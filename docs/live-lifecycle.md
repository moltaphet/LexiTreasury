# Live lifecycle proof

`scripts/interact_live.py` drives the deployed contract on Studio Next
(chain 61997) in two phases.

1. `setup` deposits into the treasury, creates a two-milestone grant, runs
   `evaluate_grant` (validator consensus) and `fund_grant`. Funding stamps each
   milestone with `funded_at`.
2. The maintainer then pushes a new commit. Evidence must be authored by the
   verified GitHub owner (API `author.login`) and dated on or after `funded_at`.
3. `finish` submits that commit, runs `adjudicate`, releases the tranche and
   withdraws it. It then submits a commit that predates funding for the second
   milestone, which the contract rejects with `EVIDENCE_INCOMPLETE`.

Every transaction hash is recorded in `deployments/studio-next.json` and listed
in the README verification table.
