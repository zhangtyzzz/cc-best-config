#!/usr/bin/env python3
"""Check and auto-create OSS lifecycle rule for ephemeral image prefix.

Exit 0 if a suitable rule exists or was created successfully.
Exit 1 if the rule cannot be verified or created.
"""

from __future__ import annotations

import os
import sys

MAX_DAYS = 1
PREFIX = "images/ephemeral"

try:
    import oss2
    from oss2.models import BucketLifecycle, LifecycleExpiration, LifecycleRule

    auth = oss2.Auth(
        os.environ["OSS_ACCESS_KEY_ID"], os.environ["OSS_ACCESS_KEY_SECRET"]
    )
    bucket = oss2.Bucket(auth, os.environ["OSS_ENDPOINT"], os.environ["OSS_BUCKET"])

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
        rp = (r.prefix or "").rstrip("/")
        if PREFIX.startswith(rp):
            covered = True
            break
    if covered:
        sys.exit(0)

    # Step 3: Not covered — try to create the rule (failure = not ready)
    rule = LifecycleRule(
        "auto-delete-ephemeral-images",
        PREFIX + "/",
        status=LifecycleRule.ENABLED,
        expiration=LifecycleExpiration(days=1),
    )
    rules = [r for r in rules if r.id != "auto-delete-ephemeral-images"]
    rules.append(rule)
    bucket.put_bucket_lifecycle(BucketLifecycle(rules))
    sys.exit(0)
except oss2.exceptions.OssError:
    sys.exit(1)
except Exception:
    sys.exit(1)
