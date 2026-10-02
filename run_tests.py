"""
Test runner that works around a Python 3.14 compatibility issue in a third-party
pytest plugin (hydra_pytest uses typing.io which was removed in 3.12+).

Usage:
    python run_tests.py
    python run_tests.py tests/direct/test_milestone_lifecycle.py -v
    python run_tests.py tests/direct/test_milestone_lifecycle.py -k test_refund
"""
import sys
import importlib.metadata
import pluggy._manager as _pm

_orig_load = _pm.PluginManager.load_setuptools_entrypoints


def _safe_load(self, group, name=None):
    count = 0
    for ep in importlib.metadata.entry_points(group=group):
        if name is not None and ep.name != name:
            continue
        if self.get_plugin(ep.name) is not None:
            continue
        if self.is_blocked(ep.name):
            continue
        try:
            plugin = ep.load()
        except Exception as exc:
            print(f"[run_tests] skipped broken plugin {ep.name!r}: {type(exc).__name__}", file=sys.stderr)
            continue
        self.register(plugin, name=ep.name)
        count += 1
    return count


_pm.PluginManager.load_setuptools_entrypoints = _safe_load

import pytest

args = sys.argv[1:] or ["tests/direct/test_milestone_lifecycle.py", "-v"]
sys.exit(pytest.main(args))
