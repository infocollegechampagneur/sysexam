"""Iteration 7 — Suspect paste detection + text comparison fields.

Validates /api/student/event clipboard_tool stores:
  * words = count of words in `text`
  * similarity = 0..100 (% of pasted words already in `before`)
  * before_words = count of words in `before`
  * suspect = (words >= 40)
And teacher GET /api/exams/{id}/sessions exposes those fields.
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
    assert url
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
def exam(teacher):
    payload = {
        "title": f"TEST_V7_{uuid.uuid4().hex[:6]}",
        "subject": "FRA",
        "exam_type": "redaction",
        "status": "open",
        "duration_minutes": 60,
        "writing_prompt": "Rédigez.",
        "settings": {
            "allowed_tools": ["antidote"],
            "block_clipboard": True,
            "require_fullscreen": True,
            "max_violations": 3,
            "lock_on_max": True,
        },
        "questions": [],
    }
    r = teacher.post(f"{BASE}/api/exams", json=payload)
    assert r.status_code in (200, 201), r.text
    ex = r.json()
    yield ex
    teacher.delete(f"{BASE}/api/exams/{ex['id']}")


def _join(exam):
    r = requests.post(f"{BASE}/api/student/join", json={"code": exam["code"], "student_name": f"TEST_V7_{uuid.uuid4().hex[:5]}"})
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json().get("session", {}).get("id")


def _find_event(teacher, exam, marker):
    sessions = teacher.get(f"{BASE}/api/exams/{exam['id']}/sessions").json()
    for s in sessions:
        for e in s.get("events", []):
            if e.get("type") == "clipboard_tool" and marker in (e.get("text") or ""):
                return s, e
    return None, None


def test_suspect_paste_high_similarity(exam, teacher):
    tok, _ = _join(exam)
    h = {"X-Session-Token": tok}
    marker = f"M{uuid.uuid4().hex[:8]}"
    # 50 words, each repeated in before (so similarity ~100%)
    words = [f"mot{i}" for i in range(50)]
    pasted = marker + " " + " ".join(words)
    before = " ".join(words) + " extra texte déjà écrit par l'élève"
    r = requests.post(f"{BASE}/api/student/event", json={"type": "clipboard_tool", "detail": "d", "text": pasted, "before": before}, headers=h)
    assert r.status_code == 200
    assert r.json()["counted"] is False
    _, ev = _find_event(teacher, exam, marker)
    assert ev is not None
    assert ev["words"] >= 40
    assert ev["suspect"] is True
    assert ev["before_words"] > 0
    assert ev["similarity"] >= 70


def test_paste_empty_before(exam, teacher):
    tok, _ = _join(exam)
    h = {"X-Session-Token": tok}
    marker = f"M{uuid.uuid4().hex[:8]}"
    pasted = marker + " " + " ".join([f"w{i}" for i in range(45)])
    r = requests.post(f"{BASE}/api/student/event", json={"type": "clipboard_tool", "detail": "d", "text": pasted, "before": ""}, headers=h)
    assert r.status_code == 200
    _, ev = _find_event(teacher, exam, marker)
    assert ev is not None
    assert ev["before_words"] == 0
    assert ev["similarity"] == 0
    assert ev["suspect"] is True


def test_short_paste_not_suspect(exam, teacher):
    tok, _ = _join(exam)
    h = {"X-Session-Token": tok}
    marker = f"M{uuid.uuid4().hex[:8]}"
    pasted = marker + " only ten short words here one two three four"  # ~11 words
    r = requests.post(f"{BASE}/api/student/event", json={"type": "clipboard_tool", "detail": "d", "text": pasted, "before": "ignored"}, headers=h)
    assert r.status_code == 200
    _, ev = _find_event(teacher, exam, marker)
    assert ev is not None
    assert ev["suspect"] is False
    assert ev["words"] < 40


def test_paste_partial_similarity(exam, teacher):
    tok, _ = _join(exam)
    h = {"X-Session-Token": tok}
    marker = f"M{uuid.uuid4().hex[:8]}"
    # 50 words: half overlap with before
    pasted_words = [f"same{i}" for i in range(25)] + [f"new{i}" for i in range(25)]
    pasted = marker + " " + " ".join(pasted_words)
    before = " ".join([f"same{i}" for i in range(25)])
    r = requests.post(f"{BASE}/api/student/event", json={"type": "clipboard_tool", "detail": "d", "text": pasted, "before": before}, headers=h)
    assert r.status_code == 200
    _, ev = _find_event(teacher, exam, marker)
    assert ev is not None
    assert ev["suspect"] is True
    # ~50% (marker not in before = 1 miss; 25 same + 25 new + 1 marker = 51)
    assert 40 <= ev["similarity"] <= 69
