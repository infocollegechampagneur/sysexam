# Iteration 25: exam managers (co-gestionnaires) + availability windows (plages horaires)
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "lynchs2757@gmail.com", "password": "Enseignant2026!"}
T2_EMAIL = "test_manager_iter25@example.com"
T2_PW = "Gestion2026!"


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def admin():
    return login(ADMIN["email"], ADMIN["password"])


@pytest.fixture(scope="module")
def t2(admin):
    users = admin.get(f"{BASE_URL}/api/admin/users").json()
    u = next((x for x in users if x["email"] == T2_EMAIL), None)
    if not u:
        r = admin.post(f"{BASE_URL}/api/admin/users", json={"email": T2_EMAIL, "name": "TEST Gestionnaire", "password": T2_PW})
        assert r.status_code == 201, r.text
        u = r.json()
    else:
        admin.post(f"{BASE_URL}/api/admin/users/{u['id']}/reset-password", json={"password": T2_PW})
    s = login(T2_EMAIL, T2_PW)
    # must_change_password may be set; change and change back is not needed for API access
    me = s.get(f"{BASE_URL}/api/auth/me").json()
    if me.get("must_change_password"):
        r = s.post(f"{BASE_URL}/api/auth/change-password", json={"current_password": T2_PW, "new_password": T2_PW + "x"})
        if r.status_code == 200:
            admin.post(f"{BASE_URL}/api/admin/users/{u['id']}/reset-password", json={"password": T2_PW})
            s = login(T2_EMAIL, T2_PW)
    return s, u["id"]


def make_exam(sess, **extra):
    body = {"title": f"TEST_iter25 {uuid.uuid4().hex[:5]}", "exam_type": "form", "status": "open",
            "questions": [{"id": "q1", "type": "short", "text": "Q?", "points": 1}], **extra}
    r = sess.post(f"{BASE_URL}/api/exams", json=body)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def cleanup(admin):
    ids = []
    yield ids
    for i in ids:
        admin.delete(f"{BASE_URL}/api/exams/{i}")


# --- Managers ---
class TestManagers:
    def test_manager_access(self, admin, t2, cleanup):
        s2, t2_id = t2
        ex = make_exam(admin, managers=[t2_id])
        cleanup.append(ex["id"])
        assert ex["managers"] == [t2_id]
        lst = s2.get(f"{BASE_URL}/api/exams").json()
        mine = next((e for e in lst if e["id"] == ex["id"]), None)
        assert mine is not None
        assert mine["is_manager"] is True and mine["owner_name"]
        # owner view
        own = next(e for e in admin.get(f"{BASE_URL}/api/exams").json() if e["id"] == ex["id"])
        assert own["is_manager"] is False and own["owner_name"] == ""
        # GET, PUT by manager
        assert s2.get(f"{BASE_URL}/api/exams/{ex['id']}").status_code == 200
        body = {**{k: ex[k] for k in ("title", "exam_type", "status", "questions", "settings", "managers")}, "subject": "Modifié par gestionnaire"}
        r = s2.put(f"{BASE_URL}/api/exams/{ex['id']}", json=body)
        assert r.status_code == 200, r.text
        got = admin.get(f"{BASE_URL}/api/exams/{ex['id']}").json()
        assert got["subject"] == "Modifié par gestionnaire"
        assert got["teacher_id"] != t2_id  # ownership unchanged
        # results/sessions + stats
        assert s2.get(f"{BASE_URL}/api/exams/{ex['id']}/sessions").status_code == 200
        # delete forbidden for manager
        r = s2.delete(f"{BASE_URL}/api/exams/{ex['id']}")
        assert r.status_code == 403
        assert admin.get(f"{BASE_URL}/api/exams/{ex['id']}").status_code == 200

    def test_manager_session_ops(self, admin, t2, cleanup):
        s2, t2_id = t2
        ex = make_exam(admin, managers=[t2_id])
        cleanup.append(ex["id"])
        r = requests.post(f"{BASE_URL}/api/student/join", json={"code": ex["code"], "student_name": "TEST Eleve M", "student_number": "M1"})
        assert r.status_code == 200, r.text
        sess = s2.get(f"{BASE_URL}/api/exams/{ex['id']}/sessions").json()
        assert len(sess) == 1
        sid = sess[0]["id"]
        r = s2.put(f"{BASE_URL}/api/sessions/{sid}/grade", json={"score": 1, "max_score": 1, "comment": "ok"})
        assert r.status_code == 200, r.text
        assert s2.post(f"{BASE_URL}/api/exams/{ex['id']}/pause", json={}).status_code == 200
        assert s2.post(f"{BASE_URL}/api/exams/{ex['id']}/resume").status_code == 200
        # help request recipients include manager
        tok = r = requests.post(f"{BASE_URL}/api/student/join", json={"code": ex["code"], "student_name": "TEST Eleve M", "student_number": "M1"}).json()["token"]
        hr = requests.post(f"{BASE_URL}/api/student/help", json={"reason": "test"}, headers={"X-Session-Token": tok})
        assert hr.status_code in (200, 201), hr.text
        reqs = s2.get(f"{BASE_URL}/api/help-requests", params={"exam_id": ex["id"]}).json()
        assert any(t2_id in q["recipients"] for q in reqs)
        # clear sessions by manager
        r = s2.delete(f"{BASE_URL}/api/exams/{ex['id']}/sessions")
        assert r.status_code == 200 and r.json()["deleted"] == 1

    def test_removed_manager_loses_access(self, admin, t2, cleanup):
        s2, t2_id = t2
        ex = make_exam(admin, managers=[t2_id])
        cleanup.append(ex["id"])
        body = {k: ex[k] for k in ("title", "exam_type", "status", "questions", "settings")}
        body["managers"] = []
        assert admin.put(f"{BASE_URL}/api/exams/{ex['id']}", json=body).status_code == 200
        assert s2.get(f"{BASE_URL}/api/exams/{ex['id']}").status_code == 404
        assert all(e["id"] != ex["id"] for e in s2.get(f"{BASE_URL}/api/exams").json())

    def test_non_manager_no_access(self, admin, t2, cleanup):
        s2, _ = t2
        ex = make_exam(admin)
        cleanup.append(ex["id"])
        assert s2.get(f"{BASE_URL}/api/exams/{ex['id']}").status_code == 404
        assert s2.delete(f"{BASE_URL}/api/exams/{ex['id']}").status_code == 404


# --- Windows ---
class TestWindows:
    def test_no_windows_open(self, admin, cleanup):
        ex = make_exam(admin)
        cleanup.append(ex["id"])
        e = next(x for x in admin.get(f"{BASE_URL}/api/exams").json() if x["id"] == ex["id"])
        assert e["window"] == {"open": True, "next_start": None}
        r = requests.post(f"{BASE_URL}/api/student/join", json={"code": ex["code"], "student_name": "TEST W0"})
        assert r.status_code == 200

    def test_current_window_allows_join(self, admin, cleanup):
        now = datetime.now(timezone.utc)
        ex = make_exam(admin, windows=[{"start": iso(now - timedelta(hours=1)), "end": iso(now + timedelta(hours=1))}])
        cleanup.append(ex["id"])
        e = next(x for x in admin.get(f"{BASE_URL}/api/exams").json() if x["id"] == ex["id"])
        assert e["window"]["open"] is True
        r = requests.post(f"{BASE_URL}/api/student/join", json={"code": ex["code"], "student_name": "TEST W1"})
        assert r.status_code == 200

    def test_future_window_refuses_with_next_start(self, admin, cleanup):
        now = datetime.now(timezone.utc)
        ex = make_exam(admin, windows=[{"start": iso(now + timedelta(days=1)), "end": iso(now + timedelta(days=1, hours=2))},
                                       {"start": iso(now - timedelta(days=2)), "end": iso(now - timedelta(days=2) + timedelta(hours=1))}])
        cleanup.append(ex["id"])
        e = next(x for x in admin.get(f"{BASE_URL}/api/exams").json() if x["id"] == ex["id"])
        assert e["window"]["open"] is False and e["window"]["next_start"]
        r = requests.post(f"{BASE_URL}/api/student/join", json={"code": ex["code"], "student_name": "TEST W2"})
        assert r.status_code == 403
        assert "Prochaine ouverture" in r.json()["detail"]
        print(r.json()["detail"])

    def test_past_window_refuses_no_next(self, admin, cleanup):
        now = datetime.now(timezone.utc)
        ex = make_exam(admin, windows=[{"start": iso(now - timedelta(days=1)), "end": iso(now - timedelta(days=1) + timedelta(hours=1))}])
        cleanup.append(ex["id"])
        r = requests.post(f"{BASE_URL}/api/student/join", json={"code": ex["code"], "student_name": "TEST W3"})
        assert r.status_code == 403
        assert "Aucune autre plage" in r.json()["detail"]

    def test_in_progress_can_rejoin_after_window_closes(self, admin, cleanup):
        now = datetime.now(timezone.utc)
        ex = make_exam(admin, windows=[{"start": iso(now - timedelta(hours=1)), "end": iso(now + timedelta(hours=1))}])
        cleanup.append(ex["id"])
        r = requests.post(f"{BASE_URL}/api/student/join", json={"code": ex["code"], "student_name": "TEST Resume", "student_number": "R1"})
        assert r.status_code == 200
        tok = r.json()["token"]
        body = {k: ex[k] for k in ("title", "exam_type", "status", "questions", "settings")}
        body["windows"] = [{"start": iso(now - timedelta(hours=3)), "end": iso(now - timedelta(hours=2))}]
        assert admin.put(f"{BASE_URL}/api/exams/{ex['id']}", json=body).status_code == 200
        r2 = requests.post(f"{BASE_URL}/api/student/join", json={"code": ex["code"], "student_name": "test resume", "student_number": "R1"})
        assert r2.status_code == 200 and r2.json()["token"] == tok
        r3 = requests.post(f"{BASE_URL}/api/student/join", json={"code": ex["code"], "student_name": "TEST Nouveau"})
        assert r3.status_code == 403
        # still works for /student/session
        assert requests.get(f"{BASE_URL}/api/student/session", headers={"X-Session-Token": tok}).status_code == 200

    def test_invalid_window_ignored(self, admin, cleanup):
        now = datetime.now(timezone.utc)
        ex = make_exam(admin, windows=[{"start": iso(now + timedelta(hours=2)), "end": iso(now + timedelta(hours=1))}, {"start": "bad", "end": ""}])
        cleanup.append(ex["id"])
        r = requests.post(f"{BASE_URL}/api/student/join", json={"code": ex["code"], "student_name": "TEST Inv"})
        assert r.status_code == 200  # invalid windows ignored -> exam open

    def test_naive_datetime_local_tz(self, admin, cleanup):
        # naive datetime interpreted in America/Toronto
        ex = make_exam(admin, windows=[{"start": "2030-01-10T08:00", "end": "2030-01-10T10:00"}])
        cleanup.append(ex["id"])
        r = requests.post(f"{BASE_URL}/api/student/join", json={"code": ex["code"], "student_name": "TEST Naive"})
        assert r.status_code == 403
        assert "10 janv. 2030 à 8 h" in r.json()["detail"], r.json()["detail"]
