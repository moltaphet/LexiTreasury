"""Make gl.message.raw["datetime"] follow direct_vm.warp() at call time.

On-chain, every transaction gets a fresh message envelope; direct mode builds it
once, so warping mid-test would otherwise be invisible to the contract.
"""


def follow_vm_clock(monkeypatch, direct_vm):
    import genlayer as gl

    class _LiveRaw(dict):
        def __getitem__(self, key):
            if key == "datetime":
                return direct_vm._datetime
            return dict.__getitem__(self, key)

    monkeypatch.setattr(gl.message, "raw", _LiveRaw(gl.message.raw))
