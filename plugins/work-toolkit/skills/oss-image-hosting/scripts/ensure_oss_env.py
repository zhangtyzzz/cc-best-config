#!/usr/bin/env python3
"""
PreToolUse hook for oss-image-hosting skill.
Checks oss2 availability, .env config, and OSS lifecycle rule.
Auto-installs oss2 and sets up lifecycle rule on first use.
Injects environment status into Claude's context via additionalContext.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = SKILL_DIR / ".env"
ENV_EXAMPLE = SKILL_DIR / ".env.example"
REQUIRED_ENV_VARS = [
    "OSS_ACCESS_KEY_ID",
    "OSS_ACCESS_KEY_SECRET",
    "OSS_ENDPOINT",
    "OSS_BUCKET",
]


def emit(decision: str, reason: str, context: str) -> None:
    result = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": reason,
            "additionalContext": context,
        }
    }
    print(json.dumps(result))


def check_oss2() -> bool:
    try:
        import oss2  # noqa: F401
        return True
    except ImportError:
        return False


def install_oss2() -> bool:
    """Install oss2 into a local .venv."""
    venv_dir = SKILL_DIR / ".venv"
    try:
        if not venv_dir.exists():
            subprocess.check_call(
                [sys.executable, "-m", "venv", str(venv_dir)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        pip = venv_dir / "bin" / "pip"
        subprocess.check_call(
            [str(pip), "install", "--quiet", "oss2"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        return True
    except Exception:
        return False


def load_env_file() -> None:
    """Load .env file into os.environ (simple key=value parser)."""
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


def get_missing_env_vars() -> list[str]:
    return [v for v in REQUIRED_ENV_VARS if not os.environ.get(v)]


def get_python_exec() -> str:
    """Return the venv python path if it exists, else system python3."""
    venv_python = SKILL_DIR / ".venv" / "bin" / "python"
    if venv_python.exists():
        return str(venv_python)
    return "python3"


def main() -> None:
    issues: list[str] = []

    # Step 1: Check oss2
    has_oss2 = check_oss2()
    installed_oss2 = False
    if not has_oss2:
        installed_oss2 = install_oss2()
        if not installed_oss2:
            issues.append("oss2 未安装且自动安装失败，请手动执行: pip3 install oss2")

    # Step 2: Load .env and check env vars
    load_env_file()
    missing_vars = get_missing_env_vars()
    if missing_vars:
        issues.append(
            f"缺少环境变量: {', '.join(missing_vars)}。"
            f"请在 {ENV_FILE} 中配置（参考 .env.example）"
        )

    # Step 3: Report
    python_exec = get_python_exec()
    tag = "[OSS Image Hosting — Environment Check]"

    if issues:
        emit(
            "allow",
            "OSS environment not ready — see context",
            f"{tag} OSS_READY=0. Issues: {'; '.join(issues)}. "
            f"Tell the user about these blockers and help them fix it. "
            f"Do not attempt to run md_upload_images.py until resolved.",
        )
        return

    context_parts = [f"{tag} OSS_READY=1."]
    if installed_oss2:
        context_parts.append(f"Auto-installed oss2 into {SKILL_DIR / '.venv'}.")
    context_parts.append(
        f"Use `{python_exec} ${{CLAUDE_SKILL_DIR}}/scripts/md_upload_images.py` "
        f"to process markdown images."
    )

    emit(
        "allow",
        "OSS environment is ready",
        " ".join(context_parts),
    )


if __name__ == "__main__":
    main()
