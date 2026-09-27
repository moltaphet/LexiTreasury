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
consume another attempt or change balances. Milestones are sequential, their titles,
criteria, amounts, and deadlines are frozen when the grant is created, and the total
of positive tranche amounts must equal the requested grant amount. Only the
applicant may cancel an unfunded draft; funded plans are not editable or cancellable.
An approved milestone can still be released after its deadline; a deadline only
expires a milestone without an approval.

## Repository evaluation, tiers, and audit policy

The existing repository evaluator remains in the canonical contract. It fetches the
repository, commit activity, contributors, structural quality, license, and audit
manifest; verifies the audit against the on-chain trusted-auditor registry; validates
the repository maintainer payout manifest; applies the existing anti-gaming gates and
tier computation; and asks the configured constitution for a structured decision.
The saved grant keeps the normalized metrics, tier, attestation UID, maintainer
identity, decision, and reasoning for display and auditability.

The milestone plan total must fit the resulting tier cap. Unlike the former one-shot
allocation, the contract does not silently trim an allocation, because that would
make the funded plan disagree with its immutable tranche amounts. An over-cap plan
is rejected and must be recreated at a lower total. Constitution, tier caps, auditor
trust, attestation recording/revocation, and repository payout binding retain their
owner-controlled rules.

## Storage and accounting

Existing owner governance and financial storage remain: owner, constitution, tier
caps, treasury reserve, trusted auditors and auditor IDs, audit attestations and UID
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

- Only the owner changes the constitution/caps, manages trusted auditors and audit
  records, and deposits treasury funds.
- Applicants create a grant plan for a GitHub repository and a payout address.
  Repository evaluation independently proves the payout address through the existing
  well-known maintainer manifest before the grant may be approved/funded.
- Anyone may request the repository evaluation and adjudicate submitted evidence;
  the contract controls allowed states and all resulting settlement.
- Only the owner funds an approved plan from reserve. Only the verified recipient
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
