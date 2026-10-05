"""
Tests for the new multi-correct MCQ + hint/expected feature.

Covers:
- POST/PUT /api/exams accepts question with correct=[0,2], hint, expected and returns them to the teacher via GET /api/exams/{id}
- Student payload (GET /api/student/session) EXCLUDES correct & expected but INCLUDES hint and the computed `multi` flag
- PUT /api/student/answers accepts list answers for a multi question
- POST /api/student/submit: receipt 'answered' counts list answers correctly (empty list = unanswered)
"""
import os
import time
import pytest
import requests

def _load_frontend_url():
    path = "/app/frontend/.env"
    if os.path.exists(path):
        for line in open(path):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    return os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


BASE_URL = _load_frontend_url()
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "lynchs2757@gmail.com"
ADMIN_PASSWORD = "Enseignant2026!"


@pytest.fixture(scope="module")
def teacher_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def created_exam(teacher_session):
    """Create a fresh form exam for tests, cleanup at end."""
    payload = {
        "title": f"TEST MCQ Multi {int(time.time())}",
        "subject": "TEST",
        "instructions": "test",
        "exam_type": "form",
        "duration_minutes": 60,
        "status": "open",
        "questions": [
            # Q0: multi-correct MCQ (A and C)
            {"type": "mcq", "text": "Lesquelles sont vraies ?", "options": ["A", "B", "C", "D"], "correct": [0, 2], "points": 2, "hint": "", "expected": ""},
            # Q1: single-correct MCQ
            {"type": "mcq", "text": "Capitale de la France ?", "options": ["Paris", "Lyon", "Nice"], "correct": [0], "points": 1, "hint": "", "expected": ""},
            # Q2: short with hint and expected
            {"type": "short", "text": "Nommez un fleuve", "options": [], "correct": [], "points": 1, "hint": "Un seul mot", "expected": "Seine ou Loire"},
            # Q3: long with hint and expected
            {"type": "long", "text": "Expliquez", "options": [], "correct": [], "points": 3, "hint": "2 ou 3 phrases", "expected": "Mentionner la cause et l'effet"},
        ],
    }
    r = teacher_session.post(f"{API}/exams", json=payload)
    assert r.status_code == 200, f"Create exam failed: {r.status_code} {r.text}"
    exam = r.json()
    yield exam
    # cleanup
    teacher_session.delete(f"{API}/exams/{exam['id']}")


class TestTeacherExamPayload:
    def test_create_persists_correct_hint_expected(self, teacher_session, created_exam):
        r = teacher_session.get(f"{API}/exams/{created_exam['id']}")
        assert r.status_code == 200
        exam = r.json()
        qs = exam["questions"]
        assert qs[0]["correct"] == [0, 2]
        assert qs[1]["correct"] == [0]
        assert qs[2]["hint"] == "Un seul mot"
        assert qs[2]["expected"] == "Seine ou Loire"
        assert qs[3]["hint"] == "2 ou 3 phrases"
        assert qs[3]["expected"] == "Mentionner la cause et l'effet"

    def test_put_updates_correct_list(self, teacher_session, created_exam):
        # Reload then modify correct of Q0 to [1, 3]
        r = teacher_session.get(f"{API}/exams/{created_exam['id']}")
        assert r.status_code == 200
        exam = r.json()
        exam["questions"][0]["correct"] = [1, 3]
        # Build ExamIn payload (keep only required fields)
        payload = {k: exam[k] for k in ("title", "subject", "instructions", "exam_type", "duration_minutes", "questions", "writing_prompt", "settings", "status") if k in exam}
        r2 = teacher_session.put(f"{API}/exams/{created_exam['id']}", json=payload)
        assert r2.status_code == 200, r2.text
        # Verify persisted
        r3 = teacher_session.get(f"{API}/exams/{created_exam['id']}")
        assert r3.json()["questions"][0]["correct"] == [1, 3]
        # restore
        exam["questions"][0]["correct"] = [0, 2]
        payload["questions"] = exam["questions"]
        teacher_session.put(f"{API}/exams/{created_exam['id']}", json=payload)


class TestStudentPublicPayload:
    @pytest.fixture(scope="class")
    def student_token(self, teacher_session, created_exam):
        # Student joins via code
        code = created_exam["code"]
        r = requests.post(f"{API}/student/join", json={"code": code, "student_name": f"TEST MCQMulti {int(time.time())}"})
        assert r.status_code == 200, r.text
        return r.json()["token"]

    def test_public_session_hides_correct_and_expected(self, student_token):
        r = requests.get(f"{API}/student/session", headers={"X-Session-Token": student_token})
        assert r.status_code == 200
        data = r.json()
        qs = data["exam"]["questions"]
        assert len(qs) == 4
        for q in qs:
            assert "correct" not in q, f"'correct' leaked: {q}"
            assert "expected" not in q, f"'expected' leaked: {q}"

    def test_public_session_includes_hint_and_multi(self, student_token):
        r = requests.get(f"{API}/student/session", headers={"X-Session-Token": student_token})
        qs = r.json()["exam"]["questions"]
        # Q0 multi-correct (2 right answers) -> multi True
        assert qs[0]["multi"] is True
        # Q1 single correct -> multi False
        assert qs[1]["multi"] is False
        # Hints present on short/long
        assert qs[2]["hint"] == "Un seul mot"
        assert qs[3]["hint"] == "2 ou 3 phrases"
        # hint still present (empty) on mcq
        assert qs[0].get("hint", "") == ""


class TestStudentAnswersListAndReceipt:
    def test_put_answers_accepts_list_and_submit_counts_correctly(self, created_exam):
        # Fresh student session
        r = requests.post(f"{API}/student/join", json={"code": created_exam["code"], "student_name": f"TEST Listans {int(time.time())}"})
        assert r.status_code == 200
        tok = r.json()["token"]
        headers = {"X-Session-Token": tok, "Content-Type": "application/json"}
        # Fetch exam to get question ids
        sess = requests.get(f"{API}/student/session", headers=headers).json()
        qs = sess["exam"]["questions"]
        q0_id, q1_id, q2_id, q3_id = qs[0]["id"], qs[1]["id"], qs[2]["id"], qs[3]["id"]
        # Save answers: Q0 = list ['A','C'], Q1 = empty list (should count as unanswered), Q2 = 'Seine', Q3 = ''
        payload = {
            "answers": {q0_id: ["A", "C"], q1_id: [], q2_id: "Seine", q3_id: ""},
            "essay_html": "",
            "annotations": [],
        }
        r2 = requests.put(f"{API}/student/answers", json=payload, headers=headers)
        assert r2.status_code == 200, r2.text
        # Submit
        r3 = requests.post(f"{API}/student/submit", json=payload, headers=headers)
        assert r3.status_code == 200, r3.text
        receipt = r3.json()
        assert receipt["questions"] == 4
        # Answered: Q0 (list non vide) + Q2 (texte non vide) = 2 ; Q1 liste vide, Q3 vide
        assert receipt["answered"] == 2, f"Expected 2 answered got {receipt['answered']} - full receipt: {receipt}"

    def test_single_mcq_as_list_single_counts(self, created_exam):
        r = requests.post(f"{API}/student/join", json={"code": created_exam["code"], "student_name": f"TEST ListansSingle {int(time.time())}"})
        tok = r.json()["token"]
        headers = {"X-Session-Token": tok, "Content-Type": "application/json"}
        qs = requests.get(f"{API}/student/session", headers=headers).json()["exam"]["questions"]
        payload = {"answers": {qs[0]["id"]: ["A"]}, "essay_html": "", "annotations": []}
        r3 = requests.post(f"{API}/student/submit", json=payload, headers=headers)
        assert r3.status_code == 200
        assert r3.json()["answered"] == 1
