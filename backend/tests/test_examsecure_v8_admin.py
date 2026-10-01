"""Backend tests for v8: admin-only account provisioning, forced password change, deactivation."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # fallback: read /app/frontend/.env
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.strip().split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"
ADMIN_EMAIL = "lynchs2757@gmail.com"
ADMIN_PASSWORD = "Enseignant2026!"


def _admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def admin():
    return _admin_session()


@pytest.fixture(scope="module")
def admin_me(admin):
    return admin.get(f"{API}/auth/me").json()


# ---------- Public registration removed ----------
def test_register_endpoint_removed():
    r = requests.post(f"{API}/auth/register", json={"email": "x@x.com", "password": "whatever1"})
    assert r.status_code == 404


# ---------- Admin login + listing ----------
def test_admin_login_and_role(admin_me):
    assert admin_me["role"] == "admin"
    assert admin_me["email"] == ADMIN_EMAIL


def test_admin_list_users(admin):
    r = admin.get(f"{API}/admin/users")
    assert r.status_code == 200
    users = r.json()
    assert isinstance(users, list)
    assert any(u["email"] == ADMIN_EMAIL for u in users)


# ---------- Admin creation flow ----------
@pytest.fixture(scope="module")
def new_teacher(admin):
    email = f"test_v8_{uuid.uuid4().hex[:8]}@example.com"
    payload = {"name": "TEST Teacher V8", "email": email, "password": "Temp12345!", "role": "teacher"}
    r = admin.post(f"{API}/admin/users", json=payload)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["email"] == email
    assert data["role"] == "teacher"
    assert data["must_change_password"] is True
    assert data["active"] is True
    yield {"id": data["id"], "email": email, "password": "Temp12345!"}
    # cleanup — deactivate
    try:
        admin.put(f"{API}/admin/users/{data['id']}", json={"active": False})
    except Exception:
        pass


def test_create_duplicate_email_400(admin, new_teacher):
    r = admin.post(f"{API}/admin/users", json={"name": "Dup", "email": new_teacher["email"], "password": "Temp12345!", "role": "teacher"})
    assert r.status_code == 400


def test_create_invalid_role_400(admin):
    r = admin.post(f"{API}/admin/users", json={"name": "X", "email": f"test_v8_{uuid.uuid4().hex[:6]}@x.com", "password": "Temp12345!", "role": "student"})
    assert r.status_code == 400


# ---------- Teacher login must_change_password + change password ----------
def test_teacher_first_login_must_change(new_teacher):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": new_teacher["email"], "password": new_teacher["password"]})
    assert r.status_code == 200
    assert r.json()["must_change_password"] is True


def test_change_password_wrong_current(new_teacher):
    s = requests.Session()
    s.post(f"{API}/auth/login", json={"email": new_teacher["email"], "password": new_teacher["password"]})
    r = s.post(f"{API}/auth/change-password", json={"current_password": "WRONG123!", "new_password": "NewPass12345"})
    assert r.status_code == 400


def test_change_password_same_as_current(new_teacher):
    s = requests.Session()
    s.post(f"{API}/auth/login", json={"email": new_teacher["email"], "password": new_teacher["password"]})
    r = s.post(f"{API}/auth/change-password", json={"current_password": new_teacher["password"], "new_password": new_teacher["password"]})
    assert r.status_code == 400


def test_change_password_too_short(new_teacher):
    s = requests.Session()
    s.post(f"{API}/auth/login", json={"email": new_teacher["email"], "password": new_teacher["password"]})
    r = s.post(f"{API}/auth/change-password", json={"current_password": new_teacher["password"], "new_password": "short"})
    assert r.status_code == 422


def test_change_password_success_clears_flag(new_teacher):
    s = requests.Session()
    s.post(f"{API}/auth/login", json={"email": new_teacher["email"], "password": new_teacher["password"]})
    new_pwd = "NewValidPass123!"
    r = s.post(f"{API}/auth/change-password", json={"current_password": new_teacher["password"], "new_password": new_pwd})
    assert r.status_code == 200
    assert r.json()["must_change_password"] is False
    new_teacher["password"] = new_pwd
    # re-login
    s2 = requests.Session()
    r2 = s2.post(f"{API}/auth/login", json={"email": new_teacher["email"], "password": new_pwd})
    assert r2.status_code == 200
    assert r2.json()["must_change_password"] is False


# ---------- Role toggling / self-protection ----------
def test_admin_cannot_demote_self(admin, admin_me):
    r = admin.put(f"{API}/admin/users/{admin_me['id']}", json={"role": "teacher"})
    assert r.status_code == 400


def test_admin_cannot_deactivate_self(admin, admin_me):
    r = admin.put(f"{API}/admin/users/{admin_me['id']}", json={"active": False})
    assert r.status_code == 400


def test_toggle_role_on_teacher(admin, new_teacher):
    r = admin.put(f"{API}/admin/users/{new_teacher['id']}", json={"role": "admin"})
    assert r.status_code == 200
    assert r.json()["role"] == "admin"
    r2 = admin.put(f"{API}/admin/users/{new_teacher['id']}", json={"role": "teacher"})
    assert r2.status_code == 200
    assert r2.json()["role"] == "teacher"


# ---------- Reset password sets must_change_password ----------
def test_admin_reset_password(admin, new_teacher):
    new_pwd = "ResetByAdmin123!"
    r = admin.post(f"{API}/admin/users/{new_teacher['id']}/reset-password", json={"password": new_pwd})
    assert r.status_code == 200
    s = requests.Session()
    r2 = s.post(f"{API}/auth/login", json={"email": new_teacher["email"], "password": new_pwd})
    assert r2.status_code == 200
    assert r2.json()["must_change_password"] is True
    new_teacher["password"] = new_pwd


# ---------- Non-admin forbidden on /api/admin/* ----------
def test_teacher_cannot_list_users(new_teacher, admin):
    # ensure teacher is role=teacher currently
    admin.put(f"{API}/admin/users/{new_teacher['id']}", json={"role": "teacher"})
    s = requests.Session()
    s.post(f"{API}/auth/login", json={"email": new_teacher["email"], "password": new_teacher["password"]})
    r = s.get(f"{API}/admin/users")
    assert r.status_code == 403


# ---------- Deactivation blocks login and existing sessions ----------
def test_deactivate_blocks_login_and_session(admin, new_teacher):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": new_teacher["email"], "password": new_teacher["password"]})
    assert r.status_code == 200
    # deactivate
    ru = admin.put(f"{API}/admin/users/{new_teacher['id']}", json={"active": False})
    assert ru.status_code == 200
    # existing session now 403
    me = s.get(f"{API}/auth/me")
    assert me.status_code == 403
    # new login attempt also 403
    s2 = requests.Session()
    r2 = s2.post(f"{API}/auth/login", json={"email": new_teacher["email"], "password": new_teacher["password"]})
    assert r2.status_code == 403
    # reactivate works
    admin.put(f"{API}/admin/users/{new_teacher['id']}", json={"active": True})
    s3 = requests.Session()
    r3 = s3.post(f"{API}/auth/login", json={"email": new_teacher["email"], "password": new_teacher["password"]})
    assert r3.status_code == 200


# ---------- Regression: admin dashboard access ----------
def test_admin_can_list_exams(admin):
    r = admin.get(f"{API}/exams")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
