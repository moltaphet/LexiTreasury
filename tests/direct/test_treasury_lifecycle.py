"""Direct tests for the unified milestone-based LexiTreasury money lifecycle.

The suite covers reserve deposits, repository evaluation and maintainer binding,
full-plan escrow, milestone adjudication, tranche release, recipient withdrawals,
and conservation across independent grants. It uses only local direct-mode mocks;
there are no live network requests or deployed transactions.
"""

import json
import hashlib
import re
import datetime
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
    vm._review_response = json.dumps({"decision": decision, "reasoning": reasoning})


def setup_all(vm, recipient, spdx="MIT", commit_count=50, veteran=False,
              authors=DEFAULT_AUTHORS, audit_present=False, maintainer_present=True,
              maintainer_payout=None, decision="APPROVED"):
    """Register the repository and policy mocks for one evaluate_grant call."""
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
    """Lifetime deposits equal reserve, funded escrow, and cumulative tranche release."""
    accounting = treasury.get_accounting()
    assert (accounting["treasury_balance"] + accounting["grant_escrow"]
            + accounting["total_released"] == 8_000 * ATTO)
    assert treasury.get_treasury_balance() >= 0
    assert treasury.get_total_escrowed() >= 0


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def treasury(direct_vm, direct_deploy, direct_owner, monkeypatch):
    direct_vm.warp("2030-01-01T00:00:00Z")
    direct_vm.sender = direct_owner
    # Lifecycle security tests run with strict repository-maintainer verification.
    contract = direct_deploy(CONTRACT, CONSTITUTION, CAP_1, CAP_2, CAP_3, False)
    import genlayer as gl
    monkeypatch.setattr(gl.vm, "get_timestamp", lambda: datetime.datetime.fromisoformat(
        direct_vm._datetime.replace("Z", "+00:00")))
    monkeypatch.setattr(gl.nondet, "exec_prompt", lambda _prompt, **_kwargs: json.loads(
        getattr(direct_vm, "_review_response", '{"decision":"APPROVED","reasoning":"ok"}')))
    return contract


def create_grant(treasury, vm, applicant, milestones, recipient=None):
    vm.sender = applicant
    return treasury.create_grant("Treasury lifecycle", GH_URL,
                                 str(recipient if recipient is not None else applicant),
                                 json.dumps(milestones))


def approve_and_fund(treasury, vm, owner, applicant, amount, recipient=None, **setup_options):
    setup_all(vm, recipient if recipient is not None else applicant, **setup_options)
    grant_id = create_grant(treasury, vm, applicant, [
        {"title": "Release", "criteria": "Ship tested release code.",
         "amount": str(amount), "deadline": 2051222400}], recipient)
    treasury.evaluate_grant(grant_id)
    vm.clear_mocks()
    assert treasury.get_grant(grant_id)["status"] == "APPROVED"
    vm.sender = owner
    treasury.fund_grant(grant_id)
    return grant_id


def approve_milestone(treasury, vm, grant_id, recipient, sha, monkeypatch):
    vm.sender = recipient
    treasury.submit_evidence(grant_id, f"{GH_URL}/commit/{sha}")
    vm.mock_web(rf".*api\.github\.com/repos/{OWNER}/{REPO}/commits/{sha}$", {
        "status": 200, "body": json.dumps({"sha": sha,
            "commit": {"message": "Ship tested release", "author": {"date": "2030-01-02T00:00:00Z"}},
            "files": [{"filename": "tests/test_release.py", "status": "added", "additions": 4,
                       "deletions": 0, "patch": "+assert release"}]}),
    })
    import genlayer as gl
    monkeypatch.setattr(gl.nondet, "exec_prompt", lambda _prompt, **_kwargs: {
        "decision": "APPROVE", "reason_code": "CRITERIA_MET", "summary": "Release criteria met.",
    })
    treasury.adjudicate(grant_id)
    return treasury.release_tranche(grant_id)


# ===========================================================================
# 1. Full end-to-end lifecycle
# ===========================================================================

class TestFullLifecycle:
    def test_deposit_create_evaluate_fund_release_withdraw(self, direct_vm, treasury,
                                                            direct_owner, direct_alice, monkeypatch):
        """The complete money path a steward can audit, asserting accounting at each step."""
        # A stable block timestamp for the whole lifecycle.
        direct_vm.warp("2026-09-02T12:00:00Z")

        # --- Step 1: Fund the treasury via a payable deposit() ---
        deposit(treasury, direct_vm, direct_owner, 8_000 * ATTO)
        assert treasury.get_treasury_balance() == 8_000 * ATTO
        assert treasury.get_total_escrowed() == 0

        # --- Step 2: Applicant commits a two-step milestone plan ---
        direct_vm.sender = direct_alice
        setup_all(direct_vm, direct_alice, spdx="MIT", commit_count=50)  # ACTIVE + MIT -> TIER_2
        pid = create_grant(treasury, direct_vm, direct_alice, [
            {"title": "Tested storage", "criteria": "Add tested indexed storage.",
             "amount": str(3_000 * ATTO), "deadline": 2051222400},
            {"title": "Documented API", "criteria": "Publish a documented API with tests.",
             "amount": str(2_000 * ATTO), "deadline": 2082758400},
        ])
        p = treasury.get_grant(pid)
        assert p["status"] == "DRAFT"
        assert p["recipient"] == str(direct_alice).lower()

        # --- Step 3: Evaluate under consensus (LLM approves, maintainer verified) ---
        treasury.evaluate_grant(pid)
        # Multi-validator consensus: independent validators re-run and must agree.
        assert direct_vm.run_validator() is True
        assert direct_vm.run_validator() is True
        direct_vm.clear_mocks()

        p = treasury.get_grant(pid)
        assert p["status"] == "APPROVED"
        assert p["tier"] == "TIER_2"
        assert p["maintainer_verified"] == "true"
        assert p["maintainer_login"] == OWNER
        assert p["allocated_amount"] == 5_000 * ATTO

        # --- Step 4: Fund the full precommitted plan into escrow ---
        direct_vm.sender = direct_owner
        funded = treasury.fund_grant(pid)
        assert funded == 5_000 * ATTO

        p = treasury.get_grant(pid)
        assert p["status"] == "FUNDED"
        assert treasury.get_treasury_balance() == 3_000 * ATTO      # 8k - 5k reserve
        assert treasury.get_accounting()["grant_escrow"] == 5_000 * ATTO
        assert treasury.get_total_escrowed() == 0
        assert_holdings_invariant(treasury)

        # --- Step 5: Commit evidence adjudication releases only tranche one ---
        direct_vm.sender = direct_alice
        released = approve_milestone(treasury, direct_vm, pid, direct_alice, "a" * 40, monkeypatch)
        assert released == 3_000 * ATTO
        assert treasury.get_claimable(str(direct_alice)) == 3_000 * ATTO
        direct_vm.sender = direct_alice
        withdrawn = treasury.withdraw()
        assert withdrawn == 3_000 * ATTO
        assert treasury.get_claimable(str(direct_alice)) == 0
        assert treasury.get_total_escrowed() == 0
        assert treasury.get_accounting()["grant_escrow"] == 2_000 * ATTO
        assert treasury.get_treasury_balance() == 3_000 * ATTO

    def test_tier1_lifecycle_with_verified_audit(
        self, direct_vm, treasury, direct_owner, direct_alice, monkeypatch
    ):
        """A VETERAN + OSI + on-chain-audited team repository reaches TIER_1."""
        direct_vm.warp("2026-09-02T09:30:00Z")
        record_onchain_audit(treasury, direct_vm, direct_owner)
        deposit(treasury, direct_vm, direct_owner, 60_000 * ATTO)

        direct_vm.sender = direct_alice
        setup_all(direct_vm, direct_alice, spdx="MIT", commit_count=100, veteran=True,
                  audit_present=True)
        pid = create_grant(treasury, direct_vm, direct_alice, [
            {"title": "Audited release", "criteria": "Deliver the audited release.",
             "amount": str(40_000 * ATTO), "deadline": 2051222400}], recipient=direct_alice)
        treasury.evaluate_grant(pid)
        assert direct_vm.run_validator() is True
        direct_vm.clear_mocks()

        p = treasury.get_grant(pid)
        assert p["tier"] == "TIER_1"
        assert p["has_audit"] == "true"
        assert p["maintainer_verified"] == "true"

        direct_vm.sender = direct_owner
        treasury.fund_grant(pid)
        approve_milestone(treasury, direct_vm, pid, direct_alice, "b" * 40, monkeypatch)
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
        pid = create_grant(treasury, direct_vm, direct_alice, [
            {"title": "Release", "criteria": "Ship tested release code.",
             "amount": str(3_000 * ATTO), "deadline": 2051222400}])
        treasury.evaluate_grant(pid)
        direct_vm.clear_mocks()

        assert treasury.get_grant(pid)["maintainer_verified"] == "false"
        assert treasury.get_grant(pid)["status"] == "REJECTED"
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert("not approved"):
            treasury.fund_grant(pid)

    def test_manifest_for_a_different_address_is_rejected(
        self, direct_vm, treasury, direct_owner, direct_alice, direct_bob
    ):
        """The repo publishes Bob's payout address, but Alice applied -> binding fails."""
        deposit(treasury, direct_vm, direct_owner, 5_000 * ATTO)
        direct_vm.sender = direct_alice
        setup_all(direct_vm, direct_alice, spdx="MIT", commit_count=50,
                  maintainer_payout=str(direct_bob))
        pid = create_grant(treasury, direct_vm, direct_alice, [
            {"title": "Release", "criteria": "Ship tested release code.",
             "amount": str(3_000 * ATTO), "deadline": 2051222400}])
        treasury.evaluate_grant(pid)
        direct_vm.clear_mocks()
        assert treasury.get_grant(pid)["maintainer_verified"] == "false"
        assert treasury.get_grant(pid)["status"] == "REJECTED"

    def test_manifest_owner_mismatch_is_rejected(
        self, direct_vm, treasury, direct_owner, direct_alice
    ):
        """Manifest declares a different owner than GitHub reports -> binding fails."""
        deposit(treasury, direct_vm, direct_owner, 5_000 * ATTO)
        direct_vm.sender = direct_alice
        setup_all(direct_vm, direct_alice, spdx="MIT", commit_count=50)
        # Re-register a clean mock list with a foreign owner claim.
        direct_vm.clear_mocks()
        mock_repo(direct_vm, spdx="MIT")
        mock_commits(direct_vm, count=50)
        mock_contents(direct_vm)
        mock_audit_manifest(direct_vm, present=False)
        mock_maintainer(direct_vm, present=True, payout_address=str(direct_alice),
                        declared_owner="impostor-owner")
        mock_llm(direct_vm)
        pid = create_grant(treasury, direct_vm, direct_alice, [
            {"title": "Release", "criteria": "Ship tested release code.",
             "amount": str(3_000 * ATTO), "deadline": 2051222400}])
        treasury.evaluate_grant(pid)
        direct_vm.clear_mocks()
        assert treasury.get_grant(pid)["maintainer_verified"] == "false"
        assert treasury.get_grant(pid)["status"] == "REJECTED"

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
        pid = create_grant(treasury, direct_vm, direct_alice, [
            {"title": "Release", "criteria": "Ship tested release code.",
             "amount": str(3_000 * ATTO), "deadline": 2051222400}])
        treasury.evaluate_grant(pid)
        direct_vm.clear_mocks()
        assert treasury.get_grant(pid)["maintainer_verified"] == "false"
        assert treasury.get_grant(pid)["status"] == "REJECTED"


# ===========================================================================
# 3. No-hanging-state / seamless execution guarantees
# ===========================================================================

class TestSeamlessExecution:
    def test_evaluate_never_leaves_pending(
        self, direct_vm, treasury, direct_owner, direct_alice
    ):
        """Every evaluated grant resolves to APPROVED or REJECTED from DRAFT."""
        for decision, expect in (("APPROVED", "APPROVED"), ("REJECTED", "REJECTED")):
            direct_vm.sender = direct_alice
            setup_all(direct_vm, direct_alice, spdx="MIT", commit_count=50, decision=decision)
            pid = create_grant(treasury, direct_vm, direct_alice, [
                {"title": "Release", "criteria": "Ship tested release code.",
                 "amount": str(1_000 * ATTO), "deadline": 2051222400}])
            treasury.evaluate_grant(pid)
            direct_vm.clear_mocks()
            status = treasury.get_grant(pid)["status"]
            assert status == expect
            assert status != "PENDING"

    def test_approval_enables_funding_but_not_unearned_payout(
        self, direct_vm, treasury, direct_owner, direct_alice
    ):
        """As soon as a proposal is APPROVED and the treasury is funded, execution succeeds."""
        deposit(treasury, direct_vm, direct_owner, 2_000 * ATTO)
        direct_vm.sender = direct_alice
        setup_all(direct_vm, direct_alice, spdx="MIT", commit_count=50)
        pid = create_grant(treasury, direct_vm, direct_alice, [
            {"title": "Release", "criteria": "Ship tested release code.",
             "amount": str(2_000 * ATTO), "deadline": 2051222400}])
        treasury.evaluate_grant(pid)
        direct_vm.clear_mocks()

        assert treasury.get_grant(pid)["status"] == "APPROVED"
        direct_vm.sender = direct_owner
        treasury.fund_grant(pid)
        assert treasury.get_grant(pid)["status"] == "FUNDED"
        assert treasury.get_accounting()["grant_escrow"] == 2_000 * ATTO
        assert treasury.get_claimable(str(direct_alice)) == 0

    def test_rejected_proposal_holds_no_funds(
        self, direct_vm, treasury, direct_owner, direct_alice
    ):
        deposit(treasury, direct_vm, direct_owner, 2_000 * ATTO)
        direct_vm.sender = direct_alice
        setup_all(direct_vm, direct_alice, spdx="MIT", commit_count=50, decision="REJECTED")
        pid = create_grant(treasury, direct_vm, direct_alice, [
            {"title": "Release", "criteria": "Ship tested release code.",
             "amount": str(2_000 * ATTO), "deadline": 2051222400}])
        treasury.evaluate_grant(pid)
        direct_vm.clear_mocks()

        p = treasury.get_grant(pid)
        assert p["status"] == "REJECTED"
        assert p["allocated_amount"] == 0
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert("not approved"):
            treasury.fund_grant(pid)
        # Treasury reserve is fully intact.
        assert treasury.get_treasury_balance() == 2_000 * ATTO
        assert treasury.get_total_escrowed() == 0


# ===========================================================================
# 4. On-chain accounting integrity across many proposals
# ===========================================================================

class TestAccountingIntegrity:
    def test_multiple_recipients_settle_independently(
        self, direct_vm, treasury, direct_owner, direct_alice, direct_bob, monkeypatch
    ):
        """Two funded grants to distinct recipients keep independent escrow balances."""
        deposit(treasury, direct_vm, direct_owner, 10_000 * ATTO)

        # Alice's proposal.
        direct_vm.sender = direct_alice
        setup_all(direct_vm, direct_alice, spdx="MIT", commit_count=50)
        pid_a = create_grant(treasury, direct_vm, direct_alice, [
            {"title": "Release A", "criteria": "Ship tested release code.",
             "amount": str(3_000 * ATTO), "deadline": 2051222400}])
        treasury.evaluate_grant(pid_a)
        direct_vm.clear_mocks()

        # Bob's proposal (same repo owner binding for the mocked repo, payout to Bob).
        direct_vm.sender = direct_bob
        setup_all(direct_vm, direct_bob, spdx="MIT", commit_count=50)
        pid_b = create_grant(treasury, direct_vm, direct_bob, [
            {"title": "Release B", "criteria": "Ship tested release code.",
             "amount": str(4_000 * ATTO), "deadline": 2051222400}])
        treasury.evaluate_grant(pid_b)
        direct_vm.clear_mocks()

        direct_vm.sender = direct_owner
        treasury.fund_grant(pid_a)
        treasury.fund_grant(pid_b)
        approve_milestone(treasury, direct_vm, pid_a, direct_alice, "a" * 40, monkeypatch)
        approve_milestone(treasury, direct_vm, pid_b, direct_bob, "b" * 40, monkeypatch)

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
