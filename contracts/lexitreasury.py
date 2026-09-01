# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
from dataclasses import dataclass
import json
import re

# ---------------------------------------------------------------------------
# Error classification prefixes
# ---------------------------------------------------------------------------
_ERR_EXPECTED  = "[EXPECTED]"   # Deterministic business logic — validators must match exactly
_ERR_EXTERNAL  = "[EXTERNAL]"   # Deterministic 4xx from GitHub — validators must match exactly
_ERR_TRANSIENT = "[TRANSIENT]"  # Network / 5xx — agree if both sides hit transient failure
_ERR_LLM       = "[LLM_ERROR]"  # LLM misbehaved — always disagree to force node rotation

# ---------------------------------------------------------------------------
# Protocol constants
# ---------------------------------------------------------------------------
ATTO: int = 10 ** 18  # 1 token = 10^18 attos (cross-chain standard for u256 money math)

TIER_1: str = "TIER_1"  # Top tier: MATURE/VETERAN + OSI license + audit
TIER_2: str = "TIER_2"  # Mid tier:  ACTIVE+      + OSI license or audit
TIER_3: str = "TIER_3"  # Base tier: MINIMAL+     + any license

STATUS_PENDING:  str = "PENDING"
STATUS_APPROVED: str = "APPROVED"
STATUS_REJECTED: str = "REJECTED"
STATUS_FUNDED:   str = "FUNDED"

DECISION_APPROVED: str = "APPROVED"
DECISION_REJECTED: str = "REJECTED"

# Commit count brackets — invariant buckets that absorb count drift between validator calls
BRACKET_NONE:    str = "NONE"     # 0 commits
BRACKET_MINIMAL: str = "MINIMAL"  # 1-9
BRACKET_ACTIVE:  str = "ACTIVE"   # 10-99
BRACKET_MATURE:  str = "MATURE"   # 100-499
BRACKET_VETERAN: str = "VETERAN"  # 500+

# OSI-approved SPDX identifiers (lowercase for case-insensitive matching)
_OSI_LICENSES: frozenset = frozenset({
    "mit", "apache-2.0", "gpl-2.0", "gpl-3.0",
    "lgpl-2.0", "lgpl-2.1", "lgpl-3.0", "agpl-3.0",
    "bsd-2-clause", "bsd-3-clause", "isc", "mpl-2.0",
    "cc0-1.0", "unlicense", "eupl-1.1", "eupl-1.2", "epl-2.0",
})

# Standard GitHub API request headers
_GH_HEADERS: dict = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "LexiTreasury/1.0",
}

# ---------------------------------------------------------------------------
# Storage dataclass
# ---------------------------------------------------------------------------

@allow_storage
@dataclass
class Proposal:
    """On-chain record for a single funding proposal."""
    proposal_id:          str
    github_url:           str
    applicant:            str    # Address serialised as hex string
    requested_amount:     u256   # In attos
    status:               str    # STATUS_* constant
    tier:                 str    # TIER_1 / TIER_2 / TIER_3 / ""
    allocated_amount:     u256   # Effective funding cap applied at evaluation time
    commit_bracket:       str    # BRACKET_* constant (set after evaluation)
    license_spdx:         str    # Raw SPDX ID from GitHub, "" if none
    is_osi_approved:      str    # "true" / "false"
    has_audit:            str    # "true" / "false"
    evaluation_decision:  str    # DECISION_APPROVED / DECISION_REJECTED / ""
    evaluation_reasoning: str    # LLM reasoning excerpt (informational only)
    submitted_at:         str    # ISO-8601 block timestamp placeholder

# ---------------------------------------------------------------------------
# Module-level helpers (invoked from inside the nondet leader / validator blocks)
# ---------------------------------------------------------------------------

def _parse_github_url(url: str) -> tuple:
    """Return (owner, repo) from any GitHub URL variant. Raises EXPECTED on parse failure."""
    url = url.rstrip("/")
    match = re.search(r"github\.com/([^/\s]+)/([^/\s]+?)(?:\.git)?$", url)
    if match:
        return match.group(1), match.group(2)
    parts = url.split("/")
    if len(parts) >= 2:
        owner = parts[-2]
        repo  = parts[-1].replace(".git", "")
        return owner, repo
    raise gl.vm.UserError(f"{_ERR_EXPECTED} Cannot parse GitHub URL: {url!r}")


def _count_to_bracket(n: int) -> str:
    """Map a raw commit count to its invariant bracket constant."""
    if n == 0:
        return BRACKET_NONE
    if n < 10:
        return BRACKET_MINIMAL
    if n < 100:
        return BRACKET_ACTIVE
    if n < 500:
        return BRACKET_MATURE
    return BRACKET_VETERAN


def _fetch_commit_bracket(owner: str, repo: str) -> str:
    """Fetch commit activity from GitHub and return a stable bracket string.

    Uses two API calls at most:
      1. Page 1 of commits (per_page=100) to determine lower bounds.
      2. A probe at page 500 (per_page=1) to distinguish MATURE from VETERAN.
    """
    url_p1 = f"https://api.github.com/repos/{owner}/{repo}/commits?per_page=100"
    resp1 = gl.nondet.web.get(url_p1, headers=_GH_HEADERS)

    if resp1.status == 409:
        return BRACKET_NONE  # GitHub returns 409 for empty repositories
    if resp1.status in (403, 429):
        raise gl.vm.UserError(f"{_ERR_TRANSIENT} GitHub rate limit ({resp1.status})")
    if resp1.status >= 500:
        raise gl.vm.UserError(f"{_ERR_TRANSIENT} GitHub API unavailable ({resp1.status})")
    if resp1.status == 404:
        raise gl.vm.UserError(f"{_ERR_EXTERNAL} Repository not found")
    if resp1.status != 200:
        raise gl.vm.UserError(f"{_ERR_EXTERNAL} GitHub commits API returned {resp1.status}")

    try:
        page1 = json.loads(resp1.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise gl.vm.UserError(f"{_ERR_TRANSIENT} Malformed JSON from GitHub commits API")

    if not isinstance(page1, list):
        return BRACKET_MINIMAL

    count1 = len(page1)
    if count1 < 100:
        return _count_to_bracket(count1)

    # Page 1 is full (>=100 commits). Probe page 500 to distinguish MATURE vs VETERAN.
    url_probe = f"https://api.github.com/repos/{owner}/{repo}/commits?per_page=1&page=500"
    resp_probe = gl.nondet.web.get(url_probe, headers=_GH_HEADERS)

    if resp_probe.status == 200:
        try:
            probe = json.loads(resp_probe.body.decode("utf-8"))
            if isinstance(probe, list) and len(probe) > 0:
                return BRACKET_VETERAN
        except (ValueError, UnicodeDecodeError):
            pass  # Probe inconclusive — fall through to MATURE

    return BRACKET_MATURE


def _detect_audit_artifacts(owner: str, repo: str, repo_topics: list) -> bool:
    """Return True if the repository contains recognisable audit indicators.

    Checks:
      - GitHub repository topics (e.g. "audited", "security-audit")
      - Files and directories in the repo root via the GitHub Contents API
    """
    # Fast path: topic-based check (no extra API call; data already fetched)
    audit_topic_words = {"audit", "audited", "security-audit", "sec-audit", "pentest"}
    if any(any(w in str(t).lower() for w in audit_topic_words) for t in repo_topics):
        return True

    # Scan repo root via Contents API
    url = f"https://api.github.com/repos/{owner}/{repo}/contents"
    resp = gl.nondet.web.get(url, headers=_GH_HEADERS)

    if resp.status != 200:
        return False  # Conservative: unknown state counts as no audit

    try:
        items = json.loads(resp.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return False

    if not isinstance(items, list):
        return False

    _AUDIT_STEMS = {"audit", "audits", "security-audit", "sec-audit", "pentest", "security"}

    for item in items:
        if not isinstance(item, dict):
            continue
        raw_name: str  = item.get("name", "")
        item_type: str = item.get("type", "")
        name_lower = raw_name.lower().strip()

        # Directory named "audits" is a strong signal
        if name_lower == "audits" and item_type == "dir":
            return True

        # File whose name starts with an audit stem
        stem = name_lower.split(".")[0]
        if stem in _AUDIT_STEMS:
            return True

    return False


def _fetch_repo_metrics(github_url: str) -> dict:
    """Fetch and normalise GitHub repository metrics. Must run inside a nondet context."""
    owner, repo = _parse_github_url(github_url)

    api_url = f"https://api.github.com/repos/{owner}/{repo}"
    resp = gl.nondet.web.get(api_url, headers=_GH_HEADERS)

    if resp.status == 404:
        raise gl.vm.UserError(f"{_ERR_EXTERNAL} Repository not found: {github_url}")
    if resp.status in (403, 429):
        raise gl.vm.UserError(f"{_ERR_TRANSIENT} GitHub rate limited ({resp.status})")
    if resp.status >= 500:
        raise gl.vm.UserError(f"{_ERR_TRANSIENT} GitHub API unavailable ({resp.status})")
    if resp.status != 200:
        raise gl.vm.UserError(f"{_ERR_EXTERNAL} GitHub repo API returned {resp.status}")

    try:
        repo_data = json.loads(resp.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise gl.vm.UserError(f"{_ERR_TRANSIENT} Malformed JSON from GitHub repo API")

    if not isinstance(repo_data, dict):
        raise gl.vm.UserError(f"{_ERR_TRANSIENT} Unexpected response shape from GitHub")

    # Extract stable license field
    license_block = repo_data.get("license") or {}
    raw_spdx: str = str(license_block.get("spdx_id") or "").strip()
    if raw_spdx in ("NOASSERTION", "N/A", "OTHER", ""):
        license_spdx = ""
    else:
        license_spdx = raw_spdx

    is_osi_approved: bool = license_spdx.lower() in _OSI_LICENSES

    # Topics are returned with the main repo response — reuse for audit detection
    topics: list = repo_data.get("topics") or []

    # Two additional API calls (commits + contents)
    commit_bracket: str = _fetch_commit_bracket(owner, repo)
    has_audit: bool     = _detect_audit_artifacts(owner, repo, topics)

    return {
        "owner":           owner,
        "repo":            repo,
        "license_spdx":    license_spdx,
        "is_osi_approved": is_osi_approved,
        "commit_bracket":  commit_bracket,
        "has_audit":       has_audit,
    }


def _run_llm_evaluation(constitution: str, github_url: str, metrics: dict) -> tuple:
    """Ask the LLM to evaluate metrics against the DAO constitution.

    Returns (decision: str, reasoning: str).
    Raises LLM_ERROR on malformed response; raises EXPECTED on invalid decision value.
    """
    bracket_legend = (
        "NONE=0 commits, MINIMAL=1-9, ACTIVE=10-99, MATURE=100-499, VETERAN=500+"
    )
    prompt = (
        "You are the neutral governance engine for LexiTreasury, "
        "a decentralised autonomous treasury on GenLayer.\n"
        "Evaluate whether the following project qualifies for treasury funding "
        f"strictly under the DAO constitution below.\n\n"
        "=== DAO CONSTITUTION ===\n"
        f"{constitution}\n\n"
        f"=== VERIFIED PROJECT METRICS (source: {github_url}) ===\n"
        f"Commit Activity Bracket : {metrics['commit_bracket']}  ({bracket_legend})\n"
        f"License (SPDX)          : {metrics['license_spdx'] or 'None'}\n"
        f"OSI-Approved License    : {metrics['is_osi_approved']}\n"
        f"Security Audit Present  : {metrics['has_audit']}\n\n"
        "=== INSTRUCTIONS ===\n"
        "- Base your decision ONLY on the constitution and the verified metrics above.\n"
        "- Do NOT invent requirements absent from the constitution.\n"
        "- Do NOT approve a project that violates any explicit constitutional requirement.\n"
        "- Cite specific constitution clauses in your reasoning.\n\n"
        'Respond with valid JSON ONLY — no markdown, no extra text:\n'
        '{"decision": "APPROVED" or "REJECTED", '
        '"reasoning": "<concise explanation referencing constitution clauses and specific metrics>"}'
    )

    raw = gl.nondet.exec_prompt(prompt, response_format="json")

    if not isinstance(raw, dict):
        raise gl.vm.UserError(
            f"{_ERR_LLM} Expected dict response, got {type(raw).__name__}"
        )

    decision: str = str(raw.get("decision", "")).strip().upper()
    if decision not in (DECISION_APPROVED, DECISION_REJECTED):
        raise gl.vm.UserError(
            f"{_ERR_LLM} Invalid decision value {decision!r}; "
            f"keys returned: {list(raw.keys())}"
        )

    reasoning: str = str(raw.get("reasoning", "")).strip()[:2048]
    return decision, reasoning


def _compute_tier(commit_bracket: str, is_osi_approved: bool, has_audit: bool) -> str:
    """Map invariant metric brackets to a funding tier. Pure deterministic function — no LLM.

    Tier 1 requirements: MATURE/VETERAN commits + OSI-approved license + audit present
    Tier 2 requirements: ACTIVE or better + OSI-approved license OR audit present
    Tier 3 requirements: MINIMAL or better + any valid license
    No tier (""):       Zero commits — project cannot receive funding
    """
    if commit_bracket in (BRACKET_MATURE, BRACKET_VETERAN):
        if is_osi_approved and has_audit:
            return TIER_1
        if is_osi_approved or has_audit:
            return TIER_2
        return TIER_3

    if commit_bracket == BRACKET_ACTIVE:
        return TIER_2 if is_osi_approved else TIER_3

    if commit_bracket == BRACKET_MINIMAL:
        return TIER_3

    return ""  # BRACKET_NONE — no tier, no allocation


def _handle_leader_error(leaders_res, leader_fn) -> bool:
    """Canonical error handler for the validator when the leader returned an error result."""
    leader_msg: str = getattr(leaders_res, "message", "")
    try:
        leader_fn()
        # Leader errored, validator succeeded — nodes diverged
        return False
    except gl.vm.UserError as exc:
        validator_msg: str = getattr(exc, "message", str(exc))
        # Deterministic errors: both sides must report the identical message
        if (validator_msg.startswith(_ERR_EXPECTED)
                or validator_msg.startswith(_ERR_EXTERNAL)):
            return validator_msg == leader_msg
        # Transient: both hit infrastructure failure — acceptable agreement
        if (validator_msg.startswith(_ERR_TRANSIENT)
                and leader_msg.startswith(_ERR_TRANSIENT)):
            return True
        # LLM or unknown: force consensus retry via node rotation
        return False
    except Exception:
        return False

# ---------------------------------------------------------------------------
# LexiTreasury Contract
# ---------------------------------------------------------------------------

class LexiTreasury(gl.Contract):
    """Decentralised autonomous treasury protocol governed by a natural-language constitution.

    Projects submit GitHub-backed proposals. The protocol fetches live repository metrics —
    commit activity, licence, and audit artefacts — evaluates them against the DAO
    constitution through GenLayer consensus, and produces a binary APPROVED / REJECTED
    outcome with an invariant funding tier that determines the allocation cap.

    Consensus guarantee: validators independently reproduce the full fetch-and-evaluate
    pipeline. Agreement is required on the binary decision, the tier bracket, the commit
    bracket, and the derived boolean licence / audit flags. LLM reasoning is excluded from
    the consensus check to absorb natural language variation without breaking finality.
    """

    # ---- Storage fields — class-level type annotations only ----
    owner:             Address
    constitution:      str
    treasury_balance:  u256       # Gross treasury balance in attos
    proposals:         TreeMap[str, Proposal]
    proposal_ids:      DynArray[str]
    proposal_count:    u256
    tier_cap_1:        u256       # Maximum allocation for TIER_1 proposals, in attos
    tier_cap_2:        u256
    tier_cap_3:        u256

    # ---------------------------------------------------------------
    # Constructor
    # ---------------------------------------------------------------

    def __init__(
        self,
        constitution: str,
        tier_cap_1: int,
        tier_cap_2: int,
        tier_cap_3: int,
    ) -> None:
        """Deploy the LexiTreasury with an initial constitution and per-tier funding caps.

        Args:
            constitution: Natural-language governance rules the DAO constitution.
            tier_cap_1:   Maximum funding for TIER_1 proposals, in attos.
            tier_cap_2:   Maximum funding for TIER_2 proposals, in attos.
            tier_cap_3:   Maximum funding for TIER_3 proposals, in attos.
        """
        if not constitution.strip():
            raise gl.vm.UserError(f"{_ERR_EXPECTED} Constitution cannot be empty")
        if tier_cap_1 < 0 or tier_cap_2 < 0 or tier_cap_3 < 0:
            raise gl.vm.UserError(f"{_ERR_EXPECTED} Tier caps must be non-negative")
        if not (tier_cap_1 >= tier_cap_2 >= tier_cap_3):
            raise gl.vm.UserError(
                f"{_ERR_EXPECTED} Caps must satisfy tier_cap_1 >= tier_cap_2 >= tier_cap_3"
            )

        self.owner             = gl.message.sender_address
        self.constitution      = constitution.strip()
        self.treasury_balance  = u256(0)
        self.proposal_count    = u256(0)
        self.tier_cap_1        = u256(tier_cap_1)
        self.tier_cap_2        = u256(tier_cap_2)
        self.tier_cap_3        = u256(tier_cap_3)

    # ---------------------------------------------------------------
    # View methods
    # ---------------------------------------------------------------

    @gl.public.view
    def get_constitution(self) -> str:
        return self.constitution

    @gl.public.view
    def get_treasury_balance(self) -> int:
        return int(self.treasury_balance)

    @gl.public.view
    def get_proposal_count(self) -> int:
        return int(self.proposal_count)

    @gl.public.view
    def get_tier_caps(self) -> dict:
        return {
            TIER_1: int(self.tier_cap_1),
            TIER_2: int(self.tier_cap_2),
            TIER_3: int(self.tier_cap_3),
        }

    @gl.public.view
    def get_proposal(self, proposal_id: str) -> dict:
        if proposal_id not in self.proposals:
            raise gl.vm.UserError(f"{_ERR_EXPECTED} Unknown proposal: {proposal_id!r}")
        p = self.proposals[proposal_id]
        return {
            "proposal_id":          p.proposal_id,
            "github_url":           p.github_url,
            "applicant":            p.applicant,
            "requested_amount":     int(p.requested_amount),
            "status":               p.status,
            "tier":                 p.tier,
            "allocated_amount":     int(p.allocated_amount),
            "commit_bracket":       p.commit_bracket,
            "license_spdx":         p.license_spdx,
            "is_osi_approved":      p.is_osi_approved,
            "has_audit":            p.has_audit,
            "evaluation_decision":  p.evaluation_decision,
            "evaluation_reasoning": p.evaluation_reasoning,
            "submitted_at":         p.submitted_at,
        }

    @gl.public.view
    def get_all_proposals(self) -> list:
        result = []
        for pid in self.proposal_ids:
            if pid in self.proposals:
                result.append(self.get_proposal(pid))
        return result

    @gl.public.view
    def get_proposals_by_status(self, status: str) -> list:
        valid_statuses = (STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED, STATUS_FUNDED)
        if status not in valid_statuses:
            raise gl.vm.UserError(
                f"{_ERR_EXPECTED} Invalid status {status!r}; valid: {valid_statuses}"
            )
        return [p for p in self.get_all_proposals() if p["status"] == status]

    # ---------------------------------------------------------------
    # Deterministic write methods
    # ---------------------------------------------------------------

    @gl.public.write
    def deposit(self, amount: int) -> None:
        """Add funds to the treasury reserve. Owner-only."""
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(f"{_ERR_EXPECTED} Only the owner can deposit funds")
        if amount <= 0:
            raise gl.vm.UserError(f"{_ERR_EXPECTED} Deposit amount must be positive")
        self.treasury_balance = self.treasury_balance + u256(amount)

    @gl.public.write
    def submit_proposal(self, github_url: str, requested_amount: int) -> str:
        """Submit a funding proposal backed by a GitHub repository.

        Returns the generated proposal ID (e.g. "prop_1").
        Raises EXPECTED if the URL is unparseable or the amount is invalid.
        """
        if not github_url.strip():
            raise gl.vm.UserError(f"{_ERR_EXPECTED} github_url is required")
        if requested_amount <= 0:
            raise gl.vm.UserError(f"{_ERR_EXPECTED} requested_amount must be positive")

        # Validate URL format deterministically before any network calls
        _parse_github_url(github_url.strip())

        next_idx: int  = int(self.proposal_count) + 1
        proposal_id    = f"prop_{next_idx}"

        self.proposals[proposal_id] = Proposal(
            proposal_id          = proposal_id,
            github_url           = github_url.strip(),
            applicant            = str(gl.message.sender_address),
            requested_amount     = u256(requested_amount),
            status               = STATUS_PENDING,
            tier                 = "",
            allocated_amount     = u256(0),
            commit_bracket       = "",
            license_spdx         = "",
            is_osi_approved      = "false",
            has_audit            = "false",
            evaluation_decision  = "",
            evaluation_reasoning = "",
            submitted_at         = "",
        )
        self.proposal_ids.append(proposal_id)
        self.proposal_count = u256(next_idx)

        return proposal_id

    @gl.public.write
    def fund_proposal(self, proposal_id: str) -> None:
        """Transfer the allocated amount from the treasury to FUNDED state. Owner-only.

        The actual token distribution to the applicant is handled externally;
        this method finalises the on-chain accounting and prevents double-spending.
        """
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(f"{_ERR_EXPECTED} Only the owner can fund proposals")
        if proposal_id not in self.proposals:
            raise gl.vm.UserError(f"{_ERR_EXPECTED} Unknown proposal: {proposal_id!r}")

        proposal = self.proposals[proposal_id]

        if proposal.status != STATUS_APPROVED:
            raise gl.vm.UserError(
                f"{_ERR_EXPECTED} Proposal {proposal_id!r} has status "
                f"{proposal.status!r}, expected APPROVED"
            )
        if proposal.allocated_amount == u256(0):
            raise gl.vm.UserError(
                f"{_ERR_EXPECTED} Proposal {proposal_id!r} has zero allocated amount"
            )
        if self.treasury_balance < proposal.allocated_amount:
            raise gl.vm.UserError(
                f"{_ERR_EXPECTED} Insufficient treasury: "
                f"balance={int(self.treasury_balance)}, "
                f"required={int(proposal.allocated_amount)}"
            )

        self.treasury_balance = self.treasury_balance - proposal.allocated_amount
        proposal.status = STATUS_FUNDED
        self.proposals[proposal_id] = proposal

    @gl.public.write
    def update_constitution(self, new_constitution: str) -> None:
        """Replace the DAO constitution with a new version. Owner-only.

        Existing pending proposals are evaluated against the constitution active
        at the time evaluate_proposal is called, not at submission time.
        """
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(
                f"{_ERR_EXPECTED} Only the owner can update the constitution"
            )
        if not new_constitution.strip():
            raise gl.vm.UserError(f"{_ERR_EXPECTED} Constitution cannot be empty")
        self.constitution = new_constitution.strip()

    @gl.public.write
    def set_tier_caps(self, cap_1: int, cap_2: int, cap_3: int) -> None:
        """Adjust per-tier funding caps. Owner-only. Invariant: cap_1 >= cap_2 >= cap_3 >= 0."""
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(f"{_ERR_EXPECTED} Only the owner can adjust tier caps")
        if cap_1 < 0 or cap_2 < 0 or cap_3 < 0:
            raise gl.vm.UserError(f"{_ERR_EXPECTED} Tier caps must be non-negative")
        if not (cap_1 >= cap_2 >= cap_3):
            raise gl.vm.UserError(
                f"{_ERR_EXPECTED} Caps must satisfy cap_1 >= cap_2 >= cap_3"
            )
        self.tier_cap_1 = u256(cap_1)
        self.tier_cap_2 = u256(cap_2)
        self.tier_cap_3 = u256(cap_3)

    # ---------------------------------------------------------------
    # Non-deterministic write — AI evaluation under consensus
    # ---------------------------------------------------------------

    @gl.public.write
    def evaluate_proposal(self, proposal_id: str) -> None:
        """Fetch live GitHub metrics and evaluate the proposal against the DAO constitution.

        Execution model:
          - The leader node fetches repository data (up to 3 GitHub API calls) and
            runs LLM evaluation to produce a binary APPROVED / REJECTED decision.
          - Each validator node independently re-runs the identical pipeline and
            compares critical fields against the leader's output.
          - Consensus is reached when all nodes agree on: decision, tier bracket,
            commit bracket, OSI-approval flag, and audit flag.
          - The LLM reasoning field is informational and excluded from the consensus check.

        Raises EXPECTED if the proposal is not in PENDING state.
        """
        if proposal_id not in self.proposals:
            raise gl.vm.UserError(f"{_ERR_EXPECTED} Unknown proposal: {proposal_id!r}")

        proposal = self.proposals[proposal_id]
        if proposal.status != STATUS_PENDING:
            raise gl.vm.UserError(
                f"{_ERR_EXPECTED} Proposal {proposal_id!r} is not PENDING "
                f"(current status: {proposal.status!r})"
            )

        # Snapshot all storage reads before entering the nondet context
        constitution: str  = self.constitution
        github_url: str    = proposal.github_url
        requested: u256    = proposal.requested_amount
        cap_1: u256        = self.tier_cap_1
        cap_2: u256        = self.tier_cap_2
        cap_3: u256        = self.tier_cap_3

        def leader_fn() -> dict:
            metrics = _fetch_repo_metrics(github_url)
            decision, reasoning = _run_llm_evaluation(constitution, github_url, metrics)

            tier: str = (
                _compute_tier(
                    metrics["commit_bracket"],
                    metrics["is_osi_approved"],
                    metrics["has_audit"],
                )
                if decision == DECISION_APPROVED
                else ""
            )

            return {
                "decision":        decision,
                "tier":            tier,
                "reasoning":       reasoning,
                "commit_bracket":  metrics["commit_bracket"],
                "license_spdx":    metrics["license_spdx"],
                "is_osi_approved": "true" if metrics["is_osi_approved"] else "false",
                "has_audit":       "true" if metrics["has_audit"] else "false",
            }

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return _handle_leader_error(leaders_res, leader_fn)

            try:
                val = leader_fn()
            except gl.vm.UserError:
                # Validator errored while leader succeeded — nodes diverged
                return False

            ldr = leaders_res.calldata

            # Critical consensus fields — all must match exactly
            return (
                ldr["decision"]        == val["decision"]
                and ldr["tier"]           == val["tier"]
                and ldr["commit_bracket"] == val["commit_bracket"]
                and ldr["is_osi_approved"] == val["is_osi_approved"]
                and ldr["has_audit"]      == val["has_audit"]
            )
            # ldr["reasoning"] and ldr["license_spdx"] are intentionally excluded:
            # reasoning varies naturally across LLM calls; license_spdx is informational
            # (consensus is on the derived boolean is_osi_approved, not the raw string).

        result: dict = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        # ---- Apply consensus result to persistent storage ----
        proposal.commit_bracket       = result["commit_bracket"]
        proposal.license_spdx         = result["license_spdx"]
        proposal.is_osi_approved      = result["is_osi_approved"]
        proposal.has_audit            = result["has_audit"]
        proposal.evaluation_decision  = result["decision"]
        proposal.evaluation_reasoning = result["reasoning"]
        proposal.tier                 = result["tier"]

        if result["decision"] == DECISION_APPROVED:
            proposal.status = STATUS_APPROVED

            # Effective cap: minimum of what was requested and the tier ceiling
            tier: str = result["tier"]
            if tier == TIER_1:
                effective_cap: u256 = cap_1
            elif tier == TIER_2:
                effective_cap = cap_2
            elif tier == TIER_3:
                effective_cap = cap_3
            else:
                effective_cap = u256(0)  # Approved with no tier = zero allocation

            proposal.allocated_amount = (
                requested if requested <= effective_cap else effective_cap
            )
        else:
            proposal.status           = STATUS_REJECTED
            proposal.allocated_amount = u256(0)

        self.proposals[proposal_id] = proposal
