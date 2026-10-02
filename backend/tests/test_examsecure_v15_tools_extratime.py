"""Iteration 15: Teacher per-session tools override + extra-time during exam.

Covers:
- PUT /api/sessions/{id}/tools with ['usito','bogus'] → 200 tools_override ['usito']
- GET /api/student/session returns exam.settings.allowed_tools merged (includes usito)
- events contain 'tools_changed'
- Non-owner teacher → 404 (per server.own_exam)
- PUT /api/sessions/{id}/extra-time 10 updates deadline by ~10 minutes
"""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _load_backend_url()
ADMIN_EMAIL = "lynchs2757@gmail.com"
ADMIN_PASSWORD = "Enseignant2026!"
FRA401_CODE = "FRA401"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def other_teacher_session(admin_session):
    """Create a secondary teacher, forced to change pwd, perform first login + change_pwd."""
    email = f"test_sdet_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "TempPass123!"
    new_pwd = "Enseignant2026!"
    r = admin_session.post(f"{BASE_URL}/api/admin/users",
                           json={"email": email, "name": "SDET Teacher", "role": "teacher", "password": pwd})
    assert r.status_code in (200, 201), r.text
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, r.text
    # may need password change
    r2 = s.post(f"{BASE_URL}/api/auth/change-password",
                json={"current_password": pwd, "new_password": new_pwd})
    # 200 if required, else may be 400; both ok
    return s


@pytest.fixture
def student_token():
    r = requests.post(f"{BASE_URL}/api/student/join",
                      json={"code": FRA401_CODE, "student_name": f"TEST SDET {uuid.uuid4().hex[:6]}",
                            "student_number": "", "client": "web", "teacher_name": ""})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture
def session_id(admin_session, student_token):
    # find FRA401 exam id
    exams = admin_session.get(f"{BASE_URL}/api/exams").json()
    fra = next(e for e in exams if e["code"] == FRA401_CODE)
    sessions = admin_session.get(f"{BASE_URL}/api/exams/{fra['id']}/sessions").json()
    # find session that matches our token
    me = requests.get(f"{BASE_URL}/api/student/session",
                      headers={"X-Session-Token": student_token}).json()
    sid = me["session"]["id"]
    assert any(s["id"] == sid for s in sessions)
    return sid


class TestSessionTools:
    def test_tools_override_filters_bogus(self, admin_session, session_id, student_token):
        r = admin_session.put(f"{BASE_URL}/api/sessions/{session_id}/tools",
                              json={"tools": ["usito", "bogus"]})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["tools_override"] == ["usito"]

        # student sees merged allowed_tools
        r2 = requests.get(f"{BASE_URL}/api/student/session",
                          headers={"X-Session-Token": student_token})
        assert r2.status_code == 200
        allowed = r2.json()["exam"]["settings"]["allowed_tools"]
        assert "usito" in allowed
        # usito already in exam, so still in list — test with wordreference too (not in FRA401)
        r3 = admin_session.put(f"{BASE_URL}/api/sessions/{session_id}/tools",
                               json={"tools": ["wordreference"]})
        assert r3.status_code == 200
        allowed2 = requests.get(f"{BASE_URL}/api/student/session",
                                headers={"X-Session-Token": student_token}).json()["exam"]["settings"]["allowed_tools"]
        assert "wordreference" in allowed2
        assert "antidote" in allowed2  # original exam tool preserved

    def test_events_contain_tools_changed(self, admin_session, session_id):
        # perform the PUT in-test so this test is self-contained
        r = admin_session.put(f"{BASE_URL}/api/sessions/{session_id}/tools",
                              json={"tools": ["usito"]})
        assert r.status_code == 200
        exams = admin_session.get(f"{BASE_URL}/api/exams").json()
        fra = next(e for e in exams if e["code"] == FRA401_CODE)
        sessions = admin_session.get(f"{BASE_URL}/api/exams/{fra['id']}/sessions").json()
        s = next(x for x in sessions if x["id"] == session_id)
        types = [e.get("type") for e in s.get("events", [])]
        assert "tools_changed" in types

    def test_non_owner_teacher_rejected(self, other_teacher_session, session_id):
        r = other_teacher_session.put(f"{BASE_URL}/api/sessions/{session_id}/tools",
                                      json={"tools": ["usito"]})
        assert r.status_code in (403, 404), f"expected 403/404 got {r.status_code}"


class TestExtraTime:
    def test_extra_time_shifts_deadline(self, admin_session, session_id, student_token):
        before = requests.get(f"{BASE_URL}/api/student/session",
                              headers={"X-Session-Token": student_token}).json()
        dl_before = datetime.fromisoformat(before["deadline"].replace("Z", "+00:00"))

        r = admin_session.put(f"{BASE_URL}/api/sessions/{session_id}/extra-time",
                              json={"extra_minutes": 10})
        assert r.status_code == 200, r.text

        after = requests.get(f"{BASE_URL}/api/student/session",
                             headers={"X-Session-Token": student_token}).json()
        dl_after = datetime.fromisoformat(after["deadline"].replace("Z", "+00:00"))
        diff = (dl_after - dl_before).total_seconds() / 60.0
        assert 9.5 <= diff <= 10.5, f"deadline shifted by {diff} min, expected ~10"

    def test_extra_time_non_owner_rejected(self, other_teacher_session, session_id):
        r = other_teacher_session.put(f"{BASE_URL}/api/sessions/{session_id}/extra-time",
                                      json={"extra_minutes": 5})
        assert r.status_code in (403, 404)
