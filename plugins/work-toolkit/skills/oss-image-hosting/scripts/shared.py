"""Shared constants and utilities for oss-image-hosting skill scripts."""

from __future__ import annotations

import os
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = SKILL_DIR / ".env"
REQUIRED_ENV_VARS = [
    "OSS_ACCESS_KEY_ID",
    "OSS_ACCESS_KEY_SECRET",
    "OSS_ENDPOINT",
    "OSS_BUCKET",
]


def load_env_file() -> None:
    """Load .env file from skill directory into os.environ."""
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
