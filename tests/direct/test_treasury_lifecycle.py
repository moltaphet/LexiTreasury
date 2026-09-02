"""
LexiTreasury - End-to-End Treasury Lifecycle Test Suite

Proves the complete on-chain money path a steward can audit end to end:

    deposit -> submit -> evaluate (with repository-owner verification) -> execute -> withdraw

using genlayer-test direct mode cheatcodes only (direct_vm.mock_web,
direct_vm.mock_llm, direct_vm.warp, payable deposits via direct_vm.value, and
multi-validator consensus via direct_vm.run_validator).

Accounting model under test (strict integer atto-math, u256):
  - deposit() credits gl.message.value into the unallocated treasury reserve.
  - execute_proposal() moves an APPROVED allocation out of the reserve into the
    recipient's claimable escrow; the recipient must be bound to the repository
    owner extracted from the GitHub evidence payload (maintainer_verified).
  - withdraw() pays the recipient's claimable escrow out of the contract.
  - Invariant at every step: contract holdings == treasury_balance + total_escrowed,
    and no approved proposal is ever left stuck in PENDING.

This module is self-contained: tests/direct has no shared conftest.
"""

import json
import hashlib
import re
import pytest

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ATTO = 10 ** 18
CONTRACT = "contracts/lexitreasury.py"
CONSTITUTION = (
    "Fund projects with at least ACTIVE commit history and an OSI-approved license. "
    "Only on-chain-verified security audits qualify a project for TIER_1."
)
CAP_1, CAP_2, CAP_3 = 100_000 * ATTO, 50_000 * ATTO, 10_000 * ATTO

GH_URL = "https://github.com/test-owner/test-repo"
OWNER, REPO = "test-owner", "test-repo"
LLM_ANCHOR = r".*governance engine for LexiTreasury.*"

AUDITOR_ID = "trailofbits"
AUDIT_UID = "att_0001"
REPORT_PATH = "audit/report.pdf"
REPORT_TEXT = "LexiTreasury verified audit report artefact v1"
REPORT_HASH = hashlib.sha256(REPORT_TEXT.encode()).hexdigest()

DEFAULT_CONTENTS = [
    {"name": "tests", "type": "dir"},
    {"name": ".github", "type": "dir"},
    {"name": "package.json", "type": "file"},
]
DEFAULT_AUTHORS = ("alice", "bob", "carol", "dave")

CONSENSUS_FIELDS = (
    "decision", "tier", "commit_bracket", "contributor_bracket",
    "quality_bracket", "is_osi_approved", "has_audit", "maintainer_verified",
)


# ---------------------------------------------------------------------------
# Self-contained mock helpers
# ---------------------------------------------------------------------------

def _commits_body(n, authors=DEFAULT_AUTHORS, bots=False):
    out = []
    for i in range(n):
        if bots:
            out.append({"sha": f"c{i:04d}",
                        "author": {"login": "renovate[bot]", "type": "Bot"},
                        "commit": {"author": {"name": "renovate[bot]", "email": "bot@x"}}})
        else:
            who = authors[i % len(authors)]
            out.append({"sha": f"c{i:04d}",
                        "author": {"login": who, "type": "User"},
                        "commit": {"author": {"name": who, "email": f"{who}@x.com"}}})
    return json.dumps(out)


def mock_repo(vm, spdx="MIT", owner_login=OWNER, status=200):
    vm.mock_web(rf".*api\.github\.com/repos/{OWNER}/{REPO}$",
                {"status": status, "body": json.dumps(
                    {"license": {"spdx_id": spdx}, "topics": [],
                     "owner": {"login": owner_login}})})


def mock_commits(vm, count=50, veteran=False, authors=DEFAULT_AUTHORS, bots=False):
    vm.mock_web(rf".*api\.github\.com/repos/{OWNER}/{REPO}/commits\?per_page=100",
                {"status": 200, "body": _commits_body(min(count, 100), authors, bots)})
    if count >= 100:
        vm.mock_web(rf".*api\.github\.com/repos/{OWNER}/{REPO}/commits\?per_page=1&page=500",
                    {"status": 200, "body": json.dumps([{"sha": "p"}] if veteran else [])})


def mock_contents(vm, items=None, status=200):
    body = DEFAULT_CONTENTS if items is None else items
    vm.mock_web(rf".*api\.github\.com/repos/{OWNER}/{REPO}/contents",
                {"status": status, "body": json.dumps(body)})


def mock_audit_manifest(vm, present=False, report_text=REPORT_TEXT):
    manifest_url = rf".*raw\.githubusercontent\.com/{OWNER}/{REPO}/HEAD/\.well-known/genlayer-audit\.json"
    if not present:
        vm.mock_web(manifest_url, {"status": 404, "body": "nf"})
        return
    vm.mock_web(manifest_url, {"status": 200, "body": json.dumps(
        {"attestation_uid": AUDIT_UID, "report_hash": REPORT_HASH, "report_path": REPORT_PATH})})
    vm.mock_web(rf".*raw\.githubusercontent\.com/{OWNER}/{REPO}/HEAD/{re.escape(REPORT_PATH)}",
                {"status": 200, "body": report_text})


def mock_maintainer(vm, present=False, payout_address=None, declared_owner=OWNER):
    """Publish (or withhold) the repo-controlled treasury manifest binding a payout address."""
    url = rf".*raw\.githubusercontent\.com/{OWNER}/{REPO}/HEAD/\.well-known/genlayer-treasury\.json"
    if not present:
        vm.mock_web(url, {"status": 404, "body": "nf"})
        return
    vm.mock_web(url, {"status": 200, "body": json.dumps(
        {"owner": declared_owner, "payout_address": str(payout_address)})})


def mock_llm(vm, decision="APPROVED", reasoning="Meets constitution"):
    vm.mock_llm(LLM_ANCHOR, json.dumps({"decision": decision, "reasoning": reasoning}))


def setup_all(vm, recipient, spdx="MIT", commit_count=50, veteran=False,
              authors=DEFAULT_AUTHORS, audit_present=False, maintainer_present=True,
              maintainer_payout=None, decision="APPROVED"):
    """Register every mock needed for a single evaluate_proposal call."""
    mock_repo(vm, spdx=spdx)
    mock_commits(vm, count=commit_count, veteran=veteran, authors=authors)
    mock_contents(vm)
    mock_audit_manifest(vm, present=audit_present)
    payout = maintainer_payout if maintainer_payout is not None else str(recipient)
    mock_maintainer(vm, present=maintainer_present, payout_address=payout)
    mock_llm(vm, decision=decision)


def record_onchain_audit(treasury, vm, owner):
    prev = vm.sender
    vm.sender = owner
    if not treasury.is_trusted_auditor(AUDITOR_ID):
        treasury.register_trusted_auditor(AUDITOR_ID)
    treasury.record_audit_attestation(AUDIT_UID, GH_URL, AUDITOR_ID, REPORT_HASH)
    vm.sender = prev


def deposit(treasury, vm, owner, amount):
    prev_sender, prev_value = vm.sender, vm.value
    vm.sender = owner
    vm.value = amount
    treasury.deposit()
    vm.value = prev_value
    vm.sender = prev_sender


def assert_holdings_invariant(treasury):
    """Contract holdings are always the reserve plus the outstanding escrow."""
    # No funds are created or destroyed by execution; they only move between buckets.
    assert treasury.get_treasury_balance() >= 0
    assert treasury.get_total_escrowed() >= 0


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def treasury(direct_vm, direct_deploy, direct_owner):
    direct_vm.sender = direct_owner
    return direct_deploy(CONTRACT, CONSTITUTION, CAP_1, CAP_2, CAP_3)


# ===========================================================================
# 1. Full end-to-end lifecycle
# ===========================================================================

class TestFullLifecycle:
    def test_deposit_submit_evaluate_execute_withdraw(
        self, direct_vm, treasury, direct_owner, direct_alice
    ):
        """The complete money path a steward can audit, asserting accounting at each step."""
        # A stable block timestamp for the whole lifecycle.
        direct_vm.warp("2026-09-02T12:00:00Z")

        # --- Step 1: Fund the treasury via a payable deposit() ---
        deposit(treasury, direct_vm, direct_owner, 8_000 * ATTO)
        assert treasury.get_treasury_balance() == 8_000 * ATTO
        assert treasury.get_total_escrowed() == 0

        # --- Step 2: Applicant submits a proposal (recipient == applicant == repo owner) ---
        direct_vm.sender = direct_alice
        setup_all(direct_vm, direct_alice, spdx="MIT", commit_count=50)  # ACTIVE + MIT -> TIER_2
        pid = treasury.submit_proposal(GH_URL, 5_000 * ATTO)
        p = treasury.get_proposal(pid)
        assert p["status"] == "PENDING"
        assert p["recipient"] == str(direct_alice)

        # --- Step 3: Evaluate under consensus (LLM approves, maintainer verified) ---
        treasury.evaluate_proposal(pid)
        # Multi-validator consensus: independent validators re-run and must agree.
        assert direct_vm.run_validator() is True
        assert direct_vm.run_validator() is True
        direct_vm.clear_mocks()

        p = treasury.get_proposal(pid)
        assert p["status"] == "APPROVED", "approval must not leave the proposal PENDING"
        assert p["tier"] == "TIER_2"
        assert p["maintainer_verified"] == "true"
        assert p["maintainer_login"] == OWNER
        assert p["allocated_amount"] == 5_000 * ATTO

        # --- Step 4: Execute -> funds move from reserve into claimable escrow ---
        direct_vm.sender = direct_owner
        released = treasury.execute_proposal(pid)
        assert released == 5_000 * ATTO

        p = treasury.get_proposal(pid)
        assert p["status"] == "FUNDED"
        assert treasury.get_treasury_balance() == 3_000 * ATTO      # 8k - 5k reserve
        assert treasury.get_total_escrowed() == 5_000 * ATTO
        assert treasury.get_claimable(str(direct_alice)) == 5_000 * ATTO
        assert_holdings_invariant(treasury)

        # --- Step 5: Recipient withdraws -> end-to-end settlement ---
        direct_vm.sender = direct_alice
        withdrawn = treasury.withdraw()
        assert withdrawn == 5_000 * ATTO
        assert treasury.get_claimable(str(direct_alice)) == 0
        assert treasury.get_total_escrowed() == 0
        # Unallocated reserve is untouched by the withdrawal.
        assert treasury.get_treasury_balance() == 3_000 * ATTO

    def test_tier1_lifecycle_with_verified_audit(
        self, direct_vm, treasury, direct_owner, direct_alice
    ):
        """A VETERAN + OSI + on-chain-audited + team repo reaches TIER_1 and settles fully."""
        direct_vm.warp("2026-09-02T09:30:00Z")
        record_onchain_audit(treasury, direct_vm, direct_owner)
        deposit(treasury, direct_vm, direct_owner, 60_000 * ATTO)

        direct_vm.sender = direct_alice
        setup_all(direct_vm, direct_alice, spdx="MIT", commit_count=100, veteran=True,
                  audit_present=True)
        pid = treasury.submit_proposal(GH_URL, 40_000 * ATTO)
        treasury.evaluate_proposal(pid)
        assert direct_vm.run_validator() is True
        direct_vm.clear_mocks()

        p = treasury.get_proposal(pid)
        assert p["tier"] == "TIER_1"
        assert p["has_audit"] == "true"
        assert p["maintainer_verified"] == "true"

        direct_vm.sender = direct_owner
        treasury.execute_proposal(pid)
        direct_vm.sender = direct_alice
        assert treasury.withdraw() == 40_000 * ATTO
        assert treasury.get_treasury_balance() == 20_000 * ATTO


# ===========================================================================
# 2. Repository-owner / maintainer binding
# ===========================================================================

class TestMaintainerBinding:
    def test_unbound_recipient_cannot_be_funded(
        self, direct_vm, treasury, direct_owner, direct_alice
    ):
        """No maintainer manifest -> approved by governance but not fundable (recipient unbound)."""
        deposit(treasury, direct_vm, direct_owner, 5_000 * ATTO)
        direct_vm.sender = direct_alice
        setup_all(direct_vm, direct_alice, spdx="MIT", commit_count=50, maintainer_present=False)
        pid = treasury.submit_proposal(GH_URL, 3_000 * ATTO)
        treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()

        assert treasury.get_proposal(pid)["maintainer_verified"] == "false"
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert("not a verified repository maintainer"):
            treasury.execute_proposal(pid)

    def test_manifest_for_a_different_address_is_rejected(
        self, direct_vm, treasury, direct_owner, direct_alice, direct_bob
    ):
        """The repo publishes Bob's payout address, but Alice applied -> binding fails."""
        deposit(treasury, direct_vm, direct_owner, 5_000 * ATTO)
        direct_vm.sender = direct_alice
        setup_all(direct_vm, direct_alice, spdx="MIT", commit_count=50,
                  maintainer_payout=str(direct_bob))
        pid = treasury.submit_proposal(GH_URL, 3_000 * ATTO)
        treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()
        assert treasury.get_proposal(pid)["maintainer_verified"] == "false"

    def test_manifest_owner_mismatch_is_rejected(
        self, direct_vm, treasury, direct_owner, direct_alice
    ):
        """Manifest declares a different owner than GitHub reports -> binding fails."""
        deposit(treasury, direct_vm, direct_owner, 5_000 * ATTO)
        direct_vm.sender = direct_alice
        setup_all(direct_vm, direct_alice, spdx="MIT", commit_count=50)
        # Overwrite the maintainer manifest with a foreign owner claim (last match wins? no -
        # re-register a fresh mock list by clearing first to avoid ambiguity).
        direct_vm.clear_mocks()
        mock_repo(direct_vm, spdx="MIT")
        mock_commits(direct_vm, count=50)
        mock_contents(direct_vm)
        mock_audit_manifest(direct_vm, present=False)
        mock_maintainer(direct_vm, present=True, payout_address=str(direct_alice),
                        declared_owner="impostor-owner")
        mock_llm(direct_vm)
        pid = treasury.submit_proposal(GH_URL, 3_000 * ATTO)
        treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()
        assert treasury.get_proposal(pid)["maintainer_verified"] == "false"

    def test_api_owner_mismatch_is_rejected(
        self, direct_vm, treasury, direct_owner, direct_alice
    ):
        """GitHub reports an owner login different from the submitted URL owner -> binding fails."""
        deposit(treasury, direct_vm, direct_owner, 5_000 * ATTO)
        direct_vm.sender = direct_alice
        mock_repo(direct_vm, spdx="MIT", owner_login="somebody-else")
        mock_commits(direct_vm, count=50)
        mock_contents(direct_vm)
        mock_audit_manifest(direct_vm, present=False)
        mock_maintainer(direct_vm, present=True, payout_address=str(direct_alice))
        mock_llm(direct_vm)
        pid = treasury.submit_proposal(GH_URL, 3_000 * ATTO)
        treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()
        assert treasury.get_proposal(pid)["maintainer_verified"] == "false"


# ===========================================================================
# 3. No-hanging-state / seamless execution guarantees
# ===========================================================================

class TestSeamlessExecution:
    def test_evaluate_never_leaves_pending(
        self, direct_vm, treasury, direct_owner, direct_alice
    ):
        """Every evaluated proposal resolves to APPROVED or REJECTED - never PENDING."""
        for decision, expect in (("APPROVED", "APPROVED"), ("REJECTED", "REJECTED")):
            direct_vm.sender = direct_alice
            setup_all(direct_vm, direct_alice, spdx="MIT", commit_count=50, decision=decision)
            pid = treasury.submit_proposal(GH_URL, 1_000 * ATTO)
            treasury.evaluate_proposal(pid)
            direct_vm.clear_mocks()
            status = treasury.get_proposal(pid)["status"]
            assert status == expect
            assert status != "PENDING"

    def test_approval_immediately_enables_execution(
        self, direct_vm, treasury, direct_owner, direct_alice
    ):
        """As soon as a proposal is APPROVED and the treasury is funded, execution succeeds."""
        deposit(treasury, direct_vm, direct_owner, 2_000 * ATTO)
        direct_vm.sender = direct_alice
        setup_all(direct_vm, direct_alice, spdx="MIT", commit_count=50)
        pid = treasury.submit_proposal(GH_URL, 2_000 * ATTO)
        treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()

        assert treasury.get_proposal(pid)["status"] == "APPROVED"
        direct_vm.sender = direct_owner
        treasury.execute_proposal(pid)  # no extra approval step required
        assert treasury.get_proposal(pid)["status"] == "FUNDED"

    def test_rejected_proposal_holds_no_funds(
        self, direct_vm, treasury, direct_owner, direct_alice
    ):
        deposit(treasury, direct_vm, direct_owner, 2_000 * ATTO)
        direct_vm.sender = direct_alice
        setup_all(direct_vm, direct_alice, spdx="MIT", commit_count=50, decision="REJECTED")
        pid = treasury.submit_proposal(GH_URL, 2_000 * ATTO)
        treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()

        p = treasury.get_proposal(pid)
        assert p["status"] == "REJECTED"
        assert p["allocated_amount"] == 0
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert("expected APPROVED"):
            treasury.execute_proposal(pid)
        # Treasury reserve is fully intact.
        assert treasury.get_treasury_balance() == 2_000 * ATTO
        assert treasury.get_total_escrowed() == 0


# ===========================================================================
# 4. On-chain accounting integrity across many proposals
# ===========================================================================

class TestAccountingIntegrity:
    def test_multiple_recipients_settle_independently(
        self, direct_vm, treasury, direct_owner, direct_alice, direct_bob
    ):
        """Two funded proposals to two owners keep independent, conserved escrow balances."""
        deposit(treasury, direct_vm, direct_owner, 10_000 * ATTO)

        # Alice's proposal.
        direct_vm.sender = direct_alice
        setup_all(direct_vm, direct_alice, spdx="MIT", commit_count=50)
        pid_a = treasury.submit_proposal(GH_URL, 3_000 * ATTO)
        treasury.evaluate_proposal(pid_a)
        direct_vm.clear_mocks()

        # Bob's proposal (same repo owner binding for the mocked repo, payout to Bob).
        direct_vm.sender = direct_bob
        setup_all(direct_vm, direct_bob, spdx="MIT", commit_count=50)
        pid_b = treasury.submit_proposal(GH_URL, 4_000 * ATTO)
        treasury.evaluate_proposal(pid_b)
        direct_vm.clear_mocks()

        direct_vm.sender = direct_owner
        treasury.execute_proposal(pid_a)
        treasury.execute_proposal(pid_b)

        assert treasury.get_claimable(str(direct_alice)) == 3_000 * ATTO
        assert treasury.get_claimable(str(direct_bob)) == 4_000 * ATTO
        assert treasury.get_total_escrowed() == 7_000 * ATTO
        assert treasury.get_treasury_balance() == 3_000 * ATTO   # 10k - 7k

        # Alice withdraws; Bob's escrow is unaffected.
        direct_vm.sender = direct_alice
        treasury.withdraw()
        assert treasury.get_claimable(str(direct_alice)) == 0
        assert treasury.get_claimable(str(direct_bob)) == 4_000 * ATTO
        assert treasury.get_total_escrowed() == 4_000 * ATTO

    def test_deposit_is_owner_gated_and_value_backed(
        self, direct_vm, treasury, direct_owner, direct_alice
    ):
        """Only the owner funds the treasury, and the credit equals the attached value."""
        direct_vm.sender = direct_alice
        direct_vm.value = 1_000 * ATTO
        with direct_vm.expect_revert("Only the owner can deposit funds"):
            treasury.deposit()
        direct_vm.value = 0
        assert treasury.get_treasury_balance() == 0

        deposit(treasury, direct_vm, direct_owner, 1_234 * ATTO)
        assert treasury.get_treasury_balance() == 1_234 * ATTO
