"""Tests for per-player custom fees (monthly_fee, churrasco_fee, guest_fee)."""
import os
import requests
import pytest
from datetime import datetime, timezone

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"')
                break
BASE_URL = (BASE_URL or "").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# -------- Create with custom fees --------
def test_create_player_with_custom_monthly_fee(s):
    r = s.post(f"{API}/players", json={
        "name": "TEST_CustomMonthly", "type": "mensalista", "monthly_fee": 30
    }, timeout=15)
    assert r.status_code == 200, r.text
    p = r.json()
    try:
        assert p["monthly_fee"] == 30
        assert p["churrasco_fee"] is None
        assert p["guest_fee"] is None
        # verify persisted via GET
        pl = s.get(f"{API}/players", timeout=15).json()
        got = next(x for x in pl if x["id"] == p["id"])
        assert got["monthly_fee"] == 30
    finally:
        s.delete(f"{API}/players/{p['id']}", timeout=15)


def test_create_player_with_all_custom_fees(s):
    r = s.post(f"{API}/players", json={
        "name": "TEST_AllCustom", "type": "convidado",
        "guest_fee": 15, "churrasco_fee": 25
    }, timeout=15)
    assert r.status_code == 200, r.text
    p = r.json()
    try:
        assert p["guest_fee"] == 15
        assert p["churrasco_fee"] == 25
    finally:
        s.delete(f"{API}/players/{p['id']}", timeout=15)


def test_create_player_no_fees_returns_null(s):
    r = s.post(f"{API}/players", json={"name": "TEST_NoFees", "type": "mensalista"}, timeout=15)
    assert r.status_code == 200
    p = r.json()
    try:
        assert p["monthly_fee"] is None
        assert p["churrasco_fee"] is None
        assert p["guest_fee"] is None
    finally:
        s.delete(f"{API}/players/{p['id']}", timeout=15)


# -------- Update / clear --------
def test_update_player_fees(s):
    p = s.post(f"{API}/players", json={"name": "TEST_UpdFees", "type": "mensalista"}, timeout=15).json()
    pid = p["id"]
    try:
        r = s.put(f"{API}/players/{pid}", json={"monthly_fee": 40, "churrasco_fee": 15}, timeout=15)
        assert r.status_code == 200
        u = r.json()
        assert u["monthly_fee"] == 40
        assert u["churrasco_fee"] == 15
        # verify GET
        pl = s.get(f"{API}/players", timeout=15).json()
        got = next(x for x in pl if x["id"] == pid)
        assert got["monthly_fee"] == 40
        assert got["churrasco_fee"] == 15
    finally:
        s.delete(f"{API}/players/{pid}", timeout=15)


def test_clear_monthly_fee_reverts_to_null(s):
    p = s.post(f"{API}/players", json={
        "name": "TEST_Clear", "type": "mensalista", "monthly_fee": 30, "churrasco_fee": 10
    }, timeout=15).json()
    pid = p["id"]
    try:
        r = s.put(f"{API}/players/{pid}", json={"clear_monthly_fee": True, "clear_churrasco_fee": True}, timeout=15)
        assert r.status_code == 200
        u = r.json()
        assert u["monthly_fee"] is None
        assert u["churrasco_fee"] is None
        pl = s.get(f"{API}/players", timeout=15).json()
        got = next(x for x in pl if x["id"] == pid)
        assert got["monthly_fee"] is None
        assert got["churrasco_fee"] is None
    finally:
        s.delete(f"{API}/players/{pid}", timeout=15)


def test_negative_fee_returns_400(s):
    r = s.post(f"{API}/players", json={
        "name": "TEST_NegCreate", "type": "mensalista"
    }, timeout=15)
    pid = r.json()["id"]
    try:
        for field in ["monthly_fee", "churrasco_fee", "guest_fee"]:
            rr = s.put(f"{API}/players/{pid}", json={field: -5}, timeout=15)
            assert rr.status_code == 400, f"{field}: {rr.status_code} {rr.text}"
    finally:
        s.delete(f"{API}/players/{pid}", timeout=15)


def test_update_name_and_type(s):
    p = s.post(f"{API}/players", json={"name": "TEST_Rename", "type": "mensalista"}, timeout=15).json()
    pid = p["id"]
    try:
        r = s.put(f"{API}/players/{pid}", json={"name": "TEST_Renamed", "type": "convidado"}, timeout=15)
        assert r.status_code == 200
        u = r.json()
        assert u["name"] == "TEST_Renamed"
        assert u["type"] == "convidado"
    finally:
        s.delete(f"{API}/players/{pid}", timeout=15)


# -------- Aggregations use custom fees --------
def test_monthly_current_uses_custom_fee_in_total_previsto(s):
    p = s.post(f"{API}/players", json={
        "name": "TEST_MonthlyCustom", "type": "mensalista", "monthly_fee": 30
    }, timeout=15).json()
    pid = p["id"]
    try:
        r = s.get(f"{API}/monthly/current", timeout=15)
        assert r.status_code == 200
        data = r.json()
        # each item has monthly_fee, default is 60
        item = next((it for it in data["items"] if it["player"]["id"] == pid), None)
        assert item is not None
        assert item["monthly_fee"] == 30
        # total_previsto should include 30 for this player (sum of custom fees)
        # verify by comparing default: total_previsto = sum(item.monthly_fee)
        expected = sum(it["monthly_fee"] for it in data["items"])
        assert data["total_previsto"] == expected
        # The total_previsto is NOT count*60 anymore because of custom
        assert data["total_previsto"] != len(data["items"]) * 60 or len(data["items"]) == 0
    finally:
        s.delete(f"{API}/players/{pid}", timeout=15)


def test_weekly_uses_custom_guest_and_churrasco_fee(s):
    # convidado with custom guest_fee=15 and churrasco_fee=25
    p = s.post(f"{API}/players", json={
        "name": "TEST_WeekCustom", "type": "convidado",
        "guest_fee": 15, "churrasco_fee": 25
    }, timeout=15).json()
    pid = p["id"]
    try:
        wid = s.get(f"{API}/weeks/current", timeout=15).json()["week"]["id"]
        # baseline totals
        baseline = s.get(f"{API}/weeks/current", timeout=15).json()["summary"]
        b_conv = baseline["total_convidados"]
        b_churr = baseline["total_churrasco"]
        b_pago = baseline["total_pago"]

        # mark attending + churrasco + paid
        s.put(f"{API}/attendance", json={
            "week_id": wid, "player_id": pid,
            "attending": True, "churrasco": True, "paid": True
        }, timeout=15)

        cw = s.get(f"{API}/weeks/current", timeout=15).json()["summary"]
        assert cw["total_convidados"] == b_conv + 15, f"expected +15 got {cw['total_convidados'] - b_conv}"
        assert cw["total_churrasco"] == b_churr + 25
        assert cw["total_pago"] == b_pago + 15 + 25

        # Also /weeks list endpoint
        listed = s.get(f"{API}/weeks", timeout=15).json()
        match = next(x for x in listed if x["week"]["id"] == wid)
        assert match["summary"]["total_convidados"] >= 15
        assert match["summary"]["total_churrasco"] >= 25
    finally:
        s.delete(f"{API}/players/{pid}", timeout=15)


def test_create_negative_fee_via_post(s):
    """PlayerCreate does not validate <0 in current server (only PUT does).
    This test documents current behavior — if server ever adds validation, adjust.
    """
    r = s.post(f"{API}/players", json={
        "name": "TEST_NegPost", "type": "mensalista", "monthly_fee": -10
    }, timeout=15)
    # Currently server accepts it. Cleanup either way.
    if r.status_code == 200:
        s.delete(f"{API}/players/{r.json()['id']}", timeout=15)
    # No hard assertion — this is informational.
