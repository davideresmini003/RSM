"""
Iteration 3 — feature & regression tests for:
  - Spanish error i18n (E1)
  - Pre-NCA preview document download (E7)
  - Demo closed operation OP-DEMO01 (D3)
  - Tripartite NCA (broker)
  - Express interest no-longer raises 'insufficient permissions'
"""
import os
import re
import uuid
import pytest
import requests

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # parse frontend/.env
        env_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env")
        env_path = os.path.abspath(env_path)
        if os.path.exists(env_path):
            for line in open(env_path):
                if line.startswith("REACT_APP_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip()
                    break
    if not url:
        raise RuntimeError("REACT_APP_BACKEND_URL not configured")
    return url.rstrip("/")

BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

CEDENTE = ("aseguradora@rsm.com", "Admin123!")
REASEG = ("reaseguradora@rsm.com", "Admin123!")
BROKER = ("broker@rsm.com", "Admin123!")
ADMIN = ("davide.resmini003@gmail.com", "Admin123!")


def _login(creds):
    r = requests.post(f"{API}/auth/login", json={"email": creds[0], "password": creds[1]}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()


def _sess(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def ced_c():
    return _sess(_login(CEDENTE)["token"])


@pytest.fixture(scope="session")
def rea_c():
    return _sess(_login(REASEG)["token"])


@pytest.fixture(scope="session")
def broker_c():
    return _sess(_login(BROKER)["token"])


# ─── Spanish i18n on auth ────────────────────────────────────────────────
class TestSpanishAuth:
    def test_invalid_credentials_spanish(self):
        r = requests.post(f"{API}/auth/login", json={"email": CEDENTE[0], "password": "wrong"}, timeout=10)
        assert r.status_code in (400, 401)
        text = r.text.lower()
        assert ("credenciales" in text or "inválid" in text), f"Expected Spanish error, got: {r.text}"
        assert "invalid" not in text or "credenciales" in text, f"English leaked: {r.text}"


# ─── Demo closed operation (D3) ──────────────────────────────────────────
class TestDemoClosedOperation:
    def test_demo01_op_visible_to_cedente(self, ced_c):
        r = ced_c.get(f"{API}/operations", timeout=10)
        assert r.status_code == 200, r.text
        ops = r.json()["operations"]
        demos = [o for o in ops if o.get("code") == "OP-DEMO01"]
        assert len(demos) == 1, f"OP-DEMO01 not found in operations. Got codes: {[o.get('code') for o in ops]}"
        op = demos[0]
        assert op["state"] == "closed", f"OP-DEMO01 state is {op['state']}, expected closed"
        # Capture id for further tests
        pytest.demo_op_id = op["id"]

    def test_demo01_detail_has_quote_accepted_and_contract_signed(self, ced_c):
        op_id = pytest.demo_op_id
        r = ced_c.get(f"{API}/operations/{op_id}", timeout=10)
        assert r.status_code == 200, r.text
        op = r.json()["operation"]
        assert op["state"] == "closed"
        assert op.get("nca_signed_cedente") is True
        assert op.get("nca_signed_reasegurador") is True
        quote = op.get("quote")
        assert quote is not None, "Quote missing on closed OP-DEMO01"
        assert quote.get("accepted") is True, f"quote.accepted={quote.get('accepted')}, expected True"
        contract = op.get("contract")
        assert contract is not None, "Contract missing on closed OP-DEMO01"
        assert contract.get("signed_cedente") is True
        assert contract.get("signed_reasegurador") is True


# ─── Pre-NCA preview document (E7) ───────────────────────────────────────
class TestPreNCAPreviewDocument:
    def test_marketplace_pack_has_preview(self, rea_c):
        # find a pack where own_interest is null (so reasegurador hasn't expressed yet)
        r = rea_c.get(f"{API}/marketplace/packs", timeout=15)
        assert r.status_code == 200, r.text
        packs = r.json()["packs"]
        available = [p for p in packs if p.get("own_interest") is None]
        assert available, "No marketplace packs available with own_interest=None"
        # iterate to find a pack which exposes pre-NCA preview files
        preview_found = None
        for pack in available:
            r2 = rea_c.get(f"{API}/submission-packs/{pack['id']}/files", timeout=10)
            if r2.status_code != 200:
                continue
            files = r2.json().get("files", [])
            previews = [f for f in files if f.get("is_preview") is True or "Presentacion" in (f.get("filename") or "")]
            if previews:
                preview_found = (pack, previews[0])
                break
        assert preview_found is not None, "No pack exposes a pre-NCA preview document"
        pack, preview = preview_found
        pytest.preview_pack_id = pack["id"]
        pytest.preview_file = preview

    def test_preview_pdf_downloadable(self, rea_c):
        preview = pytest.preview_file
        file_id = preview.get("id")
        url = f"{API}/pack-files/{file_id}/download"
        r = rea_c.get(url, timeout=15, allow_redirects=True)
        assert r.status_code == 200, f"Preview download failed: {r.status_code} url={url}"
        assert len(r.content) > 100, "Preview body too small"
        # is_preview true on file
        assert preview.get("is_preview") is True, f"file not marked is_preview: {preview}"


# ─── Express interest fix ────────────────────────────────────────────────
class TestExpressInterestPermissions:
    def test_reasegurador_can_express_interest(self, rea_c):
        # use an existing pack where own_interest=None to avoid PACK_LIMIT on cedente
        r = rea_c.get(f"{API}/marketplace/packs", timeout=15)
        assert r.status_code == 200
        packs = r.json()["packs"]
        # avoid OP-DEMO01's pack (RSM-2026-1900 per review note); pick any with own_interest=None
        candidates = [p for p in packs if p.get("own_interest") is None and p.get("code") != "RSM-2026-1900"]
        assert candidates, "No marketplace packs available with own_interest=None for express-interest test"
        pack_id = candidates[0]["id"]
        pytest.iter3_pack_id = pack_id

        ri = rea_c.post(f"{API}/interests", json={"pack_id": pack_id, "message": "Interés iter3."}, timeout=15)
        assert ri.status_code == 200, f"Express interest failed: {ri.status_code} {ri.text}"
        text = ri.text.lower()
        assert "insufficient permissions" not in text, f"Permissions leak: {ri.text}"

    def test_duplicate_interest_returns_spanish(self, rea_c):
        pack_id = pytest.iter3_pack_id
        r = rea_c.post(f"{API}/interests", json={"pack_id": pack_id, "message": "dup"}, timeout=10)
        assert r.status_code == 400, r.text
        text = r.text
        assert "Ya has expresado interés" in text or "ya has expresado" in text.lower(), f"Expected Spanish duplicate error, got: {text}"
        assert "already" not in text.lower(), f"English error leaked: {text}"


# ─── Spanish errors on operations (contract sign twice) ──────────────────
class TestSpanishOperationErrors:
    def test_demo01_double_sign_contract_returns_spanish(self, ced_c):
        # OP-DEMO01 already has cedente signed. A second sign as cedente should return Spanish error.
        op_id = getattr(pytest, "demo_op_id", None)
        if not op_id:
            # fetch
            r = ced_c.get(f"{API}/operations", timeout=10)
            ops = [o for o in r.json()["operations"] if o.get("code") == "OP-DEMO01"]
            assert ops
            op_id = ops[0]["id"]
        r = ced_c.post(
            f"{API}/operations/{op_id}/sign-contract",
            json={"operation_id": op_id, "signer_name": "Test", "accepted": True},
            timeout=10,
        )
        assert r.status_code == 400, r.text
        text = r.text
        # Should mention cedente in Spanish like "La cedente ya firmó el contrato"
        assert "ya firmó" in text.lower() or "ya firmo" in text.lower(), f"Expected Spanish double-sign error, got: {text}"
        assert "already signed" not in text.lower(), f"English error leaked: {text}"


# ─── Tripartite NCA helper check ─────────────────────────────────────────
class TestTripartiteNCALogic:
    def test_all_ncas_signed_helper_logic(self):
        """Static check: _all_ncas_signed must support broker_user_id presence (3rd party)."""
        path = "/app/backend/routers/operations.py"
        with open(path) as f:
            src = f.read()
        # function must exist
        assert "_all_ncas_signed" in src, "_all_ncas_signed helper missing"
        # extract function body
        m = re.search(r"def _all_ncas_signed\(.*?\):(.+?)(?:\n(?:async )?def |\Z)", src, re.S)
        assert m, "Could not parse _all_ncas_signed body"
        body = m.group(1)
        # should reference broker (broker_user_id or nca_signed_broker or broker)
        assert "broker" in body.lower(), f"_all_ncas_signed does not reference broker. Body:\n{body[:400]}"


# ─── Broker login sanity ─────────────────────────────────────────────────
class TestBrokerLogin:
    def test_broker_login_ok(self, broker_c):
        r = broker_c.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["role"] == "broker"
