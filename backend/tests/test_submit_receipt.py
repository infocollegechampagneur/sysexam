"""Tests for /api/student/submit submission receipt (iteration 18)."""
import os
import re
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()
BASE_URL = BASE_URL.rstrip("/")


def _join(code: str, name: str) -> tuple[str, dict]:
    r = requests.post(f"{BASE_URL}/api/student/join", json={"code": code, "student_name": name})
    assert r.status_code == 200, f"join failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data
    return data["token"], data


def _session(token: str) -> dict:
    r = requests.get(f"{BASE_URL}/api/student/session", headers={"X-Session-Token": token})
    assert r.status_code == 200, r.text
    return r.json()


RECEIPT_RE = re.compile(r"^[A-Z0-9]{8}$")


class TestSubmitReceipt:
    def test_form_fra401_submit_and_resubmit(self):
        token, _ = _join("FRA401", "TEST SubmitReceipt FORM")
        s = _session(token)
        exam = s.get("exam") or {}
        questions = exam.get("questions") or []
        assert len(questions) > 0, "FRA401 should have questions"

        # Answer only the first question
        answers = {}
        first_q = questions[0]
        if first_q.get("type") in ("multiple_choice", "qcm") and first_q.get("choices"):
            answers[first_q["id"]] = first_q["choices"][0].get("id") or first_q["choices"][0].get("text") or "A"
        else:
            answers[first_q["id"]] = "ma reponse"

        r = requests.post(
            f"{BASE_URL}/api/student/submit",
            headers={"X-Session-Token": token},
            json={"answers": answers, "essay_html": "", "annotations": []},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        receipt = d.get("receipt")
        assert isinstance(receipt, str) and RECEIPT_RE.match(receipt), f"Bad receipt: {receipt!r}"
        assert d.get("questions") == len(questions)
        assert d.get("answered") == 1, f"answered expected 1, got {d.get('answered')}"
        assert d.get("student_name") == "TEST SubmitReceipt FORM"
        assert d.get("exam_title")
        assert d.get("submitted_at")

        # Resubmit should return same receipt
        r2 = requests.post(
            f"{BASE_URL}/api/student/submit",
            headers={"X-Session-Token": token},
            json={"answers": {}, "essay_html": "", "annotations": []},
        )
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2.get("receipt") == receipt, "Receipt must be idempotent on re-submit"
        assert d2.get("submitted_at") == d.get("submitted_at")
        assert d2.get("answered") == d.get("answered")

    def test_redaction_his301_essay_words(self):
        token, _ = _join("HIS301", "TEST SubmitReceipt REDAC")
        r = requests.post(
            f"{BASE_URL}/api/student/submit",
            headers={"X-Session-Token": token},
            json={"answers": {}, "essay_html": "<p>un deux trois</p>", "annotations": []},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        receipt = d.get("receipt")
        assert isinstance(receipt, str) and RECEIPT_RE.match(receipt), f"Bad receipt: {receipt!r}"
        assert d.get("essay_words") == 3, f"essay_words expected 3, got {d.get('essay_words')}"
        assert d.get("student_name") == "TEST SubmitReceipt REDAC"
        assert d.get("exam_title")

        # Idempotent
        r2 = requests.post(
            f"{BASE_URL}/api/student/submit",
            headers={"X-Session-Token": token},
            json={"answers": {}, "essay_html": "<p>ignored</p>", "annotations": []},
        )
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2.get("receipt") == receipt
        assert d2.get("essay_words") == 3  # not re-counted since status==submitted
