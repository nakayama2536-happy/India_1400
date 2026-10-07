#!/usr/bin/env python3
"""Publish only fund outputs, preserving independent concurrent main changes.

One fetch per attempt; every rebase uses that exact FETCH_HEAD. Never force push
or reuse a candidate after its source data/calculation contract changed upstream.
"""
import json
import os
from pathlib import Path
import subprocess
import sys

OUTPUTS = ("india_core.json", "india_core_history.json")
DEPENDENCIES = OUTPUTS + (
    "update_india_core.py", "fund_history_csv.py",
    "scripts/fund_refresh_gate.py", "scripts/persist_fund_data.py",
    ".github/workflows/update-india-core.yml",
)
MAX_ATTEMPTS = 3


def git(root, *args, check=True):
    result = subprocess.run(
        ["git", *args], cwd=root, text=True, capture_output=True, timeout=90,
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
    )
    if check and result.returncode:
        raise RuntimeError(f"git {args[0]} failed: {result.stderr.strip()}")
    return result


def paths(text):
    return set(filter(None, text.split("\0")))


def persist(root=Path(".")):
    if git(root, "symbolic-ref", "--short", "HEAD").stdout.strip() != "main":
        raise RuntimeError("Fund writeback requires the main checkout")
    if git(root, "rev-parse", "--is-shallow-repository").stdout.strip() != "false":
        raise RuntimeError("Full history is required for ancestry verification")
    base = git(root, "rev-parse", "HEAD").stdout.strip()
    changed = paths(git(root, "diff", "--name-only", "-z", "HEAD").stdout)
    untracked = paths(git(root, "ls-files", "--others", "--exclude-standard", "-z").stdout)
    if changed - set(OUTPUTS) or untracked:
        raise RuntimeError("Unexpected working tree changes; refusing fund writeback")
    for name in OUTPUTS:
        path = root / name
        if path.is_symlink() or not path.is_file():
            raise RuntimeError(f"Missing or unsafe fund output: {name}")
        if not isinstance(json.loads(path.read_text(encoding="utf-8")), dict):
            raise RuntimeError(f"Invalid fund document: {name}")
    if not changed:
        return {"status": "UNCHANGED", "attempts": 0, "base_sha": base}
    git(root, "add", "--", *OUTPUTS)
    git(root, "commit", "-m", "Update India Core fund NAV")
    for attempt in range(1, MAX_ATTEMPTS + 1):
        git(root, "fetch", "--no-tags", "origin", "main")
        upstream = git(root, "rev-parse", "FETCH_HEAD").stdout.strip()
        if git(root, "merge-base", "--is-ancestor", base, upstream, check=False).returncode:
            raise RuntimeError("Upstream history diverged from acquisition base")
        affected = git(root, "diff", "--name-only", base, upstream, "--", *DEPENDENCIES).stdout
        if affected.strip():
            raise RuntimeError("Fund inputs or processing contract changed upstream; "
                               "reacquire from current main: " + affected.strip())
        print(json.dumps({"attempt": attempt, "base_sha": base, "upstream_sha": upstream}))
        git(root, "rebase", upstream)
        result = git(root, "push", "--porcelain", "origin", "HEAD:refs/heads/main", check=False)
        if not result.returncode:
            return {"status": "SAVED", "attempts": attempt,
                    "base_sha": base, "saved_sha": git(root, "rev-parse", "HEAD").stdout.strip()}
        # Retry only a normal concurrent ref advance, not auth/policy/network failures.
        if "[rejected]" not in result.stdout or not any(
            reason in result.stdout for reason in ("fetch first", "non-fast-forward")
        ):
            raise RuntimeError("Push failed (not a retryable concurrent update): " + result.stderr.strip())
    raise RuntimeError("Concurrent updates exceeded 3 writeback attempts; candidate not forced")


def main():
    try:
        report = persist()
        code = 0
    except (RuntimeError, ValueError, OSError, subprocess.TimeoutExpired) as exc:
        report = {"status": "SAVE_FAILED", "error": str(exc)}
        code = 1
    text = json.dumps(report, ensure_ascii=False)
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as out:
            out.write("\n## Fund persistence (separate from acquisition/publication)\n```json\n" + text + "\n```\n")
    return code


if __name__ == "__main__":
    sys.exit(main())
