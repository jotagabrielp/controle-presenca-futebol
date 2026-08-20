"""FutLista backend regression tests."""
import os
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    # fallback to frontend env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"')
                    break
    except Exception:
        pass
BASE_URL = (BASE_URL or "").rstrip("/")
assert BASE_URL, "Missing backend URL"

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# Health
def test_root(s):
    r = s.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    assert r.json().get("message") == "FutLista API"


# Players
def test_list_players(s):
    r = s.get(f"{API}/players", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_and_delete_player(s):
    payload = {"name": "TEST_Playwright Player", "type": "mensalista"}
    r = s.post(f"{API}/players", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["name"] == payload["name"]
    assert p["type"] == "mensalista"
    pid = p["id"]

    # verify listed
    r2 = s.get(f"{API}/players", timeout=15)
    assert any(x["id"] == pid for x in r2.json())

    # delete
    rd = s.delete(f"{API}/players/{pid}", timeout=15)
    assert rd.status_code == 200
    assert rd.json().get("ok") is True

    r3 = s.get(f"{API}/players", timeout=15)
    assert not any(x["id"] == pid for x in r3.json())


# Weeks
def test_current_week(s):
    r = s.get(f"{API}/weeks/current", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "week" in data and "attendance" in data and "summary" in data
    assert "id" in data["week"] and "label" in data["week"]
    for key in ["total_arrecadado", "total_pago", "total_pendente", "count_confirmados"]:
        assert key in data["summary"]


# Pix Settings
def test_pix_get(s):
    r = s.get(f"{API}/settings/pix", timeout=15)
    assert r.status_code == 200
    body = r.json()
    for k in ["pix_key", "holder_name", "bank"]:
        assert k in body


def test_pix_put_and_persist(s):
    payload = {"pix_key": "TEST_pix@futlista.com", "holder_name": "TEST Holder", "bank": "TEST Bank"}
    r = s.put(f"{API}/settings/pix", json=payload, timeout=15)
    assert r.status_code == 200
    assert r.json()["pix_key"] == payload["pix_key"]

    r2 = s.get(f"{API}/settings/pix", timeout=15)
    assert r2.status_code == 200
    assert r2.json()["pix_key"] == payload["pix_key"]
    assert r2.json()["holder_name"] == payload["holder_name"]

    # cleanup: reset to empty
    s.put(f"{API}/settings/pix", json={"pix_key": "", "holder_name": "", "bank": ""}, timeout=15)


# Attendance
def test_attendance_upsert_flow(s):
    # create temp player
    p = s.post(f"{API}/players", json={"name": "TEST_Attend", "type": "convidado"}, timeout=15).json()
    pid = p["id"]
    try:
        week = s.get(f"{API}/weeks/current", timeout=15).json()["week"]
        wid = week["id"]

        # mark attending
        r = s.put(f"{API}/attendance", json={"week_id": wid, "player_id": pid, "attending": True}, timeout=15)
        assert r.status_code == 200
        assert r.json()["attending"] is True

        # mark churrasco
        r = s.put(f"{API}/attendance", json={"week_id": wid, "player_id": pid, "churrasco": True}, timeout=15)
        assert r.status_code == 200
        assert r.json()["churrasco"] is True

        # mark paid
        r = s.put(f"{API}/attendance", json={"week_id": wid, "player_id": pid, "paid": True}, timeout=15)
        assert r.status_code == 200
        assert r.json()["paid"] is True

        # verify persistence via /weeks/current
        cw = s.get(f"{API}/weeks/current", timeout=15).json()
        found = [a for a in cw["attendance"] if a["player_id"] == pid]
        assert found and found[0]["paid"] is True and found[0]["churrasco"] is True

        # unattend clears churrasco & paid
        r = s.put(f"{API}/attendance", json={"week_id": wid, "player_id": pid, "attending": False}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["attending"] is False
        assert d["churrasco"] is False
        assert d["paid"] is False
    finally:
        s.delete(f"{API}/players/{pid}", timeout=15)
