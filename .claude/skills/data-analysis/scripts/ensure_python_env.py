#!/usr/bin/env python3
"""
PreToolUse hook for data-analysis skill.
Checks the Python analysis stack (pandas/matplotlib/seaborn) and auto-installs
missing packages into a local .venv. Injects the environment status into
Claude's context via additionalContext so the agent never needs to run this manually.
"""

from __future__ import annotations

import importlib
import json
import os
import subprocess
import sys


REQUIRED_MODULES = ["pandas", "matplotlib", "seaborn"]


def check_module(name: str) -> bool:
    try:
        importlib.import_module(name)
        return True
    except ImportError:
        return False


def get_missing() -> list[str]:
    return [m for m in REQUIRED_MODULES if not check_module(m)]


def setup_venv(venv_dir: str) -> str:
    """Create a .venv and install missing packages. Returns the venv python path."""
    if not os.path.exists(venv_dir):
        subprocess.check_call([sys.executable, "-m", "venv", venv_dir],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    if sys.platform == "win32":
        python_path = os.path.join(venv_dir, "Scripts", "python")
    else:
        python_path = os.path.join(venv_dir, "bin", "python")

    subprocess.check_call(
        [python_path, "-m", "pip", "install", "--quiet"] + REQUIRED_MODULES,
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )
    return python_path


def main() -> None:
    missing = get_missing()

    if not missing:
        # Environment ready — inject context and allow
        result = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "permissionDecisionReason": "Python analysis environment is ready",
                "additionalContext": (
                    "[Data Analysis Skill — Environment Check] "
                    "PYTHON_ANALYSIS_READY=1. "
                    "pandas, matplotlib, seaborn are all available. "
                    "Proceed with analysis code directly."
                )
            }
        }
        print(json.dumps(result))
        return

    # Missing deps — try auto-install
    venv_dir = os.path.join(os.getcwd(), ".venv")
    try:
        venv_python = setup_venv(venv_dir)
        result = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "permissionDecisionReason": "Python deps auto-installed into .venv",
                "additionalContext": (
                    f"[Data Analysis Skill — Environment Check] "
                    f"PYTHON_ANALYSIS_READY=1. "
                    f"Auto-installed {','.join(missing)} into {venv_dir}. "
                    f"Use {venv_python} as the Python executable for analysis code. "
                    f"Note this in the report's Environment section."
                )
            }
        }
        print(json.dumps(result))
    except Exception as exc:
        # Installation failed — still allow the Bash call but warn the agent
        result = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "permissionDecisionReason": "Python env setup failed — see context",
                "additionalContext": (
                    f"[Data Analysis Skill — Environment Check] "
                    f"PYTHON_ANALYSIS_READY=0. "
                    f"Missing: {','.join(missing)}. "
                    f"Auto-install failed: {exc}. "
                    f"Tell the user about this blocker. Do not pretend analysis ran."
                )
            }
        }
        print(json.dumps(result))


if __name__ == "__main__":
    main()
