"""Iteration 3 backend tests: unlock modes (reset/grant), teacher_message, student events with seconds, message-read."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://exam-guard-37.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

TEACHER_EMAIL = "lynchs2757@gmail.com"
TEACHER_PASSWORD = "Enseignant2026!"


@pytest.fixture(scope="module")
def teacher():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": TEACHER_EMAIL, "password": TEACHER_PASSWORD})
    assert r.status_code == 200
    return s


@pytest.fixture
def exam(teacher):
    """Open exam with max_violations=2, lock_on_max=True, no fullscreen required."""
    payload = {
        "title": f"TEST_UnlockV3_{uuid.uuid4().hex[:5]}",
        "exam_type": "form",
        "duration_minutes": 60,
        "questions": [{"id": str(uuid.uuid4()), "type": "short", "text": "Q?", "options": [], "points": 1}],
        "settings": {"allowed_tools": [], "max_violations": 2, "lock_on_max": True,
                     "require_fullscreen": False, "block_clipboard": True, "browser_spellcheck": False},
        "status": "open",
    }
    r = teacher.post(f"{API}/exams", json=payload)
    assert r.status_code == 200, r.text
    ex = r.json()
    yield ex
    teacher.delete(f"{API}/exams/{ex['id']}")


def _join(exam, name=None):
    name = name or f"TEST_S_{uuid.uuid4().hex[:5]}"
    r = requests.post(f"{API}/student/join", json={"code": exam["code"], "student_name": name})
    assert r.status_code == 200, r.text
    return r.json()["token"], name


def _fire(token, type_, detail="x", seconds=0):
    headers = {"X-Session-Token": token}
    payload = {"type": type_, "detail": detail}
    if seconds:
        payload["seconds"] = seconds
    r = requests.post(f"{API}/student/event", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _session(teacher, exam_id, name):
    r = teacher.get(f"{API}/exams/{exam_id}/sessions")
    assert r.status_code == 200
    return next(s for s in r.json() if s["student_name"] == name)


class TestStudentEventResponse:
    def test_event_returns_counts_and_limit(self, exam):
        token, _ = _join(exam)
        r = _fire(token, "tab_hidden")
        assert r["violations"] == 1
        assert r["counted"] is True
        assert r["limit"] == 2
        assert r["status"] == "in_progress"

    def test_event_seconds_stored(self, teacher, exam):
        token, name = _join(exam)
        _fire(token, "returned", "back", seconds=12.4)
        s = _session(teacher, exam["id"], name)
        ev = [e for e in s["events"] if e["type"] == "returned"][-1]
        assert "seconds" in ev
        assert abs(ev["seconds"] - 12.4) < 0.1

    def test_lock_at_limit(self, exam):
        token, _ = _join(exam)
        _fire(token, "tab_hidden")
        r2 = _fire(token, "paste_attempt", "Copié: foo")
        assert r2["violations"] == 2
        assert r2["status"] == "locked"


class TestUnlockReset:
    def test_reset_zeros_counter(self, teacher, exam):
        token, name = _join(exam)
        _fire(token, "tab_hidden"); _fire(token, "paste_attempt")  # lock
        s = _session(teacher, exam["id"], name)
        assert s["status"] == "locked"
        r = teacher.post(f"{API}/sessions/{s['id']}/unlock", json={"mode": "reset"})
        assert r.status_code == 200
        s2 = _session(teacher, exam["id"], name)
        assert s2["status"] == "in_progress"
        assert s2["violations"] == 0
        assert s2.get("allowance", 0) == 0
        # unlocked event present
        assert any(e["type"] == "unlocked" and "zéro" in e["detail"] for e in s2["events"])

    def test_empty_body_defaults_to_reset(self, teacher, exam):
        token, name = _join(exam)
        _fire(token, "tab_hidden"); _fire(token, "paste_attempt")
        s = _session(teacher, exam["id"], name)
        r = teacher.post(f"{API}/sessions/{s['id']}/unlock", json={})
        assert r.status_code == 200
        s2 = _session(teacher, exam["id"], name)
        assert s2["violations"] == 0
        assert s2["status"] == "in_progress"


class TestUnlockGrant:
    def test_grant_extra_1_keeps_counter_and_locks_at_new_limit(self, teacher, exam):
        token, name = _join(exam)
        _fire(token, "tab_hidden"); _fire(token, "paste_attempt")  # violations=2, locked (limit was 2)
        s = _session(teacher, exam["id"], name)
        r = teacher.post(f"{API}/sessions/{s['id']}/unlock", json={"mode": "grant", "extra": 1})
        assert r.status_code == 200
        s2 = _session(teacher, exam["id"], name)
        assert s2["status"] == "in_progress"
        assert s2["violations"] == 2  # counter kept
        # allowance should make new limit = max_violations(2) + allowance = 3
        # The next counted event: violations=3 == limit=3 => should lock again
        resp = _fire(token, "tab_hidden")
        assert resp["limit"] == 3
        assert resp["violations"] == 3
        assert resp["status"] == "locked"

    def test_grant_extra_2(self, teacher, exam):
        token, name = _join(exam)
        _fire(token, "tab_hidden"); _fire(token, "paste_attempt")
        s = _session(teacher, exam["id"], name)
        r = teacher.post(f"{API}/sessions/{s['id']}/unlock", json={"mode": "grant", "extra": 2})
        assert r.status_code == 200
        # Next event: limit should be 4; violations=3 => still in_progress
        r1 = _fire(token, "tab_hidden")
        assert r1["limit"] == 4
        assert r1["violations"] == 3
        assert r1["status"] == "in_progress"
        # Another: violations=4 => locked
        r2 = _fire(token, "tab_hidden")
        assert r2["violations"] == 4
        assert r2["status"] == "locked"


class TestTeacherMessage:
    def test_message_stored_and_marked_read(self, teacher, exam):
        token, name = _join(exam)
        _fire(token, "tab_hidden"); _fire(token, "paste_attempt")
        s = _session(teacher, exam["id"], name)
        msg = "Reste sur la page jusqu'à la fin."
        r = teacher.post(f"{API}/sessions/{s['id']}/unlock",
                         json={"mode": "grant", "extra": 1, "message": msg})
        assert r.status_code == 200
        s2 = _session(teacher, exam["id"], name)
        tm = s2.get("teacher_message")
        assert tm is not None
        assert tm["text"] == msg
        assert tm["read"] is False
        # unlocked event detail includes message
        unlocked = [e for e in s2["events"] if e["type"] == "unlocked"][-1]
        assert msg in unlocked["detail"]

        # Student session shows the message
        r2 = requests.get(f"{API}/student/session", headers={"X-Session-Token": token})
        assert r2.status_code == 200
        sess_tm = r2.json()["session"].get("teacher_message")
        assert sess_tm and sess_tm["text"] == msg and sess_tm["read"] is False

        # Student marks as read
        r3 = requests.post(f"{API}/student/message-read", headers={"X-Session-Token": token})
        assert r3.status_code == 200

        s3 = _session(teacher, exam["id"], name)
        assert s3["teacher_message"]["read"] is True
        assert any(e["type"] == "message_read" for e in s3["events"])

    def test_empty_message_not_stored(self, teacher, exam):
        token, name = _join(exam)
        _fire(token, "tab_hidden"); _fire(token, "paste_attempt")
        s = _session(teacher, exam["id"], name)
        r = teacher.post(f"{API}/sessions/{s['id']}/unlock",
                         json={"mode": "reset", "message": "   "})
        assert r.status_code == 200
        s2 = _session(teacher, exam["id"], name)
        # No teacher_message or unchanged
        assert not s2.get("teacher_message")
