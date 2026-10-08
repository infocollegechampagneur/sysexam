"""Iteration 23: clipboard_internal setting + /student/device + /admin/devices."""
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


def _create_exam(admin_sess, settings_overrides=None):
    body = {
        "title": f"TEST_clip_{uuid.uuid4().hex[:6]}",
        "subject": "T",
        "duration_min": 30,
        "type": "form",
        "status": "open",
        "settings": {"block_clipboard": True, **(settings_overrides or {})},
        "questions": [{"text": "x?", "type": "short", "points": 1}],
    }
    r = admin_sess.post(f"{BASE}/api/exams", json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _join(code):
    s = requests.Session()
    r = s.post(f"{BASE}/api/student/join", json={
        "code": code,
        "student_name": f"TEST_dev {uuid.uuid4().hex[:4]}",
        "student_number": uuid.uuid4().hex[:6],
        "teacher_name": "T",
        "client": "web",
    })
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ---------- clipboard_internal setting ----------
class TestClipboardInternalSetting:
    def test_default_true(self, admin_sess):
        exam = _create_exam(admin_sess)  # no override
        token = _join(exam["code"])
        r = requests.get(f"{BASE}/api/student/session", headers={"X-Session-Token": token})
        assert r.status_code == 200
        settings = (r.json().get("exam") or {}).get("settings") or {}
        assert settings.get("block_clipboard") is True
        assert settings.get("clipboard_internal") is True

    def test_explicit_false(self, admin_sess):
        exam = _create_exam(admin_sess, {"clipboard_internal": False})
        token = _join(exam["code"])
        r = requests.get(f"{BASE}/api/student/session", headers={"X-Session-Token": token})
        assert r.status_code == 200
        settings = (r.json().get("exam") or {}).get("settings") or {}
        assert settings.get("clipboard_internal") is False


# ---------- /student/device + /admin/devices ----------
@pytest.fixture(scope="module")
def exam_and_token(admin_sess):
    body = {
        "title": f"TEST_dev_{uuid.uuid4().hex[:6]}",
        "subject": "T",
        "duration_min": 30,
        "type": "form",
        "status": "open",
        "settings": {"allowed_tools": ["lexibar", "wordq"]},
        "questions": [{"text": "x?", "type": "short", "points": 1}],
    }
    r = admin_sess.post(f"{BASE}/api/exams", json=body)
    assert r.status_code in (200, 201), r.text
    exam = r.json()
    token = _join(exam["code"])
    hostname = f"TEST-LAB-{uuid.uuid4().hex[:6].upper()}"
    return exam, token, hostname


class TestDevicesEndpoint:

    def test_post_device_ok(self, exam_and_token):
        _, token, hostname = exam_and_token
        payload = {
            "hostname": hostname,
            "user": "eleve01",
            "app_version": "1.2.3",
            "os": "Windows 11",
            "tools": {
                "wordq": {"installed": True, "path": "C:\\WordQ\\wq.exe"},
                "lexibar": {"installed": False, "path": ""},
            },
            "forbidden_closed": ["Microsoft Teams"],
            "forbidden_remaining": [],
        }
        r = requests.post(f"{BASE}/api/student/device", json=payload, headers={"X-Session-Token": token})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        # lexibar is allowed+not installed -> missing
        assert "lexibar" in data["missing_tools"]
        assert "wordq" not in data["missing_tools"]

    def test_session_has_device_and_event(self, exam_and_token):
        _, token, hostname = exam_and_token
        r = requests.get(f"{BASE}/api/student/session", headers={"X-Session-Token": token})
        assert r.status_code == 200
        sess = r.json()
        session_obj = sess.get("session") or {}
        device = session_obj.get("device") or {}
        assert device.get("hostname") == hostname
        assert device.get("tools", {}).get("lexibar", {}).get("installed") is False
        assert device.get("tools", {}).get("wordq", {}).get("installed") is True
        events = session_obj.get("events") or []
        assert any(e.get("type") == "device_check" for e in events)

    def test_admin_devices_contains_hostname(self, admin_sess, exam_and_token):
        _, _, hostname = exam_and_token
        r = admin_sess.get(f"{BASE}/api/admin/devices")
        assert r.status_code == 200, r.text
        rows = r.json()
        match = next((d for d in rows if d.get("hostname") == hostname), None)
        assert match is not None, f"hostname {hostname} not in devices list"
        assert match.get("checks") == 1
        assert "lexibar" in match.get("missing_tools", [])

    def test_second_post_upserts(self, admin_sess, exam_and_token):
        _, token, hostname = exam_and_token
        payload = {
            "hostname": hostname,
            "user": "eleve01",
            "app_version": "1.2.4",
            "os": "Windows 11",
            "tools": {
                "wordq": {"installed": True, "path": ""},
                "lexibar": {"installed": False, "path": ""},
            },
            "forbidden_closed": [],
            "forbidden_remaining": [],
        }
        r = requests.post(f"{BASE}/api/student/device", json=payload, headers={"X-Session-Token": token})
        assert r.status_code == 200
        # Should still be a single row with checks=2
        r = admin_sess.get(f"{BASE}/api/admin/devices")
        rows = [d for d in r.json() if d.get("hostname") == hostname]
        assert len(rows) == 1, f"expected 1 row, got {len(rows)}"
        assert rows[0].get("checks") == 2
        assert rows[0].get("app_version") == "1.2.4"

    def test_no_token_401(self):
        payload = {"hostname": "h", "tools": {}}
        r = requests.post(f"{BASE}/api/student/device", json=payload)
        assert r.status_code == 401, r.text

    def test_non_admin_teacher_forbidden(self, admin_sess):
        # Create a teacher via admin, change password, then try GET /admin/devices
        email = f"test_dev_t_{uuid.uuid4().hex[:6]}@example.com"
        temp_pw = "TempPass2026!"
        new_pw = "NewPass2026!"
        r = admin_sess.post(f"{BASE}/api/admin/users", json={
            "email": email, "name": "T Dev", "role": "teacher", "password": temp_pw
        })
        assert r.status_code in (200, 201), r.text
        uid = r.json()["id"]
        try:
            t = requests.Session()
            r = t.post(f"{BASE}/api/auth/login", json={"email": email, "password": temp_pw})
            assert r.status_code == 200, r.text
            r = t.post(f"{BASE}/api/auth/change-password", json={
                "current_password": temp_pw, "new_password": new_pw
            })
            assert r.status_code in (200, 204), r.text
            r = t.get(f"{BASE}/api/admin/devices")
            assert r.status_code == 403, r.text
        finally:
            admin_sess.delete(f"{BASE}/api/admin/users/{uid}")
