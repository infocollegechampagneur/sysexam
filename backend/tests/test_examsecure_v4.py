"""Iteration 4 - Lock/reopen/broadcast/emergency-exit/forbidden_app features."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://exam-guard-37.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
TEACHER = {"email": "lynchs2757@gmail.com", "password": "Enseignant2026!"}


@pytest.fixture(scope="module")
def teacher():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=TEACHER)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def exam(teacher):
    """Create a dedicated open exam."""
    body = {
        "title": f"TEST_V4_{uuid.uuid4().hex[:6]}",
        "subject": "Test",
        "instructions": "x",
        "exam_type": "redaction",
        "duration_minutes": 60,
        "writing_prompt": "write",
        "settings": {
            "allowed_tools": [],
            "max_violations": 3,
            "lock_on_max": True,
            "require_fullscreen": False,
            "block_clipboard": True,
            "browser_spellcheck": False,
            "require_desktop": False,
            "exit_code": "",
        },
        "status": "open",
    }
    r = teacher.post(f"{API}/exams", json=body)
    assert r.status_code == 200, r.text
    ex = r.json()
    yield ex
    teacher.delete(f"{API}/exams/{ex['id']}")


def _join(code, name):
    r = requests.post(f"{API}/student/join", json={"code": code, "student_name": name})
    assert r.status_code == 200, r.text
    return r.json()["token"]


# --- Exit code auto-generation & privacy ---
class TestExitCode:
    def test_exit_code_generated_on_create(self, exam):
        assert exam["settings"]["exit_code"].isdigit()
        assert len(exam["settings"]["exit_code"]) == 6

    def test_exit_code_not_exposed_to_student(self, exam):
        tok = _join(exam["code"], f"TEST_ec_{uuid.uuid4().hex[:4]}")
        r = requests.get(f"{API}/student/session", headers={"X-Session-Token": tok})
        assert r.status_code == 200
        assert "exit_code" not in r.json()["exam"]["settings"]

    def test_exit_code_persisted_on_update(self, teacher, exam):
        body = {**exam, "settings": {**exam["settings"]}}
        for k in ("id", "teacher_id", "code", "file", "created_at", "session_count",
                  "flagged_count", "locked_count"):
            body.pop(k, None)
        body["settings"]["exit_code"] = ""  # ask for regen
        r = teacher.put(f"{API}/exams/{exam['id']}", json=body)
        assert r.status_code == 200
        new_code = r.json()["settings"]["exit_code"]
        assert new_code.isdigit() and len(new_code) == 6
        exam["settings"]["exit_code"] = new_code  # update for later tests


# --- Lock ---
class TestLock:
    def test_lock_in_progress_session(self, teacher, exam):
        tok = _join(exam["code"], f"TEST_lk_{uuid.uuid4().hex[:4]}")
        sid = teacher.get(f"{API}/exams/{exam['id']}/sessions").json()
        sid = [s for s in sid if s["token" ] == tok][0]["id"] if False else None
        # fetch session id from list
        all_s = teacher.get(f"{API}/exams/{exam['id']}/sessions").json()
        sess = [s for s in all_s if s["student_name"].startswith("TEST_lk_")][-1]
        sid = sess["id"]
        r = teacher.post(f"{API}/sessions/{sid}/lock", json={"reason": "triche"})
        assert r.status_code == 200
        after = [s for s in teacher.get(f"{API}/exams/{exam['id']}/sessions").json() if s["id"] == sid][0]
        assert after["status"] == "locked"
        assert after["locked_by"] == "teacher"
        assert after["lock_reason"] == "triche"
        locked_evs = [e for e in after["events"] if e["type"] == "locked"]
        assert locked_evs and "triche" in locked_evs[-1]["detail"]

    def test_lock_already_locked_returns_400(self, teacher, exam):
        all_s = teacher.get(f"{API}/exams/{exam['id']}/sessions").json()
        sess = [s for s in all_s if s["student_name"].startswith("TEST_lk_")][0]
        r = teacher.post(f"{API}/sessions/{sess['id']}/lock", json={"reason": ""})
        assert r.status_code == 400


# --- Reopen ---
class TestReopen:
    def test_reopen_submitted(self, teacher, exam):
        name = f"TEST_ro_{uuid.uuid4().hex[:4]}"
        tok = _join(exam["code"], name)
        # submit
        r = requests.post(f"{API}/student/submit",
                          headers={"X-Session-Token": tok},
                          json={"answers": {}, "essay_html": "hi", "annotations": []})
        assert r.status_code == 200
        all_s = teacher.get(f"{API}/exams/{exam['id']}/sessions").json()
        sess = [s for s in all_s if s["student_name"] == name][0]
        assert sess["status"] == "submitted"
        r = teacher.post(f"{API}/sessions/{sess['id']}/reopen")
        assert r.status_code == 200
        # student rejoin same code+name
        r = requests.post(f"{API}/student/join",
                          json={"code": exam["code"], "student_name": name})
        assert r.status_code == 200
        assert "token" in r.json()

    def test_reopen_in_progress_returns_400(self, teacher, exam):
        tok = _join(exam["code"], f"TEST_ro2_{uuid.uuid4().hex[:4]}")
        all_s = teacher.get(f"{API}/exams/{exam['id']}/sessions").json()
        sess = [s for s in all_s if s["student_name"].startswith("TEST_ro2_")][-1]
        r = teacher.post(f"{API}/sessions/{sess['id']}/reopen")
        assert r.status_code == 400


# --- Broadcast ---
class TestBroadcast:
    def test_broadcast_sets_teacher_message(self, teacher, exam):
        # Create 2 fresh in_progress sessions
        t1 = _join(exam["code"], f"TEST_bc_{uuid.uuid4().hex[:4]}")
        t2 = _join(exam["code"], f"TEST_bc_{uuid.uuid4().hex[:4]}")
        r = teacher.post(f"{API}/exams/{exam['id']}/broadcast", json={"text": "Reste calme"})
        assert r.status_code == 200
        assert r.json()["sent"] >= 2
        # Each student sees the message
        for tok in (t1, t2):
            rr = requests.get(f"{API}/student/session", headers={"X-Session-Token": tok})
            tm = rr.json()["session"]["teacher_message"]
            assert tm["text"] == "Reste calme" and tm["read"] is False


# --- Lock-all / Unlock-all ---
class TestLockAllUnlockAll:
    def test_lock_all_then_unlock_all_resets_violations(self, teacher, exam):
        # Create a fresh session, cause some violations
        name = f"TEST_la_{uuid.uuid4().hex[:4]}"
        tok = _join(exam["code"], name)
        for _ in range(2):
            requests.post(f"{API}/student/event", headers={"X-Session-Token": tok},
                          json={"type": "tab_hidden", "detail": "x"})
        la = teacher.post(f"{API}/exams/{exam['id']}/lock-all")
        assert la.status_code == 200 and la.json()["count"] >= 1
        all_s = teacher.get(f"{API}/exams/{exam['id']}/sessions").json()
        for s in all_s:
            if s["student_name"] == name:
                assert s["status"] == "locked"
                assert s["violations"] == 2
        ua = teacher.post(f"{API}/exams/{exam['id']}/unlock-all")
        assert ua.status_code == 200 and ua.json()["count"] >= 1
        all_s = teacher.get(f"{API}/exams/{exam['id']}/sessions").json()
        for s in all_s:
            if s["student_name"] == name:
                assert s["status"] == "in_progress"
                assert s["violations"] == 0


# --- Emergency exit ---
class TestEmergencyExit:
    def test_wrong_code_403_and_event(self, teacher, exam):
        name = f"TEST_ex_{uuid.uuid4().hex[:4]}"
        tok = _join(exam["code"], name)
        r = requests.post(f"{API}/student/emergency-exit",
                         headers={"X-Session-Token": tok}, json={"code": "000000"})
        assert r.status_code == 403
        all_s = teacher.get(f"{API}/exams/{exam['id']}/sessions").json()
        sess = [s for s in all_s if s["student_name"] == name][0]
        assert any(e["type"] == "emergency_exit_failed" for e in sess["events"])

    def test_correct_code_200_and_event(self, teacher, exam):
        name = f"TEST_ex_{uuid.uuid4().hex[:4]}"
        tok = _join(exam["code"], name)
        # fetch exit code (teacher side)
        ex = teacher.get(f"{API}/exams/{exam['id']}").json()
        code = ex["settings"]["exit_code"]
        r = requests.post(f"{API}/student/emergency-exit",
                         headers={"X-Session-Token": tok}, json={"code": code})
        assert r.status_code == 200
        all_s = teacher.get(f"{API}/exams/{exam['id']}/sessions").json()
        sess = [s for s in all_s if s["student_name"] == name][0]
        assert any(e["type"] == "emergency_exit" for e in sess["events"])


# --- forbidden_app event is counted ---
class TestForbiddenAppCounted:
    def test_forbidden_app_increments_violations(self, teacher, exam):
        name = f"TEST_fa_{uuid.uuid4().hex[:4]}"
        tok = _join(exam["code"], name)
        r = requests.post(f"{API}/student/event",
                        headers={"X-Session-Token": tok},
                        json={"type": "forbidden_app", "detail": "Chrome / ChatGPT"})
        assert r.status_code == 200
        d = r.json()
        assert d["counted"] is True
        assert d["violations"] == 1
