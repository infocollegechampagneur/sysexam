"""Iteration 6 — Antidote toolbar button + paste history (text field on events).

Validates /api/student/event:
  * type='clipboard_tool' with `text` -> counted=False, event stored with text (truncated at 3000)
  * type='antidote_correct'          -> counted=False
Also validates teacher sessions endpoint exposes `text` on events.
"""
import os
import uuid
import pytest
import requests


def _load_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
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


def _make_exam(teacher, tools):
    payload = {
        "title": f"TEST_V6_{uuid.uuid4().hex[:6]}",
        "subject": "FRA",
        "exam_type": "redaction",
        "status": "open",
        "duration_minutes": 60,
        "writing_prompt": "Rédigez un texte.",
        "settings": {
            "allowed_tools": tools,
            "block_clipboard": True,
            "require_fullscreen": True,
            "max_violations": 3,
            "lock_on_max": True,
        },
        "questions": [],
    }
    r = teacher.post(f"{BASE}/api/exams", json=payload)
    assert r.status_code in (200, 201), r.text
    return r.json()


@pytest.fixture(scope="module")
def antidote_exam(teacher):
    exam = _make_exam(teacher, ["antidote"])
    yield exam
    teacher.delete(f"{BASE}/api/exams/{exam['id']}")


def _join(exam):
    r = requests.post(f"{BASE}/api/student/join", json={"code": exam["code"], "student_name": f"TEST_V6_{uuid.uuid4().hex[:5]}"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_clipboard_tool_with_text(antidote_exam):
    tok = _join(antidote_exam)
    h = {"X-Session-Token": tok}
    body = {"type": "clipboard_tool", "detail": "A collé 5 mot(s)", "text": "Lorem ipsum dolor sit amet"}
    r = requests.post(f"{BASE}/api/student/event", json=body, headers=h)
    assert r.status_code == 200
    d = r.json()
    assert d["counted"] is False
    assert d["violations"] == 0


def test_antidote_correct_not_counted(antidote_exam):
    tok = _join(antidote_exam)
    h = {"X-Session-Token": tok}
    r = requests.post(f"{BASE}/api/student/event", json={"type": "antidote_correct", "detail": "A envoyé vers Antidote"}, headers=h)
    assert r.status_code == 200
    d = r.json()
    assert d["counted"] is False
    assert d["violations"] == 0


def test_text_truncated_to_3000(antidote_exam, teacher):
    tok = _join(antidote_exam)
    h = {"X-Session-Token": tok}
    long_text = "A" * 5000
    body = {"type": "clipboard_tool", "detail": "collage long", "text": long_text}
    r = requests.post(f"{BASE}/api/student/event", json=body, headers=h)
    assert r.status_code == 200
    # Fetch via teacher
    sessions = teacher.get(f"{BASE}/api/exams/{antidote_exam['id']}/sessions").json()
    # find most recent session with our events (sessions have no name match; take the one with matching text)
    found = None
    for s in sessions:
        for e in s.get("events", []):
            if e.get("type") == "clipboard_tool" and e.get("text", "").startswith("AAAA") and len(e["text"]) == 3000:
                found = e
                break
        if found:
            break
    assert found is not None, "Truncated clipboard_tool event text not found"
    assert len(found["text"]) == 3000
    assert found.get("counted") is False


def test_teacher_sees_text_field(antidote_exam, teacher):
    tok = _join(antidote_exam)
    h = {"X-Session-Token": tok}
    marker = f"MARKER_{uuid.uuid4().hex[:8]}"
    pasted = f"Hello world {marker} this is pasted content"
    requests.post(f"{BASE}/api/student/event", json={"type": "clipboard_tool", "detail": "pasted", "text": pasted}, headers=h)
    sessions = teacher.get(f"{BASE}/api/exams/{antidote_exam['id']}/sessions").json()
    hits = [e for s in sessions for e in s.get("events", []) if e.get("type") == "clipboard_tool" and marker in e.get("text", "")]
    assert hits, "No clipboard_tool event with text visible to teacher"
    assert hits[0]["text"] == pasted
    assert hits[0]["counted"] is False
