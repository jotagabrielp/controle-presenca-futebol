"""Tests for new /monthly and /expenses endpoints and weekly summary changes."""
import os
import requests
import pytest
from datetime import datetime, timezone

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or ""
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"')
                    break
    except Exception:
        pass
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

CURRENT_MONTH = datetime.now(timezone.utc).strftime("%Y-%m")


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Monthly ----------
def test_monthly_current_structure(s):
    r = s.get(f"{API}/monthly/current", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ["month", "deadline", "past_deadline", "price", "items",
              "count_pagos", "count_pendentes", "total_pago", "total_previsto"]:
        assert k in d, f"missing {k}"
    assert d["month"] == CURRENT_MONTH
    # deadline in YYYY-MM-DD
    assert len(d["deadline"]) == 10 and d["deadline"].startswith(CURRENT_MONTH)
    assert d["price"] == 60
    for item in d["items"]:
        assert "player" in item and "paid" in item and "blocked" in item
        assert item["player"]["type"] == "mensalista"


def test_monthly_mark_paid_and_unpaid_persist(s):
    # create a mensalista temp
    p = s.post(f"{API}/players", json={"name": "TEST_MonthlyPlayer", "type": "mensalista"}, timeout=15).json()
    pid = p["id"]
    try:
        # mark paid
        r = s.put(f"{API}/monthly", json={"player_id": pid, "month": CURRENT_MONTH, "paid": True}, timeout=15)
        assert r.status_code == 200
        b = r.json()
        assert b["paid"] is True and b["player_id"] == pid and b["month"] == CURRENT_MONTH

        # verify via GET current
        cur = s.get(f"{API}/monthly/current", timeout=15).json()
        me = next((it for it in cur["items"] if it["player"]["id"] == pid), None)
        assert me is not None
        assert me["paid"] is True
        assert me["paid_at"] is not None
        assert me["blocked"] is False
        assert cur["count_pagos"] >= 1
        assert cur["total_pago"] >= 60

        # unmark
        r2 = s.put(f"{API}/monthly", json={"player_id": pid, "month": CURRENT_MONTH, "paid": False}, timeout=15)
        assert r2.status_code == 200 and r2.json()["paid"] is False

        cur2 = s.get(f"{API}/monthly/current", timeout=15).json()
        me2 = next((it for it in cur2["items"] if it["player"]["id"] == pid), None)
        assert me2 is not None and me2["paid"] is False
    finally:
        # cleanup player + monthly leftover doc via unset (delete_player only removes attendance; monthly_payments left but harmless)
        s.delete(f"{API}/players/{pid}", timeout=15)


# ---------- Expenses ----------
def test_expenses_create_list_delete_and_summary(s):
    # list initial
    r = s.get(f"{API}/expenses", timeout=15)
    assert r.status_code == 200 and isinstance(r.json(), list)

    # create campo
    payload = {"category": "campo", "description": "TEST_Aluguel campo", "amount": 150.0}
    c = s.post(f"{API}/expenses", json=payload, timeout=15)
    assert c.status_code == 200, c.text
    exp1 = c.json()
    assert exp1["category"] == "campo"
    assert exp1["description"] == payload["description"]
    assert exp1["amount"] == 150.0
    assert exp1["month"] == CURRENT_MONTH
    assert len(exp1["date"]) == 10

    # create churrasco
    exp2 = s.post(f"{API}/expenses", json={"category": "churrasco", "description": "TEST_Carne", "amount": 80.5}, timeout=15).json()
    exp3 = s.post(f"{API}/expenses", json={"category": "outros", "description": "TEST_Bola", "amount": 20}, timeout=15).json()

    ids = [exp1["id"], exp2["id"], exp3["id"]]
    try:
        # list contains them, sorted by date desc
        lst = s.get(f"{API}/expenses", timeout=15).json()
        listed_ids = [e["id"] for e in lst]
        for i in ids:
            assert i in listed_ids

        # month filter
        lstm = s.get(f"{API}/expenses?month={CURRENT_MONTH}", timeout=15).json()
        listed_ids_m = [e["id"] for e in lstm]
        for i in ids:
            assert i in listed_ids_m

        # month filter to a bogus month
        lst_none = s.get(f"{API}/expenses?month=1999-01", timeout=15).json()
        for i in ids:
            assert i not in [e["id"] for e in lst_none]

        # summary
        summ = s.get(f"{API}/expenses/summary", timeout=15).json()
        assert summ["month"] == CURRENT_MONTH
        assert "by_category" in summ
        for k in ["campo", "churrasco", "outros"]:
            assert k in summ["by_category"]
        assert summ["by_category"]["campo"] >= 150.0
        assert summ["by_category"]["churrasco"] >= 80.5
        assert summ["by_category"]["outros"] >= 20
        assert summ["total"] >= 250.5
        assert summ["count"] >= 3
    finally:
        # cleanup
        for i in ids:
            s.delete(f"{API}/expenses/{i}", timeout=15)

    # verify deletion
    lst_after = s.get(f"{API}/expenses", timeout=15).json()
    ids_after = [e["id"] for e in lst_after]
    for i in ids:
        assert i not in ids_after


def test_expenses_validation(s):
    # empty description
    r1 = s.post(f"{API}/expenses", json={"category": "campo", "description": "  ", "amount": 10}, timeout=15)
    assert r1.status_code == 400

    # amount <= 0
    r2 = s.post(f"{API}/expenses", json={"category": "campo", "description": "TEST_x", "amount": 0}, timeout=15)
    assert r2.status_code == 400

    r3 = s.post(f"{API}/expenses", json={"category": "campo", "description": "TEST_x", "amount": -5}, timeout=15)
    assert r3.status_code == 400

    # invalid category (Pydantic Literal -> 422)
    r4 = s.post(f"{API}/expenses", json={"category": "invalid", "description": "TEST_x", "amount": 5}, timeout=15)
    assert r4.status_code in (400, 422)


def test_expenses_delete_404(s):
    r = s.delete(f"{API}/expenses/nonexistent-id-xyz", timeout=15)
    assert r.status_code == 404


# ---------- Week summary excludes mensalidade + waiting list logic ----------
def test_weeks_current_new_fields(s):
    r = s.get(f"{API}/weeks/current", timeout=15)
    assert r.status_code == 200
    summ = r.json()["summary"]
    # New required fields
    for k in ["total_mensalistas", "count_mensalistas_pendentes", "count_convidados_pendentes"]:
        assert k in summ, f"missing {k}"
    # mensalidade removed from weekly total
    assert summ["total_mensalistas"] == 0


def test_convidado_waiting_list_logic(s):
    """Convidado attending but not paid should NOT count in total_arrecadado; should show as count_convidados_pendentes."""
    p = s.post(f"{API}/players", json={"name": "TEST_ConvidadoWait", "type": "convidado"}, timeout=15).json()
    pid = p["id"]
    try:
        wid = s.get(f"{API}/weeks/current", timeout=15).json()["week"]["id"]

        # attending but NOT paid
        s.put(f"{API}/attendance", json={"week_id": wid, "player_id": pid, "attending": True}, timeout=15)
        after = s.get(f"{API}/weeks/current", timeout=15).json()["summary"]
        # our player is pending (not confirmed)
        assert after["count_convidados_pendentes"] >= 1
        conv_pending = after["count_convidados_pendentes"]
        conv_total = after["total_convidados"]

        # now pay -> moves to confirmed
        s.put(f"{API}/attendance", json={"week_id": wid, "player_id": pid, "paid": True}, timeout=15)
        paid = s.get(f"{API}/weeks/current", timeout=15).json()["summary"]
        assert paid["count_convidados_pendentes"] == conv_pending - 1
        assert paid["total_convidados"] == conv_total + 20
        # mensalista total still 0
        assert paid["total_mensalistas"] == 0
    finally:
        s.delete(f"{API}/players/{pid}", timeout=15)


def test_weeks_list_has_pending_fields(s):
    r = s.get(f"{API}/weeks", timeout=15)
    assert r.status_code == 200
    data = r.json()
    if data:
        summ = data[0]["summary"]
        assert "count_mensalistas_pendentes" in summ
        assert summ["total_mensalistas"] == 0
