"""Backend tests for v9: mail-status, bulk import, admin activity journal, login_log."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.strip().split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "lynchs2757@gmail.com"
ADMIN_PASSWORD = "Enseignant2026!"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def teacher_account(admin):
    """Create a teacher via admin to use for 403 tests."""
    email = f"test_v9_teacher_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "InitPass123!"
    r = admin.post(f"{API}/admin/users", json={"name": "V9 Teacher", "email": email, "password": pwd, "role": "teacher"})
    assert r.status_code == 201, r.text
    # must change password first
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200
    new_pwd = "NewPass123!"
    r = s.post(f"{API}/auth/change-password", json={"current_password": pwd, "new_password": new_pwd})
    assert r.status_code == 200, r.text
    return {"email": email, "password": new_pwd, "session": s, "id": r.json()["id"]}


# ---------- Mail status ----------
def test_mail_status_admin(admin):
    r = admin.get(f"{API}/admin/mail-status")
    assert r.status_code == 200
    data = r.json()
    assert "configured" in data and "sender" in data
    assert isinstance(data["configured"], bool)
    print("mail-status:", data)


def test_mail_status_teacher_forbidden(teacher_account):
    r = teacher_account["session"].get(f"{API}/admin/mail-status")
    assert r.status_code == 403


# ---------- Admin create user: email_sent key ----------
def test_create_user_example_email_sent_false(admin):
    email = f"test_v9_create_{uuid.uuid4().hex[:8]}@example.com"
    r = admin.post(f"{API}/admin/users", json={"name": "V9 Example", "email": email, "password": "SomePass123!", "role": "teacher"})
    assert r.status_code == 201, r.text
    data = r.json()
    assert "email_sent" in data
    # @example.com addresses: with current SMTP provider may or may not be accepted; just assert bool
    assert isinstance(data["email_sent"], bool)
    assert data["email"] == email
    assert data["must_change_password"] is True


# ---------- Reset password returns email_sent ----------
def test_reset_password_has_email_sent(admin, teacher_account):
    r = admin.post(f"{API}/admin/users/{teacher_account['id']}/reset-password", json={"password": "ResetPass123!"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "email_sent" in data
    assert isinstance(data["email_sent"], bool)


# ---------- Bulk import ----------
def test_bulk_import_mixed(admin):
    uniq = uuid.uuid4().hex[:8]
    valid_semi = f"Marie Tremblay;marie_{uniq}@example.com"
    valid_comma = f"Jacob Gagnon,jacob_{uniq}@example.com"
    invalid_no_email = "Alice SansCourriel"
    duplicate_email = f"Dup One;marie_{uniq}@example.com"
    text = "\n".join([valid_semi, valid_comma, invalid_no_email, duplicate_email])
    r = admin.post(f"{API}/admin/users/import", json={"text": text, "role": "teacher"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "created" in data and "errors" in data
    assert len(data["created"]) == 2, data
    assert len(data["errors"]) == 2, data
    emails = {c["email"] for c in data["created"]}
    assert f"marie_{uniq}@example.com" in emails
    assert f"jacob_{uniq}@example.com" in emails
    for c in data["created"]:
        assert c["password"] and len(c["password"]) >= 8
        assert "email_sent" in c
    # error reasons present
    for e in data["errors"]:
        assert "reason" in e and "line" in e
    assert "mail_configured" in data


def test_imported_user_can_login_and_must_change_password(admin):
    uniq = uuid.uuid4().hex[:8]
    email = f"login_{uniq}@example.com"
    r = admin.post(f"{API}/admin/users/import", json={"text": f"Login Test;{email}", "role": "teacher"})
    assert r.status_code == 200
    created = r.json()["created"]
    assert len(created) == 1
    pwd = created[0]["password"]
    # login
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["must_change_password"] is True


# ---------- Admin activity ----------
def test_admin_activity_admin(admin):
    r = admin.get(f"{API}/admin/activity")
    assert r.status_code == 200, r.text
    rows = r.json()
    assert isinstance(rows, list)
    admin_row = next((u for u in rows if u["email"] == ADMIN_EMAIL), None)
    assert admin_row is not None
    assert "exams" in admin_row and isinstance(admin_row["exams"], list)
    assert "logins" in admin_row and isinstance(admin_row["logins"], list)
    assert "login_count" in admin_row
    # Admin seeded 3 exams
    assert len(admin_row["exams"]) >= 3, f"Expected >=3 seeded admin exams, got {len(admin_row['exams'])}"
    # exam entries must have expected fields
    for e in admin_row["exams"]:
        assert "title" in e and "status" in e and "exam_type" in e
        assert "sessions" in e and "submitted" in e
    # login_count should be >=1 since admin logged in to run tests
    assert admin_row["login_count"] >= 1


def test_admin_activity_forbidden_for_teacher(teacher_account):
    r = teacher_account["session"].get(f"{API}/admin/activity")
    assert r.status_code == 403


# ---------- Regression: single user create still works ----------
def test_single_user_create_regression(admin):
    email = f"regress_{uuid.uuid4().hex[:8]}@example.com"
    r = admin.post(f"{API}/admin/users", json={"name": "Reg Test", "email": email, "password": "Pass1234!", "role": "teacher"})
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == email
    assert body["role"] == "teacher"
