"""Iteration 5 — Antidote/desktop-tool clipboard whitelist in answer zone.
Validates /api/student/event behavior:
  * type='clipboard_tool'     -> counted=False, no violation increment
  * type='fullscreen_exit_tool' -> counted=False
  * type='paste_attempt'      -> counted=True, violation++
Also validates teacher session detail exposes the events.
"""
import os
import uuid
import pytest
import requests

def _load_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break
        except FileNotFoundError:
            pass
    assert url, "REACT_APP_BACKEND_URL not set"
    return url.rstrip("/")

BASE = _load_url()
TEACHER = {"email": "lynchs2757@gmail.com", "password": "Enseignant2026!"}


@pytest.fixture(scope="module")
def teacher():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=TEACHER)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def antidote_exam(teacher):
    # Create a redaction exam with antidote allowed + block_clipboard on
    payload = {
        "title": f"TEST_V5_antidote_{uuid.uuid4().hex[:6]}",
        "subject": "FRA",
        "type": "redaction",
        "status": "open",
        "code": f"T5{uuid.uuid4().hex[:4].upper()}",
        "duration_minutes": 60,
        "settings": {
            "allowed_tools": ["antidote"],
            "block_clipboard": True,
            "require_fullscreen": True,
            "max_violations": 3,
            "lock_on_max": True,
        },
        "items": [{"id": "q1", "type": "essay", "prompt": "Rédigez.", "points": 10}],
    }
    r = teacher.post(f"{BASE}/api/exams", json=payload)
    assert r.status_code in (200, 201), r.text
    exam = r.json()
    yield exam
    teacher.delete(f"{BASE}/api/exams/{exam['id']}")


@pytest.fixture(scope="module")
def no_tool_exam(teacher):
    payload = {
        "title": f"TEST_V5_notool_{uuid.uuid4().hex[:6]}",
        "subject": "FRA",
        "type": "redaction",
        "status": "open",
        "code": f"N5{uuid.uuid4().hex[:4].upper()}",
        "duration_minutes": 60,
        "settings": {
            "allowed_tools": [],
            "block_clipboard": True,
            "require_fullscreen": True,
            "max_violations": 3,
            "lock_on_max": True,
        },
        "items": [{"id": "q1", "type": "essay", "prompt": "Rédigez.", "points": 10}],
    }
    r = teacher.post(f"{BASE}/api/exams", json=payload)
    assert r.status_code in (200, 201), r.text
    exam = r.json()
    yield exam
    teacher.delete(f"{BASE}/api/exams/{exam['id']}")


def _join(exam):
    r = requests.post(f"{BASE}/api/student/join", json={"code": exam["code"], "student_name": f"TEST_V5_{uuid.uuid4().hex[:5]}"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_clipboard_tool_not_counted(antidote_exam, teacher):
    tok = _join(antidote_exam)
    h = {"X-Session-Token": tok}
    r = requests.post(f"{BASE}/api/student/event", json={"type": "clipboard_tool", "detail": "A collé du texte dans sa zone (permis)"}, headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["counted"] is False
    assert data["violations"] == 0
    assert data["status"] == "in_progress"


def test_fullscreen_exit_tool_not_counted(antidote_exam):
    tok = _join(antidote_exam)
    h = {"X-Session-Token": tok}
    r = requests.post(f"{BASE}/api/student/event", json={"type": "fullscreen_exit_tool", "detail": "sortie pour outil"}, headers=h)
    assert r.status_code == 200
    assert r.json()["counted"] is False
    assert r.json()["violations"] == 0


def test_paste_attempt_counted_with_tool_too(antidote_exam):
    # The frontend decides to send paste_attempt only when outside the answer zone.
    # Backend must still COUNT paste_attempt even if antidote is allowed.
    tok = _join(antidote_exam)
    h = {"X-Session-Token": tok}
    r = requests.post(f"{BASE}/api/student/event", json={"type": "paste_attempt", "detail": "copie depuis l'énoncé"}, headers=h)
    assert r.status_code == 200
    d = r.json()
    assert d["counted"] is True
    assert d["violations"] == 1


def test_no_tool_paste_attempt_counted(no_tool_exam):
    tok = _join(no_tool_exam)
    h = {"X-Session-Token": tok}
    r = requests.post(f"{BASE}/api/student/event", json={"type": "paste_attempt", "detail": "tenté coller"}, headers=h)
    assert r.status_code == 200
    d = r.json()
    assert d["counted"] is True
    assert d["violations"] == 1


def test_events_visible_to_teacher(antidote_exam, teacher):
    tok = _join(antidote_exam)
    h = {"X-Session-Token": tok}
    requests.post(f"{BASE}/api/student/event", json={"type": "clipboard_tool", "detail": "collé Antidote"}, headers=h)
    requests.post(f"{BASE}/api/student/event", json={"type": "fullscreen_exit_tool", "detail": "sortie pour outil"}, headers=h)
    # Find session via teacher API
    r = teacher.get(f"{BASE}/api/exams/{antidote_exam['id']}/sessions")
    assert r.status_code == 200
    sessions = r.json()
    assert len(sessions) >= 1
    sess = sessions[-1]
    # Possibly need detail endpoint
    detail = teacher.get(f"{BASE}/api/sessions/{sess['id']}")
    if detail.status_code == 200:
        events = detail.json().get("events", [])
    else:
        events = sess.get("events", [])
    types = [e["type"] for e in events]
    assert "clipboard_tool" in types
    assert "fullscreen_exit_tool" in types
    # Both must be counted=False
    for e in events:
        if e["type"] in ("clipboard_tool", "fullscreen_exit_tool"):
            assert e.get("counted") is False
