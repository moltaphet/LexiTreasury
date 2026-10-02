"""
LexiTreasury - Validator Divergence & Consensus Stability Suite

Directly exercises the leader/validator agreement path with direct_vm.run_validator()
to prove the protocol is stable under real-world environment variance:

  - Invariant bucketing ABSORBS small metric drift between the leader and a validator
    (e.g. 50 vs 60 commits both read as ACTIVE) so consensus does not fail intermittently.
  - Crossing a bracket boundary (99 vs 100 commits) is a genuine disagreement and the
    validator correctly refuses to attest, forcing node rotation instead of a silent split.
  - LLM non-determinism in prose is tolerated (reasoning is excluded from consensus) but a
    different verdict, or a misbehaving/malformed LLM on a validator, forces rotation.
  - The new maintainer-binding web fetch is fail-closed under 429 / 500 / malformed data
    (never raises spuriously, never silently trusts).
  - Block-time progression via warp() is not a consensus input, so evaluation is stable
    across time and value flows keep working far into the future.

Self-contained: tests/direct has no shared conftest.
"""

import json
import datetime
import pytest

ATTO = 10 ** 18
CONTRACT = "contracts/lexitreasury.py"
CONSTITUTION = "Fund ACTIVE, OSI-licensed projects. On-chain audits qualify for TIER_1."
CAP_1, CAP_2, CAP_3 = 100_000 * ATTO, 50_000 * ATTO, 10_000 * ATTO

GH_URL = "https://github.com/test-owner/test-repo"
OWNER, REPO = "test-owner", "test-repo"
LLM_ANCHOR = r".*governance engine for LexiTreasury.*"
DEFAULT_AUTHORS = ("alice", "bob", "carol", "dave")


# ---------------------------------------------------------------------------
# Mock helpers (self-contained)
# ---------------------------------------------------------------------------

def _commits_body(n, authors=DEFAULT_AUTHORS, bots=False):
    out = []
    for i in range(n):
        if bots:
            out.append({"sha": f"c{i}", "author": {"login": "renovate[bot]", "type": "Bot"},
                        "commit": {"author": {"name": "renovate[bot]", "email": "b@x"}}})
        else:
            who = authors[i % len(authors)]
            out.append({"sha": f"c{i}", "author": {"login": who, "type": "User"},
                        "commit": {"author": {"name": who, "email": f"{who}@x"}}})
    return json.dumps(out)


def mock_repo(vm, spdx="MIT", status=200):
    vm.mock_web(rf".*api\.github\.com/repos/{OWNER}/{REPO}$",
                {"status": status, "body": json.dumps(
                    {"license": {"spdx_id": spdx}, "topics": [], "owner": {"login": OWNER}})})


def mock_commits(vm, count=50, veteran=False, authors=DEFAULT_AUTHORS, status=200):
    vm.mock_web(rf".*api\.github\.com/repos/{OWNER}/{REPO}/commits\?per_page=100",
                {"status": status, "body": _commits_body(min(count, 100), authors)})
    if count >= 100 and status == 200:
        vm.mock_web(rf".*api\.github\.com/repos/{OWNER}/{REPO}/commits\?per_page=1&page=500",
                    {"status": 200, "body": json.dumps([{"sha": "p"}] if veteran else [])})


def mock_contents(vm, status=200):
    vm.mock_web(rf".*api\.github\.com/repos/{OWNER}/{REPO}/contents",
                {"status": status, "body": json.dumps(
                    [{"name": "tests", "type": "dir"}, {"name": ".github", "type": "dir"},
                     {"name": "package.json", "type": "file"}])})


def mock_maintainer(vm, present=True, payout_address=None, status=200, body=None):
    url = rf".*raw\.githubusercontent\.com/{OWNER}/{REPO}/HEAD/\.well-known/genlayer-treasury\.json"
    if not present:
        vm.mock_web(url, {"status": 404, "body": "nf"})
        return
    if body is None:
        body = json.dumps({"owner": OWNER, "payout_address": str(payout_address)})
    vm.mock_web(url, {"status": status, "body": body})


def mock_audit_absent(vm):
    vm.mock_web(rf".*raw\.githubusercontent\.com/{OWNER}/{REPO}/HEAD/\.well-known/genlayer-audit\.json",
                {"status": 404, "body": "nf"})


def mock_llm(vm, decision="APPROVED", reasoning="ok", body=None):
    vm._review_response = body if body is not None else json.dumps(
        {"decision": decision, "reasoning": reasoning})


def setup(vm, recipient, commit_count=50, veteran=False, authors=DEFAULT_AUTHORS,
          spdx="MIT", decision="APPROVED", reasoning="ok", maintainer_present=True,
          llm_body=None):
    mock_repo(vm, spdx=spdx)
    mock_commits(vm, count=commit_count, veteran=veteran, authors=authors)
    mock_contents(vm)
    mock_audit_absent(vm)
    mock_maintainer(vm, present=maintainer_present, payout_address=str(recipient))
    mock_llm(vm, decision=decision, reasoning=reasoning, body=llm_body)


@pytest.fixture
def treasury(direct_vm, direct_deploy, direct_owner, monkeypatch):
    direct_vm.warp("2030-01-01T00:00:00Z")
    direct_vm.sender = direct_owner
    # These consensus and failure-path cases assert strict manifest binding.
    contract = direct_deploy(CONTRACT, CONSTITUTION, CAP_1, CAP_2, CAP_3)
    import genlayer as gl
    from _clock import follow_vm_clock
    follow_vm_clock(monkeypatch, direct_vm)
    monkeypatch.setattr(gl.nondet, "exec_prompt", lambda _prompt, **_kwargs: json.loads(
        getattr(direct_vm, "_review_response", '{"decision":"APPROVED","reasoning":"ok"}')))
    return contract


def _evaluate_as_leader(direct_vm, treasury, applicant, **leader_state):
    """Submit + evaluate under one environment (the leader's view). Leaves mocks active
    so a follow-up validator run can be simulated with a swapped environment."""
    setup(direct_vm, applicant, **leader_state)
    direct_vm.sender = applicant
    grant_id = _submit_grant(treasury, direct_vm, applicant, 1_000 * ATTO)
    treasury.evaluate_grant(grant_id)
    return grant_id


def _submit_grant(treasury, direct_vm, applicant, amount=1_000 * ATTO):
    direct_vm.sender = applicant
    plan = [{"title": "Consensus check", "criteria": "Repository qualifies under policy.",
             "amount": str(amount), "deadline": 2051222400}]
    return treasury.create_grant("Consensus check", GH_URL, str(applicant), json.dumps(plan))


def _validator_sees(direct_vm, applicant, **validator_state):
    """Swap the mocked environment to what a validator observes, then re-run the captured
    validator against the leader's stored result. Returns the validator's attestation bool."""
    direct_vm.clear_mocks()
    setup(direct_vm, applicant, **validator_state)
    verdict = direct_vm.run_validator()
    direct_vm.clear_mocks()
    return verdict


# ===========================================================================
# 1. Invariant bucketing absorbs benign metric variance
# ===========================================================================

class TestBucketingAbsorbsVariance:
    def test_commit_drift_within_bracket_holds_consensus(self, direct_vm, treasury, direct_alice):
        """Leader sees 50 commits, validator sees 60 - both ACTIVE, so consensus holds."""
        _evaluate_as_leader(direct_vm, treasury, direct_alice, commit_count=50)
        assert _validator_sees(direct_vm, direct_alice, commit_count=60) is True

    def test_wide_drift_same_bracket_holds(self, direct_vm, treasury, direct_alice):
        """10 vs 99 commits are far apart numerically but both ACTIVE -> still agree."""
        _evaluate_as_leader(direct_vm, treasury, direct_alice, commit_count=10)
        assert _validator_sees(direct_vm, direct_alice, commit_count=99) is True

    def test_contributor_drift_within_bracket_holds(self, direct_vm, treasury, direct_alice):
        """2 vs 3 distinct authors are both CONTRIB_SMALL -> consensus holds."""
        _evaluate_as_leader(direct_vm, treasury, direct_alice, authors=("a", "b"))
        assert _validator_sees(direct_vm, direct_alice, authors=("a", "b", "c")) is True

    def test_llm_reasoning_variance_is_tolerated(self, direct_vm, treasury, direct_alice):
        """Same verdict, different prose - reasoning is excluded from consensus."""
        _evaluate_as_leader(direct_vm, treasury, direct_alice,
                            decision="APPROVED", reasoning="clause 1 satisfied")
        assert _validator_sees(direct_vm, direct_alice,
                               decision="APPROVED", reasoning="entirely different wording") is True


# ===========================================================================
# 2. Genuine disagreements force node rotation (validator refuses to attest)
# ===========================================================================

class TestGenuineDisagreementRotates:
    def test_commit_bracket_boundary_crossing_diverges(self, direct_vm, treasury, direct_alice):
        """99 (ACTIVE) vs 100 (MATURE) crosses a bracket -> validator refuses -> rotation."""
        _evaluate_as_leader(direct_vm, treasury, direct_alice, commit_count=99)
        assert _validator_sees(direct_vm, direct_alice, commit_count=100) is False

    def test_contributor_bracket_crossing_diverges(self, direct_vm, treasury, direct_alice):
        """3 authors (SMALL) vs 4 (TEAM) is a real bracket change -> divergence."""
        _evaluate_as_leader(direct_vm, treasury, direct_alice, authors=("a", "b", "c"))
        assert _validator_sees(direct_vm, direct_alice, authors=("a", "b", "c", "d")) is False

    def test_licence_flip_diverges(self, direct_vm, treasury, direct_alice):
        """OSI vs non-OSI licence flips is_osi_approved -> divergence."""
        _evaluate_as_leader(direct_vm, treasury, direct_alice, spdx="MIT")
        assert _validator_sees(direct_vm, direct_alice, spdx="PROPRIETARY") is False

    def test_maintainer_flip_diverges(self, direct_vm, treasury, direct_alice):
        """Leader verifies the maintainer, validator cannot fetch the manifest -> divergence."""
        _evaluate_as_leader(direct_vm, treasury, direct_alice, maintainer_present=True)
        assert _validator_sees(direct_vm, direct_alice, maintainer_present=False) is False

    def test_llm_verdict_flip_forces_rotation(self, direct_vm, treasury, direct_alice):
        """Leader APPROVED, validator REJECTED -> the validator refuses to attest."""
        _evaluate_as_leader(direct_vm, treasury, direct_alice, decision="APPROVED")
        assert _validator_sees(direct_vm, direct_alice, decision="REJECTED") is False

    def test_malformed_validator_llm_forces_rotation(self, direct_vm, treasury, direct_alice):
        """A validator whose LLM returns no decision key errors out -> rotation, never a silent pass."""
        _evaluate_as_leader(direct_vm, treasury, direct_alice, decision="APPROVED")
        bad = json.dumps({"verdict": "sure"})  # missing 'decision' -> [LLM_ERROR] on rerun
        assert _validator_sees(direct_vm, direct_alice, llm_body=bad) is False


# ===========================================================================
# 3. mock_web edge cases: GitHub error classification + fail-closed maintainer path
# ===========================================================================

class TestWebEdgeCases:
    @pytest.mark.parametrize("status, prefix", [
        (403, "[TRANSIENT]"),   # rate limited
        (429, "[TRANSIENT]"),   # rate limited
        (500, "[TRANSIENT]"),   # server error
        (404, "[EXTERNAL]"),    # deterministic not-found
    ])
    def test_repo_status_classification(self, direct_vm, treasury, direct_alice, status, prefix):
        direct_vm.sender = direct_alice
        pid = _submit_grant(treasury, direct_vm, direct_alice)
        mock_repo(direct_vm, status=status)
        with direct_vm.expect_revert(prefix):
            treasury.evaluate_grant(pid)
        direct_vm.clear_mocks()

    def test_malformed_repo_json_is_definitive_and_leaves_draft(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        pid = _submit_grant(treasury, direct_vm, direct_alice)
        direct_vm.mock_web(rf".*api\.github\.com/repos/{OWNER}/{REPO}$",
                           {"status": 200, "body": "{ broken json"})
        with direct_vm.expect_revert("[EXTERNAL]"):
            treasury.evaluate_grant(pid)
        assert treasury.get_grant(pid)["status"] == "DRAFT"
        direct_vm.clear_mocks()

    @pytest.mark.parametrize("status, prefix", [(404, "[EXTERNAL]"), (500, "[TRANSIENT]")])
    def test_commit_history_error_classification(self, direct_vm, treasury, direct_alice, status, prefix):
        mock_repo(direct_vm)
        mock_commits(direct_vm, count=50, status=status)
        mock_contents(direct_vm)
        mock_audit_absent(direct_vm)
        mock_maintainer(direct_vm, payout_address=str(direct_alice))
        mock_llm(direct_vm)
        direct_vm.sender = direct_alice
        grant_id = _submit_grant(treasury, direct_vm, direct_alice)
        with direct_vm.expect_revert(prefix):
            treasury.evaluate_grant(grant_id)
        direct_vm.clear_mocks()

    def test_llm_unexpected_keys_raise_llm_error(self, direct_vm, treasury, direct_alice):
        direct_vm.sender = direct_alice
        pid = _submit_grant(treasury, direct_vm, direct_alice)
        mock_repo(direct_vm)
        mock_commits(direct_vm, count=50)
        mock_contents(direct_vm)
        mock_audit_absent(direct_vm)
        mock_maintainer(direct_vm, present=False)
        mock_llm(direct_vm, body=json.dumps({"unexpected": "shape"}))
        with direct_vm.expect_revert("[LLM_ERROR]"):
            treasury.evaluate_grant(pid)
        direct_vm.clear_mocks()

    @pytest.mark.parametrize("kind", ["server_error", "rate_limited", "malformed", "missing_field"])
    def test_maintainer_fetch_distinguishes_transient_errors_from_unverified_claims(
        self, direct_vm, treasury, direct_alice, kind,
    ):
        """Transient failures leave the draft retryable; malformed/missing claims fail closed."""
        direct_vm.sender = direct_alice
        pid = _submit_grant(treasury, direct_vm, direct_alice)
        mock_repo(direct_vm)
        mock_commits(direct_vm, count=50)
        mock_contents(direct_vm)
        mock_audit_absent(direct_vm)
        url = rf".*raw\.githubusercontent\.com/{OWNER}/{REPO}/HEAD/\.well-known/genlayer-treasury\.json"
        if kind == "server_error":
            direct_vm.mock_web(url, {"status": 500, "body": "boom"})
        elif kind == "rate_limited":
            direct_vm.mock_web(url, {"status": 429, "body": "slow down"})
        elif kind == "malformed":
            direct_vm.mock_web(url, {"status": 200, "body": "{ not json"})
        else:  # missing_field
            direct_vm.mock_web(url, {"status": 200, "body": json.dumps({"owner": OWNER})})
        mock_llm(direct_vm, decision="APPROVED")

        if kind in ("server_error", "rate_limited"):
            with direct_vm.expect_revert("[TRANSIENT]"):
                treasury.evaluate_grant(pid)
            assert treasury.get_grant(pid)["status"] == "DRAFT"
            return

        treasury.evaluate_grant(pid)
        direct_vm.clear_mocks()
        p = treasury.get_grant(pid)
        assert p["status"] == "REJECTED"
        assert p["maintainer_verified"] == "false"


# ===========================================================================
# 4. warp(): block-time progression is not a consensus input
# ===========================================================================

class TestBlockTimeProgression:
    def test_evaluation_is_time_invariant(self, direct_vm, treasury, direct_alice):
        """The same proposal evaluated at two very different block times yields identical
        consensus fields - the clock cannot cause intermittent consensus failures."""
        fields = ("status", "tier", "commit_bracket", "contributor_bracket",
                  "quality_bracket", "is_osi_approved", "has_audit", "maintainer_verified")

        direct_vm.warp("2026-01-01T00:00:00Z")
        direct_vm.sender = direct_alice
        setup(direct_vm, direct_alice, commit_count=50)
        pid1 = _submit_grant(treasury, direct_vm, direct_alice)
        treasury.evaluate_grant(pid1)
        direct_vm.clear_mocks()
        early = treasury.get_grant(pid1)

        direct_vm.warp("2031-12-31T23:59:59Z")   # years later
        direct_vm.sender = direct_alice
        setup(direct_vm, direct_alice, commit_count=50)
        pid2 = _submit_grant(treasury, direct_vm, direct_alice)
        treasury.evaluate_grant(pid2)
        direct_vm.clear_mocks()
        late = treasury.get_grant(pid2)

        for f in fields:
            assert early[f] == late[f], f"time affected consensus field {f!r}"

    def test_value_flows_work_after_time_warp(self, direct_vm, treasury, direct_owner, direct_alice, monkeypatch):
        """Deposit -> evaluate -> fund -> adjudicate -> release -> withdraw after a time warp."""
        direct_vm.warp("2030-06-15T12:00:00Z")

        direct_vm.sender = direct_owner
        direct_vm.value = 3_000 * ATTO
        treasury.deposit()
        direct_vm.value = 0

        direct_vm.sender = direct_alice
        setup(direct_vm, direct_alice, commit_count=50)
        pid = _submit_grant(treasury, direct_vm, direct_alice, 3_000 * ATTO)
        treasury.evaluate_grant(pid)
        direct_vm.clear_mocks()
        assert treasury.get_grant(pid)["status"] == "APPROVED"
        direct_vm.sender = direct_owner
        treasury.fund_grant(pid)
        sha = "a" * 40
        direct_vm.sender = direct_alice
        treasury.submit_evidence(pid, f"{GH_URL}/commit/{sha}")
        direct_vm.mock_web(rf".*api\.github\.com/repos/{OWNER}/{REPO}/commits/{sha}$", {
            "status": 200, "body": json.dumps({"sha": sha,
                "author": {"login": OWNER},
                "commit": {"message": "Repository milestone delivery", "author": {"date": "2030-06-16T00:00:00Z"}},
                "files": [{"filename": "tests/test_delivery.py", "status": "added", "additions": 5,
                           "deletions": 0, "patch": "+assert delivery"}]}),
        })
        import genlayer as gl
        monkeypatch.setattr(gl.nondet, "exec_prompt", lambda _prompt, **_kwargs: {
            "decision": "APPROVE", "reason_code": "CRITERIA_MET", "summary": "Tests prove completion.",
        })
        direct_vm.sender = direct_owner
        treasury.adjudicate(pid)
        treasury.release_tranche(pid)
        direct_vm.sender = direct_alice
        assert treasury.withdraw() == 3_000 * ATTO
        assert treasury.get_total_escrowed() == 0
