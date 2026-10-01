from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import io
import uuid
import random
import string
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

import unicodedata
import mammoth
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Header
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from auth import (hash_password, verify_password, create_access_token, create_refresh_token,
                  decode_token, set_auth_cookies, extract_token)
from storage import init_storage, put_object, get_object, APP_NAME
from seed import sample_exams

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

app = FastAPI()
api = APIRouter(prefix="/api")

TOOLS = ["usito", "wordreference", "antidote", "wordq", "lexibar"]
COUNTED_EVENTS = {"tab_hidden", "window_blur", "fullscreen_exit", "paste_attempt", "copy_attempt", "cut_attempt", "shortcut", "devtools", "print_attempt"}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def new_code():
    return "".join(random.choices(string.ascii_uppercase.replace("O", "").replace("I", "") + "23456789", k=6))


# ---------- Models ----------
class RegisterIn(BaseModel):
    email: str
    password: str = Field(min_length=6)
    name: str


class LoginIn(BaseModel):
    email: str
    password: str


class Question(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str  # mcq | short | long
    text: str
    options: List[str] = []
    points: float = 1


class ExamSettings(BaseModel):
    allowed_tools: List[str] = []
    max_violations: int = 3
    lock_on_max: bool = True
    require_fullscreen: bool = True
    block_clipboard: bool = True
    browser_spellcheck: bool = False


class ExamIn(BaseModel):
    title: str
    subject: str = ""
    instructions: str = ""
    exam_type: str = "form"  # form | redaction | document
    duration_minutes: int = 60
    questions: List[Question] = []
    writing_prompt: str = ""
    settings: ExamSettings = ExamSettings()
    status: str = "draft"  # draft | open | closed
    class_id: Optional[str] = None
    doc_answer_mode: str = "separate"  # separate | inline


class RosterStudent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    student_number: str = ""
    extra_time_percent: float = 0


class ClassIn(BaseModel):
    name: str
    students: List[RosterStudent] = []


class ExtraTimeIn(BaseModel):
    extra_minutes: float = 0


class JoinIn(BaseModel):
    code: str
    student_name: str
    student_number: str = ""
    teacher_name: str = ""


class AnswersIn(BaseModel):
    answers: Dict[str, Any] = {}
    essay_html: str = ""
    annotations: List[Dict[str, Any]] = []


class EventIn(BaseModel):
    type: str
    detail: str = ""


class GradeIn(BaseModel):
    score: Optional[float] = None
    max_score: Optional[float] = None
    comment: str = ""
    per_question: Dict[str, Dict[str, Any]] = {}


# ---------- Helpers ----------
async def current_teacher(request: Request) -> dict:
    token = extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Non authentifié")
    payload = decode_token(token, "access")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")
    return user


async def own_exam(exam_id: str, user: dict) -> dict:
    exam = await db.exams.find_one({"id": exam_id, "teacher_id": user["id"]}, {"_id": 0})
    if not exam:
        raise HTTPException(status_code=404, detail="Examen introuvable")
    return exam


async def current_session(x_session_token: str = Header(None)) -> dict:
    if not x_session_token:
        raise HTTPException(status_code=401, detail="Session élève manquante")
    s = await db.sessions.find_one({"token": x_session_token}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=401, detail="Session élève invalide")
    return s


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    return " ".join("".join(c for c in s if unicodedata.category(c) != "Mn").lower().split())


def match_roster(students: list, name: str, number: str):
    n, num = norm(name), number.strip().lower()
    for st in students:
        snum = (st.get("student_number") or "").strip().lower()
        if snum and num and snum == num:
            return st
        if norm(st["name"]) == n and (not snum or snum == num):
            return st
    return None


def public_exam(exam: dict) -> dict:
    keys = ["id", "title", "subject", "instructions", "exam_type", "duration_minutes", "questions", "writing_prompt", "settings", "status", "doc_answer_mode"]
    out = {k: exam.get(k) for k in keys}
    f = exam.get("file")
    out["file"] = {"filename": f["filename"], "content_type": f["content_type"], "kind": f["kind"], "html": f.get("html")} if f else None
    return out


def public_session(s: dict) -> dict:
    return {k: v for k, v in s.items() if k not in ("token",)}


def deadline_of(session: dict, exam: dict):
    if not exam.get("duration_minutes"):
        return None
    minutes = exam["duration_minutes"] * (1 + (session.get("extra_time_percent") or 0) / 100) + (session.get("extra_minutes") or 0)
    return datetime.fromisoformat(session["started_at"]) + timedelta(minutes=minutes)


# ---------- Auth ----------
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Ce courriel est déjà utilisé")
    user = {"id": str(uuid.uuid4()), "email": email, "name": body.name, "role": "teacher",
            "password_hash": hash_password(body.password), "created_at": now_iso()}
    await db.users.insert_one(user)
    set_auth_cookies(response, create_access_token(user["id"], email), create_refresh_token(user["id"]))
    return {"id": user["id"], "email": email, "name": user["name"], "role": "teacher"}


@api.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.strip().lower()
    ident = f"{request.client.host if request.client else 'x'}:{email}"
    att = await db.login_attempts.find_one({"identifier": ident})
    if att and att.get("count", 0) >= 5 and att.get("locked_until") and datetime.fromisoformat(att["locked_until"]) > datetime.now(timezone.utc):
        raise HTTPException(status_code=429, detail="Trop de tentatives. Réessayez dans 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        count = (att.get("count", 0) if att else 0) + 1
        upd = {"count": count}
        if count >= 5:
            upd["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        await db.login_attempts.update_one({"identifier": ident}, {"$set": upd}, upsert=True)
        raise HTTPException(status_code=401, detail="Courriel ou mot de passe invalide")
    await db.login_attempts.delete_many({"identifier": ident})
    set_auth_cookies(response, create_access_token(user["id"], email), create_refresh_token(user["id"]))
    return {"id": user["id"], "email": email, "name": user["name"], "role": user["role"]}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/", secure=True, samesite="none")
    response.delete_cookie("refresh_token", path="/", secure=True, samesite="none")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(current_teacher)):
    return user


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


@api.put("/auth/me")
async def update_me(body: ProfileIn, user: dict = Depends(current_teacher)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"name": body.name.strip()}})
    return {**user, "name": body.name.strip()}


@api.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Non authentifié")
    payload = decode_token(token, "refresh")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")
    set_auth_cookies(response, create_access_token(user["id"], user["email"]), token)
    return {"ok": True}


# ---------- Teacher: exams ----------
@api.get("/exams")
async def list_exams(user: dict = Depends(current_teacher)):
    exams = await db.exams.find({"teacher_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for e in exams:
        e["session_count"] = await db.sessions.count_documents({"exam_id": e["id"]})
        e["flagged_count"] = await db.sessions.count_documents({"exam_id": e["id"], "violations": {"$gt": 0}})
        e["locked_count"] = await db.sessions.count_documents({"exam_id": e["id"], "status": "locked"})
    return exams


@api.post("/exams")
async def create_exam(body: ExamIn, user: dict = Depends(current_teacher)):
    code = new_code()
    while await db.exams.find_one({"code": code}):
        code = new_code()
    exam = {**body.model_dump(), "id": str(uuid.uuid4()), "teacher_id": user["id"], "code": code, "file": None, "created_at": now_iso()}
    await db.exams.insert_one(exam)
    exam.pop("_id", None)
    return exam


@api.get("/exams/{exam_id}")
async def get_exam(exam_id: str, user: dict = Depends(current_teacher)):
    return await own_exam(exam_id, user)


@api.put("/exams/{exam_id}")
async def update_exam(exam_id: str, body: ExamIn, user: dict = Depends(current_teacher)):
    await own_exam(exam_id, user)
    await db.exams.update_one({"id": exam_id}, {"$set": body.model_dump()})
    return await own_exam(exam_id, user)


@api.delete("/exams/{exam_id}")
async def delete_exam(exam_id: str, user: dict = Depends(current_teacher)):
    await own_exam(exam_id, user)
    await db.exams.delete_one({"id": exam_id})
    await db.sessions.delete_many({"exam_id": exam_id})
    return {"ok": True}


@api.post("/exams/{exam_id}/file")
async def upload_exam_file(exam_id: str, file: UploadFile = File(...), user: dict = Depends(current_teacher)):
    await own_exam(exam_id, user)
    name = file.filename or "document"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in ("pdf", "docx"):
        raise HTTPException(status_code=400, detail="Formats acceptés : PDF ou Word (.docx)")
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 20 Mo)")
    ctype = "application/pdf" if ext == "pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    path = f"{APP_NAME}/exams/{user['id']}/{uuid.uuid4()}.{ext}"
    result = await asyncio.to_thread(put_object, path, data, ctype)
    html = None
    if ext == "docx":
        html = (await asyncio.to_thread(mammoth.convert_to_html, io.BytesIO(data))).value
    file_doc = {"id": str(uuid.uuid4()), "storage_path": result["path"], "filename": name, "content_type": ctype,
                "kind": ext, "size": len(data), "html": html, "uploaded_at": now_iso()}
    await db.exams.update_one({"id": exam_id}, {"$set": {"file": file_doc}})
    return file_doc


@api.delete("/exams/{exam_id}/file")
async def remove_exam_file(exam_id: str, user: dict = Depends(current_teacher)):
    await own_exam(exam_id, user)
    await db.exams.update_one({"id": exam_id}, {"$set": {"file": None}})
    return {"ok": True}


@api.get("/exams/{exam_id}/file")
async def teacher_download_file(exam_id: str, user: dict = Depends(current_teacher)):
    exam = await own_exam(exam_id, user)
    if not exam.get("file"):
        raise HTTPException(status_code=404, detail="Aucun fichier")
    data, _ = await asyncio.to_thread(get_object, exam["file"]["storage_path"])
    return Response(content=data, media_type=exam["file"]["content_type"])


@api.get("/exams/{exam_id}/sessions")
async def exam_sessions(exam_id: str, user: dict = Depends(current_teacher)):
    await own_exam(exam_id, user)
    sessions = await db.sessions.find({"exam_id": exam_id}, {"_id": 0, "token": 0}).sort("started_at", 1).to_list(1000)
    return sessions


@api.put("/sessions/{session_id}/grade")
async def grade_session(session_id: str, body: GradeIn, user: dict = Depends(current_teacher)):
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Copie introuvable")
    await own_exam(s["exam_id"], user)
    grade = {**body.model_dump(), "graded_at": now_iso()}
    await db.sessions.update_one({"id": session_id}, {"$set": {"grade": grade}})
    return grade


@api.post("/sessions/{session_id}/unlock")
async def unlock_session(session_id: str, user: dict = Depends(current_teacher)):
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Copie introuvable")
    await own_exam(s["exam_id"], user)
    ev = {"type": "unlocked", "detail": "Déverrouillé par l'enseignant (compteur remis à zéro)", "at": now_iso(), "counted": False}
    await db.sessions.update_one({"id": session_id}, {"$set": {"status": "in_progress", "violations": 0}, "$push": {"events": ev}})
    return {"ok": True}


@api.put("/sessions/{session_id}/extra-time")
async def session_extra_time(session_id: str, body: ExtraTimeIn, user: dict = Depends(current_teacher)):
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Copie introuvable")
    await own_exam(s["exam_id"], user)
    ev = {"type": "extra_time", "detail": f"Temps supplémentaire accordé : {body.extra_minutes:g} min", "at": now_iso(), "counted": False}
    await db.sessions.update_one({"id": session_id}, {"$set": {"extra_minutes": body.extra_minutes}, "$push": {"events": ev}})
    return {"ok": True}


# ---------- Teacher: classes ----------
@api.get("/classes")
async def list_classes(user: dict = Depends(current_teacher)):
    return await db.classes.find({"teacher_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/classes")
async def create_class(body: ClassIn, user: dict = Depends(current_teacher)):
    cls = {**body.model_dump(), "id": str(uuid.uuid4()), "teacher_id": user["id"], "created_at": now_iso()}
    await db.classes.insert_one(cls)
    cls.pop("_id", None)
    return cls


async def own_class(class_id: str, user: dict) -> dict:
    cls = await db.classes.find_one({"id": class_id, "teacher_id": user["id"]}, {"_id": 0})
    if not cls:
        raise HTTPException(status_code=404, detail="Classe introuvable")
    return cls


@api.get("/classes/{class_id}")
async def get_class(class_id: str, user: dict = Depends(current_teacher)):
    return await own_class(class_id, user)


@api.put("/classes/{class_id}")
async def update_class(class_id: str, body: ClassIn, user: dict = Depends(current_teacher)):
    await own_class(class_id, user)
    await db.classes.update_one({"id": class_id}, {"$set": body.model_dump()})
    return await own_class(class_id, user)


@api.delete("/classes/{class_id}")
async def delete_class(class_id: str, user: dict = Depends(current_teacher)):
    await own_class(class_id, user)
    await db.classes.delete_one({"id": class_id})
    await db.exams.update_many({"class_id": class_id}, {"$set": {"class_id": None}})
    return {"ok": True}


# ---------- Student ----------
@api.post("/student/join")
async def student_join(body: JoinIn):
    code = body.code.strip().upper()
    name = body.student_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Le nom est obligatoire")
    exam = await db.exams.find_one({"code": code}, {"_id": 0})
    if not exam:
        raise HTTPException(status_code=404, detail="Code d'examen invalide")
    if exam["status"] != "open":
        raise HTTPException(status_code=403, detail="Cet examen n'est pas ouvert actuellement")
    extra_pct = 0
    number = body.student_number.strip()
    teacher_name = body.teacher_name.strip()[:120]
    if exam.get("class_id"):
        teacher = await db.users.find_one({"id": exam["teacher_id"]}, {"_id": 0, "name": 1})
        teacher_name = (teacher or {}).get("name", teacher_name)
        cls = await db.classes.find_one({"id": exam["class_id"]}, {"_id": 0})
        entry = match_roster(cls["students"], name, number) if cls else None
        if not entry:
            raise HTTPException(status_code=403, detail="Vous n'êtes pas inscrit·e sur la liste de cette classe. Vérifiez votre nom et votre matricule.")
        name, number, extra_pct = entry["name"], entry.get("student_number") or number, entry.get("extra_time_percent") or 0
    existing = await db.sessions.find_one({"exam_id": exam["id"], "student_name_lc": name.lower(), "student_number": number}, {"_id": 0})
    if existing:
        if existing["status"] == "submitted":
            raise HTTPException(status_code=403, detail="Vous avez déjà remis cet examen")
        ev = {"type": "rejoined", "detail": "Reconnexion à l'examen", "at": now_iso(), "counted": False}
        await db.sessions.update_one({"id": existing["id"]}, {"$push": {"events": ev}})
        return {"token": existing["token"]}
    s = {"id": str(uuid.uuid4()), "token": uuid.uuid4().hex + uuid.uuid4().hex, "exam_id": exam["id"],
         "student_name": name, "student_name_lc": name.lower(), "student_number": number,
         "extra_time_percent": extra_pct, "extra_minutes": 0, "annotations": [], "teacher_name": teacher_name,
         "status": "in_progress", "answers": {}, "essay_html": "", "started_at": now_iso(), "submitted_at": None,
         "last_saved_at": None, "violations": 0,
         "events": [{"type": "joined", "detail": "Début de l'examen", "at": now_iso(), "counted": False}], "grade": None}
    await db.sessions.insert_one(s)
    return {"token": s["token"]}


@api.get("/student/exam-info/{code}")
async def student_exam_info(code: str):
    exam = await db.exams.find_one({"code": code.strip().upper(), "status": "open"}, {"_id": 0, "class_id": 1, "teacher_id": 1})
    if not exam or not exam.get("class_id"):
        return {"roster": False, "teacher_name": None}
    teacher = await db.users.find_one({"id": exam["teacher_id"]}, {"_id": 0, "name": 1})
    return {"roster": True, "teacher_name": (teacher or {}).get("name")}


@api.get("/student/session")
async def student_session(s: dict = Depends(current_session)):
    exam = await db.exams.find_one({"id": s["exam_id"]}, {"_id": 0})
    dl = deadline_of(s, exam)
    return {"session": public_session(s), "exam": public_exam(exam), "deadline": dl.isoformat() if dl else None,
            "server_now": now_iso()}


@api.put("/student/answers")
async def student_save(body: AnswersIn, s: dict = Depends(current_session)):
    if s["status"] != "in_progress":
        raise HTTPException(status_code=403, detail="La copie n'est plus modifiable")
    exam = await db.exams.find_one({"id": s["exam_id"]}, {"_id": 0})
    dl = deadline_of(s, exam)
    if dl and datetime.now(timezone.utc) > dl + timedelta(seconds=60):
        raise HTTPException(status_code=403, detail="Le temps est écoulé")
    ts = now_iso()
    await db.sessions.update_one({"id": s["id"]}, {"$set": {"answers": body.answers, "essay_html": body.essay_html, "annotations": body.annotations, "last_saved_at": ts}})
    return {"last_saved_at": ts, "deadline": dl.isoformat() if dl else None}


@api.post("/student/event")
async def student_event(body: EventIn, s: dict = Depends(current_session)):
    exam = await db.exams.find_one({"id": s["exam_id"]}, {"_id": 0})
    desktop_ok = any(t in exam["settings"].get("allowed_tools", []) for t in ("antidote", "wordq", "lexibar"))
    counted = (body.type in COUNTED_EVENTS or (body.type == "external_focus" and not desktop_ok)) and s["status"] == "in_progress"
    ev = {"type": body.type, "detail": body.detail[:300], "at": now_iso(), "counted": counted}
    upd = {"$push": {"events": ev}}
    violations = s["violations"] + (1 if counted else 0)
    status = s["status"]
    if counted:
        upd["$inc"] = {"violations": 1}
        st = exam["settings"]
        if st.get("lock_on_max") and violations >= st.get("max_violations", 3):
            status = "locked"
            upd["$set"] = {"status": "locked", "locked_at": now_iso()}
            upd["$push"] = {"events": {"$each": [ev, {"type": "locked", "detail": f"Examen bloqué après {violations} signalement(s)", "at": now_iso(), "counted": False}]}}
    await db.sessions.update_one({"id": s["id"]}, upd)
    return {"violations": violations, "status": status, "counted": counted}


@api.post("/student/submit")
async def student_submit(body: AnswersIn, s: dict = Depends(current_session)):
    if s["status"] == "submitted":
        return {"ok": True}
    ts = now_iso()
    ev = {"type": "submitted", "detail": "Copie remise", "at": ts, "counted": False}
    upd = {"status": "submitted", "submitted_at": ts}
    if s["status"] == "in_progress":
        upd.update({"answers": body.answers, "essay_html": body.essay_html, "annotations": body.annotations, "last_saved_at": ts})
    await db.sessions.update_one({"id": s["id"]}, {"$set": upd, "$push": {"events": ev}})
    return {"ok": True}


@api.get("/student/file")
async def student_file(s: dict = Depends(current_session)):
    exam = await db.exams.find_one({"id": s["exam_id"]}, {"_id": 0})
    if not exam.get("file"):
        raise HTTPException(status_code=404, detail="Aucun fichier")
    data, _ = await asyncio.to_thread(get_object, exam["file"]["storage_path"])
    return Response(content=data, media_type=exam["file"]["content_type"])


@api.get("/")
async def root():
    return {"message": "MonExamEnLigne API"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ["FRONTEND_URL"], "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.exams.create_index("code", unique=True)
    await db.sessions.create_index("token", unique=True)
    email = os.environ["ADMIN_EMAIL"].lower()
    pwd = os.environ["ADMIN_PASSWORD"]
    admin = await db.users.find_one({"email": email})
    if not admin:
        admin = {"id": str(uuid.uuid4()), "email": email, "name": "Enseignant·e principal·e", "role": "teacher",
                 "password_hash": hash_password(pwd), "created_at": now_iso()}
        await db.users.insert_one(admin)
    elif not verify_password(pwd, admin["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pwd)}})
    if await db.exams.count_documents({"teacher_id": admin["id"]}) == 0:
        for ex in sample_exams():
            await db.exams.insert_one({**ex, "id": str(uuid.uuid4()), "teacher_id": admin["id"], "file": None, "created_at": now_iso()})
    try:
        await asyncio.to_thread(init_storage)
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
