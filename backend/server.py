from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import io
import uuid
import secrets
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
from mailer import send_welcome, mail_configured
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from seed import sample_exams

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
files_bucket = AsyncIOMotorGridFSBucket(db, bucket_name="exam_files")


async def read_file(file_doc: dict) -> bytes:
    try:
        stream = await files_bucket.open_download_stream(ObjectId(file_doc["gridfs_id"]))
        return await stream.read()
    except Exception:
        raise HTTPException(status_code=404, detail="Fichier introuvable")


async def drop_file(file_doc: Optional[dict]):
    if file_doc and file_doc.get("gridfs_id"):
        try:
            await files_bucket.delete(ObjectId(file_doc["gridfs_id"]))
        except Exception:
            pass

app = FastAPI()
api = APIRouter(prefix="/api")

TOOLS = ["usito", "wordreference", "antidote", "wordq", "lexibar"]
COUNTED_EVENTS = {"tab_hidden", "window_blur", "fullscreen_exit", "paste_attempt", "copy_attempt", "cut_attempt", "shortcut", "devtools", "print_attempt", "forbidden_app"}


def text_similarity(pasted: str, before: str) -> int:
    norm = lambda s: re.findall(r"[\w'’-]+", s.lower())
    a, b = norm(pasted), norm(before)
    if not a or not b:
        return 0
    sb = set(b)
    return round(100 * sum(1 for w in a if w in sb) / len(a))


def new_exit_code():
    return "".join(random.choices(string.digits, k=6))


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def new_code():
    return "".join(random.choices(string.ascii_uppercase.replace("O", "").replace("I", "") + "23456789", k=6))


# ---------- Models ----------
class LoginIn(BaseModel):
    email: str
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class UserCreateIn(BaseModel):
    email: str
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8)
    role: str = "teacher"


class UserUpdateIn(BaseModel):
    name: str | None = None
    role: str | None = None
    active: bool | None = None


class ResetPasswordIn(BaseModel):
    password: str = Field(min_length=8)


class ImportUsersIn(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    role: str = "teacher"


def gen_password() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(12))


class Question(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str  # mcq | short | long
    text: str
    options: List[str] = []
    correct: List[int] = []
    expected: str = ""
    hint: str = ""
    points: float = 1


class ExamSettings(BaseModel):
    allowed_tools: List[str] = []
    max_violations: int = 3
    lock_on_max: bool = True
    require_fullscreen: bool = True
    block_clipboard: bool = True
    browser_spellcheck: bool = False
    require_desktop: bool = False
    exit_code: str = ""


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


class ExtraMsgIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class JoinIn(BaseModel):
    code: str
    student_name: str
    student_number: str = ""
    teacher_name: str = ""
    client: str = "web"


class AnswersIn(BaseModel):
    answers: Dict[str, Any] = {}
    essay_html: str = ""
    annotations: List[Dict[str, Any]] = []


class EventIn(BaseModel):
    type: str
    detail: str = ""
    seconds: float = 0
    text: str = ""
    before: str = ""


class UnlockIn(BaseModel):
    mode: str = "reset"  # reset | grant
    extra: int = Field(default=1, ge=1, le=20)
    message: str = Field(default="", max_length=500)


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
    if user.get("active") is False:
        raise HTTPException(status_code=403, detail="Ce compte a été désactivé")
    return user


async def current_admin(user: dict = Depends(current_teacher)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Réservé aux administrateurs")
    return user


def public_user(u: dict) -> dict:
    return {k: u.get(k) for k in ("id", "email", "name", "role", "active", "must_change_password", "created_at", "last_login_at")}


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
    out["questions"] = [{**{k: v for k, v in q.items() if k not in ("correct", "expected")}, "multi": len(q.get("correct") or []) > 1} for q in (exam.get("questions") or [])]
    out["settings"] = {k: v for k, v in (exam.get("settings") or {}).items() if k != "exit_code"}
    f = exam.get("file")
    out["file"] = {"filename": f["filename"], "content_type": f["content_type"], "kind": f["kind"], "html": f.get("html")} if f else None
    return out


def public_session(s: dict) -> dict:
    return {k: v for k, v in s.items() if k not in ("token",)}


def exam_for_session(exam: dict, s: dict) -> dict:
    out = public_exam(exam)
    extra = [t for t in (s.get("tools_override") or []) if t not in (out["settings"].get("allowed_tools") or [])]
    if extra:
        out["settings"] = {**out["settings"], "allowed_tools": [*(out["settings"].get("allowed_tools") or []), *extra]}
    return out


def deadline_of(session: dict, exam: dict):
    if not exam.get("duration_minutes"):
        return None
    minutes = exam["duration_minutes"] * (1 + (session.get("extra_time_percent") or 0) / 100) + (session.get("extra_minutes") or 0)
    paused = session.get("paused_seconds") or 0
    since = pause_since(session, exam)
    if since:
        paused += (datetime.now(timezone.utc) - since).total_seconds()
    return datetime.fromisoformat(session["started_at"]) + timedelta(minutes=minutes, seconds=paused)


def pause_since(session: dict, exam: dict):
    ts = session.get("paused_at") or exam.get("paused_at")
    return datetime.fromisoformat(ts) if ts else None


def pause_info(session: dict, exam: dict) -> dict:
    since = pause_since(session, exam)
    return {"paused": bool(since) and session.get("status") == "in_progress", "pause_message": (session.get("pause_message") if session.get("paused_at") else exam.get("pause_message")) or ""}


async def resume_sessions(query: dict, exam_pause_at: str | None, detail: str):
    now = datetime.now(timezone.utc)
    count = 0
    async for s in db.sessions.find({**query, "status": "in_progress"}, {"_id": 0, "id": 1, "paused_at": 1, "paused_seconds": 1}):
        since = s.get("paused_at") or exam_pause_at
        if not since:
            continue
        secs = (now - datetime.fromisoformat(since)).total_seconds()
        ev = {"type": "resumed", "detail": f"{detail} ({round(secs / 60)} min ajoutées au chronomètre)", "at": now_iso(), "counted": False}
        await db.sessions.update_one({"id": s["id"]}, {"$set": {"paused_at": None, "pause_message": ""}, "$inc": {"paused_seconds": secs}, "$push": {"events": ev}})
        count += 1
    return count


# ---------- Auth ----------
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
    if user.get("active") is False:
        raise HTTPException(status_code=403, detail="Ce compte a été désactivé. Contactez l'administrateur.")
    await db.login_attempts.delete_many({"identifier": ident})
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login_at": now_iso()}})
    await db.login_log.insert_one({"user_id": user["id"], "email": email, "at": now_iso(), "ip": request.client.host if request.client else "", "ua": (request.headers.get("user-agent") or "")[:160]})
    set_auth_cookies(response, create_access_token(user["id"], email), create_refresh_token(user["id"]))
    return public_user(user)


@api.post("/auth/change-password")
async def change_password(body: ChangePasswordIn, user: dict = Depends(current_teacher)):
    full = await db.users.find_one({"id": user["id"]})
    if not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")
    if body.current_password == body.new_password:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit être différent")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password), "must_change_password": False}})
    return {**user, "must_change_password": False}


# ---------- Admin : gestion des comptes ----------
@api.get("/admin/users")
async def admin_list_users(_: dict = Depends(current_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(1000)
    return [public_user(u) for u in users]


@api.post("/admin/users", status_code=201)
async def admin_create_user(body: UserCreateIn, _: dict = Depends(current_admin)):
    email = body.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Courriel invalide")
    if body.role not in ("teacher", "admin"):
        raise HTTPException(status_code=400, detail="Rôle invalide")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Ce courriel est déjà utilisé")
    user = {"id": str(uuid.uuid4()), "email": email, "name": body.name.strip(), "role": body.role, "active": True,
            "must_change_password": True, "password_hash": hash_password(body.password), "created_at": now_iso()}
    await db.users.insert_one(user)
    sent = await asyncio.to_thread(send_welcome, email, user["name"], body.password)
    return {**public_user(user), "email_sent": sent}


@api.post("/admin/users/import")
async def admin_import_users(body: ImportUsersIn, _: dict = Depends(current_admin)):
    if body.role not in ("teacher", "admin"):
        raise HTTPException(status_code=400, detail="Rôle invalide")
    created, errors = [], []
    for raw in body.text.splitlines():
        line = raw.strip()
        if not line:
            continue
        parts = [p.strip() for p in re.split(r"[;,\t]", line) if p.strip()]
        email = next((p.lower() for p in parts if "@" in p), None)
        name = " ".join(p for p in parts if "@" not in p).strip()
        if not email or "." not in email.split("@")[-1]:
            errors.append({"line": raw, "reason": "Courriel manquant ou invalide"})
            continue
        if not name:
            name = email.split("@")[0].replace(".", " ").title()
        if await db.users.find_one({"email": email}):
            errors.append({"line": raw, "reason": "Courriel déjà utilisé"})
            continue
        pwd = gen_password()
        user = {"id": str(uuid.uuid4()), "email": email, "name": name, "role": body.role, "active": True,
                "must_change_password": True, "password_hash": hash_password(pwd), "created_at": now_iso()}
        await db.users.insert_one(user)
        sent = await asyncio.to_thread(send_welcome, email, name, pwd)
        created.append({"id": user["id"], "name": name, "email": email, "password": pwd, "email_sent": sent})
    return {"created": created, "errors": errors, "mail_configured": mail_configured()}


@api.get("/admin/mail-status")
async def admin_mail_status(_: dict = Depends(current_admin)):
    return {"configured": mail_configured(), "sender": os.environ.get("MAIL_FROM", "")}


@api.get("/admin/activity")
async def admin_activity(_: dict = Depends(current_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(1000)
    exams = await db.exams.find({}, {"_id": 0, "id": 1, "teacher_id": 1, "title": 1, "subject": 1, "status": 1, "exam_type": 1, "created_at": 1}).to_list(5000)
    counts = {}
    async for row in db.sessions.aggregate([{"$group": {"_id": "$exam_id", "n": {"$sum": 1}, "submitted": {"$sum": {"$cond": [{"$eq": ["$status", "submitted"]}, 1, 0]}}}}]):
        counts[row["_id"]] = {"sessions": row["n"], "submitted": row["submitted"]}
    logins = {}
    async for l in db.login_log.find({}, {"_id": 0}).sort("at", -1).limit(5000):
        logins.setdefault(l["user_id"], []).append({"at": l["at"], "ip": l.get("ip", "")})
    out = []
    for u in users:
        ex = sorted([{**e, **counts.get(e["id"], {"sessions": 0, "submitted": 0})} for e in exams if e["teacher_id"] == u["id"]], key=lambda e: e["created_at"], reverse=True)
        lg = logins.get(u["id"], [])
        out.append({**public_user(u), "exams": ex, "logins": lg[:20], "login_count": len(lg)})
    return out


@api.put("/admin/users/{user_id}")
async def admin_update_user(user_id: str, body: UserUpdateIn, admin: dict = Depends(current_admin)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    upd = {}
    if body.name is not None:
        upd["name"] = body.name.strip()
    if body.role is not None:
        if body.role not in ("teacher", "admin"):
            raise HTTPException(status_code=400, detail="Rôle invalide")
        if user_id == admin["id"] and body.role != "admin":
            raise HTTPException(status_code=400, detail="Vous ne pouvez pas retirer votre propre rôle d'administrateur")
        upd["role"] = body.role
    if body.active is not None:
        if user_id == admin["id"] and not body.active:
            raise HTTPException(status_code=400, detail="Vous ne pouvez pas désactiver votre propre compte")
        upd["active"] = body.active
    if upd:
        await db.users.update_one({"id": user_id}, {"$set": upd})
    return public_user({**target, **upd})


@api.post("/admin/users/{user_id}/reset-password")
async def admin_reset_password(user_id: str, body: ResetPasswordIn, _: dict = Depends(current_admin)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    await db.users.update_one({"id": user_id}, {"$set": {"password_hash": hash_password(body.password), "must_change_password": True}})
    sent = await asyncio.to_thread(send_welcome, target["email"], target["name"], body.password, True)
    return {"ok": True, "email_sent": sent}


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
    data = body.model_dump()
    data["settings"]["exit_code"] = data["settings"].get("exit_code") or new_exit_code()
    exam = {**data, "id": str(uuid.uuid4()), "teacher_id": user["id"], "code": code, "file": None, "created_at": now_iso()}
    await db.exams.insert_one(exam)
    exam.pop("_id", None)
    return exam


@api.get("/exams/{exam_id}")
async def get_exam(exam_id: str, user: dict = Depends(current_teacher)):
    return await own_exam(exam_id, user)


@api.put("/exams/{exam_id}")
async def update_exam(exam_id: str, body: ExamIn, user: dict = Depends(current_teacher)):
    await own_exam(exam_id, user)
    data = body.model_dump()
    data["settings"]["exit_code"] = data["settings"].get("exit_code") or new_exit_code()
    await db.exams.update_one({"id": exam_id}, {"$set": data})
    return await own_exam(exam_id, user)


@api.delete("/exams/{exam_id}")
async def delete_exam(exam_id: str, user: dict = Depends(current_teacher)):
    exam = await own_exam(exam_id, user)
    await drop_file(exam.get("file"))
    await db.exams.delete_one({"id": exam_id})
    await db.sessions.delete_many({"exam_id": exam_id})
    return {"ok": True}


@api.post("/exams/{exam_id}/file")
async def upload_exam_file(exam_id: str, file: UploadFile = File(...), user: dict = Depends(current_teacher)):
    exam = await own_exam(exam_id, user)
    name = file.filename or "document"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in ("pdf", "docx"):
        raise HTTPException(status_code=400, detail="Formats acceptés : PDF ou Word (.docx)")
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 20 Mo)")
    ctype = "application/pdf" if ext == "pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    fid = await files_bucket.upload_from_stream(name, data, metadata={"contentType": ctype, "exam_id": exam_id})
    html = None
    if ext == "docx":
        html = (await asyncio.to_thread(mammoth.convert_to_html, io.BytesIO(data))).value
    file_doc = {"id": str(uuid.uuid4()), "gridfs_id": str(fid), "filename": name, "content_type": ctype,
                "kind": ext, "size": len(data), "html": html, "uploaded_at": now_iso()}
    await drop_file(exam.get("file"))
    await db.exams.update_one({"id": exam_id}, {"$set": {"file": file_doc}})
    return file_doc


@api.delete("/exams/{exam_id}/file")
async def remove_exam_file(exam_id: str, user: dict = Depends(current_teacher)):
    exam = await own_exam(exam_id, user)
    await drop_file(exam.get("file"))
    await db.exams.update_one({"id": exam_id}, {"$set": {"file": None}})
    return {"ok": True}


@api.get("/exams/{exam_id}/file")
async def teacher_download_file(exam_id: str, user: dict = Depends(current_teacher)):
    exam = await own_exam(exam_id, user)
    if not exam.get("file"):
        raise HTTPException(status_code=404, detail="Aucun fichier")
    return Response(content=await read_file(exam["file"]), media_type=exam["file"]["content_type"])


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
async def unlock_session(session_id: str, body: UnlockIn = UnlockIn(), user: dict = Depends(current_teacher)):
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Copie introuvable")
    exam = await own_exam(s["exam_id"], user)
    ts = now_iso()
    if body.mode == "grant":
        allowance = max(0, s["violations"] - exam["settings"].get("max_violations", 3)) + body.extra
        upd = {"status": "in_progress", "allowance": allowance, "locked_by": None}
        detail = f"Débloqué par l'enseignant : {body.extra} signalement(s) de plus accordé(s) (compteur conservé à {s['violations']})"
    else:
        upd = {"status": "in_progress", "violations": 0, "allowance": 0, "locked_by": None}
        detail = "Débloqué par l'enseignant : compteur remis à zéro"
    msg = body.message.strip()
    if msg:
        upd["teacher_message"] = {"text": msg, "at": ts, "read": False}
        detail += f" · Message : « {msg} »"
    ev = {"type": "unlocked", "detail": detail, "at": ts, "counted": False}
    await db.sessions.update_one({"id": session_id}, {"$set": upd, "$push": {"events": ev}})
    return {"ok": True}


class LockIn(BaseModel):
    reason: str = Field(default="", max_length=300)


@api.post("/sessions/{session_id}/lock")
async def lock_session(session_id: str, body: LockIn = LockIn(), user: dict = Depends(current_teacher)):
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Copie introuvable")
    await own_exam(s["exam_id"], user)
    if s["status"] != "in_progress":
        raise HTTPException(status_code=400, detail="Seul un examen en cours peut être bloqué")
    ts = now_iso()
    detail = "Examen bloqué par l'enseignant" + (f" : « {body.reason.strip()} »" if body.reason.strip() else "")
    await db.sessions.update_one({"id": session_id}, {"$set": {"status": "locked", "locked_at": ts, "locked_by": "teacher", "lock_reason": body.reason.strip()},
                                                      "$push": {"events": {"type": "locked", "detail": detail, "at": ts, "counted": False}}})
    return {"ok": True}


@api.post("/sessions/{session_id}/reopen")
async def reopen_session(session_id: str, user: dict = Depends(current_teacher)):
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Copie introuvable")
    await own_exam(s["exam_id"], user)
    if s["status"] != "submitted":
        raise HTTPException(status_code=400, detail="Seule une copie remise peut être rouverte")
    ev = {"type": "reopened", "detail": "Copie rouverte par l'enseignant : l'élève peut se reconnecter", "at": now_iso(), "counted": False}
    await db.sessions.update_one({"id": session_id}, {"$set": {"status": "in_progress", "submitted_at": None}, "$push": {"events": ev}})
    return {"ok": True}


class BroadcastIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)


@api.post("/exams/{exam_id}/broadcast")
async def broadcast(exam_id: str, body: BroadcastIn, user: dict = Depends(current_teacher)):
    await own_exam(exam_id, user)
    text, ts = body.text.strip(), now_iso()
    ev = {"type": "teacher_message", "detail": f"Message à toute la classe : « {text} »", "at": ts, "counted": False}
    r = await db.sessions.update_many({"exam_id": exam_id, "status": {"$in": ["in_progress", "locked"]}},
                                      {"$set": {"teacher_message": {"text": text, "at": ts, "read": False}}, "$push": {"events": ev}})
    return {"sent": r.modified_count}


@api.post("/exams/{exam_id}/lock-all")
async def lock_all(exam_id: str, user: dict = Depends(current_teacher)):
    await own_exam(exam_id, user)
    ts = now_iso()
    ev = {"type": "locked", "detail": "Examen bloqué par l'enseignant (toute la classe)", "at": ts, "counted": False}
    r = await db.sessions.update_many({"exam_id": exam_id, "status": "in_progress"},
                                      {"$set": {"status": "locked", "locked_at": ts, "locked_by": "teacher", "lock_reason": ""}, "$push": {"events": ev}})
    return {"count": r.modified_count}


class PauseIn(BaseModel):
    message: str = Field(default="", max_length=300)
    exam_ids: list[str] | None = None


async def pause_exam(exam: dict, message: str) -> int:
    if exam.get("paused_at"):
        return 0
    ts = now_iso()
    await db.exams.update_one({"id": exam["id"]}, {"$set": {"paused_at": ts, "pause_message": message}})
    ev = {"type": "paused", "detail": f"Examen mis en pause par l'enseignant{(' : ' + message) if message else ''}", "at": ts, "counted": False}
    r = await db.sessions.update_many({"exam_id": exam["id"], "status": "in_progress"}, {"$push": {"events": ev}})
    return r.modified_count


async def resume_exam(exam: dict) -> int:
    if not exam.get("paused_at"):
        return 0
    count = await resume_sessions({"exam_id": exam["id"]}, exam["paused_at"], "Reprise de l'examen")
    await db.exams.update_one({"id": exam["id"]}, {"$set": {"paused_at": None, "pause_message": ""}})
    return count


@api.post("/exams/{exam_id}/pause")
async def exam_pause(exam_id: str, body: PauseIn, user: dict = Depends(current_teacher)):
    exam = await own_exam(exam_id, user)
    return {"count": await pause_exam(exam, body.message.strip())}


@api.post("/exams/{exam_id}/resume")
async def exam_resume(exam_id: str, user: dict = Depends(current_teacher)):
    exam = await own_exam(exam_id, user)
    return {"count": await resume_exam(exam)}


@api.post("/exams/pause-many")
async def exams_pause_many(body: PauseIn, user: dict = Depends(current_teacher)):
    q = {"teacher_id": user["id"], "status": "open"}
    if body.exam_ids:
        q["id"] = {"$in": body.exam_ids}
    total, exams = 0, 0
    async for exam in db.exams.find(q, {"_id": 0}):
        total += await pause_exam(exam, body.message.strip())
        exams += 1
    return {"exams": exams, "count": total}


@api.post("/exams/resume-many")
async def exams_resume_many(body: PauseIn, user: dict = Depends(current_teacher)):
    q = {"teacher_id": user["id"], "paused_at": {"$ne": None}}
    if body.exam_ids:
        q["id"] = {"$in": body.exam_ids}
    total, exams = 0, 0
    async for exam in db.exams.find(q, {"_id": 0}):
        total += await resume_exam(exam)
        exams += 1
    return {"exams": exams, "count": total}


@api.post("/sessions/{session_id}/pause")
async def session_pause(session_id: str, body: PauseIn, user: dict = Depends(current_teacher)):
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Copie introuvable")
    await own_exam(s["exam_id"], user)
    if s["status"] != "in_progress":
        raise HTTPException(status_code=400, detail="Seule une copie en cours peut être mise en pause")
    if s.get("paused_at"):
        return {"ok": True}
    ts = now_iso()
    ev = {"type": "paused", "detail": f"Copie mise en pause par l'enseignant{(' : ' + body.message.strip()) if body.message.strip() else ''}", "at": ts, "counted": False}
    await db.sessions.update_one({"id": session_id}, {"$set": {"paused_at": ts, "pause_message": body.message.strip()}, "$push": {"events": ev}})
    return {"ok": True}


@api.post("/sessions/{session_id}/resume")
async def session_resume(session_id: str, user: dict = Depends(current_teacher)):
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Copie introuvable")
    await own_exam(s["exam_id"], user)
    count = await resume_sessions({"id": session_id}, None, "Reprise de la copie")
    return {"ok": True, "count": count}


@api.post("/exams/{exam_id}/unlock-all")
async def unlock_all(exam_id: str, user: dict = Depends(current_teacher)):
    await own_exam(exam_id, user)
    ev = {"type": "unlocked", "detail": "Débloqué par l'enseignant (toute la classe) : compteur remis à zéro", "at": now_iso(), "counted": False}
    r = await db.sessions.update_many({"exam_id": exam_id, "status": "locked"},
                                      {"$set": {"status": "in_progress", "violations": 0, "allowance": 0, "locked_by": None}, "$push": {"events": ev}})
    return {"count": r.modified_count}


@api.post("/sessions/{session_id}/message")
async def send_session_message(session_id: str, body: ExtraMsgIn, user: dict = Depends(current_teacher)):
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Copie introuvable")
    await own_exam(s["exam_id"], user)
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Le message est vide")
    ts = now_iso()
    ev = {"type": "teacher_message", "detail": f"Avertissement envoyé : « {text} »", "at": ts, "counted": False}
    await db.sessions.update_one({"id": session_id}, {"$set": {"teacher_message": {"text": text, "at": ts, "read": False}}, "$push": {"events": ev}})
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


class SessionToolsIn(BaseModel):
    tools: list[str] = Field(default_factory=list)


@api.put("/sessions/{session_id}/tools")
async def session_tools(session_id: str, body: SessionToolsIn, user: dict = Depends(current_teacher)):
    s = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Copie introuvable")
    await own_exam(s["exam_id"], user)
    tools = [t for t in body.tools if t in TOOLS]
    ev = {"type": "tools_changed", "detail": f"Outils permis pour cet élève : {', '.join(tools) if tools else 'aucun ajout'}", "at": now_iso(), "counted": False}
    await db.sessions.update_one({"id": session_id}, {"$set": {"tools_override": tools}, "$push": {"events": ev}})
    return {"ok": True, "tools_override": tools}


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
    client_kind = "desktop" if body.client == "desktop" else "web"
    if exam["settings"].get("require_desktop") and client_kind != "desktop":
        raise HTTPException(status_code=403, detail="Cet examen doit être fait dans l'application MonExamEnLigne pour Windows.")
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
         "extra_time_percent": extra_pct, "extra_minutes": 0, "annotations": [], "teacher_name": teacher_name, "client": client_kind,
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
    return {"session": public_session(s), "exam": exam_for_session(exam, s), "deadline": dl.isoformat() if dl else None,
            "server_now": now_iso(), **pause_info(s, exam)}


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
    if body.seconds > 0:
        ev["seconds"] = round(body.seconds, 1)
    if body.text:
        ev["text"] = body.text[:3000]
        words = len(body.text.split())
        ev["words"] = words
        ev["similarity"] = text_similarity(body.text, body.before)
        ev["before_words"] = len(body.before.split())
        ev["suspect"] = words >= 40
    upd = {"$push": {"events": ev}}
    violations = s["violations"] + (1 if counted else 0)
    status = s["status"]
    limit = exam["settings"].get("max_violations", 3) + (s.get("allowance") or 0)
    if counted:
        upd["$inc"] = {"violations": 1}
        st = exam["settings"]
        if st.get("lock_on_max") and violations >= limit:
            status = "locked"
            upd["$set"] = {"status": "locked", "locked_at": now_iso(), "locked_by": "auto"}
            upd["$push"] = {"events": {"$each": [ev, {"type": "locked", "detail": f"Examen bloqué après {violations} signalement(s)", "at": now_iso(), "counted": False}]}}
    await db.sessions.update_one({"id": s["id"]}, upd)
    return {"violations": violations, "status": status, "counted": counted, "limit": limit}


@api.post("/student/message-read")
async def student_message_read(s: dict = Depends(current_session)):
    if s.get("teacher_message"):
        ev = {"type": "message_read", "detail": "L'élève a lu le message de l'enseignant", "at": now_iso(), "counted": False}
        await db.sessions.update_one({"id": s["id"]}, {"$set": {"teacher_message.read": True}, "$push": {"events": ev}})
    return {"ok": True}


class ExitIn(BaseModel):
    code: str


@api.post("/student/emergency-exit")
async def student_emergency_exit(body: ExitIn, s: dict = Depends(current_session)):
    exam = await db.exams.find_one({"id": s["exam_id"]}, {"_id": 0, "settings": 1})
    ok = bool(exam["settings"].get("exit_code")) and body.code.strip() == exam["settings"]["exit_code"]
    ev = {"type": "emergency_exit" if ok else "emergency_exit_failed",
          "detail": "Sortie d'urgence du mode kiosque avec le code enseignant" if ok else "Code de sortie d'urgence incorrect",
          "at": now_iso(), "counted": False}
    await db.sessions.update_one({"id": s["id"]}, {"$push": {"events": ev}})
    if not ok:
        raise HTTPException(status_code=403, detail="Code incorrect")
    return {"ok": True}


@api.post("/student/submit")
async def student_submit(body: AnswersIn, s: dict = Depends(current_session)):
    exam = await db.exams.find_one({"id": s["exam_id"]}, {"_id": 0})
    if s["status"] == "submitted":
        return {"ok": True, **submit_receipt(s, exam)}
    ts = now_iso()
    ev = {"type": "submitted", "detail": "Copie remise", "at": ts, "counted": False}
    upd = {"status": "submitted", "submitted_at": ts, "receipt": uuid.uuid4().hex[:8].upper()}
    if s["status"] == "in_progress":
        upd.update({"answers": body.answers, "essay_html": body.essay_html, "annotations": body.annotations, "last_saved_at": ts})
    await db.sessions.update_one({"id": s["id"]}, {"$set": upd, "$push": {"events": ev}})
    return {"ok": True, **submit_receipt({**s, **upd}, exam)}


def submit_receipt(s: dict, exam: dict) -> dict:
    answers = s.get("answers") or {}
    questions = exam.get("questions") or []
    answered = sum(1 for q in questions if str(answers.get(q["id"], "") or "").strip() not in ("", "<p></p>", "[]"))
    words = len(re.sub(r"<[^>]+>", " ", s.get("essay_html") or "").split())
    return {"receipt": s.get("receipt") or "", "submitted_at": s.get("submitted_at"), "answered": answered, "questions": len(questions),
            "essay_words": words, "annotations": len(s.get("annotations") or []), "student_name": s.get("student_name"), "exam_title": exam.get("title")}


@api.get("/student/file")
async def student_file(s: dict = Depends(current_session)):
    exam = await db.exams.find_one({"id": s["exam_id"]}, {"_id": 0})
    if not exam.get("file"):
        raise HTTPException(status_code=404, detail="Aucun fichier")
    return Response(content=await read_file(exam["file"]), media_type=exam["file"]["content_type"])


@api.get("/")
async def root():
    return {"message": "MonExamEnLigne API"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ["FRONTEND_URL"].split(",") if o.strip()] + ["http://localhost:3000"],
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
        admin = {"id": str(uuid.uuid4()), "email": email, "name": "Administrateur·trice", "role": "admin", "active": True,
                 "password_hash": hash_password(pwd), "created_at": now_iso()}
        await db.users.insert_one(admin)
    else:
        upd = {"role": "admin", "active": True}
        if not verify_password(pwd, admin["password_hash"]):
            upd["password_hash"] = hash_password(pwd)
        await db.users.update_one({"email": email}, {"$set": upd})
    if await db.exams.count_documents({"teacher_id": admin["id"]}) == 0:
        for ex in sample_exams():
            ex["settings"]["exit_code"] = new_exit_code()
            await db.exams.insert_one({**ex, "id": str(uuid.uuid4()), "teacher_id": admin["id"], "file": None, "created_at": now_iso()})
    async for e in db.exams.find({"$or": [{"settings.exit_code": {"$exists": False}}, {"settings.exit_code": ""}]}, {"id": 1}):
        await db.exams.update_one({"id": e["id"]}, {"$set": {"settings.exit_code": new_exit_code()}})


@app.on_event("shutdown")
async def shutdown():
    client.close()
