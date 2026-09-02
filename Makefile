# LexiTreasury build pipeline
#
# Static VM safety (genvm-lint) runs BEFORE the tests so a broken contract fails the
# pipeline instantly, without waiting for the in-memory direct-mode suite.
#
#   make lint    - AST + SDK semantic validation of the contract (zero VM errors)
#   make types   - SDK-configured Pyright type check
#   make test    - full pytest suite (core + direct-mode)
#   make direct  - fast direct-mode suite only (no Docker, ~sub-second)
#   make check   - lint + types + test (the CI gate)

CONTRACT := contracts/lexitreasury.py
PY       := python run_tests.py

.PHONY: lint types test direct check

lint:
	genvm-lint check $(CONTRACT)

types:
	@out="$$(genvm-lint typecheck $(CONTRACT) 2>&1)"; echo "$$out"; \
	echo "$$out" | grep -q "0 error(s)" || { echo "TYPECHECK FAILED"; exit 1; }

test:
	$(PY) tests/ -q

direct:
	$(PY) tests/direct/ -q

check: lint types test
	@echo "OK: static VM checks + type check + full test suite passed"
