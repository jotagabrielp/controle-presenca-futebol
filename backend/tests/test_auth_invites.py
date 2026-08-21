"""Tests for auth + invites feature (iteration 6)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://squad-checker.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@futlista.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        data={"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Auth ----------
class TestAuth:
    def test_setup_required_false(self):
        r = requests.get(f"{BASE_URL}/api/auth/setup-required")
        assert r.status_code == 200
        assert r.json()["setup_required"] is False

    def test_setup_409_when_admin_exists(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/setup",
            json={"email": "new@x.com", "password": "abcdef"},
        )
        assert r.status_code == 409

    def test_login_returns_token(self, token):
        assert token and len(token) > 10

    def test_login_bad_creds_401(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": ADMIN_EMAIL, "password": "WRONG"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert r.status_code == 401

    def test_me_no_token_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_bad_token_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer garbage"})
        assert r.status_code == 401

    def test_me_valid(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL


# ---------- Protected endpoints require token ----------
class TestProtectedRequireAuth:
    @pytest.mark.parametrize("method,path,body", [
        ("POST", "/api/players", {"name": "X", "type": "convidado"}),
        ("PUT", "/api/players/xxx", {"name": "Y"}),
        ("DELETE", "/api/players/xxx", None),
        ("PUT", "/api/monthly", {"player_id": "x", "month": "2026-01", "paid": True}),
        ("POST", "/api/expenses", {"category": "campo", "description": "d", "amount": 10}),
        ("DELETE", "/api/expenses/xxx", None),
        ("PUT", "/api/settings/pix", {"pix_key": "k", "holder_name": "h", "bank": "b"}),
        ("PUT", "/api/settings/team", {"team_name": "t", "team_emoji": "⚽"}),
        ("GET", "/api/invites", None),
        ("DELETE", "/api/invites/xxx", None),
    ])
    def test_401_without_token(self, method, path, body):
        r = requests.request(method, f"{BASE_URL}{path}", json=body)
        assert r.status_code == 401, f"{method} {path} -> {r.status_code}"


# ---------- Public endpoints (no auth) ----------
class TestPublicEndpoints:
    def test_get_players_public(self):
        r = requests.get(f"{BASE_URL}/api/players")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_current_week_public(self):
        r = requests.get(f"{BASE_URL}/api/weeks/current")
        assert r.status_code == 200
        assert "week" in r.json()

    def test_monthly_current_public(self):
        r = requests.get(f"{BASE_URL}/api/monthly/current")
        assert r.status_code == 200

    def test_expenses_public(self):
        r = requests.get(f"{BASE_URL}/api/expenses")
        assert r.status_code == 200

    def test_attendance_public(self):
        cw = requests.get(f"{BASE_URL}/api/weeks/current").json()
        players = requests.get(f"{BASE_URL}/api/players").json()
        if not players:
            pytest.skip("no players")
        r = requests.put(
            f"{BASE_URL}/api/attendance",
            json={"week_id": cw["week"]["id"], "player_id": players[0]["id"]},
        )
        assert r.status_code == 200


# ---------- Invites ----------
class TestInvites:
    def test_create_invite_public(self):
        r = requests.post(f"{BASE_URL}/api/invites", json={"type": "convidado"})
        assert r.status_code == 200
        d = r.json()
        assert d["type"] == "convidado"
        assert d["uses"] == 0
        assert d["token"]

    def test_get_invite_404(self):
        r = requests.get(f"{BASE_URL}/api/invites/nonexistent-token-xyz")
        assert r.status_code == 404

    def test_get_invite_ok(self):
        c = requests.post(f"{BASE_URL}/api/invites", json={"type": "mensalista"}).json()
        r = requests.get(f"{BASE_URL}/api/invites/{c['token']}")
        assert r.status_code == 200
        assert r.json()["type"] == "mensalista"

    def test_accept_invite_creates_player(self, auth_headers):
        inv = requests.post(f"{BASE_URL}/api/invites", json={"type": "convidado"}).json()
        r = requests.post(
            f"{BASE_URL}/api/invites/{inv['token']}/accept",
            json={"name": "TEST_InviteUser"},
        )
        assert r.status_code == 200
        p = r.json()
        assert p["name"] == "TEST_InviteUser"
        assert p["type"] == "convidado"
        # uses incremented
        inv2 = requests.get(f"{BASE_URL}/api/invites/{inv['token']}").json()
        assert inv2["uses"] == 1
        # cleanup
        requests.delete(f"{BASE_URL}/api/players/{p['id']}", headers=auth_headers)

    def test_list_invites_admin(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/invites", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- Auth with token succeeds ----------
class TestProtectedWithToken:
    def test_player_crud(self, auth_headers):
        r = requests.post(
            f"{BASE_URL}/api/players",
            json={"name": "TEST_AuthPlayer", "type": "convidado"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        pid = r.json()["id"]
        # cleanup
        d = requests.delete(f"{BASE_URL}/api/players/{pid}", headers=auth_headers)
        assert d.status_code == 200

    def test_settings_pix(self, auth_headers):
        r = requests.put(
            f"{BASE_URL}/api/settings/pix",
            json={"pix_key": "test-key", "holder_name": "H", "bank": "B"},
            headers=auth_headers,
        )
        assert r.status_code == 200


# ---------- Promote ----------
class TestPromote:
    def test_promote_requires_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/promote",
            json={"email": "x@x.com", "password": "abcdef"},
        )
        assert r.status_code == 401

    def test_promote_conflict_existing(self, auth_headers):
        r = requests.post(
            f"{BASE_URL}/api/auth/promote",
            json={"email": ADMIN_EMAIL, "password": "abcdef"},
            headers=auth_headers,
        )
        assert r.status_code == 409
