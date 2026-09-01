# LexiTreasury

> **Autonomous treasury governance powered by AI consensus on GenLayer.**
> No multisig. No committees. A natural-language constitution and five independent
> AI validators are the sole decision-making authority.

![Network](https://img.shields.io/badge/Network-StudioNet-22d3ee?style=flat-square)
![Contract](https://img.shields.io/badge/Contract-Verified-10b981?style=flat-square)
![Tests](https://img.shields.io/badge/Tests-Passing-10b981?style=flat-square)
![Chain](https://img.shields.io/badge/Chain_ID-61999-6366f1?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-94a3b8?style=flat-square)

---

## Live Deployment

| Field            | Value                                                        |
|------------------|--------------------------------------------------------------|
| Network          | GenLayer StudioNet                                           |
| Chain ID         | 61999                                                        |
| RPC URL          | `https://studio.genlayer.com/api`                            |
| Contract Address | `0x5f3b98c0315C2b9F2aE71d4d3feA6856248A63B4`                |
| Deploy TX        | `0xea86b850658ca31d33f44b33721fc7ec9f869d7d79ef89275cdc3c238cf0e250` |
| Deployed At      | 2026-09-01                                                   |
| Validators       | 5 / 5 (100% consensus at deploy)                             |
| Explorer         | https://studio.genlayer.com                                  |

---

## What is LexiTreasury?

LexiTreasury is an **intelligent contract** on GenLayer that evaluates GitHub-based
funding proposals against a plain-English DAO constitution through live AI consensus.
Every proposal triggers a real-time pipeline:

1. Three live GitHub API calls collect verifiable on-chain evidence.
2. A deterministic Python function assigns an invariant funding tier — no LLM involved.
3. A large language model interprets the DAO constitution and returns a binary verdict.
4. Five validator nodes independently reproduce the full pipeline and reach consensus.
5. The outcome is written permanently on-chain: `APPROVED` or `REJECTED`.

The deployed DAO constitution reads:

> "Projects must demonstrate active open-source development. Minimum ACTIVE commit
> bracket required. An OSI-approved license is mandatory for any funding. Security
> audits by recognized firms qualify projects for higher-tier allocations. Tier 1
> requires MATURE or VETERAN activity plus both an OSI license and a completed audit.
> Tier 2 requires ACTIVE or better activity plus either an OSI license or an audit.
> Tier 3 requires MINIMAL or better activity plus any valid license. Projects with
> zero commits receive no allocation regardless of decision."

---

## Architecture

### End-to-End Evaluation Flow

```
Submitter                LexiTreasury Contract           GenLayer Validators (x5)
   |                            |                                  |
   |--- submit_proposal() ----->|                                  |
   |     github_url             | store Proposal{PENDING}          |
   |     requested_amount       |                                  |
   |                            |                                  |
   |--- evaluate_proposal() --->|                                  |
   |                            |--- leader_fn() ----------------->|
   |                            |     GET /repos/:owner/:repo      |
   |                            |     GET /repos/.../commits       |
   |                            |     GET /repos/.../contents      |
   |                            |     LLM: APPROVED / REJECTED     |
   |                            |                                  |
   |                            |<-- validators agree? ------------|
   |                            |    (decision + tier + bracket    |
   |                            |     + osi_flag + audit_flag)     |
   |                            |                                  |
   |                            | write final status + allocation  |
   |<-- APPROVED/REJECTED ------|                                  |
```

### Four Core Mechanisms

**1. Natural-Language Constitution**

The governance rules live on-chain as a plain-English string. No ABI encoding, no
opaque numeric thresholds. The constitution can be updated by the owner; all future
evaluations use the current version at evaluation time, not submission time.

**2. Dynamic GitHub Auditing (3 API Calls)**

```
GET /repos/:owner/:repo
  -> license.spdx_id     (e.g. "MIT", "Apache-2.0")
  -> topics[]            (e.g. ["audited", "defi"])

GET /repos/:owner/:repo/commits?per_page=100
  -> commit count        -> bracket (NONE / MINIMAL / ACTIVE / MATURE / VETERAN)

GET /repos/:owner/:repo/contents
  -> root file listing   -> audit file presence (audit.md, audits/, security-report.pdf ...)
```

Commit counts are bucketed into invariant brackets before evaluation. This absorbs
the natural drift between the leader fetch and each validator's independent fetch,
eliminating the primary source of validator divergence.

**3. Deterministic Tier Assignment**

```python
def _compute_tier(commit_bracket, is_osi_approved, has_audit):
    if commit_bracket in (MATURE, VETERAN):
        if is_osi_approved and has_audit:  return TIER_1   # up to 10,000 tokens
        if is_osi_approved or has_audit:   return TIER_2   # up to  5,000 tokens
        return TIER_3                                       # up to  1,000 tokens
    if commit_bracket == ACTIVE:
        return TIER_2 if is_osi_approved else TIER_3
    if commit_bracket == MINIMAL:
        return TIER_3
    return ""  # NONE bracket -- no allocation
```

No LLM is involved in tier computation. All five validators will always agree on the
same tier, because the inputs are discrete enumerations derived from the same
bucketing rules.

**4. AI Consensus with Equivalence Checking**

The LLM answers only one question: does this project satisfy the DAO constitution?
Validators do not re-run identical LLM calls; they verify *equivalence* — each
validator runs the full pipeline independently and checks that its binary
`APPROVED`/`REJECTED` verdict matches the leader's. Reasoning text is excluded from
the consensus check, absorbing the natural variation in LLM language without
affecting finality.

```
Consensus fields (must match exactly):
  decision        (APPROVED | REJECTED)
  tier            (TIER_1 | TIER_2 | TIER_3 | "")
  commit_bracket  (NONE | MINIMAL | ACTIVE | MATURE | VETERAN)
  is_osi_approved (true | false)
  has_audit       (true | false)

Excluded from consensus:
  evaluation_reasoning   (free-form LLM text -- varies naturally)
  license_spdx           (raw string -- consensus is on the derived boolean)
```

### Error Classification

All errors are prefixed with a classification tag that guides validator consensus:

| Prefix        | Meaning                                                  | Validator behaviour         |
|---------------|----------------------------------------------------------|-----------------------------|
| `[EXPECTED]`  | Deterministic business logic (bad URL, wrong status)     | Messages must match exactly |
| `[EXTERNAL]`  | Deterministic 4xx from GitHub (repo not found, private)  | Messages must match exactly |
| `[TRANSIENT]` | Network failure or GitHub 5xx / rate-limit               | Agree if both sides fail    |
| `[LLM_ERROR]` | Malformed LLM output (unparseable JSON, invalid field)   | Always disagree -> rotate   |

---

## Tech Stack

### Intelligent Contract

| Layer        | Technology                                      |
|--------------|-------------------------------------------------|
| Language     | Python 3.x (GenLayer GenVM subset)              |
| Runtime      | GenVM — non-deterministic LLM + HTTP inside EVM |
| Storage      | `TreeMap`, `DynArray`, `u256`, `Address` (GenLayer primitives) |
| LLM calls    | `gl.nondet.exec_prompt(prompt, response_format="json")` |
| HTTP calls   | `gl.nondet.web.get(url, headers={...})`         |
| Framework    | `gl.Contract`, `@gl.public.view`, `@gl.public.write` |

### Frontend Dashboard

| Layer        | Technology                                       |
|--------------|--------------------------------------------------|
| Framework    | Next.js 16 (App Router, Turbopack)               |
| Language     | TypeScript 5.7 (target ES2020)                   |
| Styling      | Tailwind CSS 3.4                                 |
| SDK          | genlayer-js 1.1.8                                |
| Wallet       | WalletContext — private key in React state       |
| Testing      | Jest 29 (unit + integration) + Playwright (E2E)  |

---

## Project Structure

```
LexiTreasury/
|-- contracts/
|   `-- lexitreasury.py          # GenLayer intelligent contract (single file)
|-- tests/
|   `-- test_lexitreasury.py     # Python direct-mode contract tests (pytest)
|-- frontend/
|   |-- app/
|   |   |-- layout.tsx           # Root layout (html, body, dark class)
|   |   |-- page.tsx             # Page shell + tab state + WalletProvider
|   |   `-- globals.css          # Design tokens, glass system, Tailwind overrides
|   |-- components/
|   |   |-- Header.tsx           # Sticky header + Connect Wallet panel
|   |   |-- TabNav.tsx           # Constitution / Proposals / Submit tabs
|   |   |-- ConstitutionTab.tsx  # AI workflow diagram, tier cards, bracket table
|   |   |-- ProposalsTab.tsx     # Live proposal table with detail panel
|   |   |-- SubmitTab.tsx        # Proposal submission form
|   |   |-- AboutSection.tsx     # Protocol overview and pillar cards
|   |   |-- FaqSection.tsx       # Accordion FAQ (10 items, 5 tag filters)
|   |   `-- Footer.tsx           # 4-column footer with metadata strip
|   |-- contexts/
|   |   `-- WalletContext.tsx    # Private-key wallet state (React context)
|   |-- lib/
|   |   `-- contract.ts          # genlayer-js read/write wrappers
|   |-- tests/
|   |   |-- unit/
|   |   |   `-- helpers.test.ts              # 16 unit tests (no network)
|   |   |-- integration/
|   |   |   |-- contract.reads.test.ts       # Live StudioNet read tests
|   |   |   |-- contract.writes.test.ts      # Live StudioNet write tests
|   |   |   `-- contract.errors.test.ts      # Error propagation tests
|   |   `-- e2e/
|   |       |-- navigation.spec.ts           # App load and tab navigation
|   |       |-- wallet.spec.ts               # Connect Wallet panel flows
|   |       `-- submit.spec.ts               # Form validation and submit states
|   |-- jest.config.js           # Jest + next/jest + genlayer-js CJS remapping
|   `-- playwright.config.ts     # Playwright with auto-start dev server
|-- deployment.json              # Deployed contract metadata (address, tx hash, args)
`-- README.md
```

---

## Getting Started

### Prerequisites

| Tool          | Version  | Notes                                         |
|---------------|----------|-----------------------------------------------|
| Node.js       | 20+      | Required for the frontend                     |
| Python        | 3.10+    | Required for contract tests                   |
| genlayer CLI  | latest   | `npm install -g genlayer`                     |
| pytest        | 8+       | `pip install pytest`                          |

### 1. Clone and install

```bash
git clone https://github.com/your-org/LexiTreasury.git
cd LexiTreasury

# Frontend dependencies
cd frontend
npm install
```

### 2. Environment variables

```bash
# frontend/.env.local (already present in this repo)
NEXT_PUBLIC_CONTRACT_ADDRESS=0x5f3b98c0315C2b9F2aE71d4d3feA6856248A63B4
NEXT_PUBLIC_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_CHAIN_ID=61999
NEXT_PUBLIC_EXPLORER_URL=https://studio.genlayer.com
```

### 3. Run the frontend dashboard

```bash
cd frontend
npm run dev
# Open http://localhost:3000
```

The dashboard connects to the live deployed contract automatically using the env vars
above. No local node or additional configuration is required.

---

## Connect Wallet

LexiTreasury runs on GenLayer StudioNet — a gasless testnet. To submit proposals:

1. Click **Connect Wallet** in the top-right header.
2. Enter your StudioNet private key (the 0x-prefixed 32-byte key from your GenLayer
   Studio account). The key is used client-side only and is never stored or transmitted.
3. Your derived address appears in the header. The private key field is hidden from
   the Submit form while you are connected.
4. To disconnect, click your address and select **Disconnect**.

> StudioNet is gasless. Any account can deploy and interact with contracts at zero cost.

---

## Contract Interaction via CLI

The contract is also fully accessible through the genlayer CLI:

```bash
# Set network to StudioNet
genlayer network set studionet

# Read the DAO constitution
genlayer call 0x5f3b98c0315C2b9F2aE71d4d3feA6856248A63B4 get_constitution

# Read tier caps
genlayer call 0x5f3b98c0315C2b9F2aE71d4d3feA6856248A63B4 get_tier_caps

# Read all proposals
genlayer call 0x5f3b98c0315C2b9F2aE71d4d3feA6856248A63B4 get_all_proposals

# Submit a proposal (requires a funded StudioNet account)
genlayer write 0x5f3b98c0315C2b9F2aE71d4d3feA6856248A63B4 submit_proposal \
  --args "https://github.com/your-org/your-repo" 1000000000000000000000

# Trigger evaluation (owner-callable on StudioNet)
genlayer write 0x5f3b98c0315C2b9F2aE71d4d3feA6856248A63B4 evaluate_proposal \
  --args "prop_1"
```

---

## Testing

### Unit Tests (no network, ~400ms)

Tests helper functions in `lib/contract.ts`: `attoToTokens`, `shortenAddress`, `shortenUrl`.

```bash
cd frontend
npm test
```

Expected output:

```
Tests:       16 passed, 16 total
Time:        ~0.4s
```

### Integration Tests (live StudioNet)

Hits the deployed contract directly. Requires network access to `studio.genlayer.com`.

```bash
cd frontend
npm run test:integration
```

Coverage:

| Suite                     | Tests | What it verifies                                   |
|---------------------------|-------|----------------------------------------------------|
| `contract.reads.test.ts`  | 8     | Constitution content, tier cap ordering, proposals |
| `contract.errors.test.ts` | 5     | RPC error propagation, bad key rejection           |
| `contract.writes.test.ts` | 2*    | Full submit + post-confirm poll (skipped by default) |

(*) Write tests are skipped unless `TEST_PRIVATE_KEY` is set:

```bash
export TEST_PRIVATE_KEY=0x<your-studionet-private-key>
npm run test:integration
```

### Contract Tests (Python / direct-mode pytest)

Tests the intelligent contract in direct-mode — no server required, runs in ~50ms.

```bash
# From the project root (not frontend/)
pytest tests/ -v
```

### E2E Tests (Playwright)

Browser-level tests against the running Next.js app. The dev server is started
automatically by Playwright if not already running on port 3000.

```bash
# Install the Chromium browser once
cd frontend
npm run playwright:install

# Run all E2E tests headlessly
npm run test:e2e

# Run with the interactive Playwright UI
npm run test:e2e:ui
```

Coverage:

| Spec                    | Scenarios                                                       |
|-------------------------|-----------------------------------------------------------------|
| `navigation.spec.ts`    | App loads, header, hero, tab switching, CTA scroll              |
| `wallet.spec.ts`        | Panel open/close, invalid key error, connect, disconnect, SubmitTab integration |
| `submit.spec.ts`        | Field validation, error banner, connected wallet form, tier caps panel |

### Full test run summary

```bash
cd frontend

# 1. Unit (offline, instant)
npm test

# 2. Integration (live StudioNet)
npm run test:integration

# 3. E2E (requires dev server + Chromium)
npm run test:e2e

# 4. Python contract tests (from project root)
cd ..
pytest tests/ -v
```

---

## Contract Reference

### Public View Methods

| Method                           | Returns           | Description                              |
|----------------------------------|-------------------|------------------------------------------|
| `get_constitution()`             | `str`             | Full DAO constitution text               |
| `get_treasury_balance()`         | `int`             | Treasury balance in attos                |
| `get_proposal_count()`           | `int`             | Total proposals submitted                |
| `get_tier_caps()`                | `dict`            | `{TIER_1, TIER_2, TIER_3}` in attos      |
| `get_proposal(proposal_id)`      | `dict`            | Single proposal record                   |
| `get_all_proposals()`            | `list[dict]`      | All proposals ordered by submission      |
| `get_proposals_by_status(status)`| `list[dict]`      | Filtered by PENDING / APPROVED / etc.    |

### Write Methods

| Method                                | Access  | Description                               |
|---------------------------------------|---------|-------------------------------------------|
| `submit_proposal(github_url, amount)` | Public  | Submit a funding proposal                 |
| `evaluate_proposal(proposal_id)`      | Public  | Trigger AI consensus evaluation           |
| `fund_proposal(proposal_id)`          | Owner   | Mark APPROVED proposal as FUNDED          |
| `deposit(amount)`                     | Owner   | Add funds to treasury balance             |
| `update_constitution(new_text)`       | Owner   | Replace the DAO constitution              |
| `set_tier_caps(cap1, cap2, cap3)`     | Owner   | Adjust per-tier funding maximums          |

### Proposal Record Shape

```typescript
interface Proposal {
  proposal_id:          string;   // "prop_1", "prop_2", ...
  github_url:           string;   // submitted repository URL
  applicant:            string;   // 0x-prefixed sender address
  requested_amount:     string;   // in attos (1 token = 1e18 attos)
  status:               "PENDING" | "APPROVED" | "REJECTED" | "FUNDED";
  tier:                 "TIER_1" | "TIER_2" | "TIER_3" | "";
  allocated_amount:     string;   // effective cap applied at evaluation, in attos
  commit_bracket:       "NONE" | "MINIMAL" | "ACTIVE" | "MATURE" | "VETERAN";
  license_spdx:         string;   // e.g. "MIT", "Apache-2.0", ""
  is_osi_approved:      "true" | "false";
  has_audit:            "true" | "false";
  evaluation_decision:  "APPROVED" | "REJECTED" | "";
  evaluation_reasoning: string;   // LLM reasoning excerpt (informational)
  submitted_at:         string;   // ISO-8601 timestamp placeholder
}
```

### Funding Tiers

| Tier   | Max Allocation | Requirements                                             |
|--------|---------------|----------------------------------------------------------|
| TIER_1 | 10,000 tokens | MATURE/VETERAN commits + OSI license + security audit    |
| TIER_2 |  5,000 tokens | ACTIVE+ commits + OSI license OR audit                   |
| TIER_3 |  1,000 tokens | MINIMAL+ commits + any valid license                     |
| None   |  0 tokens     | NONE commit bracket (zero commits)                        |

### Commit Activity Brackets

| Bracket  | Commit Count | Notes                                               |
|----------|-------------|-----------------------------------------------------|
| NONE     | 0           | Repository is empty -- no allocation possible       |
| MINIMAL  | 1 -- 9      | Very early stage                                    |
| ACTIVE   | 10 -- 99    | Regular development                                 |
| MATURE   | 100 -- 499  | Established project                                 |
| VETERAN  | 500+        | Long-running, high-activity project                 |

---

## How GenLayer Makes This Possible

Traditional smart contracts cannot make HTTP calls or run language models. GenLayer's
GenVM lifts this restriction through a two-phase execution model:

```
Phase 1 -- Leader execution
  - One validator is elected leader.
  - Leader executes the full contract function: HTTP calls, LLM prompt, computation.
  - Leader records its result.

Phase 2 -- Validator verification
  - All other validators independently re-execute the same function.
  - Each validator runs its own LLM call and HTTP fetches.
  - Validator compares its result to the leader's on the consensus fields.
  - Supermajority agreement finalises the transaction.
```

LexiTreasury exploits this model in two ways:

- **Deterministic tier assignment** — the `_compute_tier` function uses only discrete
  enum inputs, guaranteeing all validators produce the same tier with no LLM variance.
- **Reduced consensus surface** — by excluding `reasoning` from the consensus check,
  validators absorb natural LLM text variation without ever disagreeing on the binary
  funding decision.

---

## Deploying a Fresh Instance

To deploy your own LexiTreasury with a custom constitution:

```bash
# Set network
genlayer network set studionet

# Deploy (interactive — will prompt for account password)
genlayer deploy --contract contracts/lexitreasury.py \
  --args \
  "Your constitution text here." \
  10000000000000000000000 \
  5000000000000000000000 \
  1000000000000000000000
```

Constructor argument units: all cap values are in **attos** (1 token = 10^18 attos).

---

## Hackathon Submission

```
Project Name:   LexiTreasury

Tagline:        Autonomous treasury governance powered by AI consensus.
                No multisig. No committees. A natural-language constitution
                and five independent AI validators are the only authority.

Category:       DeFi / DAO / AI Agents

Network:        GenLayer StudioNet

Chain ID:       61999

Contract:       0x5f3b98c0315C2b9F2aE71d4d3feA6856248A63B4

Deploy TX:      0xea86b850658ca31d33f44b33721fc7ec9f869d7d79ef89275cdc3c238cf0e250

Short Description:
  LexiTreasury is an intelligent contract on GenLayer that manages a DAO
  treasury entirely through AI consensus. Proposals are GitHub repositories.
  The contract fetches live commit counts, license identifiers, and security
  audit markers directly from the GitHub API -- on-chain, no oracle required.
  A deterministic Python function assigns a funding tier; a large language
  model interprets the plain-English DAO constitution and returns a binary
  APPROVED or REJECTED verdict. Five validator nodes independently reproduce
  the full pipeline and reach consensus before any result is written on-chain.
  No human intervention. No multisig. Pure autonomous governance.

Key Differentiators:
  - Constitution-as-code: governance rules are a plain-English string stored
    on-chain, not numeric parameters or bytecode.
  - Zero-trust GitHub verification: live API calls inside the contract mean
    proposers cannot self-report false metrics.
  - Deterministic + non-deterministic split: tier assignment is pure Python
    (all validators always agree), while the AI verdict uses equivalence
    checking to absorb natural LLM variance without breaking consensus.
  - Production-grade error taxonomy: [EXPECTED], [EXTERNAL], [TRANSIENT],
    [LLM_ERROR] prefixes guide validator behaviour for every failure mode.
  - Full-stack: deployed contract + Next.js dashboard + 30+ automated tests.

Tech Stack:
  Contract:   Python / GenVM (GenLayer intelligent contract)
  SDK:        genlayer-js v1.1.8
  Frontend:   Next.js 16 / TypeScript / Tailwind CSS
  Tests:      Jest (unit + integration) + Playwright (E2E)

Live Dashboard: http://localhost:3000 (run `npm run dev` from frontend/)
Explorer:       https://studio.genlayer.com
```

---

## License

MIT -- see [LICENSE](LICENSE) for details.

Built for the **Agent Tank 2026** hackathon on GenLayer.
