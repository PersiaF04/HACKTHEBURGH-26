"""Check generated files in data/public/ against the shapes of contracts/fixtures/.

The fixtures are the contract's examples, so a generated file is valid when every key in the
fixture exists with a compatible type (numbers may be null: "missing data is null, never 0").
Run: ``python -m turnup.validate`` from ``pipeline/``.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "contracts" / "fixtures"
PUBLIC = REPO_ROOT / "data" / "public"
LANE_A_FILES = ["farms.json", "curtailment_daily.json", "iceberg.json", "dfs_requests.json"]
# Objects keyed by data values (farm ids, zone ids) rather than fixed field names.
DYNAMIC_KEY_PATHS = {"periods[].farms", "requests[].zone_caps_mw"}


def _kind(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "bool"
    if isinstance(v, (int, float)):
        return "number"
    return type(v).__name__


def compare(expected, actual, path: str = "") -> list[str]:
    errors: list[str] = []
    ek, ak = _kind(expected), _kind(actual)
    if ak == "null" and ek in ("number", "str", "null"):
        return errors
    if ek == "null":
        return errors
    if ek != ak:
        return [f"{path or '<root>'}: expected {ek}, got {ak}"]
    if ek == "dict":
        if path in DYNAMIC_KEY_PATHS:
            sample = next(iter(expected.values()), None)
            for k, v in actual.items():
                if sample is not None:
                    errors += compare(sample, v, f"{path}.{k}")
            return errors
        for k, v in expected.items():
            if path == "" and k == "meta":
                continue
            if k not in actual:
                errors.append(f"{path}.{k}: missing")
            else:
                errors += compare(v, actual[k], f"{path}.{k}" if path else k)
    elif ek == "list" and expected and actual:
        for item in actual[:50]:
            errors += compare(expected[0], item, f"{path}[]")
    return errors


def check_meta(obj) -> list[str]:
    m = obj.get("meta") if isinstance(obj, dict) else None
    if not isinstance(m, dict):
        return ["meta: missing"]
    errs = [f"meta.{k}: missing" for k in ("source", "generated_utc", "retrospective") if k not in m]
    if m.get("fixture"):
        errs.append("meta.fixture: generated files must not be marked as fixtures")
    return errs


def validate_file(public_path: Path, fixture_path: Path) -> list[str]:
    actual = json.loads(public_path.read_text(encoding="utf-8"))
    expected = json.loads(fixture_path.read_text(encoding="utf-8"))
    return check_meta(actual) + compare(expected, actual)


def main() -> int:
    targets = [(PUBLIC / f, FIXTURES / f) for f in LANE_A_FILES]
    fixture_replay = next((FIXTURES / "replay").glob("*.json"))
    targets += [(p, fixture_replay) for p in sorted((PUBLIC / "replay").glob("*.json")) if p.name != "live.json"]
    bad = 0
    for public_path, fixture_path in targets:
        if not public_path.exists():
            print(f"MISSING {public_path.relative_to(REPO_ROOT)}")
            bad += 1
            continue
        errs = validate_file(public_path, fixture_path)
        print(f"{'OK     ' if not errs else 'INVALID'} {public_path.relative_to(REPO_ROOT)}")
        for e in errs[:10]:
            print("   ", e)
        bad += bool(errs)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
