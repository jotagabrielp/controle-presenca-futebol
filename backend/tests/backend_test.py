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



# Team Settings (NEW)
def test_team_get_default(s):
    r = s.get(f"{API}/settings/team", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "team_name" in body
    assert "team_emoji" in body


def test_team_put_and_persist(s):
    payload = {"team_name": "TEST_Turma FC", "team_emoji": "⚽"}
    r = s.put(f"{API}/settings/team", json=payload, timeout=15)
    assert r.status_code == 200
    assert r.json()["team_name"] == payload["team_name"]
    assert r.json()["team_emoji"] == payload["team_emoji"]

    r2 = s.get(f"{API}/settings/team", timeout=15)
    assert r2.status_code == 200
    assert r2.json()["team_name"] == payload["team_name"]
    assert r2.json()["team_emoji"] == payload["team_emoji"]

    # cleanup
    s.put(f"{API}/settings/team", json={"team_name": "", "team_emoji": ""}, timeout=15)


# Weeks listing (N+1 optimization)
def test_list_weeks_structure(s):
    r = s.get(f"{API}/weeks", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    if data:
        item = data[0]
        assert "week" in item and "summary" in item
        assert "id" in item["week"] and "label" in item["week"]
        for k in [
            "total_mensalistas", "total_convidados", "total_churrasco",
            "total_arrecadado", "total_pago", "total_pendente",
            "count_mensalistas", "count_convidados", "count_churrasco",
            "count_pagos", "count_confirmados",
        ]:
            assert k in item["summary"], f"missing {k}"


def test_list_weeks_summary_consistency_with_current(s):
    """After marking a player attending on current week, list_weeks summary for that week should reflect it."""
    p = s.post(f"{API}/players", json={"name": "TEST_WeeksAgg", "type": "mensalista"}, timeout=15).json()
    pid = p["id"]
    try:
        wid = s.get(f"{API}/weeks/current", timeout=15).json()["week"]["id"]
        s.put(f"{API}/attendance", json={"week_id": wid, "player_id": pid, "attending": True, "churrasco": True, "paid": True}, timeout=15)

        listed = s.get(f"{API}/weeks", timeout=15).json()
        match = next((x for x in listed if x["week"]["id"] == wid), None)
        assert match is not None
        # mensalista=60 + churrasco=20 must be counted
        assert match["summary"]["total_mensalistas"] >= 60
        assert match["summary"]["total_churrasco"] >= 20
        assert match["summary"]["total_pago"] >= 80
        assert match["summary"]["count_confirmados"] >= 1
    finally:
        s.delete(f"{API}/players/{pid}", timeout=15)


# Player history (N+1 optimization)
def test_player_history_structure_and_totals(s):
    p = s.post(f"{API}/players", json={"name": "TEST_HistPlayer", "type": "convidado"}, timeout=15).json()
    pid = p["id"]
    try:
        wid = s.get(f"{API}/weeks/current", timeout=15).json()["week"]["id"]
        s.put(f"{API}/attendance", json={"week_id": wid, "player_id": pid, "attending": True, "churrasco": True, "paid": True}, timeout=15)

        r = s.get(f"{API}/players/{pid}/history", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["player"]["id"] == pid
        assert isinstance(body["history"], list)
        for k in ["total_present", "total_churrasco", "total_paid"]:
            assert k in body
        assert body["total_present"] >= 1
        assert body["total_churrasco"] >= 1
        assert body["total_paid"] >= 1
        cur = next((h for h in body["history"] if h["week"]["id"] == wid), None)
        assert cur is not None
        assert cur["attending"] is True
        assert cur["churrasco"] is True
        assert cur["paid"] is True
    finally:
        s.delete(f"{API}/players/{pid}", timeout=15)


def test_player_history_404(s):
    r = s.get(f"{API}/players/nonexistent-id-xyz/history", timeout=15)
    assert r.status_code == 404
