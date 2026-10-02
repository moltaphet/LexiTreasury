# LexiTreasury

LexiTreasury funds open-source work through one repository-qualified milestone
grant flow. Repository activity, project tiers, the DAO constitution, a repository
payout assertion, and audit attestations decide whether a grant may enter the treasury
funding stage. A funded grant then releases fixed milestone tranches only after
commit-pinned evidence is reviewed by GenLayer consensus.

## Unified contract and prior version

[`contracts/lexitreasury.py`](contracts/lexitreasury.py) is the only contract source
and active application contract. The former standalone milestone contract was
merged here and removed. There is no legacy product mode, proposal selector, or
second app connection.

The one-shot proposal API is deprecated in the active ABI. Its relevant policy and
security behavior remain integrated into grant evaluation: commit and contributor
tiers, structural quality, OSI license checks, DAO constitution evaluation,
hash-bound attestations submitted by registered auditor wallets, and a repository
write-access-holder payout assertion. A qualified grant must fit its tier cap in full. The contract rejects an
over-cap plan rather than silently trimming precommitted tranche amounts; its
applicant can create a new plan with lower amounts. Grant funding remains backed
by the owner-managed payable reserve, and recipients still withdraw released
claimable balances through `withdraw()`.

The historical StudioNet contract at
`0xBE623B407Cbc54C84Dcba97c6040E7b8469F17cf` is preserved in
[`deployments/archive/studionet-legacy.json`](deployments/archive/studionet-legacy.json).
The archived source revision is recorded there for history; the current source
path now contains the unified contract. The old code has no authorized upgrader,
upgrade entrypoint, or upgradeable root storage, so it cannot be upgraded in place.
The unified Studio Dev deployment is now active. Its address, network, and Explorer
URL are recorded in the single active deployment configuration linked below. The
old StudioNet deployment is not a second active app path, and its records are not
migrated automatically.

## State machine and money flow

```text
DRAFT --repository evaluation--> APPROVED or REJECTED
  |                                  |
  | applicant cancels                | treasury owner funds full plan from reserve
  v                                  v
CANCELLED                         FUNDED / IN_PROGRESS
                                      |
                         recipient submits current milestone
                                      v
                                  SUBMITTED
                           consensus adjudication
                         /                    \
                    APPROVED                REJECTED
                         |                  retry up to 3
                owner or recipient              |
                  releases tranche       3 rejects / deadline
                         |                       v
                next milestone READY         REFUNDABLE
                         |                       |
                   COMPLETED              permissionless refund
                                                 v
                                             REFUNDED
```

- The creator is the applicant. The treasury owner is the funder because grants
  draw from the existing owner-managed reserve. Only the applicant can cancel an
  unfunded draft; only the owner can fund an approved grant.
- The draft stores 1–10 milestones, each with nonempty criteria, a positive amount,
  and a future Unix deadline. Amounts add to the requested grant total and deadlines
  must increase. Terms cannot be edited. To change a plan, cancel the draft and
  create a replacement; rejection also requires a new grant.
- Repository evaluation is a first consensus gate. It snapshots the current
  constitution, tier caps, audit registry, and repository evidence. It checks that
  the payout address asserted by a repository write-access holder matches the
  designated recipient. That manifest is not cryptographic proof of the GitHub
  owner's personal approval. Approval is allowed only if the full milestone total
  is within the computed tier cap. A missing manifest (404) is unverified. Rate
  limits and server failures abort evaluation transiently, leaving the grant in
  `DRAFT` for retry. Malformed or oversized responses are definitive input errors,
  not transient network failures. A root Contents
  response at GitHub's 1,000-entry cap is checked against the default branch's
  recursive Git Trees result (bounded to 100,000 entries and 8 MiB). A truncated or
  over-budget tree produces a definitive, actionable incomplete-scan error; no
  quality score is recorded and the grant remains `DRAFT`. The user must reduce the
  scan size or contact the treasury owner for manual review before retrying.
  Evaluation does not reserve funds.
- An approved grant stores the evaluation-time tier-cap eligibility and allocated
  total. Later cap changes apply to future evaluations; they do not strand or
  invalidate an already approved grant. Funding still requires the owner, sufficient
  reserve, and all milestone deadlines to remain in the future.
- After approval, the owner funds the exact milestone total from the reserve. The
  contract rechecks that every deadline is still in the future. Only then are the
  milestone terms considered funded and locked.
- The recipient can submit evidence only for the current milestone, using an HTTPS
  GitHub commit URL with a 40-character SHA in the grant repository. A rejected
  submission can be retried before the deadline, up to three total submissions.
  The deadline prevents new submissions; it does not invalidate evidence accepted
  before the deadline. That pending submission remains adjudicable and cannot be
  expired or refunded before review. If it is rejected after the deadline, no retry
  is possible and remaining escrow becomes refundable; a third rejection also makes
  the grant refundable. An approved milestone can be released after its deadline.
  An overdue milestone with no pending submission can be expired and refunded.
- Adjudication fetches the specific commit and reviews its bounded file/change
  evidence against the stored criteria. The structured result is exactly a decision,
  reason code, and bounded summary. Criteria and GitHub data are untrusted content;
  prompt-injection text is neutralized and the prompt prohibits treating it as
  instructions. Invalid or conflicting results fail closed. Transient review errors
  leave the evidence submitted so adjudication can be retried.
- The owner or recipient may release an approved tranche. Release moves that amount
  from the grant's unearned escrow into the recipient's claimable balance; the
  recipient later calls `withdraw()` to transfer claimable funds. Anyone may mark
  an overdue unapproved milestone refundable and trigger the refund. Refund returns
  only unearned escrow to the treasury reserve; earned/released tranches remain
  claimable and are not clawed back.
- The accounting invariant is `contract native balance >= reserve + grant escrow +
  claimable escrow`. Funding moves reserve to grant escrow; release moves grant
  escrow to claimable escrow; withdrawal pays claimable escrow; refund moves
  unearned grant escrow back to reserve. The contract checks each state transition
  and balance bucket. `get_accounting()` reports `contract_balance`,
  `total_liabilities` (reserve + grant escrow + claimable escrow) and
  `is_solvent = contract_balance >= total_liabilities`. Grant escrow is included
  because funded-but-unreleased tranches are still owed; a check against reserve and
  claimable escrow alone would report a contract holding too little as solvent.

## Live Deployment (Studio Next)

| Field | Value |
| --- | --- |
| Network | GenLayer Studio Next, chain ID 61997 |
| Contract | [`0x755D77CF9878872246220cc1Cd745c47ebd5cB44`](https://explorer-studio-next.genlayer.com/address/0x755D77CF9878872246220cc1Cd745c47ebd5cB44) |
| Deploy tx | [`0xdce62e487ca4aa226164cca6cdb12798d12c8d329e0ec65712ffe1e30f1d4516`](https://explorer-studio-next.genlayer.com/tx/0xdce62e487ca4aa226164cca6cdb12798d12c8d329e0ec65712ffe1e30f1d4516) (consensus ACCEPTED) |
| Deployer / owner | `0x6ec5cb7469a661b8e23b4867359893a25116ea19` (`lexitreasury_v5_deployer`) |
| Source SHA-256 | `d6c54aa68dc93207294b0df7177b5f492bcd2bdaf195804343bb9462b820f17a` |
| Deployed | 2026-10-02T09:41:57Z |

Recorded in [`deployments/studio-next.json`](deployments/studio-next.json). The
deployed contract's `get_accounting()` returns `is_solvent`. The explorer URL formats are unverified. Earlier deployments are superseded (see
`superseded_deployments` in the record): `0x75b1…` still had the removed demo flag, and
`0x4Ca6…` used `gl.vm.get_timestamp()`, which the Studio Next runner rejects, so
`create_grant` failed on-chain; the contract now reads `gl.message.raw["datetime"]`.

## Audit Hardening & V2 Changelog

- **Evidence freshness and author binding.** `fund_grant` stamps `funded_at` on each
  milestone. A commit is rejected when its author or committer date predates
  `funded_at` or cannot be parsed. The GitHub API `author.login` must equal the
  grant's verified maintainer login; the spoofable git config name and email are
  ignored. Dates are still chosen by the committer, so this blocks replaying old
  commits, not date forgery by the maintainer account.
- **Fork defense.** Forked repositories are rejected deterministically at evaluation
  with `ERR_FORKED_REPO_UNSUPPORTED`.
- **Deadline grace window.** The submission deadline is separate from adjudication.
  A submission made before the deadline stays adjudicable afterwards (`submitted_at`
  is recorded). After a 7-day grace window an unreviewed submission may be expired
  and refunded, so honest applicants are not timed out by slow adjudication and
  escrow cannot be locked forever.
- **Leader error handling.** `UserError` text is extracted via `data`, then
  `message`, then `args[0]`, then `str()` on both leader and validators, so identical
  errors reach the same consensus verdict.
- **Solvency invariant.** `get_accounting()` exposes `contract_balance`,
  `total_liabilities` and `is_solvent`. Liabilities include grant escrow, which a
  reserve-plus-claimable check would miss.

## Live On-Chain Verification Table

Transactions are produced by `scripts/interact_live.py` against Studio Next (chain
ID 61997, `https://studio-next.genlayer.com/api`) and recorded, with the contract
address and the SHA-256 of `contracts/lexitreasury.py`, in
`deployments/studio-next.json`. The contract is deployed, but **no grant lifecycle has been run on it yet**, so this table
is intentionally empty rather than filled with placeholders. Run `setup`, push one
new commit to the grant repository, then run `finish` (see the script docstring) and
paste the resulting rows here.

| Step | Contract call | Tx hash | Result |
| --- | --- | --- | --- |
| 1 | `deposit` | _pending live run_ | |
| 2 | `create_grant` | _pending live run_ | |
| 3 | `evaluate_grant` | _pending live run_ | consensus APPROVED |
| 4 | `fund_grant` | _pending live run_ | |
| 5 | `submit_evidence` | _pending live run_ | |
| 6 | `adjudicate` | _pending live run_ | consensus APPROVED |
| 7 | `release_tranche` + `withdraw` | _pending live run_ | |
| 8 | stale-commit `submit_evidence` + `adjudicate` | _pending live run_ | REJECTED (`EVIDENCE_INCOMPLETE`) |

Each hash links to `https://explorer-studio-next.genlayer.com/tx/<hash>`. Step 8
demonstrates the rejection path: the contract has no slashing mechanism, so the
fraudulent submission is rejected and the milestone's escrow stays locked until it
is refunded to the reserve.

## Studio Dev configuration

The app uses one active deployment record:
[`frontend/config/studio-dev-deployment.json`](frontend/config/studio-dev-deployment.json).
It supplies the active contract address, constructor values, Studio Dev RPC,
chain ID, and Studio Next Explorer base. Contract reads, writes, wallet network
settings, and the app's contract Explorer link consume this record; the app builds
the address-specific link from the configured Explorer base and contract address.

The contract has no demo payout path. Eligibility always requires a
repository-controlled payout assertion manifest, which anyone with repository write
access can change and which does not prove personal approval by the GitHub owner.

| Setting | Value |
|---|---|
| Network | GenLayer Studio Dev / Studio Next preview (release candidate) |
| RPC | `https://studio-dev.genlayer.com/api` |
| Chain ID | `61997` |
| Explorer | Studio Next preview; address link is built from the active deployment record |
| Runner | `5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng` |
| JS SDK | `genlayer-js@2.0.0-rc.1` |
| Python client | `genlayer-py==0.19.0rc2` |
| Direct test suite | `genlayer-test==0.30.0rc2` |
| GenLayer CLI | `0.40.0-rc2` |

These are release-candidate versions. Studio Dev may reset, which can remove test
deployments and transactions. Configuration, wallet network selection, and
documentation target Studio Dev only. The frontend estimates current per-write
fees, submits the transaction with the fee quote, waits for finalization, and
checks the SDK success result. A submitted hash alone is not treated as success.

## Setup and verification

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Contract tools and direct tests use an isolated Python environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-studio-dev.txt
genvm-lint check contracts/lexitreasury.py --json
python run_tests.py tests/direct/test_milestone_lifecycle.py -v
```

Frontend checks:

```bash
cd frontend
npm test -- --runInBand
npm run test:integration -- --runInBand
npm run lint
npx tsc --noEmit
npm run build
npm run test:e2e
```

Direct tests use local execution with mocked GitHub and LLM calls. They do not
deploy or submit network transactions. Any future network test must target Studio
Dev only. Review the [v0.6 migration guide](https://docs.genlayer.com/developers/consensus-v06-migration#test-on-studio-dev-first)
and current GenLayer documentation before selecting updated SDK, CLI, runner, or
test versions. Studio Dev is an RC preview and may reset; the active StudioNet
archive remains historical and is not used by the app.

The original proposal-only core suite still collects 118 skipped tests because its
assertions call entrypoints and state views removed from the active ABI. Its
case-by-case disposition and exact replacement test names are in the
[final scenario audit](docs/test-scenario-audit.md). The adversarial, consensus,
and treasury lifecycle suites were rewritten against the grant state machine and
are active. The summary [coverage map](docs/test-coverage-map.md) links the full
audit. Skipped legacy assertions are not counted as passing coverage.

## Security notes

- The owner controls constitution updates, tier caps, auditor-address registration
  and revocation, and reserve deposits. Only the registered active auditor wallet
  named in an attestation can submit it; the owner cannot attest in that wallet's
  name. The chain authenticates the transaction sender, but registration remains an
  owner trust decision: the owner could enroll its own or a colluding address, so the
  contract does not independently establish auditor qualifications. The applicant
  supplies the repository, recipient, milestone criteria, amounts, and deadlines.
  The recipient alone submits evidence. Contract checks enforce these roles.
- Audit attestations count only when the repo manifest, report hash, repository
  binding, and currently active auditor address all match. The payout manifest is
  an assertion by someone with repository write access; it does not prove that the
  GitHub owner personally approved the address.
- Evidence is bound to the verified maintainer and to the funding time. Adjudication
  rejects a commit unless (a) the GitHub-API-resolved `author.login` equals the
  grant's verified maintainer login (the git config name and email are
  attacker-controlled and are ignored), and (b) both the author and committer dates
  are on or after the milestone's `funded_at` block timestamp, so a pre-existing
  commit cannot be replayed as new work. Limitation: git dates are set by whoever
  creates the commit, so this stops replaying existing history but does not stop
  someone who controls the maintainer account from forging a date. Organisation-owned
  repositories, whose owner login is an organisation, cannot currently satisfy the
  author binding.
- Forked repositories are rejected at evaluation (`ERR_FORKED_REPO_UNSUPPORTED`)
  because they inherit upstream history and metrics. The demo payout bypass
  (`allow_demo_owner_payout`) was removed entirely.
- A submission made before the milestone deadline remains adjudicable after it. If
  nobody adjudicates within 7 days of the deadline, the milestone may be expired and
  refunded so escrow cannot be locked indefinitely.
- Audit evidence is bounded: manifests to 16 KiB, report paths to 256 characters,
  and report bodies to 256 KiB. Oversized or invalid evidence is rejected with a
  specific audit status and cannot qualify as an attestation. The GenLayer web API
  exposes response bodies after receiving them; `Content-Length` allows early
  rejection when provided, while the local byte check occurs after the SDK has
  received the body.
- Other external response limits are 64 KiB for repository metadata, 512 KiB and
  100 items per commit-list response, 512 KiB for Contents, 8 MiB for Git Trees,
  16 KiB for the payout manifest, and 64 KiB for an individual commit response;
  normalized commit evidence sent to review is capped at 32 KiB. Each response checks a
  usable `Content-Length` before parsing and checks received bytes when that header
  is absent or invalid. The GenLayer web API exposes the response after receiving it,
  so the body limit bounds parsing and consensus work but cannot prevent the SDK from
  first receiving an oversized body.
- The constitution is nonempty and limited to 8,192 UTF-8 bytes, which also bounds
  the policy portion of the evaluation prompt. The lifetime auditor registry is
  capped at 64 wallet addresses and the attestation UID registry at 256 unique IDs.
  Revoking a record does not free capacity; reactivating an existing auditor does
  not consume another slot. Auditor and attestation storage is therefore bounded.
- The treasury owner curates auditor addresses and may register their own wallet.
  Only a currently active registered wallet can submit an attestation from its own
  transaction sender address. This is owner-curated trust, not independent,
  decentralized, or trustless auditor selection.
- Repository text, milestone criteria, GitHub commit messages, paths, and patches
  are untrusted. Fetch hosts are constructed from validated GitHub identifiers;
  external fields are bounded and sanitized before LLM evaluation.
- Collection reads are bounded and paginated (25 grants, 10 milestones per page).
  Transaction UI distinguishes submitted, pending finalization, failure, and
  finalized success; the hash is available for retry tracking if finalization
  waiting times out.

## Known Limitations & Security Assumptions

- **Organization-Owned Repositories:** In the current version, milestone commit
  verification checks `commit.author.login == maintainer_login`. Repositories owned by
  GitHub Organizations (where owner is an org entity, not an individual author)
  require individual maintainer binding and will be expanded in V3.
- **Commit dates are committer-controlled.** The `funded_at` check stops replaying
  existing history but not a maintainer who forges a date.
- **The payout manifest is a write-access assertion,** not proof that the GitHub
  owner approved the address.
- **Auditor trust is owner-curated;** it is not decentralized auditor selection.

## References

- [GenLayer v0.6 migration guide](https://docs.genlayer.com/developers/consensus-v06-migration)
- [GenLayerJS API](https://docs.genlayer.com/api-references/genlayer-js)
- [Transactions and finalization](https://docs.genlayer.com/api-references/genlayer-js/transactions)
- [GenLayer upgradability](https://docs.genlayer.com/developers/intelligent-contracts/features/upgradability)
