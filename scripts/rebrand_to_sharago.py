"""Sharago rebranding — code-level find/replace.

Replaces user-visible occurrences of "VEHIQ" / "Vehiq" / "vehiq.pl" with
"Sharago" / "sharago.pl". Deliberately SKIPS:
  - `vehiq-*` Tailwind class names (CSS tokens — internal, never shown)
  - `vehiq_*` snake_case identifiers (localStorage keys, env vars, DB names,
    function/variable names) — runtime migration handles localStorage,
    and DB/env keys are intentionally untouched for backward compat.
  - /app/memory/ and /app/test_reports/ — historical records.
  - node_modules / build / .git / __pycache__.

Run from /app:  python3 scripts/rebrand_to_sharago.py
"""
import os
import re
from pathlib import Path

ROOT = Path("/app")
SKIP_DIRS = {"node_modules", "build", ".git", "__pycache__", "memory", "test_reports", ".venv", "venv", "dist"}
SKIP_FILES = {"yarn.lock", "package-lock.json", "rebrand_to_sharago.py"}
TARGET_EXTS = {".py", ".js", ".jsx", ".ts", ".tsx", ".json", ".html", ".css", ".md", ".xml", ".txt"}

# Safe replacements (compiled in order). Word boundaries are critical so we
# don't accidentally touch identifiers like `vehiq_session` or `vehiq-gold`.
RULES = [
    # All-caps brand mentions
    (re.compile(r"\bVEHIQ\b"), "Sharago"),
    # CamelCase brand mentions
    (re.compile(r"\bVehiq\b"), "Sharago"),
    # Domain → domain (keeps email TLDs etc. intact)
    (re.compile(r"\bvehiq\.pl\b"), "sharago.pl"),
    (re.compile(r"\bvehiq\.com\b"), "sharago.com"),
]


def should_process(path: Path) -> bool:
    if any(part in SKIP_DIRS for part in path.parts):
        return False
    if path.name in SKIP_FILES:
        return False
    if path.suffix.lower() not in TARGET_EXTS:
        return False
    return True


def main() -> None:
    changed: list[tuple[Path, int]] = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        # In-place filter to skip walking into ignored dirs
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            p = Path(dirpath) / fn
            if not should_process(p):
                continue
            try:
                original = p.read_text(encoding="utf-8")
            except (UnicodeDecodeError, FileNotFoundError):
                continue
            updated = original
            for pattern, repl in RULES:
                updated = pattern.sub(repl, updated)
            if updated != original:
                hits = sum(1 for _ in re.finditer(r"Sharago|sharago\.pl|sharago\.com", updated)) - \
                       sum(1 for _ in re.finditer(r"Sharago|sharago\.pl|sharago\.com", original))
                p.write_text(updated, encoding="utf-8")
                changed.append((p.relative_to(ROOT), hits))

    print(f"\n=== Rebrand complete — {len(changed)} files modified ===")
    for f, n in sorted(changed):
        print(f"  +{n:3d}  {f}")


if __name__ == "__main__":
    main()
