"""
RSM Backend E2E Tests
Covers: auth, submission packs, marketplace, interests, operations (NCA/quote/contract), chat, admin, negative cases.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://product-guide-app.preview.emergentagent.com").rstrip("/")

CEDENTE_EMAIL = "cedente@demo.eu"
REASEG_EMAIL = "reasegurador@demo.eu"
BROKER_EMAIL = "broker@demo.eu"
ADMIN_EMAIL = "admin@rsm.eu"
DEMO_PASS = "Demo123!"
ADMIN_PASS = "Admin123!"


# ─── Helpers ─────────────────────────────────────────────────────────────
def _login(email: str, password: str) -> dict:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    return data


def _client(token: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# Session-scoped shared state
@pytest.fixture(scope="session")
def ced():
    return _login(CEDENTE_EMAIL, DEMO_PASS)


@pytest.fixture(scope="session")
def rea():
    return _login(REASEG_EMAIL, DEMO_PASS)


@pytest.fixture(scope="session")
def adm():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="session")
def ced_c(ced):
    return _client(ced["token"])


@pytest.fixture(scope="session")
def rea_c(rea):
    return _client(rea["token"])


@pytest.fixture(scope="session")
def adm_c(adm):
    return _client(adm["token"])


# Shared state between tests in the e2e flow
STATE = {}


# ─── Auth tests ──────────────────────────────────────────────────────────
class TestAuth:
    def test_login_cedente_success(self, ced):
        assert ced["user"]["role"] == "cedente"
        assert ced["user"]["email"] == CEDENTE_EMAIL
        assert ced["user"]["verified"] is True

    def test_login_reasegurador_success(self, rea):
        assert rea["user"]["role"] == "reasegurador"

    def test_login_admin_success(self, adm):
        assert adm["user"]["role"] == "admin"

    def test_login_invalid_password(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": CEDENTE_EMAIL, "password": "wrong"},
            timeout=10,
        )
        assert r.status_code in (400, 401)

    def test_me_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 401

    def test_me_with_token(self, ced_c):
        r = ced_c.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 200
        assert r.json()["user"]["email"] == CEDENTE_EMAIL


# ─── Submission pack flow ────────────────────────────────────────────────
class TestSubmissionPackFlow:
    def test_create_published_pack(self, ced_c):
        unique_title = f"TEST_XL_Property_2026_{uuid.uuid4().hex[:6]}"
        payload = {
            "title": unique_title,
            "branch": "Property",
            "reinsurance_type": "Excess of Loss",
            "country_region": "España",
            "coverage_period": "01/01/2026 – 31/12/2026",
            "cession_pct": 30,
            "premiums_y1": 15000000,
            "premiums_y2": 13000000,
            "premiums_y3": 12000000,
            "loss_ratio_y1": 62,
            "loss_ratio_y2": 58,
            "loss_ratio_y3": 65,
            "description": "Test XL Property program 2026. Zero cat events.",
            "status": "published",
        }
        r = ced_c.post(f"{BASE_URL}/api/submission-packs", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        pack = r.json()["pack"]
        assert pack["title"] == unique_title
        assert pack["status"] == "published"
        assert pack["code"].startswith("RSM-")
        assert pack["cession_pct"] == 30
        STATE["pack_id"] = pack["id"]
        STATE["pack_code"] = pack["code"]
        STATE["pack_title"] = unique_title

    def test_my_packs_lists_new(self, ced_c):
        r = ced_c.get(f"{BASE_URL}/api/submission-packs/mine", timeout=10)
        assert r.status_code == 200
        packs = r.json()["packs"]
        ids = [p["id"] for p in packs]
        assert STATE["pack_id"] in ids

    def test_marketplace_lists_pack_for_reasegurador(self, rea_c):
        r = rea_c.get(f"{BASE_URL}/api/marketplace/packs", timeout=10)
        assert r.status_code == 200
        packs = r.json()["packs"]
        matching = [p for p in packs if p["id"] == STATE["pack_id"]]
        assert len(matching) == 1
        p = matching[0]
        assert p["title"] == STATE["pack_title"]
        assert p["verified"] is True
        assert p["own_interest"] is None

    def test_marketplace_pack_detail(self, rea_c):
        r = rea_c.get(f"{BASE_URL}/api/marketplace/packs/{STATE['pack_id']}", timeout=10)
        assert r.status_code == 200, r.text
        pack = r.json()["pack"]
        assert pack["id"] == STATE["pack_id"]
        assert pack["premiums_y1"] == 15000000
        assert pack["loss_ratio_y2"] == 58
        assert pack["description"].startswith("Test XL Property")
        assert pack["verified"] is True
        assert pack["avg_loss_ratio"] == round((62 + 58 + 65) / 3, 1)

    def test_marketplace_detail_invalid_id(self, rea_c):
        r = rea_c.get(f"{BASE_URL}/api/marketplace/packs/nonexistent-id", timeout=10)
        assert r.status_code == 404


# ─── Interest flow ───────────────────────────────────────────────────────
class TestInterestFlow:
    def test_reasegurador_expresses_interest(self, rea_c):
        r = rea_c.post(
            f"{BASE_URL}/api/interests",
            json={"pack_id": STATE["pack_id"], "message": "Nos interesa este programa. Rating A+."},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        interest = r.json()["interest"]
        assert interest["status"] == "pending"
        assert interest["pack_id"] == STATE["pack_id"]
        STATE["interest_id"] = interest["id"]

    def test_duplicate_interest_rejected(self, rea_c):
        r = rea_c.post(
            f"{BASE_URL}/api/interests",
            json={"pack_id": STATE["pack_id"], "message": "again"},
            timeout=10,
        )
        assert r.status_code == 400
        assert "Already" in r.text or "already" in r.text.lower()

    def test_cedente_sees_received_interest(self, ced_c):
        r = ced_c.get(f"{BASE_URL}/api/interests/received?status=pending", timeout=10)
        assert r.status_code == 200
        items = r.json()["items"]
        match = [it for it in items if it["id"] == STATE["interest_id"]]
        assert len(match) == 1
        assert match[0]["pack"]["code"] == STATE["pack_code"]

    def test_marketplace_own_interest_shows_pending(self, rea_c):
        r = rea_c.get(f"{BASE_URL}/api/marketplace/packs/{STATE['pack_id']}", timeout=10)
        assert r.status_code == 200
        assert r.json()["pack"]["own_interest"] == "pending"

    def test_cedente_accepts_interest(self, ced_c):
        r = ced_c.post(
            f"{BASE_URL}/api/interests/{STATE['interest_id']}/respond",
            json={"action": "accept"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert "operation_id" in data
        STATE["operation_id"] = data["operation_id"]

    def test_operation_created_nca_pending(self, ced_c):
        r = ced_c.get(f"{BASE_URL}/api/operations/{STATE['operation_id']}", timeout=10)
        assert r.status_code == 200
        op = r.json()["operation"]
        assert op["state"] == "nca_pending"
        assert op["nca_signed_cedente"] is False
        assert op["nca_signed_reasegurador"] is False
        assert op["revealed"] is False  # identities still anonymous


# ─── NCA signing + identity reveal ───────────────────────────────────────
class TestNCAFlow:
    def test_chat_locked_before_nca(self, rea_c):
        r = rea_c.get(
            f"{BASE_URL}/api/messages/{STATE['operation_id']}?channel=cedente-reasegurador",
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["locked"] is True
        assert data["messages"] == []

    def test_send_message_before_nca_forbidden(self, rea_c):
        r = rea_c.post(
            f"{BASE_URL}/api/messages",
            json={
                "operation_id": STATE["operation_id"],
                "channel": "cedente-reasegurador",
                "text": "should fail",
            },
            timeout=10,
        )
        assert r.status_code == 400
        assert "NCA" in r.text

    def test_cedente_signs_nca(self, ced_c):
        r = ced_c.post(
            f"{BASE_URL}/api/operations/{STATE['operation_id']}/sign-nca",
            json={"operation_id": STATE["operation_id"], "signer_name": "Carla Demo", "accepted": True},
            timeout=10,
        )
        assert r.status_code == 200, r.text

    def test_cedente_cannot_sign_twice(self, ced_c):
        r = ced_c.post(
            f"{BASE_URL}/api/operations/{STATE['operation_id']}/sign-nca",
            json={"operation_id": STATE["operation_id"], "signer_name": "Carla Demo", "accepted": True},
            timeout=10,
        )
        assert r.status_code == 400

    def test_state_still_nca_pending_partial(self, rea_c):
        r = rea_c.get(f"{BASE_URL}/api/operations/{STATE['operation_id']}", timeout=10)
        op = r.json()["operation"]
        assert op["nca_signed_cedente"] is True
        assert op["nca_signed_reasegurador"] is False
        assert op["state"] == "nca_pending"
        assert op["revealed"] is False

    def test_quote_cannot_be_submitted_before_nca_full(self, rea_c):
        r = rea_c.post(
            f"{BASE_URL}/api/operations/{STATE['operation_id']}/quote",
            json={
                "operation_id": STATE["operation_id"],
                "reinsurance_type": "Excess of Loss",
                "offered_share_pct": 30,
            },
            timeout=10,
        )
        assert r.status_code == 400

    def test_reasegurador_signs_nca(self, rea_c):
        r = rea_c.post(
            f"{BASE_URL}/api/operations/{STATE['operation_id']}/sign-nca",
            json={"operation_id": STATE["operation_id"], "signer_name": "Roberto Demo", "accepted": True},
            timeout=10,
        )
        assert r.status_code == 200, r.text

    def test_identity_revealed_after_both_signed(self, ced_c, rea_c):
        for c in (ced_c, rea_c):
            r = c.get(f"{BASE_URL}/api/operations/{STATE['operation_id']}", timeout=10)
            op = r.json()["operation"]
            assert op["state"] == "quote_pending", f"Expected quote_pending, got {op['state']}"
            assert op["revealed"] is True
            assert op["cedente_company"]["name"]
            assert op["reasegurador_company"]["name"]


# ─── Chat ────────────────────────────────────────────────────────────────
class TestChat:
    def test_chat_unlocked_after_nca(self, rea_c):
        r = rea_c.get(
            f"{BASE_URL}/api/messages/{STATE['operation_id']}?channel=cedente-reasegurador",
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["locked"] is False

    def test_reasegurador_sends_message(self, rea_c):
        r = rea_c.post(
            f"{BASE_URL}/api/messages",
            json={
                "operation_id": STATE["operation_id"],
                "channel": "cedente-reasegurador",
                "text": "Buenas, recibido el SFCR. ¿Podemos confirmar retention 2M€?",
            },
            timeout=10,
        )
        assert r.status_code == 200, r.text
        assert r.json()["message"]["text"].startswith("Buenas")

    def test_cedente_sees_message_and_replies(self, ced_c):
        r = ced_c.get(
            f"{BASE_URL}/api/messages/{STATE['operation_id']}?channel=cedente-reasegurador",
            timeout=10,
        )
        msgs = r.json()["messages"]
        assert len(msgs) >= 1
        assert any("retention 2M€" in m["text"] for m in msgs)
        # Reply
        r2 = ced_c.post(
            f"{BASE_URL}/api/messages",
            json={
                "operation_id": STATE["operation_id"],
                "channel": "cedente-reasegurador",
                "text": "Sí, confirmamos retention 2M€. Esperamos tu cotización.",
            },
            timeout=10,
        )
        assert r2.status_code == 200

    def test_reasegurador_sees_cedente_reply(self, rea_c):
        r = rea_c.get(
            f"{BASE_URL}/api/messages/{STATE['operation_id']}?channel=cedente-reasegurador",
            timeout=10,
        )
        msgs = r.json()["messages"]
        assert any("confirmamos retention" in m["text"] for m in msgs)


# ─── Quote flow ──────────────────────────────────────────────────────────
class TestQuoteFlow:
    def test_reasegurador_submits_quote(self, rea_c):
        payload = {
            "operation_id": STATE["operation_id"],
            "reinsurance_type": "Excess of Loss",
            "offered_share_pct": 30,
            "ceding_commission_pct": 28,
            "rate_on_line_pct": 5,
            "attachment_point": 2000000,
            "limit_eur": 10000000,
            "estimated_premium_eur": 1200000,
            "exclusions": "Nuclear, war",
            "special_conditions": "Retention 2M€ per loss",
        }
        r = rea_c.post(f"{BASE_URL}/api/operations/{STATE['operation_id']}/quote", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        q = r.json()["quote"]
        assert q["offered_share_pct"] == 30
        assert q["attachment_point"] == 2000000

    def test_quote_cannot_be_submitted_twice(self, rea_c):
        r = rea_c.post(
            f"{BASE_URL}/api/operations/{STATE['operation_id']}/quote",
            json={
                "operation_id": STATE["operation_id"],
                "reinsurance_type": "Excess of Loss",
                "offered_share_pct": 25,
            },
            timeout=10,
        )
        assert r.status_code == 400

    def test_state_now_quote_received(self, ced_c):
        r = ced_c.get(f"{BASE_URL}/api/operations/{STATE['operation_id']}", timeout=10)
        op = r.json()["operation"]
        assert op["state"] == "quote_received"
        assert op["quote"] is not None
        assert op["quote"]["estimated_premium_eur"] == 1200000

    def test_cedente_accepts_quote(self, ced_c):
        r = ced_c.post(
            f"{BASE_URL}/api/operations/{STATE['operation_id']}/accept-quote",
            json={},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        assert "contract_id" in r.json()

    def test_state_contract_pending(self, ced_c):
        r = ced_c.get(f"{BASE_URL}/api/operations/{STATE['operation_id']}", timeout=10)
        op = r.json()["operation"]
        assert op["state"] == "contract_pending"
        assert op["contract"] is not None


# ─── Contract signing ────────────────────────────────────────────────────
class TestContractFlow:
    def test_cedente_signs_contract(self, ced_c):
        r = ced_c.post(
            f"{BASE_URL}/api/operations/{STATE['operation_id']}/sign-contract",
            json={"operation_id": STATE["operation_id"], "signer_name": "Carla Demo", "accepted": True},
            timeout=10,
        )
        assert r.status_code == 200

    def test_still_contract_pending(self, rea_c):
        r = rea_c.get(f"{BASE_URL}/api/operations/{STATE['operation_id']}", timeout=10)
        op = r.json()["operation"]
        assert op["state"] == "contract_pending"
        assert op["contract"]["signed_cedente"] is True
        assert op["contract"]["signed_reasegurador"] is False

    def test_reasegurador_signs_contract_closes_operation(self, rea_c):
        r = rea_c.post(
            f"{BASE_URL}/api/operations/{STATE['operation_id']}/sign-contract",
            json={"operation_id": STATE["operation_id"], "signer_name": "Roberto Demo", "accepted": True},
            timeout=10,
        )
        assert r.status_code == 200
        r2 = rea_c.get(f"{BASE_URL}/api/operations/{STATE['operation_id']}", timeout=10)
        op = r2.json()["operation"]
        assert op["state"] == "closed"
        assert op["closed_at"] is not None


# ─── Admin ───────────────────────────────────────────────────────────────
class TestAdmin:
    def test_admin_lists_companies(self, adm_c):
        r = adm_c.get(f"{BASE_URL}/api/admin/companies", timeout=10)
        assert r.status_code == 200
        companies = r.json().get("companies") or r.json().get("items") or []
        assert isinstance(companies, list)
        assert len(companies) >= 3
        verified = [c for c in companies if c.get("verified")]
        assert len(verified) >= 3

    def test_admin_audit_log(self, adm_c):
        r = adm_c.get(f"{BASE_URL}/api/admin/audit", timeout=10)
        assert r.status_code == 200
        body = r.json()
        entries = body.get("entries") or body.get("items") or body.get("audit") or []
        assert isinstance(entries, list)
        actions = {e.get("action") for e in entries}
        # Recent actions from this test run should appear
        expected = {"pack.create", "interest.express", "interest.accept", "nca.sign", "quote.submit", "quote.accept", "contract.sign", "message.send"}
        missing = expected - actions
        assert not missing, f"Missing audit actions: {missing}"

    def test_non_admin_cannot_access_admin(self, ced_c):
        r = ced_c.get(f"{BASE_URL}/api/admin/companies", timeout=10)
        assert r.status_code == 403


# ─── Stats ───────────────────────────────────────────────────────────────
class TestStats:
    def test_cedente_dashboard_stats(self, ced_c):
        r = ced_c.get(f"{BASE_URL}/api/stats/dashboard", timeout=10)
        assert r.status_code == 200

    def test_reasegurador_dashboard_stats(self, rea_c):
        r = rea_c.get(f"{BASE_URL}/api/stats/dashboard", timeout=10)
        assert r.status_code == 200
