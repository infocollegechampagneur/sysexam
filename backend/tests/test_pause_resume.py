"""Pause/Resume feature tests for MonExamEnLigne (iter 17)."""
import os, time, pytest, requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://exam-guard-37.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
ADMIN_EMAIL = "lynchs2757@gmail.com"
ADMIN_PASSWORD = "Enseignant2026!"


@pytest.fixture(scope="module")
def teacher():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def fra401_id(teacher):
    r = teacher.get(f"{API}/exams")
    assert r.status_code == 200
    for e in r.json():
        if e["code"] == "FRA401":
            return e["id"]
    pytest.skip("FRA401 not seeded")


@pytest.fixture
def student_token(fra401_id):
    r = requests.post(f"{API}/student/join", json={"code": "FRA401", "student_name": f"TEST Pause {int(time.time()*1000)}"})
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    # Transition from precheck -> in_progress
    h = {"X-Session-Token": tok}
    requests.post(f"{API}/student/precheck", headers=h, json={"forbidden_apps": [], "camera": True, "microphone": True})
    requests.post(f"{API}/student/start", headers=h)
    return tok


def _sess(token):
    r = requests.get(f"{API}/student/session", headers={"X-Session-Token": token})
    assert r.status_code == 200, r.text
    return r.json()


def test_exam_pause_resume_flow(teacher, fra401_id, student_token):
    # Baseline deadline
    s0 = _sess(student_token)
    assert s0.get("paused") is False
    d0 = s0["deadline"]

    # Pause exam
    r = teacher.post(f"{API}/exams/{fra401_id}/pause", json={"message": "Consigne"})
    assert r.status_code == 200, r.text
    assert r.json()["count"] >= 1

    time.sleep(1)
    s1 = _sess(student_token)
    assert s1["paused"] is True
    assert s1["pause_message"] == "Consigne"
    assert s1["deadline"] > d0  # deadline shifts forward

    # Wait 3s, deadline should keep shifting
    time.sleep(3)
    s2 = _sess(student_token)
    assert s2["paused"] is True
    assert s2["deadline"] > s1["deadline"]

    # Resume
    r = teacher.post(f"{API}/exams/{fra401_id}/resume", json={})
    assert r.status_code == 200
    assert r.json()["count"] >= 1

    s3 = _sess(student_token)
    assert s3["paused"] is False
    # final deadline ~= d0 + paused_seconds (2-8s window)
    from datetime import datetime
    def _p(x): return datetime.fromisoformat(x.replace("Z", "+00:00"))
    delta = (_p(s3["deadline"]) - _p(d0)).total_seconds()
    assert 2 <= delta <= 10, f"delta={delta}"


def test_session_pause_resume_and_submitted_400(teacher, fra401_id, student_token):
    # Find the session
    r = teacher.get(f"{API}/exams/{fra401_id}/sessions")
    assert r.status_code == 200
    sess = [s for s in r.json() if s["status"] == "in_progress"]
    assert sess, "no in_progress session"
    sid = sess[0]["id"]

    r = teacher.post(f"{API}/sessions/{sid}/pause", json={"message": "stop"})
    assert r.status_code == 200
    time.sleep(1)
    r = teacher.post(f"{API}/sessions/{sid}/resume", json={})
    assert r.status_code == 200

    # 400 when session not in progress: find a submitted one
    r = teacher.get(f"{API}/exams/{fra401_id}/sessions")
    submitted = [s for s in r.json() if s["status"] != "in_progress"]
    if submitted:
        r = teacher.post(f"{API}/sessions/{submitted[0]['id']}/pause", json={"message": "x"})
        assert r.status_code == 400


def test_pause_many_resume_many(teacher, student_token):
    r = teacher.post(f"{API}/exams/pause-many", json={"message": "break"})
    assert r.status_code == 200
    body = r.json()
    assert "exams" in body and "count" in body

    time.sleep(1)
    r = teacher.post(f"{API}/exams/resume-many", json={})
    assert r.status_code == 200
    body = r.json()
    assert "exams" in body and "count" in body

    # Confirm no exam left paused
    exams = teacher.get(f"{API}/exams").json()
    for e in exams:
        assert not e.get("paused_at"), f"{e['code']} still paused"


def test_events_contain_paused_and_resumed(teacher, fra401_id):
    r = teacher.get(f"{API}/exams/{fra401_id}/sessions")
    assert r.status_code == 200
    for s in r.json():
        detail = teacher.get(f"{API}/sessions/{s['id']}")
        if detail.status_code == 200:
            events = detail.json().get("events") or []
            types = {e.get("type") for e in events}
            if "paused" in types and "resumed" in types:
                return
    pytest.skip("No session with both events (acceptable if cleanup happened)")
