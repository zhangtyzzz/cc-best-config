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


def _venv_subdir() -> str:
    """Return the venv binary subdirectory name for the current platform."""
    return "Scripts" if sys.platform == "win32" else "bin"


def _exe(name: str) -> str:
    """Append .exe on Windows."""
    return f"{name}.exe" if sys.platform == "win32" else name


def _can_import_oss2(python: str) -> bool:
    """Check if a given Python interpreter can import oss2."""
    try:
        subprocess.check_call(
            [python, "-c", "import oss2"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def check_oss2() -> bool:
    """Check oss2 availability in venv first, then fall back to system python."""
    venv_python = SKILL_DIR / ".venv" / _venv_subdir() / _exe("python")
    if venv_python.exists() and _can_import_oss2(str(venv_python)):
        return True
    return _can_import_oss2(sys.executable)


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
        pip = venv_dir / _venv_subdir() / _exe("pip")
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
            value = value.strip().strip("'\"")
            os.environ.setdefault(key.strip(), value)


def get_missing_env_vars() -> list[str]:
    return [v for v in REQUIRED_ENV_VARS if not os.environ.get(v)]


def get_python_exec() -> str:
    """Return the interpreter that can import oss2."""
    venv_python = SKILL_DIR / ".venv" / _venv_subdir() / _exe("python")
    if venv_python.exists() and _can_import_oss2(str(venv_python)):
        return str(venv_python)
    # Fall back to the interpreter running this hook (not necessarily PATH python3)
    return sys.executable


def check_lifecycle(python_exec: str) -> bool:
    """Run a quick lifecycle check via the oss2 library to verify access.
    Also verifies write access when no rules exist yet."""
    check_code = """
import os, sys
MAX_DAYS = 7
PREFIX = 'images/ephemeral'
try:
    import oss2
    from oss2.models import BucketLifecycle, LifecycleExpiration, LifecycleRule
    auth = oss2.Auth(os.environ['OSS_ACCESS_KEY_ID'], os.environ['OSS_ACCESS_KEY_SECRET'])
    bucket = oss2.Bucket(auth, os.environ['OSS_ENDPOINT'], os.environ['OSS_BUCKET'])

    # Step 1: Try to read lifecycle rules
    rules = None
    try:
        existing = bucket.get_bucket_lifecycle()
        rules = list(existing.rules)
    except oss2.exceptions.NoSuchLifecycle:
        rules = []
    except oss2.exceptions.AccessDenied:
        # Cannot read lifecycle — assume configured out of band.
        # md_upload_images.py handles this identically (warn and proceed).
        sys.exit(0)

    # Step 2: Check if a suitable rule already covers our prefix
    covered = False
    for r in rules:
        if r.status != LifecycleRule.ENABLED:
            continue
        if r.expiration is None:
            continue
        if r.expiration.days is None or r.expiration.days > MAX_DAYS:
            continue
        rp = (r.prefix or '').rstrip('/')
        if PREFIX.startswith(rp):
            covered = True
            break
    if covered:
        sys.exit(0)

    # Step 3: Not covered — try to create the rule (failure = not ready)
    rule = LifecycleRule(
        'auto-delete-ephemeral-images', PREFIX + '/',
        status=LifecycleRule.ENABLED,
        expiration=LifecycleExpiration(days=1),
    )
    rules = [r for r in rules if r.id != 'auto-delete-ephemeral-images']
    rules.append(rule)
    bucket.put_bucket_lifecycle(BucketLifecycle(rules))
    sys.exit(0)
except oss2.exceptions.OssError:
    sys.exit(1)
except Exception:
    sys.exit(1)
"""
    try:
        subprocess.check_call(
            [python_exec, "-c", check_code],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=os.environ.copy(),
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


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

    # Step 3: Verify lifecycle access (only if oss2 and env are ready)
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

    # Step 4: Check lifecycle access so md_upload_images.py won't fail later
    lifecycle_ok = check_lifecycle(python_exec)
    if not lifecycle_ok:
        issues.append(
            "无法验证 OSS 生命周期规则（权限不足或配置错误）。"
            "请使用有 bucket 管理权限的 AK 运行 --setup-lifecycle，"
            "或手动在 OSS 控制台配置生命周期规则"
        )
        emit(
            "allow",
            "OSS environment not ready — lifecycle check failed",
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
