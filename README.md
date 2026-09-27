# LexiTreasury

LexiTreasury funds open-source work through one repository-qualified milestone
grant flow. Repository activity, project tiers, the DAO constitution, maintainer
verification, and audit attestations decide whether a grant may enter the treasury
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
hash-bound trusted-auditor attestations, and the repository maintainer payout
binding. A qualified grant must fit its tier cap in full. The contract rejects an
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
  constitution, tier caps, audit registry, and repository evidence. It enforces
  maintainer binding to the designated recipient. Approval is allowed only if the
  full milestone total is within the computed tier cap. It does not reserve funds.
- After approval, the owner funds the exact milestone total from the reserve. The
  contract rechecks that every deadline is still in the future. Only then are the
  milestone terms considered funded and locked.
- The recipient can submit evidence only for the current milestone, using an HTTPS
  GitHub commit URL with a 40-character SHA in the grant repository. A rejected
  submission can be retried until three submissions have been adjudicated or the
  deadline passes. An approved milestone must be released before the next milestone
  is available.
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
- The accounting invariant is `contract native balance = reserve + grant escrow +
  claimable escrow`. Funding moves reserve to grant escrow; release moves grant
  escrow to claimable escrow; withdrawal pays claimable escrow; refund moves
  unearned grant escrow back to reserve. The contract checks each state transition
  and balance bucket.

## Studio Dev configuration

The app uses one active deployment record:
[`frontend/config/studio-dev-deployment.json`](frontend/config/studio-dev-deployment.json).
It supplies the active contract address, constructor values, Studio Dev RPC,
chain ID, and Studio Next Explorer base. Contract reads, writes, wallet network
settings, and the app's contract Explorer link consume this record; the app builds
the address-specific link from the configured Explorer base and contract address.

The contract constructor accepts a final `allow_demo_owner_payout` boolean,
defaulting to `true` for hackathon demo deployments. This accepts the applicant
wallet as recipient when GitHub confirms the URL owner and the recipient is the
applicant's wallet. It does not prove the applicant controls that GitHub account.
Set it to `false` for production so repository maintainer verification requires
the repo-controlled payout manifest. The active Studio Dev constructor values are
recorded in the deployment configuration below.

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

- The owner controls constitution updates, tier caps, trusted auditor registration,
  attestation recording/revocation, and reserve deposits. The applicant supplies
  the repository, recipient, milestone criteria, amounts, and deadlines. The
  recipient alone submits evidence. Contract checks, not UI controls, enforce roles.
- Audit attestations count only when the repo manifest, report hash, repository
  binding, and currently trusted auditor all match. Maintainer verification binds
  the repository owner's published payout address to the grant recipient.
- Repository text, milestone criteria, GitHub commit messages, paths, and patches
  are untrusted. Fetch hosts are constructed from validated GitHub identifiers;
  external fields are bounded and sanitized before LLM evaluation.
- Collection reads are bounded and paginated (25 grants, 10 milestones per page).
  Transaction UI distinguishes submitted, pending finalization, failure, and
  finalized success; the hash is available for retry tracking if finalization
  waiting times out.

## References

- [GenLayer v0.6 migration guide](https://docs.genlayer.com/developers/consensus-v06-migration)
- [GenLayerJS API](https://docs.genlayer.com/api-references/genlayer-js)
- [Transactions and finalization](https://docs.genlayer.com/api-references/genlayer-js/transactions)
- [GenLayer upgradability](https://docs.genlayer.com/developers/intelligent-contracts/features/upgradability)
