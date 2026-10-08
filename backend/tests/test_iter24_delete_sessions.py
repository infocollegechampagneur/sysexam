"""Iteration 24: DELETE /api/exams/{id}/sessions and DELETE /api/sessions/{id}."""
import os
import uuid
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "lynchs2757@gmail.com"
ADMIN_PASS = "Enseignant2026!"


@pytest.fixture(scope="module")
def admin_sess():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    return s


def _create_exam(admin_sess):
    body = {
        "title": f"TEST_iter24_{uuid.uuid4().hex[:6]}",
        "subject": "T",
        "duration_min": 30,
        "type": "form",
        "status": "open",
        "questions": [{"text": "q?", "type": "short", "points": 1}],
    }
    r = admin_sess.post(f"{BASE}/api/exams", json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _join(code, name_suffix=""):
    s = requests.Session()
    r = s.post(f"{BASE}/api/student/join", json={
        "code": code,
        "student_name": f"TEST_s{name_suffix}_{uuid.uuid4().hex[:4]}",
        "student_number": uuid.uuid4().hex[:6],
        "teacher_name": "T",
        "client": "web",
    })
    assert r.status_code == 200, r.text
    return r.json()["token"]


class TestDeleteSessions:
    def test_full_flow(self, admin_sess):
        exam = _create_exam(admin_sess)
        exam_id = exam["id"]
        code = exam["code"]

        # Three students join
        t1 = _join(code, "1")
        t2 = _join(code, "2")
        t3 = _join(code, "3")

        # Submit one copy
        r = requests.post(f"{BASE}/api/student/submit",
                          headers={"X-Session-Token": t1},
                          json={"answers": {}, "essay_html": ""})
        assert r.status_code == 200, r.text

        # list sessions
        r = admin_sess.get(f"{BASE}/api/exams/{exam_id}/sessions")
        assert r.status_code == 200
        sessions = r.json()
        assert len(sessions) == 3
        s_ids = [s["id"] for s in sessions]

        # Delete one
        r = admin_sess.delete(f"{BASE}/api/sessions/{s_ids[0]}")
        assert r.status_code == 200, r.text
        r = admin_sess.get(f"{BASE}/api/exams/{exam_id}/sessions")
        assert r.status_code == 200
        assert len(r.json()) == 2

        # Clear all sessions
        r = admin_sess.delete(f"{BASE}/api/exams/{exam_id}/sessions")
        assert r.status_code == 200, r.text
        assert r.json().get("deleted") == 2

        # List empty
        r = admin_sess.get(f"{BASE}/api/exams/{exam_id}/sessions")
        assert r.status_code == 200
        assert r.json() == []

        # Exam still exists with same code
        r = admin_sess.get(f"{BASE}/api/exams/{exam_id}")
        assert r.status_code == 200
        assert r.json()["code"] == code

        # Student can rejoin
        t4 = _join(code, "4")
        assert t4

        # Deleted session's old token should no longer work
        # (t2 was deleted via clear all)
        r = requests.get(f"{BASE}/api/student/session",
                         headers={"X-Session-Token": t2})
        assert r.status_code in (401, 404), r.text

    def test_delete_unauth(self, admin_sess):
        exam = _create_exam(admin_sess)
        t = _join(exam["code"])
        r = admin_sess.get(f"{BASE}/api/exams/{exam['id']}/sessions")
        sid = r.json()[0]["id"]

        # No auth
        r = requests.delete(f"{BASE}/api/sessions/{sid}")
        assert r.status_code == 401, r.text

        r = requests.delete(f"{BASE}/api/exams/{exam['id']}/sessions")
        assert r.status_code == 401, r.text

        # cleanup
        admin_sess.delete(f"{BASE}/api/exams/{exam['id']}/sessions")

    def test_delete_other_teacher_404(self, admin_sess):
        # Create a second teacher via admin
        email = f"TEST_t_{uuid.uuid4().hex[:6]}@test.com"
        r = admin_sess.post(f"{BASE}/api/admin/users",
                            json={"email": email, "name": "T2", "password": "Enseignant2026!", "role": "teacher"})
        assert r.status_code in (200, 201), r.text

        # New teacher creates own exam + session
        s2 = requests.Session()
        r = s2.post(f"{BASE}/api/auth/login", json={"email": email, "password": "Enseignant2026!"})
        assert r.status_code == 200, r.text
        # Possibly must_change_password
        r2 = s2.post(f"{BASE}/api/auth/change-password",
                     json={"current_password": "Enseignant2026!", "new_password": "Enseignant2026!X"})
        # ok if 200 or already changed (400)
        if r2.status_code == 200:
            s2 = requests.Session()
            s2.post(f"{BASE}/api/auth/login", json={"email": email, "password": "Enseignant2026!X"})

        body = {
            "title": f"TEST_iter24_other_{uuid.uuid4().hex[:4]}",
            "subject": "T", "duration_min": 30, "type": "form", "status": "open",
            "questions": [{"text": "q?", "type": "short", "points": 1}],
        }
        r = s2.post(f"{BASE}/api/exams", json=body)
        assert r.status_code in (200, 201), r.text
        other_exam = r.json()
        _join(other_exam["code"])

        # Get sid as other teacher
        r = s2.get(f"{BASE}/api/exams/{other_exam['id']}/sessions")
        assert r.status_code == 200
        sid = r.json()[0]["id"]

        # Admin tries to delete other teacher's session
        r = admin_sess.delete(f"{BASE}/api/sessions/{sid}")
        assert r.status_code == 404, r.text

        # cleanup
        s2.delete(f"{BASE}/api/exams/{other_exam['id']}")
