"""Iteration 21: J'ai besoin d'aide + Teams webhook + help recipients."""
import os
import uuid
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "lynchs2757@gmail.com"
ADMIN_PASS = "Enseignant2026!"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_sess():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def open_exam(admin_sess):
    """Create a dedicated open exam owned by admin."""
    body = {
        "title": f"TEST_help_{uuid.uuid4().hex[:6]}",
        "subject": "Test",
        "duration_min": 30,
        "type": "form",
        "status": "open",
        "questions": [{"text": "1+1?", "type": "short", "points": 1}],
    }
    r = admin_sess.post(f"{BASE}/api/exams", json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()


@pytest.fixture
def student_token(open_exam):
    s = requests.Session()
    r = s.post(f"{BASE}/api/student/join", json={
        "code": open_exam["code"],
        "student_name": f"TEST Student {uuid.uuid4().hex[:4]}",
        "student_number": uuid.uuid4().hex[:6],
        "teacher_name": "T",
        "client": "web",
    })
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _sh(token):
    return {"X-Session-Token": token}


# ---------- Student help flow ----------
class TestStudentHelp:
    def test_create_help_duplicate_delete(self, student_token, admin_sess, open_exam):
        # Create
        r = requests.post(f"{BASE}/api/student/help", json={"reason": "besoin d'aide"}, headers=_sh(student_token))
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["status"] == "open"
        assert open_exam["teacher_id"] in data["recipients"]
        assert data["teams_sent"] == []

        # Second → 409
        r2 = requests.post(f"{BASE}/api/student/help", json={"reason": "x"}, headers=_sh(student_token))
        assert r2.status_code == 409

        # Session reflects help_pending
        rs = requests.get(f"{BASE}/api/student/session", headers=_sh(student_token))
        assert rs.status_code == 200
        assert rs.json().get("help_pending") is not None

        # Teacher (owner / admin) can see it
        rl = admin_sess.get(f"{BASE}/api/help-requests", params={"status": "open", "exam_id": open_exam["id"]})
        assert rl.status_code == 200
        ids = [x["id"] for x in rl.json()]
        assert data["id"] in ids

        # Handle it
        rh = admin_sess.put(f"{BASE}/api/help-requests/{data['id']}/handle")
        assert rh.status_code == 200
        assert rh.json()["status"] == "handled"

        # help_pending becomes null
        rs2 = requests.get(f"{BASE}/api/student/session", headers=_sh(student_token))
        assert rs2.json().get("help_pending") is None

        # events contains help_request + help_handled (via admin events listing uses session data via exams/sessions)
        # Direct check: create again then cancel
        r3 = requests.post(f"{BASE}/api/student/help", json={"reason": "again"}, headers=_sh(student_token))
        assert r3.status_code == 201
        rd = requests.delete(f"{BASE}/api/student/help", headers=_sh(student_token))
        assert rd.status_code == 200
        rs3 = requests.get(f"{BASE}/api/student/session", headers=_sh(student_token))
        assert rs3.json().get("help_pending") is None


# ---------- Recipients isolation ----------
@pytest.fixture(scope="module")
def second_teacher(admin_sess):
    email = f"test_help_{uuid.uuid4().hex[:6]}@example.com"
    pwd = "TempPass2026!"
    r = admin_sess.post(f"{BASE}/api/admin/users", json={"name": "TEST T2", "email": email, "role": "teacher", "password": pwd})
    assert r.status_code in (200, 201), r.text
    data = r.json()
    return {"id": data["id"], "email": email, "password": pwd}


@pytest.fixture
def t2_sess(second_teacher):
    s = requests.Session()
    pwd = second_teacher["password"]
    r = s.post(f"{BASE}/api/auth/login", json={"email": second_teacher["email"], "password": pwd})
    # must_change_password forces change
    if r.status_code == 200 and r.json().get("must_change_password"):
        new_pwd = "NewPass2026!"
        rc = s.post(f"{BASE}/api/auth/change-password", json={"current_password": pwd, "new_password": new_pwd})
        assert rc.status_code == 200, rc.text
        # re-login
        s = requests.Session()
        r = s.post(f"{BASE}/api/auth/login", json={"email": second_teacher["email"], "password": new_pwd})
    assert r.status_code == 200, r.text
    return s


class TestRecipientsIsolation:
    def test_isolation_and_add_recipient(self, admin_sess, t2_sess, second_teacher, open_exam, student_token):
        # Clear admin defaults so they don't leak
        admin_sess.put(f"{BASE}/api/admin/help-settings/default", json={"recipients": []})
        # Ensure exam has no extra recipients
        admin_sess.put(f"{BASE}/api/admin/exams/{open_exam['id']}/help-recipients", json={"recipients": []})

        # Cancel any existing open help request on this session
        requests.delete(f"{BASE}/api/student/help", headers=_sh(student_token))

        # Student creates a help request
        r = requests.post(f"{BASE}/api/student/help", json={"reason": "iso1"}, headers=_sh(student_token))
        assert r.status_code == 201
        req1 = r.json()

        # t2 should NOT see it
        rl2 = t2_sess.get(f"{BASE}/api/help-requests", params={"status": "open"})
        assert rl2.status_code == 200
        assert req1["id"] not in [x["id"] for x in rl2.json()]

        # Admin sees everything
        rla = admin_sess.get(f"{BASE}/api/help-requests", params={"status": "open"})
        assert req1["id"] in [x["id"] for x in rla.json()]

        # Cancel, then add t2 as recipient on this exam, create a new request
        requests.delete(f"{BASE}/api/student/help", headers=_sh(student_token))
        rp = admin_sess.put(f"{BASE}/api/admin/exams/{open_exam['id']}/help-recipients",
                            json={"recipients": [second_teacher["id"]]})
        assert rp.status_code == 200
        assert second_teacher["id"] in rp.json()["help_recipients"]

        r2 = requests.post(f"{BASE}/api/student/help", json={"reason": "iso2"}, headers=_sh(student_token))
        assert r2.status_code == 201
        req2 = r2.json()
        assert second_teacher["id"] in req2["recipients"]

        rl2b = t2_sess.get(f"{BASE}/api/help-requests", params={"status": "open"})
        assert req2["id"] in [x["id"] for x in rl2b.json()]

        # cleanup
        requests.delete(f"{BASE}/api/student/help", headers=_sh(student_token))


# ---------- Teams webhook config ----------
class TestTeamsWebhook:
    def test_webhook_validation_and_flow(self, admin_sess):
        # http:// rejected
        r = admin_sess.put(f"{BASE}/api/auth/me", json={"name": "Admin", "teams_webhook": "http://x"})
        assert r.status_code == 400

        # valid https
        valid = "https://example.invalid/webhook/abcdefghijklmnop"
        r = admin_sess.put(f"{BASE}/api/auth/me", json={"name": "Admin", "teams_webhook": valid})
        assert r.status_code == 200
        assert r.json().get("teams_configured") is True

        # GET /auth/me does NOT expose teams_webhook
        rm = admin_sess.get(f"{BASE}/api/auth/me")
        assert rm.status_code == 200
        body = rm.json()
        assert "teams_webhook" not in body
        assert body.get("teams_configured") is True

        # teams-test → 502 (hôte invalide)
        rt = admin_sess.post(f"{BASE}/api/auth/me/teams-test")
        assert rt.status_code == 502

        # GET /api/teachers includes teams_configured flag
        tl = admin_sess.get(f"{BASE}/api/teachers")
        assert tl.status_code == 200
        assert any(u.get("teams_configured") for u in tl.json())
        # none expose teams_webhook
        assert all("teams_webhook" not in u for u in tl.json())

        # Remove via empty string
        r = admin_sess.put(f"{BASE}/api/auth/me", json={"name": "Admin", "teams_webhook": ""})
        assert r.status_code == 200
        assert r.json().get("teams_configured") is False

    def test_help_still_works_with_invalid_webhook(self, admin_sess, open_exam):
        # set invalid-but-well-formed webhook
        valid = "https://example.invalid/webhook/abcdefghijklmnop"
        admin_sess.put(f"{BASE}/api/auth/me", json={"name": "Admin", "teams_webhook": valid})

        # new student, create help request
        s = requests.Session()
        rj = s.post(f"{BASE}/api/student/join", json={
            "code": open_exam["code"],
            "student_name": f"TEST Student {uuid.uuid4().hex[:4]}",
            "student_number": uuid.uuid4().hex[:6],
            "teacher_name": "T",
            "client": "web",
        })
        token = rj.json()["token"]
        r = requests.post(f"{BASE}/api/student/help", json={"reason": "with webhook"}, headers=_sh(token))
        assert r.status_code == 201
        req = r.json()
        assert req["teams_sent"] == []  # initial value; background task may fail silently

        # cleanup webhook
        admin_sess.put(f"{BASE}/api/auth/me", json={"name": "Admin", "teams_webhook": ""})


# ---------- Admin help-settings ----------
class TestAdminHelpSettings:
    def test_get_and_update_defaults(self, admin_sess):
        r = admin_sess.get(f"{BASE}/api/admin/help-settings")
        assert r.status_code == 200
        data = r.json()
        assert "default_recipients" in data
        assert "exams" in data

        # Update defaults then re-read
        new_defaults = []
        up = admin_sess.put(f"{BASE}/api/admin/help-settings/default", json={"recipients": new_defaults})
        assert up.status_code == 200

        r2 = admin_sess.get(f"{BASE}/api/admin/help-settings")
        assert r2.status_code == 200


# ---------- Page title (frontend) ----------
class TestPageTitle:
    def test_title_contains_moneExamEnLigne(self):
        r = requests.get(BASE + "/", timeout=20)
        assert r.status_code == 200
        html = r.text
        # <title> tag check
        import re
        m = re.search(r"<title>([^<]+)</title>", html, re.IGNORECASE)
        assert m, "no <title> tag"
        title = m.group(1).strip()
        assert "MonExamEnLigne" in title
        assert "Champagneur" in title
        # No 'emergent' in app-visible meta (ignore the platform preview overlay script)
        # Check meta description/apple-mobile tags don't mention emergent
        for tag in re.findall(r"<meta[^>]+>", html, re.IGNORECASE):
            assert "emergent" not in tag.lower(), f"emergent found in meta: {tag}"
