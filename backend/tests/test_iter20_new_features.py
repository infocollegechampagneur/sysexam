"""Backend tests for iteration 20: partial_credit, shuffle_options, stats, question bank."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://exam-guard-37.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "lynchs2757@gmail.com"
ADMIN_PASSWORD = "Enseignant2026!"


@pytest.fixture(scope="module")
def teacher():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return s


def _mkexam(teacher, *, partial=False, shuffle=False, questions=None, status="open", title=None, subject="Mathématiques"):
    body = {
        "title": title or f"TEST_iter20_{uuid.uuid4().hex[:8]}",
        "subject": subject,
        "exam_type": "form",
        "duration_minutes": 60,
        "questions": questions or [],
        "settings": {
            "allowed_tools": [], "max_violations": 3, "lock_on_max": True,
            "require_fullscreen": False, "block_clipboard": False, "browser_spellcheck": False,
            "require_desktop": False, "exit_code": "",
            "partial_credit": partial, "shuffle_options": shuffle,
        },
        "status": status,
    }
    r = teacher.post(f"{API}/exams", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _join(code, name):
    r = requests.post(f"{API}/student/join", json={"code": code, "student_name": name})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _save_and_submit(token, qid, value):
    h = {"X-Session-Token": token}
    r = requests.put(f"{API}/student/answers", json={"answers": {qid: value}, "essay_html": "", "annotations": []}, headers=h)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/student/submit", json={"answers": {qid: value}, "essay_html": "", "annotations": []}, headers=h)
    assert r.status_code == 200, r.text


# --- Partial Credit ---

@pytest.mark.parametrize("answer,expected_rate", [
    (["A"], 50),
    (["A", "B"], 0),
    (["A", "C"], 100),
    (["A", "B", "C"], 50),
])
def test_partial_credit_enabled(teacher, answer, expected_rate):
    qid = str(uuid.uuid4())
    exam = _mkexam(teacher, partial=True, questions=[{
        "id": qid, "type": "mcq", "text": f"Partial Q {expected_rate}",
        "options": ["A", "B", "C", "D"], "correct": [0, 2], "points": 2
    }])
    token = _join(exam["code"], f"TEST_stud_{uuid.uuid4().hex[:6]}")
    _save_and_submit(token, qid, answer)
    r = teacher.get(f"{API}/exams/{exam['id']}/stats")
    assert r.status_code == 200, r.text
    stats = r.json()
    q = stats["questions"][0]
    assert q["success_rate"] == expected_rate, f"Expected {expected_rate} got {q['success_rate']} for answer {answer}"


def test_partial_credit_disabled_all_or_nothing(teacher):
    qid = str(uuid.uuid4())
    exam = _mkexam(teacher, partial=False, questions=[{
        "id": qid, "type": "mcq", "text": "AllOrNothing",
        "options": ["A", "B", "C", "D"], "correct": [0, 2], "points": 2
    }])
    token = _join(exam["code"], f"TEST_stud_{uuid.uuid4().hex[:6]}")
    _save_and_submit(token, qid, ["A"])
    stats = teacher.get(f"{API}/exams/{exam['id']}/stats").json()
    assert stats["questions"][0]["success_rate"] == 0


# --- Shuffle options ---

def test_shuffle_options_deterministic_per_student(teacher):
    qid = str(uuid.uuid4())
    options = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"]
    exam = _mkexam(teacher, shuffle=True, questions=[{
        "id": qid, "type": "mcq", "text": "Shuffled",
        "options": options, "correct": [0], "points": 1
    }])
    token_a = _join(exam["code"], f"TEST_studA_{uuid.uuid4().hex[:6]}")
    token_b = _join(exam["code"], f"TEST_studB_{uuid.uuid4().hex[:6]}")

    def get_opts(tok):
        r = requests.get(f"{API}/student/session", headers={"X-Session-Token": tok})
        assert r.status_code == 200
        return r.json()["exam"]["questions"][0]["options"]

    a1 = get_opts(token_a)
    a2 = get_opts(token_a)
    b1 = get_opts(token_b)
    assert a1 == a2, "Same student must see consistent order"
    assert sorted(a1) == sorted(options), "Same options set"
    assert sorted(b1) == sorted(options)
    # Not strictly required they differ, but very likely with 6 opts & different session ids
    # We just confirm both are permutations of originals


def test_shuffle_disabled_preserves_order(teacher):
    qid = str(uuid.uuid4())
    options = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"]
    exam = _mkexam(teacher, shuffle=False, questions=[{
        "id": qid, "type": "mcq", "text": "NoShuffle",
        "options": options, "correct": [0], "points": 1
    }])
    token = _join(exam["code"], f"TEST_stud_{uuid.uuid4().hex[:6]}")
    r = requests.get(f"{API}/student/session", headers={"X-Session-Token": token})
    got = r.json()["exam"]["questions"][0]["options"]
    assert got == options


# --- Stats endpoint shape & short answer manual grading ---

def test_stats_shape_and_short_answer_grading(teacher):
    qid_mcq = str(uuid.uuid4())
    qid_short = str(uuid.uuid4())
    exam = _mkexam(teacher, partial=False, questions=[
        {"id": qid_mcq, "type": "mcq", "text": "Q1", "options": ["X", "Y"], "correct": [0], "points": 1},
        {"id": qid_short, "type": "short", "text": "Q2", "options": [], "correct": [], "points": 4},
    ])
    token = _join(exam["code"], f"TEST_stud_{uuid.uuid4().hex[:6]}")
    h = {"X-Session-Token": token}
    requests.put(f"{API}/student/answers", json={"answers": {qid_mcq: "X", qid_short: "Hello"}, "essay_html": "", "annotations": []}, headers=h)
    requests.post(f"{API}/student/submit", json={"answers": {qid_mcq: "X", qid_short: "Hello"}, "essay_html": "", "annotations": []}, headers=h)

    sess = teacher.get(f"{API}/exams/{exam['id']}/sessions").json()
    sid = sess[0]["id"]
    # grade short Q with 2/4
    g = teacher.put(f"{API}/sessions/{sid}/grade", json={"score": 2, "max_score": 5, "comment": "", "per_question": {qid_short: {"points": 2}}})
    assert g.status_code == 200

    stats = teacher.get(f"{API}/exams/{exam['id']}/stats").json()
    assert stats["total"] == 1
    assert stats["submitted"] == 1
    assert len(stats["questions"]) == 2
    q1, q2 = stats["questions"]
    # MCQ fields
    assert q1["success_rate"] == 100
    assert q1["answered"] == 1
    assert q1["full_marks"] == 1
    assert q1["distribution"] == {"X": 1, "Y": 0}
    assert q1["correct"] == ["X"]
    # Short Q: 2/4 = 50%
    assert q2["success_rate"] == 50
    assert q2["distribution"] is None


# --- Question Bank ---

def test_bank_auto_populated_on_create_and_update(teacher):
    t1 = f"TEST_bank_q1_{uuid.uuid4().hex[:6]}"
    t2 = f"TEST_bank_q2_{uuid.uuid4().hex[:6]}"
    exam = _mkexam(teacher, questions=[
        {"id": str(uuid.uuid4()), "type": "mcq", "text": t1, "options": ["a", "b"], "correct": [0], "points": 1},
        {"id": str(uuid.uuid4()), "type": "short", "text": t2, "options": [], "correct": [], "points": 2},
        {"id": str(uuid.uuid4()), "type": "short", "text": "   ", "options": [], "correct": [], "points": 1},  # empty - excluded
    ], subject="SubjectTest")
    r = teacher.get(f"{API}/bank", params={"q": "TEST_bank_q"})
    assert r.status_code == 200
    items = r.json()["items"]
    texts = [i["question"]["text"] for i in items]
    assert t1 in texts and t2 in texts
    # No empty-text question
    assert "" not in texts and "   " not in texts
    # Source auto, subject, exam_title set
    it = next(i for i in items if i["question"]["text"] == t1)
    assert it["source"] == "auto"
    assert it["subject"] == "SubjectTest"
    assert it["exam_title"] == exam["title"]

    # Update exam - no duplicate created
    exam2 = dict(exam)
    for k in ("id", "code", "teacher_id", "created_at", "file"):
        exam2.pop(k, None)
    exam2["questions"][0]["text"] = t1 + "_updated"
    r = teacher.put(f"{API}/exams/{exam['id']}", json=exam2)
    assert r.status_code == 200
    bank2 = teacher.get(f"{API}/bank", params={"q": "TEST_bank_q"}).json()["items"]
    texts2 = [i["question"]["text"] for i in bank2]
    assert t1 + "_updated" in texts2
    assert t1 not in texts2  # old text replaced on same question_id (not duplicated)


def test_bank_manual_add_filter_delete(teacher):
    tag = uuid.uuid4().hex[:6]
    text = f"TEST_manual_{tag} special FINDME"
    q = {"id": str(uuid.uuid4()), "type": "short", "text": text, "options": [], "correct": [], "points": 2, "hint": "", "expected": ""}
    r = teacher.post(f"{API}/bank", json={"question": q, "subject": "ManualSubj"})
    assert r.status_code == 200, r.text
    assert r.json()["source"] == "manual"
    item_id = r.json()["id"]

    # filter q (case-insensitive)
    r = teacher.get(f"{API}/bank", params={"q": "findme"})
    assert any(i["question"]["text"] == text for i in r.json()["items"])

    # filter type
    r = teacher.get(f"{API}/bank", params={"q": f"TEST_manual_{tag}", "type": "short"})
    assert len(r.json()["items"]) >= 1
    r = teacher.get(f"{API}/bank", params={"q": f"TEST_manual_{tag}", "type": "mcq"})
    assert not any(i["question"]["text"] == text for i in r.json()["items"])

    # filter subject
    r = teacher.get(f"{API}/bank", params={"q": f"TEST_manual_{tag}", "subject": "ManualSubj"})
    assert any(i["question"]["text"] == text for i in r.json()["items"])

    # delete (hides)
    r = teacher.delete(f"{API}/bank/{item_id}")
    assert r.status_code == 200
    r = teacher.get(f"{API}/bank", params={"q": "findme"})
    assert not any(i["id"] == item_id for i in r.json()["items"])


def test_bank_empty_text_rejected(teacher):
    q = {"id": str(uuid.uuid4()), "type": "short", "text": "   ", "options": [], "correct": [], "points": 1}
    r = teacher.post(f"{API}/bank", json={"question": q, "subject": ""})
    assert r.status_code == 400
