"""
LexiTreasury - Parametrized Boundary Regression Suite

Locks in every domain-specific threshold and bracket boundary in the protocol by
calling the contract's pure, module-level decision functions DIRECTLY - with no VM
fixture, no mocks, and no consensus round-trip. These are the deterministic invariants
every validator must reproduce byte-for-byte, so pinning them here catches any silent
drift in a threshold the instant it happens.

The real contract module is loaded once (module scope) via gltest's loader so the
assertions run against the shipped implementation, not a re-implementation of it.
"""

import sys
from pathlib import Path

import pytest

CONTRACT_PATH = Path(__file__).resolve().parents[2] / "contracts" / "lexitreasury.py"


def _load_lexi_module():
    """Load the contract module and return it for direct access to module-level helpers.

    Uses gltest's own loader machinery (WASI mock + SDK path setup + message injection)
    so importing `class LexiTreasury(gl.Contract)` succeeds outside a live call, then
    hands back the module object whose pure functions we exercise directly.
    """
    from gltest.direct.vm import VMContext
    from gltest.direct.loader import load_contract_class, create_address

    vm = VMContext()
    vm.sender = create_address("boundary_probe")
    cls = load_contract_class(CONTRACT_PATH, vm)
    module = sys.modules[cls.__module__]

    # This out-of-band load registers the contract in the SDK's process-global
    # single-contract guard. Clear it so subsequent direct_deploy() calls in the same
    # session can register their own freshly-imported class without a false collision.
    try:
        import genlayer.contract as _gc
        _gc.__known_contract__ = None
    except Exception:
        pass

    return module


@pytest.fixture(scope="module")
def lexi():
    return _load_lexi_module()


# ===========================================================================
# 1. Commit-count -> commit bracket boundaries
# ===========================================================================

@pytest.mark.parametrize("count, expected", [
    (0,      "NONE"),
    (1,      "MINIMAL"),
    (9,      "MINIMAL"),     # upper edge of MINIMAL
    (10,     "ACTIVE"),      # lower edge of ACTIVE
    (99,     "ACTIVE"),      # upper edge of ACTIVE
    (100,    "MATURE"),      # lower edge of MATURE
    (499,    "MATURE"),      # upper edge of MATURE
    (500,    "VETERAN"),     # lower edge of VETERAN
    (10_000, "VETERAN"),
])
def test_commit_bracket_boundaries(lexi, count, expected):
    assert lexi._count_to_bracket(count) == expected


# ===========================================================================
# 2. Distinct-contributor -> contributor bracket boundaries
# ===========================================================================

def _commit(login, kind="User"):
    return {"sha": "x", "author": {"login": login, "type": kind},
            "commit": {"author": {"name": login, "email": f"{login}@x"}}}


@pytest.mark.parametrize("logins, expected", [
    ([],                                  "CONTRIB_NONE"),
    (["solo"],                            "CONTRIB_SOLO"),
    (["a", "a", "a"],                     "CONTRIB_SOLO"),   # same author repeated
    (["a", "b"],                          "CONTRIB_SMALL"),  # lower edge SMALL
    (["a", "b", "c"],                     "CONTRIB_SMALL"),  # upper edge SMALL
    (["a", "b", "c", "d"],                "CONTRIB_TEAM"),   # lower edge TEAM
    (["a", "b", "c", "d", "e", "f"],      "CONTRIB_TEAM"),
])
def test_contributor_bracket_boundaries(lexi, logins, expected):
    page = [_commit(l) for l in logins]
    assert lexi._contributor_bracket(page) == expected


def test_bot_only_history_collapses_to_bot(lexi):
    page = [_commit("dependabot[bot]", kind="Bot") for _ in range(20)]
    assert lexi._contributor_bracket(page) == "CONTRIB_BOT"


def test_mixed_bot_and_human_counts_only_humans(lexi):
    page = [_commit("renovate[bot]", kind="Bot"), _commit("alice"), _commit("bob")]
    assert lexi._contributor_bracket(page) == "CONTRIB_SMALL"


# ===========================================================================
# 3. Structural-signal count -> quality bracket boundaries
# ===========================================================================

@pytest.mark.parametrize("tests, ci, manifest, expected", [
    (False, False, False, "QUALITY_NONE"),
    (True,  False, False, "QUALITY_BASIC"),
    (False, True,  False, "QUALITY_BASIC"),
    (False, False, True,  "QUALITY_BASIC"),
    (True,  True,  False, "QUALITY_STANDARD"),
    (True,  False, True,  "QUALITY_STANDARD"),
    (True,  True,  True,  "QUALITY_STRONG"),
])
def test_quality_bracket_boundaries(lexi, tests, ci, manifest, expected):
    signals = {"has_tests": tests, "has_ci": ci, "has_build_manifest": manifest}
    assert lexi._quality_bracket(signals) == expected


# ===========================================================================
# 4. Full tier decision table (every input combination is locked)
# ===========================================================================

class TestTierDecisionTable:
    BRACKETS = ("NONE", "MINIMAL", "ACTIVE", "MATURE", "VETERAN")
    QUALITIES = ("QUALITY_NONE", "QUALITY_BASIC", "QUALITY_STANDARD", "QUALITY_STRONG")
    CONTRIBS = ("CONTRIB_NONE", "CONTRIB_BOT", "CONTRIB_SOLO", "CONTRIB_SMALL", "CONTRIB_TEAM")

    def test_zero_commits_never_funds(self, lexi):
        for osi in (True, False):
            for audit in (True, False):
                assert lexi._compute_tier("NONE", osi, audit, "QUALITY_STRONG", "CONTRIB_TEAM") == ""

    def test_bot_history_never_funds(self, lexi):
        for bracket in self.BRACKETS:
            assert lexi._compute_tier(bracket, True, True, "QUALITY_STRONG", "CONTRIB_BOT") == ""

    def test_no_structural_quality_never_funds(self, lexi):
        for bracket in ("MINIMAL", "ACTIVE", "MATURE", "VETERAN"):
            assert lexi._compute_tier(bracket, True, True, "QUALITY_NONE", "CONTRIB_TEAM") == ""

    @pytest.mark.parametrize("bracket, osi, audit, quality, contrib, expected", [
        # TIER_1 requires MATURE+/OSI/audit/STANDARD+/multi-contributor together.
        ("VETERAN", True,  True,  "QUALITY_STRONG",   "CONTRIB_TEAM",  "TIER_1"),
        ("MATURE",  True,  True,  "QUALITY_STANDARD", "CONTRIB_SMALL", "TIER_1"),
        # Solo author caps at TIER_2 even with everything else maxed.
        ("VETERAN", True,  True,  "QUALITY_STRONG",   "CONTRIB_SOLO",  "TIER_2"),
        # STANDARD-quality gate for TIER_1: only BASIC quality -> TIER_2.
        ("VETERAN", True,  True,  "QUALITY_BASIC",    "CONTRIB_TEAM",  "TIER_2"),
        # MATURE/VETERAN with only one of OSI/audit -> TIER_2.
        ("VETERAN", True,  False, "QUALITY_STRONG",   "CONTRIB_TEAM",  "TIER_2"),
        ("VETERAN", False, True,  "QUALITY_STRONG",   "CONTRIB_TEAM",  "TIER_2"),
        # MATURE/VETERAN with neither -> TIER_3.
        ("VETERAN", False, False, "QUALITY_STRONG",   "CONTRIB_TEAM",  "TIER_3"),
        # ACTIVE: OSI -> TIER_2, otherwise TIER_3.
        ("ACTIVE",  True,  False, "QUALITY_BASIC",    "CONTRIB_SOLO",  "TIER_2"),
        ("ACTIVE",  False, False, "QUALITY_BASIC",    "CONTRIB_SOLO",  "TIER_3"),
        # MINIMAL with valid structure -> TIER_3 regardless of licence/audit.
        ("MINIMAL", True,  True,  "QUALITY_STRONG",   "CONTRIB_TEAM",  "TIER_3"),
    ])
    def test_tier_decision_points(self, lexi, bracket, osi, audit, quality, contrib, expected):
        assert lexi._compute_tier(bracket, osi, audit, quality, contrib) == expected

    def test_full_space_is_total_and_stable(self, lexi):
        """Every input combination yields a valid, repeatable tier (no gaps, no flakiness)."""
        valid = {"", "TIER_1", "TIER_2", "TIER_3"}
        for bracket in self.BRACKETS:
            for osi in (True, False):
                for audit in (True, False):
                    for quality in self.QUALITIES:
                        for contrib in self.CONTRIBS:
                            first = lexi._compute_tier(bracket, osi, audit, quality, contrib)
                            assert first in valid
                            assert first == lexi._compute_tier(bracket, osi, audit, quality, contrib)


# ===========================================================================
# 5. Address normalisation + maintainer binding boundaries
# ===========================================================================

@pytest.mark.parametrize("raw, expected", [
    ("0x" + "aB" * 20, "0x" + "ab" * 20),   # checksum casing -> lowercase
    ("0x" + "00" * 20, "0x" + "00" * 20),
    ("0x" + "ff" * 20, "0x" + "ff" * 20),
    (("0x" + "ab" * 20).upper().replace("0X", "0x"), "0x" + "ab" * 20),
    ("0x" + "ab" * 19, ""),                 # too short
    ("0x" + "ab" * 21, ""),                 # too long
    ("0x" + "zz" * 20, ""),                 # non-hex
    ("not-an-address", ""),
    ("", ""),
])
def test_normalize_address_boundaries(lexi, raw, expected):
    assert lexi._normalize_address(raw) == expected


@pytest.mark.parametrize("hex_in, expected", [
    ("a" * 64,              "a" * 64),
    ("A" * 64,              "a" * 64),      # uppercase normalised
    ("  " + "b" * 64 + " ", "b" * 64),      # whitespace stripped
    ("a" * 63,              ""),            # too short
    ("a" * 65,              ""),            # too long
    ("g" * 64,              ""),            # non-hex
])
def test_sanitize_hex64_boundaries(lexi, hex_in, expected):
    assert lexi._sanitize_hex64(hex_in) == expected


class TestMaintainerVerification:
    ADDR = "0x" + "ab" * 20

    def _claim(self, owner="acme", payout=ADDR):
        return {"declared_owner": owner, "payout_address": payout}

    def test_all_bindings_aligned_verifies(self, lexi):
        assert lexi._verify_maintainer(self._claim(), "acme", "acme", self.ADDR) is True

    def test_case_insensitive_owner_match(self, lexi):
        # declared_owner is lowercased upstream; api/url owners compared case-insensitively.
        assert lexi._verify_maintainer(self._claim(owner="acme"), "ACME", "Acme", self.ADDR) is True

    def test_missing_payout_fails(self, lexi):
        assert lexi._verify_maintainer(self._claim(payout=""), "acme", "acme", self.ADDR) is False

    def test_url_owner_mismatch_fails(self, lexi):
        assert lexi._verify_maintainer(self._claim(), "someone-else", "acme", self.ADDR) is False

    def test_declared_owner_mismatch_fails(self, lexi):
        assert lexi._verify_maintainer(self._claim(owner="impostor"), "acme", "acme", self.ADDR) is False

    def test_recipient_mismatch_fails(self, lexi):
        other = "0x" + "cd" * 20
        assert lexi._verify_maintainer(self._claim(), "acme", "acme", other) is False

    def test_empty_api_login_fails(self, lexi):
        assert lexi._verify_maintainer(self._claim(), "acme", "", self.ADDR) is False


# ===========================================================================
# 6. GitHub URL parsing boundaries
# ===========================================================================

@pytest.mark.parametrize("url, owner, repo", [
    ("https://github.com/foo/bar",       "foo", "bar"),
    ("https://github.com/foo/bar/",      "foo", "bar"),
    ("https://github.com/foo/bar.git",   "foo", "bar"),
    ("http://github.com/Foo/Bar",        "Foo", "Bar"),   # casing preserved
    ("git@github.com/foo/bar",           "foo", "bar"),
])
def test_parse_github_url_valid(lexi, url, owner, repo):
    assert lexi._parse_github_url(url) == (owner, repo)


def test_parse_github_url_unparseable_raises_expected(lexi):
    with pytest.raises(Exception) as exc:
        lexi._parse_github_url("noslash")
    assert "[EXPECTED]" in str(exc.value)
