"""Iteration 22: alert sound, teams_email, help_button exam setting, tool paths."""
import os
import re
import struct
import uuid
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "lynchs2757@gmail.com"
ADMIN_PASS = "Enseignant2026!"


def make_wav(seconds: float = 0.1, rate: int = 8000) -> bytes:
    n = int(rate * seconds)
    data = b"\x00\x00" * n
    header = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE"
    header += b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
    header += b"data" + struct.pack("<I", len(data))
    return header + data


@pytest.fixture(scope="module")
def admin_sess():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    return s


# ---------- Sonnerie d'alerte ----------
class TestAlertSound:
    def test_full_cycle(self, admin_sess):
        # Ensure clean state
        admin_sess.delete(f"{BASE}/api/admin/alert-sound")
        admin_sess.delete(f"{BASE}/api/auth/me/alert-sound")

        # Initial: 204
        r = admin_sess.get(f"{BASE}/api/alert-sound")
        assert r.status_code == 204, r.text

        # Admin uploads default WAV
        wav = make_wav()
        r = admin_sess.post(
            f"{BASE}/api/admin/alert-sound",
            files={"file": ("default.wav", wav, "audio/wav")},
        )
        assert r.status_code == 200, r.text
        assert r.json()["configured"] is True

        # GET /alert-sound → 200 audio/wav
        r = admin_sess.get(f"{BASE}/api/alert-sound")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("audio/wav")
        assert len(r.content) > 40

        # Teacher (admin acts as teacher) uploads custom
        r = admin_sess.post(
            f"{BASE}/api/auth/me/alert-sound",
            files={"file": ("mine.wav", wav, "audio/wav")},
        )
        assert r.status_code == 200, r.text
        assert r.json()["alert_sound"] == "custom"

        # /auth/me reflects custom
        r = admin_sess.get(f"{BASE}/api/auth/me")
        assert r.status_code == 200
        assert r.json().get("alert_sound") == "custom"

        # Invalid type → 400
        r = admin_sess.post(
            f"{BASE}/api/auth/me/alert-sound",
            files={"file": ("bad.txt", b"hello", "text/plain")},
        )
        assert r.status_code == 400, r.text

        # Too large → 413 (2.5 Mo)
        big = b"\x00" * (int(2.5 * 1024 * 1024))
        # Need a valid wav header + big data chunk otherwise ext may bypass? Our server reads then compares size, so size check first.
        r = admin_sess.post(
            f"{BASE}/api/auth/me/alert-sound",
            files={"file": ("big.wav", big, "audio/wav")},
        )
        assert r.status_code == 413, r.text

        # DELETE custom → alert_sound default
        r = admin_sess.delete(f"{BASE}/api/auth/me/alert-sound")
        assert r.status_code == 200
        assert r.json()["alert_sound"] == "default"

        # But default admin still configured → GET /alert-sound 200
        r = admin_sess.get(f"{BASE}/api/alert-sound")
        assert r.status_code == 200

        # DELETE admin default
        r = admin_sess.delete(f"{BASE}/api/admin/alert-sound")
        assert r.status_code == 200
        assert r.json()["configured"] is False

        # Final: 204
        r = admin_sess.get(f"{BASE}/api/alert-sound")
        assert r.status_code == 204


# ---------- Teams email ----------
class TestTeamsEmail:
    def test_invalid_email_400(self, admin_sess):
        # Get current name first to preserve
        me = admin_sess.get(f"{BASE}/api/auth/me").json()
        r = admin_sess.put(f"{BASE}/api/auth/me", json={"name": me["name"], "teams_email": "pas-un-courriel"})
        assert r.status_code == 400, r.text

    def test_valid_email_saved(self, admin_sess):
        me = admin_sess.get(f"{BASE}/api/auth/me").json()
        test_addr = "test-canal@example.invalid"
        r = admin_sess.put(f"{BASE}/api/auth/me", json={"name": me["name"], "teams_email": test_addr, "notify_email": False})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["teams_email"] == test_addr
        assert data["notify_email"] is False

        r = admin_sess.get(f"{BASE}/api/auth/me")
        d = r.json()
        assert d["teams_email"] == test_addr
        assert d["notify_email"] is False

        # Cleanup: clear
        r = admin_sess.put(f"{BASE}/api/auth/me", json={"name": me["name"], "teams_email": "", "notify_email": False})
        assert r.status_code == 200
        assert r.json()["teams_email"] == ""

    def test_teams_test_no_config_400(self, admin_sess):
        me = admin_sess.get(f"{BASE}/api/auth/me").json()
        # Ensure no email/webhook configured
        admin_sess.put(f"{BASE}/api/auth/me", json={"name": me["name"], "teams_email": "", "teams_webhook": "", "notify_email": False})
        r = admin_sess.post(f"{BASE}/api/auth/me/teams-test")
        assert r.status_code == 400, r.text


# ---------- help_button exam setting ----------
class TestHelpButton:
    def _create_exam(self, admin_sess, help_button: bool):
        body = {
            "title": f"TEST_hb_{uuid.uuid4().hex[:6]}",
            "subject": "T",
            "duration_min": 30,
            "type": "form",
            "status": "open",
            "settings": {"help_button": help_button},
            "questions": [{"text": "x?", "type": "short", "points": 1}],
        }
        r = admin_sess.post(f"{BASE}/api/exams", json=body)
        assert r.status_code in (200, 201), r.text
        return r.json()

    def _join(self, code):
        s = requests.Session()
        r = s.post(f"{BASE}/api/student/join", json={
            "code": code,
            "student_name": f"TEST Student {uuid.uuid4().hex[:4]}",
            "student_number": uuid.uuid4().hex[:6],
            "teacher_name": "T",
            "client": "web",
        })
        assert r.status_code == 200, r.text
        return r.json()["token"]

    def test_help_disabled_403(self, admin_sess):
        exam = self._create_exam(admin_sess, help_button=False)
        token = self._join(exam["code"])
        # session reflects settings
        r = requests.get(f"{BASE}/api/student/session", headers={"X-Session-Token": token})
        assert r.status_code == 200
        settings = (r.json().get("exam") or {}).get("settings") or {}
        assert settings.get("help_button") is False
        # POST help → 403
        r = requests.post(f"{BASE}/api/student/help", json={"reason": "x"}, headers={"X-Session-Token": token})
        assert r.status_code == 403, r.text

    def test_help_enabled_201(self, admin_sess):
        exam = self._create_exam(admin_sess, help_button=True)
        token = self._join(exam["code"])
        r = requests.get(f"{BASE}/api/student/session", headers={"X-Session-Token": token})
        settings = (r.json().get("exam") or {}).get("settings") or {}
        assert settings.get("help_button") is True
        r = requests.post(f"{BASE}/api/student/help", json={"reason": "ok"}, headers={"X-Session-Token": token})
        assert r.status_code == 201, r.text


# ---------- Tool paths ----------
class TestToolPaths:
    def test_put_cleans_and_filters(self, admin_sess):
        payload = {"paths": {
            "lexibar": ["C:\\Program Files\\LexibarLP5X\\Lexibar.exe", "  ", ""],
            "foo": ["x"],
        }}
        r = admin_sess.put(f"{BASE}/api/admin/tool-paths", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "foo" not in data
        assert data["lexibar"] == ["C:\\Program Files\\LexibarLP5X\\Lexibar.exe"]

        # Public GET returns the same
        r = requests.get(f"{BASE}/api/tool-paths")
        assert r.status_code == 200
        assert r.json()["lexibar"] == ["C:\\Program Files\\LexibarLP5X\\Lexibar.exe"]
        assert "foo" not in r.json()

    def test_put_requires_admin(self, admin_sess):
        # Create non-admin teacher
        email = f"test_tp_{uuid.uuid4().hex[:6]}@example.com"
        r = admin_sess.post(f"{BASE}/api/admin/users", json={
            "email": email, "name": "TEST TP", "password": "TempPass2026!", "role": "teacher"
        })
        assert r.status_code in (200, 201), r.text

        t = requests.Session()
        r = t.post(f"{BASE}/api/auth/login", json={"email": email, "password": "TempPass2026!"})
        assert r.status_code == 200
        # Force change password if required
        if r.json().get("must_change_password"):
            r = t.post(f"{BASE}/api/auth/change-password", json={
                "current_password": "TempPass2026!", "new_password": "NewPass2026!"
            })
            assert r.status_code == 200

        r = t.put(f"{BASE}/api/admin/tool-paths", json={"paths": {"lexibar": ["x"]}})
        assert r.status_code == 403, r.text
