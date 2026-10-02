# LexiTreasury unified contract design

## Canonical source and migration

`contracts/lexitreasury.py` is the only contract source and defines the
only `LexiTreasury` class. The standalone milestone file and class have been
removed after porting their lifecycle, validation, adjudication, escrow, and refund
logic. There is no old proposal API or contract-model selector in the active ABI.

The existing deployment is not upgradeable based on its checked-in source: its
constructor does not register an authorized `gl.storage.Root` upgrader and the
contract exposes no method to replace code. GenLayer locks code and upgrader slots
after initialization unless authorized upgraders are registered. The existing
StudioNet address remains historical and untouched. A unified Studio Dev deployment
therefore needs a new address. The explorer address page could not be retrieved in
the available read-only web lookup, so on-chain bytecode and the deployed upgrader
list were not independently confirmed.

## State machine

One grant includes both the existing repository eligibility decision and its
milestone settlement. The eligibility decision qualifies the same grant that later
enters milestone review; it is not a second proposal product.

```text
DRAFT
  | evaluate_grant (repository evidence + constitution + maintainer + tier cap)
  +-----------------------------+
  |                             |
  v                             v
APPROVED                     REJECTED
  | fund_grant (owner, exact planned total from treasury reserve)
  v
FUNDED / IN_PROGRESS
  | recipient submits commit-pinned evidence for current milestone
  v
SUBMITTED
  | adjudicate against milestone criteria and verified commit
  +-----------------------------+
  |                             |
  v                             v
APPROVED                     REJECTED
  | release_tranche              | retry before deadline, at most 3 submissions
  | moves tranche to             +-- 3rd rejection or deadline --> REFUNDABLE
  | recipient claimable balance                                  |
  +--> next milestone READY                                      |
  +--> COMPLETED after final release                             |

DRAFT -- applicant cancels before funding --> CANCELLED
REFUNDABLE -- refund_unearned --> REFUNDED
```

An adjudication error leaves the current evidence submitted for retry; it does not
consume another attempt or change balances. Evidence can only be submitted before
the deadline, but accepted evidence stays `SUBMITTED` and remains adjudicable after
the deadline. Expiry cannot discard that pending evidence. A rejection before the
deadline permits another submission until the three-submission limit; a third
rejection makes the grant refundable. If a timely submission is rejected after its
deadline, no retry is possible and the grant becomes refundable immediately. An
overdue milestone with no pending submission can expire and become refundable. An
approved milestone can still be released after its deadline. Milestones are
sequential, their titles, criteria, amounts, and deadlines are frozen at creation,
and positive tranche amounts must sum to the requested grant amount. Only the
applicant may cancel an unfunded draft; funded plans are not editable or cancellable.

## Repository evaluation, tiers, and audit policy

The existing repository evaluator remains in the canonical contract. It fetches the
repository, commit activity, contributors, structural quality, license, and audit
manifest; verifies the audit against the on-chain trusted-auditor registry; validates
the repository payout assertion manifest; applies the existing anti-gaming gates and
tier computation; and asks the configured constitution for a structured decision.
Rate limits and GitHub 5xx failures on any evidence request raise a transient
consensus error, so evaluation writes nothing and the grant remains `DRAFT` for
retry. Genuine manifest absence and malformed or invalid claims are treated as
unverified evidence; malformed or oversized core API responses are definitive
external-data errors and never become successful evaluations. Root Contents responses at GitHub's 1,000-item cap are unknown
when any quality indicator is absent; they cannot produce a zero-quality result.
The saved grant keeps the normalized metrics, tier, attestation UID, owner login
associated with a matching payout assertion, decision, and reasoning for display
and auditability. The manifest is an assertion published by a repository
write-access holder; it does not prove that the GitHub owner personally approved
the recipient address.

The milestone plan total must fit the tier cap captured during evaluation. That
eligibility is stored on the approved grant: later cap changes affect future
evaluations only and do not strand an approved grant. Unlike the former one-shot
allocation, the contract does not silently trim an allocation, because that would
make the funded plan disagree with its immutable tranche amounts. An over-cap plan
is rejected and must be recreated at a lower total. Constitution, tier caps, auditor
registry/revocation, and repository payout binding retain their owner-controlled
rules. Attestation submission is authorized separately: the named auditor's
registered wallet address must equal the authenticated transaction sender.

## Storage and accounting

Existing owner governance and financial storage remain: owner, constitution, tier
caps, treasury reserve, trusted auditor wallet addresses, audit attestations and UID
index, recipient claimable balances, and the outstanding claimable escrow total.

The canonical `Grant` storage record combines the former `Proposal` evaluation fields
with grant ID/title, applicant, verified recipient, requested/approved amount, grant
state, milestone count/current index, and cumulative released/refunded values. A
`Milestone` storage record contains immutable plan terms plus attempts, status, commit
URL/SHA, structured decision, reason code, summary, and released amount. Grants and
milestones are keyed in `TreeMap`s; grant IDs use `DynArray` for bounded pagination.

The money buckets are:

```text
contract native balance
  = treasury_balance                 (owner-deposited, unallocated reserve)
  + total_grant_escrow                (funded, unearned milestone tranches)
  + total_escrowed                    (released, recipient claimable balances)
```

Funding moves the exact approved plan total from reserve to per-grant escrow.
Releasing a tranche moves that amount from grant escrow into the existing recipient
claimable mapping. `withdraw` remains the recipient pull-payment path and decreases
claimable escrow before transferring native value. A refund moves only the grant's
remaining unearned escrow back into the treasury reserve and records a cumulative
refund total. This preserves owner deposits and recipient withdrawals while adding
milestone-level locked funds.

## Permissions

- Only the owner changes the constitution/caps, registers and revokes auditor wallet
  addresses, revokes audit records, and deposits treasury funds. Only an active,
  registered auditor address can submit a new attestation. The transaction sender is
  cryptographically authenticated by the chain, but the owner still decides which
  addresses are trusted and could register itself or a colluding address; this is a
  governance trust boundary, not an independent qualification oracle.
- Applicants create a grant plan for a GitHub repository and a payout address.
  Repository evaluation checks the payout address asserted by the well-known
  manifest against the grant recipient. The manifest can be changed by any
  repository write-access holder and does not cryptographically prove personal
  approval by the GitHub owner.
- Anyone may request the repository evaluation and adjudicate submitted evidence;
  the contract controls allowed states and all resulting settlement. Rate limits
  and 5xx errors leave evaluation in `DRAFT` for retry instead of recording absent
  quality or maintainer signals. Malformed/oversized responses stop evaluation with
  a definitive external-data error. At the Contents API's 1,000-entry cap, a recursive
  Git Trees scan establishes completeness with limits of 100,000 entries and 8 MiB.
  A truncated or over-budget tree returns a definitive actionable incomplete-scan
  error; it is never scored as zero quality or classified as transient. The user
  can reduce the scan size or contact the treasury owner for manual review.
- Only the owner funds an approved plan from reserve. Only the designated recipient
  submits evidence. The owner or recipient can release an approved tranche. Anyone
  can mark an expired milestone refundable or trigger its refund; the refunded value
  always returns to the treasury reserve.

## Validation policy

Criteria, titles, evidence URLs, GitHub fields, and commit contents are untrusted.
The contract validates and bounds URLs/SHAs, constructs GitHub API URLs from parsed
components, sanitizes prompt data, isolates instructions from data, and validates
structured LLM output. The previous repository evaluator and milestone reviewer are
both retained as consensus checks inside this single grant lifecycle. Direct tests
must cover each decision gate, access rule, balance movement, retries, and all
terminal states. The default repository test command targets the unified grant
lifecycle; legacy contract behavior is not part of the new contract ABI.

Audit manifests are capped at 16 KiB, report paths at 256 characters, and report
bodies at 256 KiB. Oversized or malformed audit evidence is rejected with an
explanatory status and cannot qualify as verified. The SDK returns a response object
after receiving the body; where `Content-Length` is present the contract checks it
before accessing or parsing the body, then enforces the same bound on received bytes.
Auditor selection is owner-curated: the owner can register its own wallet, and only
an active registered wallet can submit an attestation from its own transaction
sender address. This is not independent, decentralized, or trustless auditor
selection.

The other response budgets are 64 KiB for repository metadata, 512 KiB and 100
entries per commit-list response, 512 KiB for repository Contents, 8 MiB and 100,000 entries for recursive Git Trees,
and 64 KiB for a commit-evidence response; the normalized evidence sent to review
is capped at 32 KiB. A usable `Content-Length` is checked
before the response body; absent or malformed length metadata falls back to an
actual byte-length check before decoding or parsing. The web API provides the body
after receipt, so this bounds contract parsing and consensus work but cannot prevent
the SDK from receiving an oversized payload.

The constitution must be nonempty and at most 8,192 UTF-8 bytes. This is also the
maximum constitution text inserted into the evaluation prompt. The auditor address
registry is capped at 64 lifetime entries and the unique attestation UID registry
at 256; revocation does not free a slot, while reactivation updates the existing
auditor entry. `get_trusted_auditors` returns the whole registry, which remains
bounded by that fixed maximum. UID keys are 1–64 lowercase ASCII characters from
`a-z`, `0-9`, `.`, `_`, `:`, and `-`, starting with a lowercase letter or digit;
invalid values are rejected rather than
normalized. Audit report paths are repository-relative ASCII paths with no URL
encoding, traversal components, backslashes, query, or fragment delimiters.
