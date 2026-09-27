# Unified contract test coverage

The original 171 skipped test cases have now been audited from their source code.
There are 118 remaining skips, all in the legacy proposal-only core file. The
adversarial, consensus-hardening, and treasury-lifecycle cases have been rewritten
against the milestone grant state machine and are active.

See [the scenario-by-scenario audit](test-scenario-audit.md) for all 171 original
test IDs, intended behavior, named replacements, rewritten cases, obsolete cases,
and remaining gaps.

Current disposition of the original 171 cases:

| Disposition | Count | Notes |
| --- | ---: | --- |
| Directly mapped to active unified-contract coverage | 113 | Includes repository evaluation, policy, tiers, attestation checks, security gates, and grant state reads. |
| Rewritten against the unified ABI and run | 56 | Includes 53 rewritten adversarial, consensus, and lifecycle cases, two commit-history error classifications, and over-cap plan rejection in place of one-shot clipping. |
| Obsolete contract-level status-filter assertions | 2 | The contract exposes bounded `get_grants` pages; callers filter the returned grant states. |

The detailed audit explains why the original core test bodies remain skipped: they
call the retired proposal-only API. Their scenarios remain traceable to named active
tests except the two status-filter assertions, whose contract endpoint no longer
exists. The harness verifies bookkeeping conservation and local validator
agreement; it does not inspect deployed native balances or exercise Studio Dev.
