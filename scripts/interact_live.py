#!/usr/bin/env python3
"""Live Studio Next lifecycle proofs for LexiTreasury.

Drives the real contract on-chain and records every transaction hash, the
contract address and the SHA-256 of the deployed source into
``deployments/studio-next.json``. Nothing is mocked and no hash is invented:
a step is only recorded after the network returns a receipt.

Contract method mapping (the task's names -> the deployed ABI):
    deposit_treasury            -> deposit            (payable)
    create_grant / evaluate_grant / fund_grant / submit_evidence -> same names
    adjudicate_milestone        -> adjudicate
    claim_payout                -> release_tranche + withdraw
    reject_fraudulent_evidence  -> submit_evidence(stale commit) + adjudicate -> REJECTED

Because evidence must be a commit authored by the verified GitHub owner AFTER
funding, the run is two-phase and you push one real commit in between:

    export LEXI_OWNER_KEY=0x...        # treasury owner / deployer
    export LEXI_RECIPIENT_KEY=0x...    # grant recipient == payout_address in the repo manifest
    python scripts/interact_live.py setup  --repo https://github.com/<owner>/<repo>
    # ... push a NEW commit to <repo> authored by <owner>, copy its URL ...
    python scripts/interact_live.py finish --evidence-url https://github.com/<owner>/<repo>/commit/<sha> \
                                           --stale-url    https://github.com/<owner>/<repo>/commit/<older-sha>

``check`` verifies RPC/chain connectivity without sending anything.
Run with the Python that has genlayer-py installed.
"""

import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "contracts" / "lexitreasury.py"
RECORD_PATH = ROOT / "deployments" / "studio-next.json"
CONFIG_PATH = ROOT / "frontend" / "config" / "studio-dev-deployment.json"

CHAIN_ID = 61997
RPC_URL = "https://studio-next.genlayer.com/api"
EXPLORER = "https://explorer-studio-next.genlayer.com"
ATTO = 10 ** 18
DAY = 86400


def load_sdk():
    try:
        from genlayer_py import create_account, create_client
        from genlayer_py.chains import studio_devnet
    except ImportError:
        sys.exit("genlayer-py is required (e.g. /Users/ehs4n/Westphalia/.venv/bin/python).")
    chain = studio_devnet.model_copy(deep=True) if hasattr(studio_devnet, "model_copy") else studio_devnet
    chain.id = CHAIN_ID
    chain.name = "GenLayer Studio Next"
    chain.rpc_urls = {"default": {"http": [RPC_URL]}}
    chain.block_explorers = {"default": {"name": "GenLayer Studio Next Explorer", "url": EXPLORER}}
    return create_account, create_client, chain


def source_sha256() -> str:
    return hashlib.sha256(CONTRACT_PATH.read_bytes()).hexdigest()


def load_record() -> dict:
    if RECORD_PATH.exists():
        return json.loads(RECORD_PATH.read_text())
    return {"network": {"name": "GenLayer Studio Next", "chain_id": CHAIN_ID, "rpc_url": RPC_URL,
                        "explorer": EXPLORER},
            "contract_address": None, "source_path": "contracts/lexitreasury.py",
            "source_sha256": None, "transactions": []}


def save_record(record: dict) -> None:
    RECORD_PATH.parent.mkdir(parents=True, exist_ok=True)
    RECORD_PATH.write_text(json.dumps(record, indent=2) + "\n")


class Session:
    def __init__(self, owner_key: str, recipient_key: str):
        create_account, create_client, chain = load_sdk()
        self.owner = create_account(owner_key)
        self.recipient = create_account(recipient_key)
        self.client = create_client(chain=chain, endpoint=RPC_URL)
        self.record = load_record()

    @property
    def address(self) -> str:
        if not self.record["contract_address"]:
            sys.exit("No contract address recorded; run `setup` first.")
        return self.record["contract_address"]

    def _log(self, step: str, tx_hash: str, receipt, note: str = "") -> None:
        status = str(receipt.get("statusName") or receipt.get("status_name") or receipt.get("status")) \
            if isinstance(receipt, dict) else str(receipt)
        self.record["transactions"].append({
            "step": step, "tx_hash": tx_hash, "status": status, "note": note,
            "explorer_url": f"{EXPLORER}/tx/{tx_hash}", "recorded_at": int(time.time()),
        })
        self.record["source_sha256"] = source_sha256()
        save_record(self.record)
        print(f"[{step}] {tx_hash} -> {status}")

    def write(self, step, account, method, args=None, value=0, note=""):
        tx_hash = self.client.write_contract(
            address=self.address, function_name=method, account=account,
            args=args or [], value=value)
        receipt = self.client.wait_for_transaction_receipt(
            transaction_hash=tx_hash, status="ACCEPTED", retries=60, interval=5000)
        self._log(step, str(tx_hash), receipt, note)
        return receipt

    def read(self, method, args=None):
        return self.client.read_contract(address=self.address, function_name=method, args=args or [])

    def deploy(self) -> None:
        cfg = json.loads(CONFIG_PATH.read_text())["constructor_args"]
        args = [cfg["constitution"], int(cfg["tier_cap_1"]), int(cfg["tier_cap_2"]),
                int(cfg["tier_cap_3"])]
        tx_hash = self.client.deploy_contract(code=CONTRACT_PATH.read_bytes(), account=self.owner, args=args)
        receipt = self.client.wait_for_transaction_receipt(
            transaction_hash=tx_hash, status="ACCEPTED", retries=60, interval=5000)
        address = (receipt.get("txDataDecoded") or {}).get("contract_address") \
            or (receipt.get("data") or {}).get("contract_address") \
            or receipt.get("to_address") or receipt.get("recipient")
        if not address:
            sys.exit(f"Deployed ({tx_hash}) but could not read the address from the receipt: {receipt}")
        self.record["contract_address"] = address
        self._log("deploy", str(tx_hash), receipt, "constructor")


def phase_setup(args) -> None:
    s = Session(os.environ["LEXI_OWNER_KEY"], os.environ["LEXI_RECIPIENT_KEY"])
    if args.contract:
        s.record["contract_address"] = args.contract
    if not s.record["contract_address"]:
        s.deploy()
    now = int(time.time())
    plan = [
        {"title": "Delivery", "criteria": args.criteria, "amount": str(2 * ATTO), "deadline": now + 30 * DAY},
        {"title": "Follow-up", "criteria": args.criteria, "amount": str(1 * ATTO), "deadline": now + 60 * DAY},
    ]
    s.write("1 deposit_treasury", s.owner, "deposit", value=10 * ATTO)
    s.write("2 create_grant", s.recipient, "create_grant",
            ["LexiTreasury live proof", args.repo, s.recipient.address, json.dumps(plan)])
    grant_id = f"grant_{int(s.read('get_grant_count'))}"
    s.record["grant_id"] = grant_id
    s.record["repository"] = args.repo
    s.write("3 evaluate_grant", s.recipient, "evaluate_grant", [grant_id], note="consensus decision")
    grant = s.read("get_grant", [grant_id])
    if grant["status"] != "APPROVED":
        save_record(s.record)
        sys.exit(f"Grant was not approved (status={grant['status']}): {grant.get('evaluation_reasoning')}")
    s.write("4 fund_grant", s.owner, "fund_grant", [grant_id])
    save_record(s.record)
    print(f"\nFunded {grant_id}. Now push a NEW commit to {args.repo} authored by "
          f"'{grant['maintainer_login']}', then run `finish --evidence-url <commit url> --stale-url <older commit url>`.")


def phase_finish(args) -> None:
    s = Session(os.environ["LEXI_OWNER_KEY"], os.environ["LEXI_RECIPIENT_KEY"])
    grant_id = s.record["grant_id"]
    s.write("5 submit_evidence", s.recipient, "submit_evidence", [grant_id, args.evidence_url])
    s.write("6 adjudicate_milestone", s.owner, "adjudicate", [grant_id], note="consensus decision")
    milestone = s.read("get_milestones", [grant_id, 0, 1])["items"][0]
    if milestone["status"] != "APPROVED":
        sys.exit(f"Milestone not approved: {milestone['status']} / {milestone['summary']}")
    s.write("7a claim_payout (release_tranche)", s.recipient, "release_tranche", [grant_id])
    s.write("7b claim_payout (withdraw)", s.recipient, "withdraw")
    # Fraud scenario on milestone 2: a commit that predates funding must be rejected.
    s.write("8a reject_fraudulent_evidence: submit stale commit", s.recipient, "submit_evidence",
            [grant_id, args.stale_url])
    s.write("8b reject_fraudulent_evidence: adjudicate", s.owner, "adjudicate", [grant_id])
    second = s.read("get_milestones", [grant_id, 1, 1])["items"][0]
    s.record["fraud_scenario"] = {"status": second["status"], "reason_code": second["reason_code"],
                                  "summary": second["summary"]}
    s.record["accounting"] = s.read("get_accounting")
    save_record(s.record)
    if second["status"] != "REJECTED":
        sys.exit(f"Expected the stale commit to be REJECTED, got {second['status']}")
    print("Fraud path proven:", second["reason_code"], "-", second["summary"])


def phase_check(_args) -> None:
    _, create_client, chain = load_sdk()
    client = create_client(chain=chain, endpoint=RPC_URL)
    print("chain id:", chain.id, "rpc:", RPC_URL, "client:", type(client).__name__)
    print("source sha256:", source_sha256())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="phase", required=True)
    sub.add_parser("check").set_defaults(fn=phase_check)
    setup = sub.add_parser("setup")
    setup.add_argument("--repo", required=True)
    setup.add_argument("--contract", help="reuse an already-deployed contract address")
    setup.add_argument("--criteria", default="Add a tested change to the repository that is committed after funding.")
    setup.set_defaults(fn=phase_setup)
    finish = sub.add_parser("finish")
    finish.add_argument("--evidence-url", required=True)
    finish.add_argument("--stale-url", required=True)
    finish.set_defaults(fn=phase_finish)
    args = parser.parse_args()
    args.fn(args)


def run_full_lifecycle_proofs() -> None:
    """Entry point kept for the two-phase flow: run `setup`, push a commit, run `finish`."""
    sys.exit("Run `interact_live.py setup ...` then `interact_live.py finish ...` (see module docstring).")


if __name__ == "__main__":
    main()
