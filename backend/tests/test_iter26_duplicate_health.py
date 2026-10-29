# Iteration 26: exam duplication + admin server health
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "lynchs2757@gmail.com", "password": "Enseignant2026!"}
T2_EMAIL = "test_manager_iter25@example.com"
T2_PW = "Gestion2026!"
PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def admin():
    return login(ADMIN["email"], ADMIN["password"])


@pytest.fixture(scope="module")
def teacher(admin):
    users = admin.get(f"{BASE_URL}/api/admin/users").json()
    u = next((x for x in users if x["email"] == T2_EMAIL), None)
    if not u:
        r = admin.post(f"{BASE_URL}/api/admin/users", json={"email": T2_EMAIL, "name": "TEST Gestionnaire", "password": T2_PW})
        assert r.status_code == 201, r.text
    else:
        admin.post(f"{BASE_URL}/api/admin/users/{u['id']}/reset-password", json={"password": T2_PW})
    return login(T2_EMAIL, T2_PW)


@pytest.fixture(scope="module")
def created(admin):
    ids = []
    yield ids
    for i in ids:
        admin.delete(f"{BASE_URL}/api/exams/{i}")


@pytest.fixture(scope="module")
def src_exam(admin, created):
    body = {"title": f"TEST_iter26 {uuid.uuid4().hex[:5]}", "exam_type": "form", "status": "open",
            "questions": [{"id": "q1", "type": "short", "text": "Q dup?", "points": 3}],
            "settings": {"time_limit_minutes": 42}}
    r = admin.post(f"{BASE_URL}/api/exams", json=body)
    assert r.status_code == 200, r.text
    ex = r.json()
    created.append(ex["id"])
    r = admin.post(f"{BASE_URL}/api/exams/{ex['id']}/file", files={"file": ("sujet.pdf", PDF, "application/pdf")})
    assert r.status_code == 200, r.text
    return admin.get(f"{BASE_URL}/api/exams/{ex['id']}").json()


class TestDuplicate:
    def test_duplicate_full(self, admin, src_exam, created):
        r = admin.post(f"{BASE_URL}/api/exams/{src_exam['id']}/duplicate")
        assert r.status_code == 201, r.text
        d = r.json()
        created.append(d["id"])
        assert "_id" not in d
        assert d["id"] != src_exam["id"]
        assert d["title"] == f"{src_exam['title']} (copie)"
        assert d["status"] == "draft"
        assert d["code"] != src_exam["code"]
        assert d["windows"] == []
        me = admin.get(f"{BASE_URL}/api/auth/me").json()
        assert d["teacher_id"] == me["id"]
        assert d["questions"] == src_exam["questions"]
        assert d["settings"].get("time_limit_minutes") == src_exam["settings"].get("time_limit_minutes")
        assert d["file"] and d["file"]["gridfs_id"] != src_exam["file"]["gridfs_id"]
        assert d["file"]["filename"] == "sujet.pdf"
        g = admin.get(f"{BASE_URL}/api/exams/{d['id']}")
        assert g.status_code == 200 and g.json()["title"].endswith("(copie)")
        f = admin.get(f"{BASE_URL}/api/exams/{d['id']}/file")
        assert f.status_code == 200 and f.content == PDF
        lst = admin.get(f"{BASE_URL}/api/exams").json()
        row = next(e for e in lst if e["id"] == d["id"])
        assert row["session_count"] == 0

    def test_second_duplicate_new_code(self, admin, src_exam, created):
        r1 = admin.post(f"{BASE_URL}/api/exams/{src_exam['id']}/duplicate").json()
        r2 = admin.post(f"{BASE_URL}/api/exams/{src_exam['id']}/duplicate").json()
        created.extend([r1["id"], r2["id"]])
        assert len({r1["code"], r2["code"], src_exam["code"]}) == 3

    def test_source_file_intact_after_deleting_copy(self, admin, src_exam):
        r = admin.post(f"{BASE_URL}/api/exams/{src_exam['id']}/duplicate").json()
        assert admin.delete(f"{BASE_URL}/api/exams/{r['id']}").status_code == 200
        f = admin.get(f"{BASE_URL}/api/exams/{src_exam['id']}/file")
        assert f.status_code == 200 and f.content == PDF

    def test_duplicate_unknown(self, admin):
        r = admin.post(f"{BASE_URL}/api/exams/{uuid.uuid4()}/duplicate")
        assert r.status_code == 404

    def test_duplicate_unauth(self, src_exam):
        r = requests.post(f"{BASE_URL}/api/exams/{src_exam['id']}/duplicate")
        assert r.status_code == 401

    def test_duplicate_other_teacher_forbidden(self, teacher, src_exam):
        r = teacher.post(f"{BASE_URL}/api/exams/{src_exam['id']}/duplicate")
        assert r.status_code in (403, 404)

    def test_duplicate_no_file(self, admin, created):
        ex = admin.post(f"{BASE_URL}/api/exams", json={"title": "TEST_iter26 nofile", "exam_type": "form", "questions": []}).json()
        created.append(ex["id"])
        d = admin.post(f"{BASE_URL}/api/exams/{ex['id']}/duplicate")
        assert d.status_code == 201
        created.append(d.json()["id"])
        assert d.json()["file"] is None


class TestHealth:
    def test_health_admin(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/health")
        assert r.status_code == 200, r.text
        h = r.json()
        for k in ("time", "started_at", "version", "workers", "db", "disk", "tunnel", "mail", "backup"):
            assert k in h
        assert h["db"]["ok"] is True and isinstance(h["db"]["ms"], int)
        assert isinstance(h["db"]["atlas"], bool) and h["db"]["name"]
        assert set(h["db"]["counts"]) == {"users", "exams", "sessions", "classes"}
        assert h["disk"]["total_gb"] > 0 and 0 <= h["disk"]["used_pct"] <= 100
        assert set(h["tunnel"]) == {"domain", "ok", "ms"}
        assert isinstance(h["mail"], bool)
        assert set(h["backup"]) == {"last_at", "size_mb", "count"}

    def test_health_teacher_forbidden(self, teacher):
        r = teacher.get(f"{BASE_URL}/api/admin/health")
        assert r.status_code == 403

    def test_health_unauth(self):
        assert requests.get(f"{BASE_URL}/api/admin/health").status_code == 401
