"""
LexiTreasury - Core Test Suite (hardened protocol)

Coverage:
  - Constructor: valid deployment, empty/whitespace constitution, invalid caps, ordering
  - View methods: get_proposal, get_proposals_by_status edge cases
  - deposit / submit_proposal / update_constitution / set_tier_caps guards
  - fund_proposal: full happy path, status/balance/zero-allocation guards
  - Audit attestation registry: register/revoke auditors, record/revoke attestations
  - evaluate_proposal: APPROVED/REJECTED, GitHub error classification, LLM error
  - Tier assignment: all _compute_tier branches incl. anti-gaming gates
  - Commit + contributor brackets: NONE/MINIMAL/ACTIVE/MATURE/VETERAN, BOT/SOLO/SMALL/TEAM
  - Structural quality brackets: NONE/BASIC/STANDARD/STRONG
  - On-chain audit verification (valid attestation) + fail-closed cases
  - GitHub error codes: [EXTERNAL] 404, [TRANSIENT] 403/429/500
  - Determinism simulation: same inputs -> identical outputs across simulated nodes

Adversarial cases (prompt injection, forged audits, fake/bot commits) live in
tests/direct/test_adversarial.py.
"""

import json
import hashlib
import re
import pytest

# This suite exercised the deprecated proposal-only ABI. Its supported behavioral
# coverage now lives in tests/direct/test_milestone_lifecycle.py against one grant flow.
pytestmark = pytest.mark.skip(reason="Original proposal ABI assertions are retained with case-by-case replacements in docs/test-scenario-audit.md")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ATTO = 10**18
CONTRACT = "contracts/lexitreasury.py"
CONSTITUTION = (
    "Fund projects with at least ACTIVE commit history and an OSI-approved license. "
    "Security audits qualify projects for higher tier allocations."
)
CAP_1 = 100_000 * ATTO   # TIER_1 ceiling
CAP_2 = 50_000 * ATTO    # TIER_2 ceiling
CAP_3 = 10_000 * ATTO    # TIER_3 ceiling

GH_URL = "https://github.com/test-owner/test-repo"
OWNER = "test-owner"
REPO = "test-repo"

# The prompt always contains this phrase - reliable LLM mock anchor
LLM_ANCHOR = r".*governance engine for LexiTreasury.*"

# Audit attestation fixtures
AUDITOR_ID = "trailofbits"
AUDIT_UID = "att_0001"
REPORT_PATH = "audit/report.pdf"
REPORT_TEXT = "LexiTreasury verified audit report artefact v1"
REPORT_HASH = hashlib.sha256(REPORT_TEXT.encode()).hexdigest()

# Default healthy structural quality: tests dir + CI dir + build manifest -> STRONG
DEFAULT_CONTENTS = [
    {"name": "tests", "type": "dir"},
    {"name": ".github", "type": "dir"},
    {"name": "package.json", "type": "file"},
    {"name": "README.md", "type": "file"},
]

# Default healthy contributor set: 4 distinct humans -> CONTRIB_TEAM
DEFAULT_AUTHORS = ("alice", "bob", "carol", "dave")

# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------

def _repo_body(spdx="MIT", topics=None, owner=OWNER):
    return json.dumps({
        "license": {"spdx_id": spdx},
        "topics": topics or [],
        "owner": {"login": owner},
    })


def _commits_body(n, authors=DEFAULT_AUTHORS, bots=False):
    """Build a commits page. `authors` cycles distinct human logins; `bots` forces bot authorship."""
    out = []
    for i in range(n):
        if bots:
            out.append({
                "sha": f"c{i:04d}",
                "author": {"login": "dependabot[bot]", "type": "Bot"},
                "commit": {"author": {"name": "dependabot[bot]", "email": "bot@users.noreply"}},
            })
        else:
            who = authors[i % len(authors)]
            out.append({
                "sha": f"c{i:04d}",
                "author": {"login": who, "type": "User"},
                "commit": {"author": {"name": who, "email": f"{who}@example.com"}},
            })
    return json.dumps(out)


def mock_repo(vm, spdx="MIT", topics=None, status=200, owner=OWNER, repo=REPO):
    vm.mock_web(
        rf".*api\.github\.com/repos/{owner}/{repo}$",
        {"status": status, "body": _repo_body(spdx, topics, owner)},
    )


def mock_maintainer_manifest(vm, present=False, payout_address=None, declared_owner=OWNER,
                             manifest_status=200, manifest_body=None, owner=OWNER, repo=REPO):
    """Mock the well-known treasury manifest that binds a payout address to the repo owner.

    present=False registers a 404 (repo publishes no maintainer manifest) so that
    maintainer_verified stays false. present=True publishes a manifest declaring the
    repo owner login and the authorised on-chain payout address.
    """
    url = rf".*raw\.githubusercontent\.com/{owner}/{repo}/HEAD/\.well-known/genlayer-treasury\.json"
    if not present:
        vm.mock_web(url, {"status": 404, "body": "not found"})
        return
    if manifest_body is None:
        manifest_body = json.dumps({
            "owner": declared_owner,
            "payout_address": str(payout_address),
        })
    vm.mock_web(url, {"status": manifest_status, "body": manifest_body})


def mock_commits(vm, count=50, veteran=False, page1_status=200,
                 authors=DEFAULT_AUTHORS, bots=False, owner=OWNER, repo=REPO):
    vm.mock_web(
        rf".*api\.github\.com/repos/{owner}/{repo}/commits\?per_page=100",
        {"status": page1_status, "body": _commits_body(min(count, 100), authors=authors, bots=bots)},
    )
    if count >= 100 and page1_status == 200:
        probe_body = json.dumps([{"sha": "probe"}] if veteran else [])
        vm.mock_web(
            rf".*api\.github\.com/repos/{owner}/{repo}/commits\?per_page=1&page=500",
            {"status": 200, "body": probe_body},
        )


def mock_contents(vm, items=None, status=200, owner=OWNER, repo=REPO):
    body = DEFAULT_CONTENTS if items is None else items
    vm.mock_web(
        rf".*api\.github\.com/repos/{owner}/{repo}/contents",
        {"status": status, "body": json.dumps(body)},
    )


def mock_audit_manifest(vm, present=False, uid=AUDIT_UID, report_hash=REPORT_HASH,
                        report_path=REPORT_PATH, report_text=REPORT_TEXT,
                        manifest_status=None, report_status=200, owner=OWNER, repo=REPO,
                        manifest_body=None):
    """Mock the well-known audit manifest and its referenced report artefact.

    present=False registers a 404 for the manifest (repo publishes no attestation).
    present=True registers a manifest + report. Override individual fields to forge cases.
    """
    manifest_url = rf".*raw\.githubusercontent\.com/{owner}/{repo}/HEAD/\.well-known/genlayer-audit\.json"
    if not present:
        vm.mock_web(manifest_url, {"status": 404, "body": "not found"})
        return

    if manifest_body is None:
        manifest_body = json.dumps({
            "attestation_uid": uid,
            "report_hash": report_hash,
            "report_path": report_path,
        })
    vm.mock_web(manifest_url, {"status": manifest_status or 200, "body": manifest_body})
    report_url = rf".*raw\.githubusercontent\.com/{owner}/{repo}/HEAD/{re.escape(report_path)}"
    vm.mock_web(report_url, {"status": report_status, "body": report_text})


def mock_llm(vm, decision="APPROVED", reasoning="Satisfies all constitutional requirements"):
    vm.mock_llm(LLM_ANCHOR, json.dumps({"decision": decision, "reasoning": reasoning}))


def setup_evaluate_mocks(
    vm,
    spdx="MIT",
    topics=None,
    commit_count=50,
    veteran=False,
    authors=DEFAULT_AUTHORS,
    bots=False,
    contents=None,
    audit_present=False,
    audit_uid=AUDIT_UID,
    audit_report_hash=REPORT_HASH,
    audit_report_path=REPORT_PATH,
    audit_report_text=REPORT_TEXT,
    audit_manifest_status=None,
    audit_report_status=200,
    audit_manifest_body=None,
    maintainer_present=False,
    maintainer_payout=None,
    maintainer_declared_owner=OWNER,
    decision="APPROVED",
    reasoning="Satisfies all constitutional requirements",
):
    """Register every GitHub / raw / LLM mock for one evaluate_proposal call."""
    mock_repo(vm, spdx=spdx, topics=topics)
    mock_commits(vm, count=commit_count, veteran=veteran, authors=authors, bots=bots)
    mock_contents(vm, items=contents)
    mock_audit_manifest(
        vm, present=audit_present, uid=audit_uid, report_hash=audit_report_hash,
        report_path=audit_report_path, report_text=audit_report_text,
        manifest_status=audit_manifest_status, report_status=audit_report_status,
        manifest_body=audit_manifest_body,
    )
    mock_maintainer_manifest(
        vm, present=maintainer_present, payout_address=maintainer_payout,
        declared_owner=maintainer_declared_owner,
    )
    mock_llm(vm, decision=decision, reasoning=reasoning)


def setup_onchain_audit(treasury, direct_vm, direct_owner,
                        uid=AUDIT_UID, github_url=GH_URL, auditor=AUDITOR_ID,
                        report_hash=REPORT_HASH):
    """Register a trusted auditor and record an on-chain attestation (owner action)."""
    prev = direct_vm.sender
    direct_vm.sender = direct_owner
    if not treasury.is_trusted_auditor(auditor):
        treasury.register_trusted_auditor(auditor)
    treasury.record_audit_attestation(uid, github_url, auditor, report_hash)
    direct_vm.sender = prev


def submit_and_evaluate(vm, treasury, applicant, request=1_000 * ATTO, **mock_kwargs):
    """Submit a proposal and evaluate it. Returns proposal_id; clears mocks afterward."""
    setup_evaluate_mocks(vm, **mock_kwargs)
    vm.sender = applicant
    pid = treasury.submit_proposal(GH_URL, request)
    treasury.evaluate_proposal(pid)
    vm.clear_mocks()
    return pid


def fund_treasury(vm, treasury, owner, amount):
    """Owner deposits `amount` attos of native value into the treasury reserve."""
    prev_sender, prev_value = vm.sender, vm.value
    vm.sender = owner
    vm.value = amount
    treasury.deposit()
    vm.value = prev_value
    vm.sender = prev_sender


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def treasury(direct_vm, direct_deploy, direct_owner):
    """Fresh LexiTreasury deployment with standard caps."""
    direct_vm.sender = direct_owner
    return direct_deploy(CONTRACT, CONSTITUTION, CAP_1, CAP_2, CAP_3)


# ===========================================================================
# 1. Constructor
# ===========================================================================

class TestConstructor:
    def test_deploy_initialises_state(self, direct_vm, direct_deploy, direct_owner):
        direct_vm.sender = direct_owner
        c = direct_deploy(CONTRACT, CONSTITUTION, CAP_1, CAP_2, CAP_3)
        assert c.get_constitution() == CONSTITUTION
        assert c.get_treasury_balance() == 0
        assert c.get_proposal_count() == 0

    def test_deploy_sets_tier_caps(self, direct_vm, direct_deploy, direct_owner):
        direct_vm.sender = direct_owner
        c = direct_deploy(CONTRACT, CONSTITUTION, CAP_1, CAP_2, CAP_3)
        caps = c.get_tier_caps()
        assert caps["TIER_1"] == CAP_1
        assert caps["TIER_2"] == CAP_2
        assert caps["TIER_3"] == CAP_3

    def test_constitution_stripped_on_deploy(self, direct_vm, direct_deploy, direct_owner):
        direct_vm.sender = direct_owner
        c = direct_deploy(CONTRACT, f"  {CONSTITUTION}  ", CAP_1, CAP_2, CAP_3)
        assert c.get_constitution() == CONSTITUTION

    def test_empty_constitution_reverts(self, direct_vm, direct_deploy, direct_owner):
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert("Constitution cannot be empty"):
            direct_deploy(CONTRACT, "", CAP_1, CAP_2, CAP_3)

    def test_whitespace_only_constitution_reverts(self, direct_vm, direct_deploy, direct_owner):
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert("Constitution cannot be empty"):
            direct_deploy(CONTRACT, "   \t\n  ", CAP_1, CAP_2, CAP_3)

    def test_negative_tier_cap_reverts(self, direct_vm, direct_deploy, direct_owner):
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert("Tier caps must be non-negative"):
            direct_deploy(CONTRACT, CONSTITUTION, -1, CAP_2, CAP_3)

    def test_cap_ordering_violated_reverts(self, direct_vm, direct_deploy, direct_owner):
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert("Caps must satisfy"):
            direct_deploy(CONTRACT, CONSTITUTION, CAP_3, CAP_1, CAP_2)

    def test_equal_caps_accepted(self, direct_vm, direct_deploy, direct_owner):
        direct_vm.sender = direct_owner
        eq = 5_000 * ATTO
        c = direct_deploy(CONTRACT, CONSTITUTION, eq, eq, eq)
        caps = c.get_tier_caps()
        assert caps["TIER_1"] == caps["TIER_2"] == caps["TIER_3"] == eq

    def test_zero_caps_accepted(self, direct_vm, direct_deploy, direct_owner):
        direct_vm.sender = direct_owner
        c = direct_deploy(CONTRACT, CONSTITUTION, 0, 0, 0)
        assert c.get_tier_caps()["TIER_1"] == 0


# ===========================================================================
# 2. deposit
# ===========================================================================

class TestDeposit:
    def test_owner_deposit_increases_balance(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        direct_vm.value = 500 * ATTO
        treasury.deposit()
        direct_vm.value = 0
        assert treasury.get_treasury_balance() == 500 * ATTO

    def test_cumulative_deposits(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        direct_vm.value = 100 * ATTO
        treasury.deposit()
        direct_vm.value = 200 * ATTO
        treasury.deposit()
        direct_vm.value = 0
        assert treasury.get_treasury_balance() == 300 * ATTO

    def test_non_owner_deposit_reverts(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        direct_vm.value = 100 * ATTO
        with direct_vm.expect_revert("Only the owner can deposit funds"):
            treasury.deposit()
        direct_vm.value = 0

    def test_zero_value_deposit_reverts(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        direct_vm.value = 0
        with direct_vm.expect_revert("Deposit amount must be positive"):
            treasury.deposit()


# ===========================================================================
# 3. submit_proposal
# ===========================================================================

class TestSubmitProposal:
    def test_first_proposal_id_is_prop_1(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        pid = treasury.submit_proposal(GH_URL, 1_000 * ATTO)
        assert pid == "prop_1"

    def test_sequential_ids_increment(self, direct_vm, treasury, direct_alice, direct_bob):
        direct_vm.sender = direct_alice
        p1 = treasury.submit_proposal(GH_URL, 1_000 * ATTO)
        direct_vm.sender = direct_bob
        p2 = treasury.submit_proposal("https://github.com/other/repo", 500 * ATTO)
        assert p1 == "prop_1"
        assert p2 == "prop_2"
        assert treasury.get_proposal_count() == 2

    def test_initial_proposal_status_is_pending(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        pid = treasury.submit_proposal(GH_URL, 1_000 * ATTO)
        p = treasury.get_proposal(pid)
        assert p["status"] == "PENDING"
        assert p["tier"] == ""
        assert p["allocated_amount"] == 0
        assert p["github_url"] == GH_URL

    def test_dot_git_url_accepted(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        pid = treasury.submit_proposal("https://github.com/owner/repo.git", 1_000 * ATTO)
        assert pid == "prop_1"

    def test_trailing_slash_url_accepted(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        pid = treasury.submit_proposal("https://github.com/owner/repo/", 1_000 * ATTO)
        assert pid == "prop_1"

    def test_empty_url_reverts(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        with direct_vm.expect_revert("github_url is required"):
            treasury.submit_proposal("", 1_000 * ATTO)

    def test_unparseable_url_reverts(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        with direct_vm.expect_revert("Cannot parse GitHub URL"):
            treasury.submit_proposal("noslash", 1_000 * ATTO)

    def test_zero_amount_reverts(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        with direct_vm.expect_revert("requested_amount must be positive"):
            treasury.submit_proposal(GH_URL, 0)

    def test_negative_amount_reverts(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        with direct_vm.expect_revert("requested_amount must be positive"):
            treasury.submit_proposal(GH_URL, -1)


# ===========================================================================
# 4. View methods
# ===========================================================================

class TestViewMethods:
    def test_get_proposal_unknown_reverts(self, direct_vm, treasury):
        with direct_vm.expect_revert("Unknown proposal"):
            treasury.get_proposal("prop_999")

    def test_get_all_proposals_empty(self, treasury):
        assert treasury.get_all_proposals() == []

    def test_get_proposals_by_status_invalid_reverts(self, direct_vm, treasury):
        with direct_vm.expect_revert("Invalid status"):
            treasury.get_proposals_by_status("INVALID")

    def test_get_proposals_by_status_pending(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        treasury.submit_proposal(GH_URL, 1_000 * ATTO)
        pending = treasury.get_proposals_by_status("PENDING")
        assert len(pending) == 1
        assert pending[0]["status"] == "PENDING"

    def test_get_constitution_returns_stripped(self, direct_vm, direct_deploy, direct_owner):
        direct_vm.sender = direct_owner
        c = direct_deploy(CONTRACT, f"\n{CONSTITUTION}\n", CAP_1, CAP_2, CAP_3)
        assert c.get_constitution() == CONSTITUTION


# ===========================================================================
# 5. update_constitution
# ===========================================================================

class TestUpdateConstitution:
    def test_owner_can_update(self, direct_vm, treasury, direct_owner):
        new_text = "New DAO rules: only VETERAN repos qualify."
        direct_vm.sender = direct_owner
        treasury.update_constitution(new_text)
        assert treasury.get_constitution() == new_text

    def test_constitution_stripped_on_update(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        treasury.update_constitution("  Stripped text  ")
        assert treasury.get_constitution() == "Stripped text"

    def test_non_owner_update_reverts(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        with direct_vm.expect_revert("Only the owner can update the constitution"):
            treasury.update_constitution("Hijacked rules")

    def test_empty_update_reverts(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert("Constitution cannot be empty"):
            treasury.update_constitution("")


# ===========================================================================
# 6. set_tier_caps
# ===========================================================================

class TestSetTierCaps:
    def test_owner_can_update_caps(self, direct_vm, treasury, direct_owner):
        new1, new2, new3 = 200_000 * ATTO, 80_000 * ATTO, 20_000 * ATTO
        direct_vm.sender = direct_owner
        treasury.set_tier_caps(new1, new2, new3)
        caps = treasury.get_tier_caps()
        assert caps["TIER_1"] == new1
        assert caps["TIER_2"] == new2
        assert caps["TIER_3"] == new3

    def test_equal_caps_allowed(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        treasury.set_tier_caps(5_000 * ATTO, 5_000 * ATTO, 5_000 * ATTO)
        caps = treasury.get_tier_caps()
        assert caps["TIER_1"] == caps["TIER_2"] == caps["TIER_3"]

    def test_non_owner_reverts(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        with direct_vm.expect_revert("Only the owner can adjust tier caps"):
            treasury.set_tier_caps(1_000 * ATTO, 500 * ATTO, 100 * ATTO)

    def test_negative_cap_reverts(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert("Tier caps must be non-negative"):
            treasury.set_tier_caps(-1, CAP_2, CAP_3)

    def test_cap_ordering_violated_reverts(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert("Caps must satisfy"):
            treasury.set_tier_caps(CAP_3, CAP_1, CAP_2)

    def test_zero_caps_allowed(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        treasury.set_tier_caps(0, 0, 0)
        caps = treasury.get_tier_caps()
        assert caps["TIER_1"] == 0


# ===========================================================================
# 7. Audit attestation registry (deterministic owner-managed trust anchor)
# ===========================================================================

class TestAuditRegistry:
    def test_owner_registers_auditor(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        treasury.register_trusted_auditor("TrailOfBits")
        assert treasury.is_trusted_auditor("trailofbits") is True
        assert "trailofbits" in treasury.get_trusted_auditors()

    def test_non_owner_register_reverts(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        with direct_vm.expect_revert("Only the owner can register auditors"):
            treasury.register_trusted_auditor("acme")

    def test_empty_auditor_id_reverts(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert("auditor_id is required"):
            treasury.register_trusted_auditor("!!!")  # sanitises to empty

    def test_revoke_auditor(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        treasury.register_trusted_auditor("acme")
        treasury.revoke_trusted_auditor("acme")
        assert treasury.is_trusted_auditor("acme") is False

    def test_revoke_unknown_auditor_reverts(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert("Unknown auditor"):
            treasury.revoke_trusted_auditor("ghost")

    def test_record_attestation_happy(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        treasury.register_trusted_auditor(AUDITOR_ID)
        treasury.record_audit_attestation(AUDIT_UID, GH_URL, AUDITOR_ID, REPORT_HASH)
        rec = treasury.get_audit_attestation(AUDIT_UID)
        assert rec["owner"] == OWNER
        assert rec["repo"] == REPO
        assert rec["auditor_id"] == AUDITOR_ID
        assert rec["report_hash"] == REPORT_HASH
        assert rec["status"] == "active"

    def test_record_attestation_untrusted_auditor_reverts(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert("not a trusted active auditor"):
            treasury.record_audit_attestation(AUDIT_UID, GH_URL, "nobody", REPORT_HASH)

    def test_record_attestation_bad_hash_reverts(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        treasury.register_trusted_auditor(AUDITOR_ID)
        with direct_vm.expect_revert("64-char sha256 hex"):
            treasury.record_audit_attestation(AUDIT_UID, GH_URL, AUDITOR_ID, "deadbeef")

    def test_record_duplicate_uid_reverts(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        treasury.register_trusted_auditor(AUDITOR_ID)
        treasury.record_audit_attestation(AUDIT_UID, GH_URL, AUDITOR_ID, REPORT_HASH)
        with direct_vm.expect_revert("already exists"):
            treasury.record_audit_attestation(AUDIT_UID, GH_URL, AUDITOR_ID, REPORT_HASH)

    def test_non_owner_record_reverts(self, direct_vm, treasury, direct_owner, direct_alice):
        direct_vm.sender = direct_owner
        treasury.register_trusted_auditor(AUDITOR_ID)
        direct_vm.sender = direct_alice
        with direct_vm.expect_revert("Only the owner can record attestations"):
            treasury.record_audit_attestation(AUDIT_UID, GH_URL, AUDITOR_ID, REPORT_HASH)

    def test_revoke_attestation(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        treasury.register_trusted_auditor(AUDITOR_ID)
        treasury.record_audit_attestation(AUDIT_UID, GH_URL, AUDITOR_ID, REPORT_HASH)
        treasury.revoke_audit_attestation(AUDIT_UID)
        assert treasury.get_audit_attestation(AUDIT_UID)["status"] == "revoked"

    def test_get_unknown_attestation_reverts(self, direct_vm, treasury):
        with direct_vm.expect_revert("Unknown attestation"):
            treasury.get_audit_attestation("att_missing")


# ===========================================================================
# 8. fund_proposal
# ===========================================================================

class TestExecuteProposal:
    def _mkw(self, direct_alice, **extra):
        """Mock kwargs that publish a maintainer manifest binding the payout to Alice."""
        base = dict(maintainer_present=True, maintainer_payout=str(direct_alice))
        base.update(extra)
        return base

    def test_full_execute_lifecycle(self, direct_vm, treasury, direct_owner, direct_alice):
        """Submit -> evaluate (APPROVED, TIER_2, maintainer verified) -> deposit -> execute."""
        pid = submit_and_evaluate(
            direct_vm, treasury, direct_alice,
            request=5_000 * ATTO,
            **self._mkw(direct_alice, spdx="MIT", commit_count=50),  # ACTIVE + MIT -> TIER_2
        )
        p = treasury.get_proposal(pid)
        assert p["status"] == "APPROVED"
        assert p["maintainer_verified"] == "true"

        fund_treasury(direct_vm, treasury, direct_owner, 5_000 * ATTO)
        direct_vm.sender = direct_owner
        released = treasury.execute_proposal(pid)
        assert released == 5_000 * ATTO

        p = treasury.get_proposal(pid)
        assert p["status"] == "FUNDED"
        assert treasury.get_treasury_balance() == 0
        assert treasury.get_total_escrowed() == 5_000 * ATTO
        assert treasury.get_claimable(str(direct_alice)) == 5_000 * ATTO

    def test_recipient_can_execute(self, direct_vm, treasury, direct_owner, direct_alice):
        pid = submit_and_evaluate(
            direct_vm, treasury, direct_alice,
            request=2_000 * ATTO, **self._mkw(direct_alice, spdx="MIT", commit_count=50),
        )
        fund_treasury(direct_vm, treasury, direct_owner, 2_000 * ATTO)
        direct_vm.sender = direct_alice          # recipient triggers settlement
        treasury.execute_proposal(pid)
        assert treasury.get_proposal(pid)["status"] == "FUNDED"

    def test_execute_requires_maintainer_verified(self, direct_vm, treasury, direct_owner, direct_alice):
        """APPROVED but no maintainer manifest -> execution is refused (recipient unbound)."""
        pid = submit_and_evaluate(
            direct_vm, treasury, direct_alice,
            request=2_000 * ATTO, spdx="MIT", commit_count=50, maintainer_present=False,
        )
        assert treasury.get_proposal(pid)["maintainer_verified"] == "false"
        fund_treasury(direct_vm, treasury, direct_owner, 2_000 * ATTO)
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert("not a verified repository maintainer"):
            treasury.execute_proposal(pid)

    def test_wrong_payout_address_is_not_verified(self, direct_vm, treasury, direct_alice, direct_bob):
        """Manifest declares Bob's address, but Alice is the applicant -> unverified."""
        pid = submit_and_evaluate(
            direct_vm, treasury, direct_alice,
            request=2_000 * ATTO, spdx="MIT", commit_count=50,
            maintainer_present=True, maintainer_payout=str(direct_bob),
        )
        assert treasury.get_proposal(pid)["maintainer_verified"] == "false"

    def test_execute_caps_at_tier_ceiling(self, direct_vm, treasury, direct_alice):
        """When requested > cap, allocated = cap. ACTIVE + non-OSI -> TIER_3."""
        pid = submit_and_evaluate(
            direct_vm, treasury, direct_alice,
            request=50_000 * ATTO,        # > CAP_3
            **self._mkw(direct_alice, spdx="PROPRIETARY", commit_count=50),
        )
        p = treasury.get_proposal(pid)
        assert p["tier"] == "TIER_3"
        assert p["allocated_amount"] == CAP_3

    def test_execute_within_cap_uses_requested(self, direct_vm, treasury, direct_alice):
        request = 3_000 * ATTO   # < CAP_3
        pid = submit_and_evaluate(
            direct_vm, treasury, direct_alice,
            request=request, **self._mkw(direct_alice, spdx="PROPRIETARY", commit_count=50),  # TIER_3
        )
        p = treasury.get_proposal(pid)
        assert p["allocated_amount"] == request

    def test_third_party_execute_reverts(self, direct_vm, treasury, direct_owner, direct_alice, direct_charlie):
        pid = submit_and_evaluate(
            direct_vm, treasury, direct_alice,
            **self._mkw(direct_alice, spdx="MIT", commit_count=50),
        )
        fund_treasury(direct_vm, treasury, direct_owner, 2_000 * ATTO)
        direct_vm.sender = direct_charlie
        with direct_vm.expect_revert("Only the owner or the recipient can execute"):
            treasury.execute_proposal(pid)

    def test_unknown_proposal_execute_reverts(self, direct_vm, treasury, direct_owner):
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert("Unknown proposal"):
            treasury.execute_proposal("prop_999")

    def test_execute_rejected_proposal_reverts(self, direct_vm, treasury, direct_owner, direct_alice):
        pid = submit_and_evaluate(direct_vm, treasury, direct_alice, decision="REJECTED")
        fund_treasury(direct_vm, treasury, direct_owner, 1_000 * ATTO)
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert("expected APPROVED"):
            treasury.execute_proposal(pid)

    def test_execute_insufficient_balance_reverts(self, direct_vm, treasury, direct_owner, direct_alice):
        request = 5_000 * ATTO
        pid = submit_and_evaluate(
            direct_vm, treasury, direct_alice, request=request,
            **self._mkw(direct_alice, spdx="MIT", commit_count=50),
        )
        fund_treasury(direct_vm, treasury, direct_owner, 1 * ATTO)
        direct_vm.sender = direct_owner
        with direct_vm.expect_revert("Insufficient treasury"):
            treasury.execute_proposal(pid)

    def test_double_execute_reverts(self, direct_vm, treasury, direct_owner, direct_alice):
        request = 2_000 * ATTO
        pid = submit_and_evaluate(
            direct_vm, treasury, direct_alice, request=request,
            **self._mkw(direct_alice, spdx="MIT", commit_count=50),
        )
        fund_treasury(direct_vm, treasury, direct_owner, 10_000 * ATTO)
        direct_vm.sender = direct_owner
        treasury.execute_proposal(pid)
        with direct_vm.expect_revert("expected APPROVED"):
            treasury.execute_proposal(pid)

    def test_withdraw_settles_recipient(self, direct_vm, treasury, direct_owner, direct_alice):
        """Full settlement: execute -> claimable -> withdraw zeroes the escrow."""
        pid = submit_and_evaluate(
            direct_vm, treasury, direct_alice, request=4_000 * ATTO,
            **self._mkw(direct_alice, spdx="MIT", commit_count=50),
        )
        fund_treasury(direct_vm, treasury, direct_owner, 4_000 * ATTO)
        direct_vm.sender = direct_owner
        treasury.execute_proposal(pid)

        direct_vm.sender = direct_alice
        withdrawn = treasury.withdraw()
        assert withdrawn == 4_000 * ATTO
        assert treasury.get_claimable(str(direct_alice)) == 0
        assert treasury.get_total_escrowed() == 0

    def test_withdraw_without_balance_reverts(self, direct_vm, treasury, direct_bob):
        direct_vm.sender = direct_bob
        with direct_vm.expect_revert("No claimable balance"):
            treasury.withdraw()


# ===========================================================================
# 9. evaluate_proposal - revert paths
# ===========================================================================

class TestEvaluateProposalReverts:
    def test_unknown_proposal_reverts(self, direct_vm, treasury):
        with direct_vm.expect_revert("Unknown proposal"):
            treasury.evaluate_proposal("prop_999")

    def test_already_approved_reverts(self, direct_vm, treasury, direct_alice):
        pid = submit_and_evaluate(direct_vm, treasury, direct_alice, spdx="MIT", commit_count=50)
        setup_evaluate_mocks(direct_vm)
        with direct_vm.expect_revert("is not PENDING"):
            treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()

    def test_already_rejected_reverts(self, direct_vm, treasury, direct_alice):
        pid = submit_and_evaluate(direct_vm, treasury, direct_alice, decision="REJECTED")
        setup_evaluate_mocks(direct_vm)
        with direct_vm.expect_revert("is not PENDING"):
            treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()

    def test_github_repo_404_raises_external(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        pid = treasury.submit_proposal(GH_URL, 1_000 * ATTO)
        mock_repo(direct_vm, status=404)
        with direct_vm.expect_revert("[EXTERNAL]"):
            treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()

    def test_github_rate_limit_raises_transient(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        pid = treasury.submit_proposal(GH_URL, 1_000 * ATTO)
        mock_repo(direct_vm, status=403)
        with direct_vm.expect_revert("[TRANSIENT]"):
            treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()

    def test_github_server_error_raises_transient(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        pid = treasury.submit_proposal(GH_URL, 1_000 * ATTO)
        mock_repo(direct_vm, status=500)
        with direct_vm.expect_revert("[TRANSIENT]"):
            treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()

    def test_llm_invalid_decision_raises_llm_error(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        pid = treasury.submit_proposal(GH_URL, 1_000 * ATTO)
        mock_repo(direct_vm)
        mock_commits(direct_vm, count=50)
        mock_contents(direct_vm)
        mock_audit_manifest(direct_vm, present=False)
        mock_maintainer_manifest(direct_vm, present=False)
        direct_vm.mock_llm(LLM_ANCHOR, json.dumps({"decision": "MAYBE", "reasoning": "Uncertain"}))
        with direct_vm.expect_revert("[LLM_ERROR]"):
            treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()


# ===========================================================================
# 10. evaluate_proposal - APPROVED happy paths
# ===========================================================================

class TestEvaluateProposalApproved:
    def test_approved_sets_status_and_fields(self, direct_vm, treasury, direct_alice):
        pid = submit_and_evaluate(
            direct_vm, treasury, direct_alice, spdx="MIT", commit_count=50,  # ACTIVE + MIT -> TIER_2
        )
        p = treasury.get_proposal(pid)
        assert p["status"] == "APPROVED"
        assert p["tier"] == "TIER_2"
        assert p["commit_bracket"] == "ACTIVE"
        assert p["is_osi_approved"] == "true"
        assert p["evaluation_decision"] == "APPROVED"

    def test_rejected_sets_status_and_zero_allocation(self, direct_vm, treasury, direct_alice):
        pid = submit_and_evaluate(direct_vm, treasury, direct_alice, decision="REJECTED")
        p = treasury.get_proposal(pid)
        assert p["status"] == "REJECTED"
        assert p["tier"] == ""
        assert p["allocated_amount"] == 0

    def test_approved_proposal_appears_in_status_filter(self, direct_vm, treasury, direct_alice):
        submit_and_evaluate(direct_vm, treasury, direct_alice, spdx="MIT", commit_count=50)
        approved = treasury.get_proposals_by_status("APPROVED")
        assert len(approved) == 1
        rejected = treasury.get_proposals_by_status("REJECTED")
        assert len(rejected) == 0

    def test_reasoning_stored(self, direct_vm, treasury, direct_alice):
        reason = "Meets the ACTIVE commit and OSI requirements from clause 2."
        pid = submit_and_evaluate(
            direct_vm, treasury, direct_alice, spdx="MIT", commit_count=50, reasoning=reason,
        )
        p = treasury.get_proposal(pid)
        assert p["evaluation_reasoning"] == reason

    def test_license_spdx_stored(self, direct_vm, treasury, direct_alice):
        pid = submit_and_evaluate(
            direct_vm, treasury, direct_alice, spdx="Apache-2.0", commit_count=50,
        )
        p = treasury.get_proposal(pid)
        assert p["license_spdx"] == "Apache-2.0"


# ===========================================================================
# 11. Tier assignment - all _compute_tier branches (incl. anti-gaming gates)
# ===========================================================================

class TestTierAssignment:
    def _eval(self, direct_vm, treasury, direct_alice, **kwargs):
        pid = submit_and_evaluate(direct_vm, treasury, direct_alice, **kwargs)
        return treasury.get_proposal(pid)

    def test_veteran_osi_audit_is_tier1(self, direct_vm, treasury, direct_owner, direct_alice):
        setup_onchain_audit(treasury, direct_vm, direct_owner)
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=100, veteran=True, spdx="MIT", audit_present=True)
        assert p["tier"] == "TIER_1"
        assert p["commit_bracket"] == "VETERAN"
        assert p["has_audit"] == "true"

    def test_mature_osi_audit_is_tier1(self, direct_vm, treasury, direct_owner, direct_alice):
        setup_onchain_audit(treasury, direct_vm, direct_owner)
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=100, veteran=False, spdx="MIT", audit_present=True)
        assert p["tier"] == "TIER_1"
        assert p["commit_bracket"] == "MATURE"

    def test_veteran_osi_no_audit_is_tier2(self, direct_vm, treasury, direct_alice):
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=100, veteran=True, spdx="MIT", audit_present=False)
        assert p["tier"] == "TIER_2"

    def test_veteran_audit_no_osi_is_tier2(self, direct_vm, treasury, direct_owner, direct_alice):
        setup_onchain_audit(treasury, direct_vm, direct_owner)
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=100, veteran=True, spdx="PROPRIETARY", audit_present=True)
        assert p["tier"] == "TIER_2"
        assert p["is_osi_approved"] == "false"

    def test_veteran_neither_osi_nor_audit_is_tier3(self, direct_vm, treasury, direct_alice):
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=100, veteran=True, spdx="PROPRIETARY", audit_present=False)
        assert p["tier"] == "TIER_3"

    def test_active_osi_is_tier2(self, direct_vm, treasury, direct_alice):
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=50, veteran=False, spdx="MIT")
        assert p["tier"] == "TIER_2"
        assert p["commit_bracket"] == "ACTIVE"

    def test_active_no_osi_is_tier3(self, direct_vm, treasury, direct_alice):
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=50, veteran=False, spdx="PROPRIETARY")
        assert p["tier"] == "TIER_3"

    def test_minimal_is_tier3_regardless(self, direct_vm, treasury, direct_alice):
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=5, veteran=False, spdx="MIT")
        assert p["tier"] == "TIER_3"
        assert p["commit_bracket"] == "MINIMAL"

    def test_rejected_always_has_empty_tier(self, direct_vm, treasury, direct_owner, direct_alice):
        setup_onchain_audit(treasury, direct_vm, direct_owner)
        pid = submit_and_evaluate(
            direct_vm, treasury, direct_alice,
            commit_count=100, veteran=True, spdx="MIT", audit_present=True, decision="REJECTED",
        )
        p = treasury.get_proposal(pid)
        assert p["tier"] == ""
        assert p["allocated_amount"] == 0

    def test_tier1_requires_onchain_audit_not_just_manifest(self, direct_vm, treasury, direct_alice):
        """A published manifest with NO matching on-chain attestation -> audit stays false -> TIER_2."""
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=100, veteran=True, spdx="MIT", audit_present=True)
        assert p["has_audit"] == "false"
        assert p["tier"] == "TIER_2"


# ===========================================================================
# 12. Anti-gaming gates: quality + contributor
# ===========================================================================

class TestAntiGamingGates:
    def _eval(self, direct_vm, treasury, direct_alice, **kwargs):
        pid = submit_and_evaluate(direct_vm, treasury, direct_alice, **kwargs)
        return treasury.get_proposal(pid)

    def test_no_structural_quality_blocks_funding(self, direct_vm, treasury, direct_alice):
        """VETERAN + OSI but zero structural signals -> QUALITY_NONE -> no tier -> REJECTED."""
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=100, veteran=True, spdx="MIT",
                       contents=[{"name": "README.md", "type": "file"}])
        assert p["quality_bracket"] == "QUALITY_NONE"
        assert p["tier"] == ""
        assert p["status"] == "REJECTED"

    def test_basic_quality_allows_tier3(self, direct_vm, treasury, direct_alice):
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=50, veteran=False, spdx="PROPRIETARY",
                       contents=[{"name": "package.json", "type": "file"}])
        assert p["quality_bracket"] == "QUALITY_BASIC"
        assert p["tier"] == "TIER_3"

    def test_standard_quality_bracket(self, direct_vm, treasury, direct_alice):
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=50, spdx="MIT",
                       contents=[{"name": "tests", "type": "dir"},
                                 {"name": "package.json", "type": "file"}])
        assert p["quality_bracket"] == "QUALITY_STANDARD"

    def test_bot_only_history_blocks_funding(self, direct_vm, treasury, direct_alice):
        """All-bot commit history -> CONTRIB_BOT -> no tier even if everything else is strong."""
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=100, veteran=True, spdx="MIT", bots=True)
        assert p["contributor_bracket"] == "CONTRIB_BOT"
        assert p["tier"] == ""
        assert p["status"] == "REJECTED"

    def test_solo_contributor_cannot_reach_tier1(self, direct_vm, treasury, direct_owner, direct_alice):
        """A single human author caps a VETERAN+OSI+audit repo at TIER_2, never TIER_1."""
        setup_onchain_audit(treasury, direct_vm, direct_owner)
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=100, veteran=True, spdx="MIT", audit_present=True,
                       authors=("solo",))
        assert p["contributor_bracket"] == "CONTRIB_SOLO"
        assert p["has_audit"] == "true"
        assert p["tier"] == "TIER_2"

    def test_small_team_reaches_tier1(self, direct_vm, treasury, direct_owner, direct_alice):
        setup_onchain_audit(treasury, direct_vm, direct_owner)
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=100, veteran=True, spdx="MIT", audit_present=True,
                       authors=("x", "y", "z"))
        assert p["contributor_bracket"] == "CONTRIB_SMALL"
        assert p["tier"] == "TIER_1"


# ===========================================================================
# 13. Commit + contributor bracket detection
# ===========================================================================

class TestCommitBrackets:
    def _get(self, direct_vm, treasury, direct_alice, count, veteran=False,
             page1_status=200, authors=DEFAULT_AUTHORS, bots=False):
        vm = direct_vm
        vm.sender = direct_alice
        pid = treasury.submit_proposal(GH_URL, 1_000 * ATTO)
        mock_repo(vm)
        mock_commits(vm, count=count, veteran=veteran, page1_status=page1_status,
                     authors=authors, bots=bots)
        mock_contents(vm)
        mock_audit_manifest(vm, present=False)
        mock_maintainer_manifest(vm, present=False)
        mock_llm(vm)
        treasury.evaluate_proposal(pid)
        vm.clear_mocks()
        return treasury.get_proposal(pid)

    def test_none_bracket_from_empty_repo_409(self, direct_vm, treasury, direct_alice):
        p = self._get(direct_vm, treasury, direct_alice, count=1, page1_status=409)
        assert p["commit_bracket"] == "NONE"
        assert p["contributor_bracket"] == "CONTRIB_NONE"

    def test_minimal_bracket(self, direct_vm, treasury, direct_alice):
        assert self._get(direct_vm, treasury, direct_alice, count=5)["commit_bracket"] == "MINIMAL"

    def test_active_bracket(self, direct_vm, treasury, direct_alice):
        assert self._get(direct_vm, treasury, direct_alice, count=50)["commit_bracket"] == "ACTIVE"

    def test_mature_bracket_probe_empty(self, direct_vm, treasury, direct_alice):
        assert self._get(direct_vm, treasury, direct_alice,
                         count=100, veteran=False)["commit_bracket"] == "MATURE"

    def test_veteran_bracket_probe_non_empty(self, direct_vm, treasury, direct_alice):
        assert self._get(direct_vm, treasury, direct_alice,
                         count=100, veteran=True)["commit_bracket"] == "VETERAN"

    def test_single_commit_is_minimal(self, direct_vm, treasury, direct_alice):
        assert self._get(direct_vm, treasury, direct_alice, count=1)["commit_bracket"] == "MINIMAL"

    def test_boundary_99_is_active(self, direct_vm, treasury, direct_alice):
        assert self._get(direct_vm, treasury, direct_alice, count=99)["commit_bracket"] == "ACTIVE"

    def test_solo_contributor(self, direct_vm, treasury, direct_alice):
        p = self._get(direct_vm, treasury, direct_alice, count=10, authors=("only",))
        assert p["contributor_bracket"] == "CONTRIB_SOLO"

    def test_team_contributor(self, direct_vm, treasury, direct_alice):
        p = self._get(direct_vm, treasury, direct_alice, count=20,
                      authors=("a", "b", "c", "d", "e"))
        assert p["contributor_bracket"] == "CONTRIB_TEAM"

    def test_bot_contributor(self, direct_vm, treasury, direct_alice):
        p = self._get(direct_vm, treasury, direct_alice, count=20, bots=True)
        assert p["contributor_bracket"] == "CONTRIB_BOT"


# ===========================================================================
# 14. On-chain audit verification + fail-closed cases
# ===========================================================================

class TestAuditVerification:
    def _eval(self, direct_vm, treasury, direct_alice, **kwargs):
        pid = submit_and_evaluate(direct_vm, treasury, direct_alice, **kwargs)
        return treasury.get_proposal(pid)

    def test_valid_attestation_sets_audit_true(self, direct_vm, treasury, direct_owner, direct_alice):
        setup_onchain_audit(treasury, direct_vm, direct_owner)
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=50, spdx="MIT", audit_present=True)
        assert p["has_audit"] == "true"
        assert p["audit_uid"] == AUDIT_UID

    def test_no_manifest_is_no_audit(self, direct_vm, treasury, direct_owner, direct_alice):
        setup_onchain_audit(treasury, direct_vm, direct_owner)
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=50, spdx="MIT", audit_present=False)
        assert p["has_audit"] == "false"

    def test_manifest_without_onchain_record_is_no_audit(self, direct_vm, treasury, direct_alice):
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=50, spdx="MIT", audit_present=True)  # no on-chain record
        assert p["has_audit"] == "false"

    def test_report_hash_mismatch_is_no_audit(self, direct_vm, treasury, direct_owner, direct_alice):
        setup_onchain_audit(treasury, direct_vm, direct_owner)
        # Serve a report whose bytes do NOT hash to the attested value.
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=50, spdx="MIT", audit_present=True,
                       audit_report_text="tampered report body")
        assert p["has_audit"] == "false"

    def test_revoked_attestation_is_no_audit(self, direct_vm, treasury, direct_owner, direct_alice):
        setup_onchain_audit(treasury, direct_vm, direct_owner)
        direct_vm.sender = direct_owner
        treasury.revoke_audit_attestation(AUDIT_UID)
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=50, spdx="MIT", audit_present=True)
        assert p["has_audit"] == "false"

    def test_revoked_auditor_is_no_audit(self, direct_vm, treasury, direct_owner, direct_alice):
        setup_onchain_audit(treasury, direct_vm, direct_owner)
        direct_vm.sender = direct_owner
        treasury.revoke_trusted_auditor(AUDITOR_ID)
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=50, spdx="MIT", audit_present=True)
        assert p["has_audit"] == "false"

    def test_attestation_bound_to_other_repo_is_no_audit(self, direct_vm, treasury, direct_owner, direct_alice):
        # Attestation recorded for a different repo than the proposal's repo.
        setup_onchain_audit(treasury, direct_vm, direct_owner,
                            github_url="https://github.com/test-owner/other-repo")
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=50, spdx="MIT", audit_present=True)
        assert p["has_audit"] == "false"

    def test_missing_report_file_is_no_audit(self, direct_vm, treasury, direct_owner, direct_alice):
        setup_onchain_audit(treasury, direct_vm, direct_owner)
        p = self._eval(direct_vm, treasury, direct_alice,
                       commit_count=50, spdx="MIT", audit_present=True, audit_report_status=404)
        assert p["has_audit"] == "false"


# ===========================================================================
# 15. GitHub API error classification
# ===========================================================================

class TestGitHubErrorClassification:
    def _pid(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        return treasury.submit_proposal(GH_URL, 1_000 * ATTO)

    def test_repo_404_is_external(self, direct_vm, treasury, direct_alice):
        pid = self._pid(direct_vm, treasury, direct_alice)
        mock_repo(direct_vm, status=404)
        with direct_vm.expect_revert("[EXTERNAL]"):
            treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()

    def test_repo_403_is_transient(self, direct_vm, treasury, direct_alice):
        pid = self._pid(direct_vm, treasury, direct_alice)
        mock_repo(direct_vm, status=403)
        with direct_vm.expect_revert("[TRANSIENT]"):
            treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()

    def test_repo_429_is_transient(self, direct_vm, treasury, direct_alice):
        pid = self._pid(direct_vm, treasury, direct_alice)
        mock_repo(direct_vm, status=429)
        with direct_vm.expect_revert("[TRANSIENT]"):
            treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()

    def test_repo_500_is_transient(self, direct_vm, treasury, direct_alice):
        pid = self._pid(direct_vm, treasury, direct_alice)
        mock_repo(direct_vm, status=500)
        with direct_vm.expect_revert("[TRANSIENT]"):
            treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()

    def test_commits_404_is_external(self, direct_vm, treasury, direct_alice):
        pid = self._pid(direct_vm, treasury, direct_alice)
        mock_repo(direct_vm)
        mock_commits(direct_vm, count=1, page1_status=404)
        with direct_vm.expect_revert("[EXTERNAL]"):
            treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()

    def test_commits_500_is_transient(self, direct_vm, treasury, direct_alice):
        pid = self._pid(direct_vm, treasury, direct_alice)
        mock_repo(direct_vm)
        mock_commits(direct_vm, count=1, page1_status=500)
        with direct_vm.expect_revert("[TRANSIENT]"):
            treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()


# ===========================================================================
# 16. Determinism simulation
# ===========================================================================

class TestDeterminismSimulation:
    CONSENSUS_FIELDS = ("status", "tier", "commit_bracket", "contributor_bracket",
                        "quality_bracket", "is_osi_approved", "has_audit")

    def _run_once(self, direct_vm, treasury, pid, **mocks):
        setup_evaluate_mocks(direct_vm, **mocks)
        treasury.evaluate_proposal(pid)
        direct_vm.clear_mocks()
        return treasury.get_proposal(pid)

    def test_two_nodes_produce_identical_tier1_result(self, direct_vm, treasury, direct_owner, direct_alice):
        setup_onchain_audit(treasury, direct_vm, direct_owner)
        mocks = dict(spdx="MIT", commit_count=100, veteran=True, audit_present=True, decision="APPROVED")
        direct_vm.sender = direct_alice
        pid = treasury.submit_proposal(GH_URL, 5_000 * ATTO)
        snap = direct_vm.snapshot()
        a = self._run_once(direct_vm, treasury, pid, **mocks)
        direct_vm.revert(snap)
        b = self._run_once(direct_vm, treasury, pid, **mocks)
        for f in self.CONSENSUS_FIELDS:
            assert a[f] == b[f], f"Nodes diverged on {f!r}: {a[f]!r} vs {b[f]!r}"
        assert a["tier"] == "TIER_1"

    def test_three_node_consensus_all_identical(self, direct_vm, treasury, direct_owner, direct_alice):
        setup_onchain_audit(treasury, direct_vm, direct_owner)
        mocks = dict(spdx="MIT", commit_count=100, veteran=True, audit_present=True, decision="APPROVED")
        direct_vm.sender = direct_alice
        pid = treasury.submit_proposal(GH_URL, 5_000 * ATTO)
        snap = direct_vm.snapshot()
        results = []
        for _ in range(3):
            direct_vm.revert(snap)
            results.append(self._run_once(direct_vm, treasury, pid, **mocks))
        for f in self.CONSENSUS_FIELDS:
            assert len({r[f] for r in results}) == 1, f"Diverged on {f!r}"

    def test_rejected_decision_deterministic_across_nodes(self, direct_vm, treasury, direct_alice):
        mocks = dict(spdx="MIT", commit_count=50, veteran=False, decision="REJECTED")
        direct_vm.sender = direct_alice
        pid = treasury.submit_proposal(GH_URL, 1_000 * ATTO)
        snap = direct_vm.snapshot()
        results = []
        for _ in range(3):
            direct_vm.revert(snap)
            results.append(self._run_once(direct_vm, treasury, pid, **mocks))
        for f in self.CONSENSUS_FIELDS:
            assert len({r[f] for r in results}) == 1, f"Diverged on {f!r}"

    def test_pure_tier_computation_is_deterministic(self):
        """Mirror of _compute_tier's decision table across the full input space."""
        def compute(bracket, osi, audit, quality, contrib):
            qrank = {"QUALITY_NONE": 0, "QUALITY_BASIC": 1, "QUALITY_STANDARD": 2, "QUALITY_STRONG": 3}
            if bracket == "NONE":
                return ""
            if contrib == "CONTRIB_BOT":
                return ""
            if qrank[quality] < 1:
                return ""
            q_ok_t1 = qrank[quality] >= 2
            c_ok_t1 = contrib in ("CONTRIB_SMALL", "CONTRIB_TEAM")
            if bracket in ("MATURE", "VETERAN"):
                if osi and audit and q_ok_t1 and c_ok_t1:
                    return "TIER_1"
                if osi or audit:
                    return "TIER_2"
                return "TIER_3"
            if bracket == "ACTIVE":
                return "TIER_2" if osi else "TIER_3"
            return "TIER_3"

        # Stability: repeated calls with identical args yield identical output.
        for bracket in ("NONE", "MINIMAL", "ACTIVE", "MATURE", "VETERAN"):
            for osi in (True, False):
                for audit in (True, False):
                    for quality in ("QUALITY_NONE", "QUALITY_BASIC", "QUALITY_STANDARD", "QUALITY_STRONG"):
                        for contrib in ("CONTRIB_NONE", "CONTRIB_BOT", "CONTRIB_SOLO",
                                        "CONTRIB_SMALL", "CONTRIB_TEAM"):
                            first = compute(bracket, osi, audit, quality, contrib)
                            assert first == compute(bracket, osi, audit, quality, contrib)

        # Spot-check anti-gaming invariants.
        assert compute("VETERAN", True, True, "QUALITY_NONE", "CONTRIB_TEAM") == ""
        assert compute("VETERAN", True, True, "QUALITY_STRONG", "CONTRIB_BOT") == ""
        assert compute("VETERAN", True, True, "QUALITY_STRONG", "CONTRIB_TEAM") == "TIER_1"
        assert compute("VETERAN", True, True, "QUALITY_STRONG", "CONTRIB_SOLO") == "TIER_2"
        assert compute("NONE", True, True, "QUALITY_STRONG", "CONTRIB_TEAM") == ""
