"""Iteration 2 backend tests: classes, extra time, class-restricted join, inline doc mode."""
import os
import io
import uuid
import pytest
import requests
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://exam-guard-37.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

TEACHER_EMAIL = "lynchs2757@gmail.com"
TEACHER_PASSWORD = "Enseignant2026!"

FIXTURES = "/app/tests/fixtures"


@pytest.fixture(scope="module")
def teacher():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": TEACHER_EMAIL, "password": TEACHER_PASSWORD})
    assert r.status_code == 200
    return s


@pytest.fixture(scope="module")
def test_class(teacher):
    # Create a class with 3 students, one with extra time
    payload = {
        "name": f"TEST_Classe_{uuid.uuid4().hex[:5]}",
        "students": [
            {"id": str(uuid.uuid4()), "name": "Marie Tremblay", "student_number": "TREM123", "extra_time_percent": 33},
            {"id": str(uuid.uuid4()), "name": "Jean-François Côté", "student_number": "COTE456", "extra_time_percent": 0},
            {"id": str(uuid.uuid4()), "name": "Alice Dubois", "student_number": "", "extra_time_percent": 0},
        ],
    }
    r = teacher.post(f"{API}/classes", json=payload)
    assert r.status_code == 200, r.text
    cls = r.json()
    yield cls
    teacher.delete(f"{API}/classes/{cls['id']}")


@pytest.fixture
def restricted_exam(teacher, test_class):
    """Exam open with class restriction + 1-minute duration for deadline math."""
    payload = {
        "title": "TEST_Restricted",
        "subject": "Test",
        "exam_type": "form",
        "duration_minutes": 60,
        "questions": [{"id": str(uuid.uuid4()), "type": "mcq", "text": "Q?", "options": ["A", "B"], "points": 1}],
        "settings": {"allowed_tools": [], "max_violations": 3, "lock_on_max": True,
                     "require_fullscreen": False, "block_clipboard": True, "browser_spellcheck": False},
        "status": "open",
        "class_id": test_class["id"],
    }
    r = teacher.post(f"{API}/exams", json=payload)
    assert r.status_code == 200, r.text
    exam = r.json()
    yield exam
    teacher.delete(f"{API}/exams/{exam['id']}")


# ---------- Classes CRUD ----------
class TestClasses:
    def test_create_and_get_class(self, teacher, test_class):
        assert test_class["id"]
        assert len(test_class["students"]) == 3
        r = teacher.get(f"{API}/classes/{test_class['id']}")
        assert r.status_code == 200
        assert r.json()["name"] == test_class["name"]

    def test_list_classes(self, teacher, test_class):
        r = teacher.get(f"{API}/classes")
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert test_class["id"] in ids

    def test_update_class(self, teacher, test_class):
        new_name = test_class["name"] + "_upd"
        payload = {"name": new_name, "students": test_class["students"]}
        r = teacher.put(f"{API}/classes/{test_class['id']}", json=payload)
        assert r.status_code == 200
        assert r.json()["name"] == new_name

    def test_delete_class_clears_exam_ref(self, teacher):
        # create temp class + exam
        cr = teacher.post(f"{API}/classes", json={"name": "TEST_TmpCls", "students": []})
        cid = cr.json()["id"]
        er = teacher.post(f"{API}/exams", json={"title": "TEST_TmpExam", "exam_type": "form",
                                                 "duration_minutes": 10, "status": "draft", "class_id": cid})
        eid = er.json()["id"]
        r = teacher.delete(f"{API}/classes/{cid}")
        assert r.status_code == 200
        e = teacher.get(f"{API}/exams/{eid}").json()
        assert e.get("class_id") in (None, "")
        teacher.delete(f"{API}/exams/{eid}")

    def test_unauthenticated(self):
        r = requests.get(f"{API}/classes")
        assert r.status_code == 401


# ---------- Join with class restriction ----------
class TestClassRestrictedJoin:
    def test_non_enrolled_refused(self, restricted_exam):
        r = requests.post(f"{API}/student/join",
                          json={"code": restricted_exam["code"], "student_name": "Inconnu Personne"})
        assert r.status_code == 403
        assert "inscrit" in r.json()["detail"].lower()

    def test_enrolled_case_accent_insensitive(self, restricted_exam):
        # Match "Jean-François Côté" with lowercase no accents
        r = requests.post(f"{API}/student/join",
                          json={"code": restricted_exam["code"], "student_name": "jean-francois cote",
                                "student_number": "COTE456"})
        assert r.status_code == 200
        assert r.json()["token"]

    def test_matricule_alone_matches(self, restricted_exam):
        r = requests.post(f"{API}/student/join",
                          json={"code": restricted_exam["code"], "student_name": "Nom Different",
                                "student_number": "TREM123"})
        assert r.status_code == 200

    def test_wrong_matricule_refused(self, restricted_exam):
        r = requests.post(f"{API}/student/join",
                          json={"code": restricted_exam["code"], "student_name": "Marie Tremblay",
                                "student_number": "WRONG999"})
        # Name matches but matricule mismatch -> refused per match_roster logic
        assert r.status_code == 403

    def test_name_only_when_no_matricule(self, restricted_exam):
        r = requests.post(f"{API}/student/join",
                          json={"code": restricted_exam["code"], "student_name": "Alice Dubois"})
        assert r.status_code == 200


# ---------- Extra time ----------
class TestExtraTime:
    def test_deadline_includes_extra_percent(self, restricted_exam):
        # Marie has 33% extra
        r = requests.post(f"{API}/student/join",
                          json={"code": restricted_exam["code"], "student_name": "Marie Tremblay",
                                "student_number": "TREM123"})
        assert r.status_code == 200
        token = r.json()["token"]
        r = requests.get(f"{API}/student/session", headers={"X-Session-Token": token})
        assert r.status_code == 200
        data = r.json()
        assert data["deadline"] is not None
        assert data["session"]["extra_time_percent"] == 33
        started = datetime.fromisoformat(data["session"]["started_at"])
        deadline = datetime.fromisoformat(data["deadline"])
        minutes = (deadline - started).total_seconds() / 60
        # 60 * 1.33 = 79.8
        assert 79 <= minutes <= 81, f"Expected ~79.8 min, got {minutes}"

    def test_teacher_add_extra_minutes_extends_deadline(self, teacher, restricted_exam):
        # Enroll a student (Alice, no extra)
        r = requests.post(f"{API}/student/join",
                          json={"code": restricted_exam["code"], "student_name": "Alice Dubois"})
        token = r.json()["token"]
        r = requests.get(f"{API}/student/session", headers={"X-Session-Token": token})
        d1 = datetime.fromisoformat(r.json()["deadline"])

        # Find session id as teacher
        r = teacher.get(f"{API}/exams/{restricted_exam['id']}/sessions")
        sess = next(s for s in r.json() if s["student_name"] == "Alice Dubois")
        r = teacher.put(f"{API}/sessions/{sess['id']}/extra-time", json={"extra_minutes": 15})
        assert r.status_code == 200

        # PUT answers returns new deadline
        r = requests.put(f"{API}/student/answers",
                         json={"answers": {}, "essay_html": "", "annotations": []},
                         headers={"X-Session-Token": token})
        assert r.status_code == 200
        d2 = datetime.fromisoformat(r.json()["deadline"])
        diff = (d2 - d1).total_seconds() / 60
        assert 14 <= diff <= 16, f"Expected +15 min, got {diff}"


# ---------- Document inline mode ----------
class TestDocumentInline:
    def test_create_inline_doc_exam_with_pdf(self, teacher):
        payload = {"title": "TEST_InlinePDF", "exam_type": "document", "duration_minutes": 30,
                   "status": "open", "doc_answer_mode": "inline"}
        r = teacher.post(f"{API}/exams", json=payload)
        assert r.status_code == 200
        exam = r.json()
        assert exam["doc_answer_mode"] == "inline"

        with open(f"{FIXTURES}/examen.pdf", "rb") as f:
            r = teacher.post(f"{API}/exams/{exam['id']}/file",
                             files={"file": ("examen.pdf", f.read(), "application/pdf")})
        assert r.status_code == 200
        assert r.json()["kind"] == "pdf"

        # Student join + annotations persistence
        rj = requests.post(f"{API}/student/join",
                           json={"code": exam["code"], "student_name": f"TEST_Ann_{uuid.uuid4().hex[:5]}"})
        token = rj.json()["token"]
        anns = [{"id": "a1", "page": 0, "x": 100, "y": 200, "text": "Ma reponse"}]
        r = requests.put(f"{API}/student/answers",
                         json={"answers": {}, "essay_html": "", "annotations": anns},
                         headers={"X-Session-Token": token})
        assert r.status_code == 200
        # Teacher reads session back
        r = teacher.get(f"{API}/exams/{exam['id']}/sessions")
        sess = r.json()[0]
        assert sess["annotations"] == anns

        teacher.delete(f"{API}/exams/{exam['id']}")

    def test_create_inline_doc_exam_with_docx(self, teacher):
        payload = {"title": "TEST_InlineDOCX", "exam_type": "document", "duration_minutes": 30,
                   "status": "open", "doc_answer_mode": "inline"}
        r = teacher.post(f"{API}/exams", json=payload)
        exam = r.json()

        with open(f"{FIXTURES}/examen.docx", "rb") as f:
            r = teacher.post(f"{API}/exams/{exam['id']}/file",
                             files={"file": ("examen.docx",
                                             f.read(),
                                             "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})
        assert r.status_code == 200
        body = r.json()
        assert body["kind"] == "docx"
        # mammoth converted to html
        assert body["html"] and len(body["html"]) > 0

        # Student session shows the html (public_exam.file.html)
        rj = requests.post(f"{API}/student/join",
                           json={"code": exam["code"], "student_name": f"TEST_DocX_{uuid.uuid4().hex[:5]}"})
        token = rj.json()["token"]
        r = requests.get(f"{API}/student/session", headers={"X-Session-Token": token})
        assert r.status_code == 200
        file_info = r.json()["exam"]["file"]
        assert file_info["kind"] == "docx"
        assert file_info["html"]
        assert "Examen Word" in file_info["html"] or "complétez" in file_info["html"].lower() or len(file_info["html"]) > 10
        assert r.json()["exam"]["doc_answer_mode"] == "inline"

        teacher.delete(f"{API}/exams/{exam['id']}")
