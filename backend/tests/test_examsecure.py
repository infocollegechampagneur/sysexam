"""Backend tests for ÉxamSécure - auth, exams, student join, events, grading."""
import os
import io
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://exam-guard-37.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

TEACHER_EMAIL = "lynchs2757@gmail.com"
TEACHER_PASSWORD = "Enseignant2026!"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def teacher_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": TEACHER_EMAIL, "password": TEACHER_PASSWORD})
    assert r.status_code == 200, f"Teacher login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def seeded_exams(teacher_session):
    r = teacher_session.get(f"{API}/exams")
    assert r.status_code == 200
    exams = r.json()
    by_code = {e["code"]: e for e in exams}
    return by_code


# ---------- Auth ----------
class TestAuth:
    def test_root_api(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
        assert "message" in r.json()

    def test_login_success_and_cookies(self):
        r = requests.post(f"{API}/auth/login", json={"email": TEACHER_EMAIL, "password": TEACHER_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == TEACHER_EMAIL
        assert data["role"] == "teacher"
        # httpOnly cookies
        cookies = r.cookies
        assert "access_token" in cookies
        assert "refresh_token" in cookies

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": TEACHER_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_authenticated(self, teacher_session):
        r = teacher_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == TEACHER_EMAIL

    def test_me_unauthenticated(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_new_teacher(self):
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Pass1234!", "name": "TEST User"})
        assert r.status_code == 200
        assert r.json()["email"] == email

    def test_register_duplicate(self):
        r = requests.post(f"{API}/auth/register", json={"email": TEACHER_EMAIL, "password": "Pass1234!", "name": "dup"})
        assert r.status_code == 400


# ---------- Exams ----------
class TestExams:
    def test_list_seeded_exams(self, seeded_exams):
        for code in ["FRA401", "HIS301", "MAT402"]:
            assert code in seeded_exams, f"Missing seeded code {code}"
        assert seeded_exams["FRA401"]["status"] == "open"
        assert seeded_exams["HIS301"]["status"] == "open"
        assert seeded_exams["MAT402"]["status"] == "draft"
        assert "session_count" in seeded_exams["FRA401"]
        assert "flagged_count" in seeded_exams["FRA401"]

    def test_create_update_delete_exam(self, teacher_session):
        payload = {
            "title": "TEST_Exam",
            "subject": "Test",
            "exam_type": "form",
            "duration_minutes": 30,
            "questions": [
                {"id": str(uuid.uuid4()), "type": "mcq", "text": "2+2?", "options": ["3", "4"], "points": 1},
                {"id": str(uuid.uuid4()), "type": "short", "text": "Capital?", "options": [], "points": 2},
            ],
            "settings": {"allowed_tools": ["usito"], "max_violations": 3, "lock_on_max": True,
                         "require_fullscreen": False, "block_clipboard": True, "browser_spellcheck": False},
            "status": "draft",
        }
        r = teacher_session.post(f"{API}/exams", json=payload)
        assert r.status_code == 200, r.text
        exam = r.json()
        exam_id = exam["id"]
        assert exam["code"] and len(exam["code"]) == 6

        # update to open
        payload["status"] = "open"
        payload["title"] = "TEST_Exam_Updated"
        r = teacher_session.put(f"{API}/exams/{exam_id}", json=payload)
        assert r.status_code == 200
        assert r.json()["title"] == "TEST_Exam_Updated"
        assert r.json()["status"] == "open"

        # verify GET
        r = teacher_session.get(f"{API}/exams/{exam_id}")
        assert r.status_code == 200
        assert r.json()["title"] == "TEST_Exam_Updated"

        # delete
        r = teacher_session.delete(f"{API}/exams/{exam_id}")
        assert r.status_code == 200
        r = teacher_session.get(f"{API}/exams/{exam_id}")
        assert r.status_code == 404


# ---------- Student join ----------
class TestStudentJoin:
    def test_join_invalid_code(self):
        r = requests.post(f"{API}/student/join", json={"code": "ZZZZZZ", "student_name": "TEST"})
        assert r.status_code == 404

    def test_join_draft_refused(self):
        r = requests.post(f"{API}/student/join", json={"code": "MAT402", "student_name": "TEST Draft"})
        assert r.status_code == 403

    def test_join_no_name(self):
        r = requests.post(f"{API}/student/join", json={"code": "FRA401", "student_name": "   "})
        assert r.status_code == 400

    def test_join_open_and_rejoin(self):
        name = f"TEST_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/student/join", json={"code": "FRA401", "student_name": name})
        assert r.status_code == 200
        token1 = r.json()["token"]
        # Rejoin returns same token
        r = requests.post(f"{API}/student/join", json={"code": "FRA401", "student_name": name})
        assert r.status_code == 200
        assert r.json()["token"] == token1


# ---------- Full student flow ----------
class TestStudentFlow:
    @pytest.fixture
    def student_token(self):
        name = f"TEST_Flow_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/student/join", json={"code": "FRA401", "student_name": name})
        assert r.status_code == 200
        return r.json()["token"], name

    def test_session_info(self, student_token):
        token, _ = student_token
        r = requests.get(f"{API}/student/session", headers={"X-Session-Token": token})
        assert r.status_code == 200
        data = r.json()
        assert data["exam"]["title"]
        assert data["session"]["status"] == "in_progress"
        assert data["exam"]["settings"]["max_violations"] == 3

    def test_session_missing_token(self):
        r = requests.get(f"{API}/student/session")
        assert r.status_code == 401

    def test_save_answers(self, student_token):
        token, _ = student_token
        r = requests.put(f"{API}/student/answers", json={"answers": {"q1": "A"}, "essay_html": "<p>hi</p>"},
                         headers={"X-Session-Token": token})
        assert r.status_code == 200
        assert r.json()["last_saved_at"]

    def test_events_count_and_lock(self):
        name = f"TEST_Lock_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/student/join", json={"code": "FRA401", "student_name": name})
        token = r.json()["token"]
        headers = {"X-Session-Token": token}
        last = None
        for i in range(3):
            r = requests.post(f"{API}/student/event", json={"type": "tab_hidden", "detail": f"test {i}"}, headers=headers)
            assert r.status_code == 200
            last = r.json()
        assert last["violations"] == 3
        assert last["status"] == "locked"

    def test_uncounted_event(self, student_token):
        token, _ = student_token
        r = requests.post(f"{API}/student/event", json={"type": "external_focus", "detail": "x"},
                          headers={"X-Session-Token": token})
        assert r.status_code == 200
        assert r.json()["counted"] is False

    def test_submit_and_block_rejoin(self):
        name = f"TEST_Sub_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/student/join", json={"code": "FRA401", "student_name": name})
        token = r.json()["token"]
        r = requests.post(f"{API}/student/submit", json={"answers": {"q": "ans"}, "essay_html": ""},
                         headers={"X-Session-Token": token})
        assert r.status_code == 200
        # rejoin blocked
        r = requests.post(f"{API}/student/join", json={"code": "FRA401", "student_name": name})
        assert r.status_code == 403


# ---------- Teacher grading & unlock ----------
class TestGradingUnlock:
    def test_grade_and_unlock(self, teacher_session, seeded_exams):
        fra = seeded_exams["FRA401"]
        # Create a session, lock it
        name = f"TEST_Grade_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/student/join", json={"code": "FRA401", "student_name": name})
        token = r.json()["token"]
        for _ in range(3):
            requests.post(f"{API}/student/event", json={"type": "tab_hidden"}, headers={"X-Session-Token": token})

        # teacher views sessions
        r = teacher_session.get(f"{API}/exams/{fra['id']}/sessions")
        assert r.status_code == 200
        sessions = r.json()
        mine = next((s for s in sessions if s["student_name"] == name), None)
        assert mine is not None
        assert mine["status"] == "locked"
        assert mine["violations"] >= 3

        # unlock
        r = teacher_session.post(f"{API}/sessions/{mine['id']}/unlock")
        assert r.status_code == 200

        # verify unlocked
        r = teacher_session.get(f"{API}/exams/{fra['id']}/sessions")
        mine2 = next(s for s in r.json() if s["id"] == mine["id"])
        assert mine2["status"] == "in_progress"
        assert mine2["violations"] == 0

        # grade
        grade = {"score": 7.5, "max_score": 10, "comment": "TEST good", "per_question": {"q1": {"score": 2}}}
        r = teacher_session.put(f"{API}/sessions/{mine['id']}/grade", json=grade)
        assert r.status_code == 200
        r = teacher_session.get(f"{API}/exams/{fra['id']}/sessions")
        mine3 = next(s for s in r.json() if s["id"] == mine["id"])
        assert mine3["grade"]["score"] == 7.5
        assert mine3["grade"]["comment"] == "TEST good"


# ---------- File upload ----------
class TestFileUpload:
    def test_upload_invalid_format(self, teacher_session):
        # create a doc exam
        payload = {"title": "TEST_Doc", "exam_type": "document", "duration_minutes": 30, "status": "open"}
        r = teacher_session.post(f"{API}/exams", json=payload)
        exam_id = r.json()["id"]
        files = {"file": ("bad.txt", b"hello", "text/plain")}
        r = teacher_session.post(f"{API}/exams/{exam_id}/file", files=files)
        assert r.status_code == 400
        teacher_session.delete(f"{API}/exams/{exam_id}")

    def test_upload_pdf(self, teacher_session):
        payload = {"title": "TEST_Doc_PDF", "exam_type": "document", "duration_minutes": 30, "status": "open"}
        r = teacher_session.post(f"{API}/exams", json=payload)
        exam_id = r.json()["id"]
        exam_code = r.json()["code"]
        # minimal valid PDF
        pdf_bytes = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
        files = {"file": ("test.pdf", pdf_bytes, "application/pdf")}
        r = teacher_session.post(f"{API}/exams/{exam_id}/file", files=files)
        assert r.status_code == 200, r.text
        assert r.json()["kind"] == "pdf"

        # student should be able to download
        rj = requests.post(f"{API}/student/join", json={"code": exam_code, "student_name": f"TEST_File_{uuid.uuid4().hex[:5]}"})
        token = rj.json()["token"]
        r = requests.get(f"{API}/student/file", headers={"X-Session-Token": token})
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")

        # cleanup
        teacher_session.delete(f"{API}/exams/{exam_id}")
