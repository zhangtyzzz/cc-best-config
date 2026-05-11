#!/usr/bin/env python3
"""
PreToolUse hook for hf-papers skill.
Checks if the Hugging Face CLI (hf) is installed and auto-installs if missing.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys


def main() -> None:
    if shutil.which("hf"):
        result = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "permissionDecisionReason": "HF CLI is available",
                "additionalContext": (
                    "[HF Papers Skill — CLI Check] "
                    "HF_CLI_READY=1. "
                    "hf command is available. Proceed with hf papers commands."
                ),
            }
        }
        print(json.dumps(result))
        return

    # Not found — try auto-install
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "--quiet", "-U", "huggingface_hub[cli]"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        # Verify it's now available
        if shutil.which("hf"):
            result = {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "allow",
                    "permissionDecisionReason": "HF CLI auto-installed",
                    "additionalContext": (
                        "[HF Papers Skill — CLI Check] "
                        "HF_CLI_READY=1. "
                        "Auto-installed huggingface_hub[cli]. hf command is now available."
                    ),
                }
            }
            print(json.dumps(result))
        else:
            result = {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "allow",
                    "permissionDecisionReason": "HF CLI install succeeded but hf not in PATH",
                    "additionalContext": (
                        "[HF Papers Skill — CLI Check] "
                        "HF_CLI_READY=0. "
                        "pip install succeeded but hf not found in PATH. "
                        "Tell the user to check their PATH or run: pip install -U 'huggingface_hub[cli]'"
                    ),
                }
            }
            print(json.dumps(result))
    except Exception as exc:
        result = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "permissionDecisionReason": "HF CLI auto-install failed",
                "additionalContext": (
                    f"[HF Papers Skill — CLI Check] "
                    f"HF_CLI_READY=0. "
                    f"Auto-install failed: {exc}. "
                    f"Tell the user to install manually: pip install -U 'huggingface_hub[cli]'"
                ),
            }
        }
        print(json.dumps(result))


if __name__ == "__main__":
    main()
