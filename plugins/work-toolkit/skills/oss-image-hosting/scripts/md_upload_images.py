#!/usr/bin/env python3
"""
将 Markdown 中的本地图片上传到阿里云 OSS，生成签名 URL 并替换本地路径。

用法:
    python md_upload_images.py --content-file report.md
    python md_upload_images.py --content "# Title\n![img](./screenshot.png)"
    python md_upload_images.py --setup-lifecycle

环境变量 (或 .env 文件):
    OSS_ACCESS_KEY_ID      AK
    OSS_ACCESS_KEY_SECRET  SK
    OSS_ENDPOINT           如 https://oss-cn-hangzhou.aliyuncs.com
    OSS_BUCKET             如 vchen-dev
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
from pathlib import Path

import oss2
from oss2.models import BucketLifecycle, LifecycleExpiration, LifecycleRule


OSS_PREFIX = "images/ephemeral"
SIGN_EXPIRY = 3600  # 1 hour
LIFECYCLE_RULE_ID = "auto-delete-ephemeral-images"
LIFECYCLE_DAYS = 1  # OSS minimum granularity

# Markdown image patterns — group(2) captures the path, group(3) captures optional
# title + closing paren. Supports spaces and balanced parentheses in filenames.
MD_IMAGE_RE = re.compile(r'(!\[[^\]]*\]\()((?:[^()"]+|\([^)]*\))+?)(\s+"[^"]*")?\)')
HTML_IMG_RE = re.compile(r'(<img\s[^>]*?src=")([^"]+)("[^>]*>)', re.IGNORECASE)

SKILL_DIR = Path(__file__).resolve().parent.parent


def load_env_file() -> None:
    """Load .env file from skill directory into os.environ."""
    env_file = SKILL_DIR / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            value = value.strip().strip("'\"")
            os.environ.setdefault(key.strip(), value)


def is_local_path(path: str) -> bool:
    return not path.startswith(("http://", "https://", "data:"))


def make_oss_key(file_path: Path) -> str:
    content_hash = hashlib.md5(file_path.read_bytes()).hexdigest()[:8]
    return f"{OSS_PREFIX}/{content_hash}_{file_path.name}"


def create_bucket() -> oss2.Bucket:
    key_id = os.environ.get("OSS_ACCESS_KEY_ID", "")
    key_secret = os.environ.get("OSS_ACCESS_KEY_SECRET", "")
    endpoint = os.environ.get("OSS_ENDPOINT", "")
    bucket_name = os.environ.get("OSS_BUCKET", "")

    missing = [
        name
        for name, val in [
            ("OSS_ACCESS_KEY_ID", key_id),
            ("OSS_ACCESS_KEY_SECRET", key_secret),
            ("OSS_ENDPOINT", endpoint),
            ("OSS_BUCKET", bucket_name),
        ]
        if not val
    ]
    if missing:
        print(f"错误：缺少环境变量: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    auth = oss2.Auth(key_id, key_secret)
    return oss2.Bucket(auth, endpoint, bucket_name)


def setup_lifecycle(bucket: oss2.Bucket) -> None:
    """Set OSS lifecycle rule to auto-delete ephemeral objects."""
    rule = LifecycleRule(
        LIFECYCLE_RULE_ID,
        f"{OSS_PREFIX}/",
        status=LifecycleRule.ENABLED,
        expiration=LifecycleExpiration(days=LIFECYCLE_DAYS),
    )
    try:
        existing = bucket.get_bucket_lifecycle()
        rules = [r for r in existing.rules if r.id != LIFECYCLE_RULE_ID]
    except oss2.exceptions.NoSuchLifecycle:
        rules = []

    rules.append(rule)
    bucket.put_bucket_lifecycle(BucketLifecycle(rules))
    print(
        f"✅ 已设置生命周期规则: {OSS_PREFIX}/ 下的对象将在 "
        f"{LIFECYCLE_DAYS} 天后自动删除",
        file=sys.stderr,
    )


def ensure_lifecycle(bucket: oss2.Bucket) -> bool:
    """Ensure lifecycle rule exists. Returns True if verified, False if not.
    Uploads should be blocked when lifecycle cannot be confirmed."""
    try:
        existing = bucket.get_bucket_lifecycle()
        for r in existing.rules:
            if r.id == LIFECYCLE_RULE_ID:
                return True
    except oss2.exceptions.NoSuchLifecycle:
        pass
    except oss2.exceptions.OssError:
        print(
            "错误：无法读取生命周期规则（权限不足）。上传已取消以防止文件永久留存。\n"
            "请使用有 bucket 管理权限的 AK 运行 --setup-lifecycle，"
            "或手动在 OSS 控制台配置生命周期规则后重试。",
            file=sys.stderr,
        )
        return False
    try:
        setup_lifecycle(bucket)
        return True
    except oss2.exceptions.OssError:
        print(
            "错误：无法设置生命周期规则（权限不足）。上传已取消以防止文件永久留存。\n"
            "请使用有 bucket 管理权限的 AK 运行 --setup-lifecycle，"
            "或手动在 OSS 控制台配置生命周期规则后重试。",
            file=sys.stderr,
        )
        return False


def upload_and_sign(bucket: oss2.Bucket, local_path: Path) -> str | None:
    if not local_path.exists():
        print(f"警告：文件不存在，跳过: {local_path}", file=sys.stderr)
        return None
    if not local_path.is_file():
        print(f"警告：不是文件，跳过: {local_path}", file=sys.stderr)
        return None

    key = make_oss_key(local_path)
    try:
        bucket.put_object_from_file(key, str(local_path))
        url = bucket.sign_url("GET", key, SIGN_EXPIRY)
        print(f"  ✓ {local_path.name} → {key}", file=sys.stderr)
        return url
    except Exception as e:
        print(f"警告：上传失败 {local_path.name}: {e}", file=sys.stderr)
        return None


def resolve_path(raw_path: str, base_dir: Path | None) -> Path:
    p = Path(raw_path)
    if p.is_absolute():
        return p
    if base_dir:
        return (base_dir / p).resolve()
    return p.resolve()


def process_markdown(content: str, base_dir: Path | None) -> str:
    local_images: dict[str, Path] = {}

    for pattern in (MD_IMAGE_RE, HTML_IMG_RE):
        for m in pattern.finditer(content):
            path_str = m.group(2)
            # Strip CommonMark angle brackets: ![img](<path with spaces>)
            if path_str.startswith("<") and path_str.endswith(">"):
                path_str = path_str[1:-1]
            if is_local_path(path_str):
                local_images[path_str] = resolve_path(path_str, base_dir)

    if not local_images:
        print("没有发现本地图片，无需处理。", file=sys.stderr)
        return content

    print(f"发现 {len(local_images)} 张本地图片，开始上传...", file=sys.stderr)

    bucket = create_bucket()
    if not ensure_lifecycle(bucket):
        sys.exit(1)
    url_map: dict[str, str] = {}

    for raw_path, resolved_path in local_images.items():
        signed_url = upload_and_sign(bucket, resolved_path)
        if signed_url:
            url_map[raw_path] = signed_url

    if not url_map:
        print("警告：没有成功上传的图片。", file=sys.stderr)
        return content

    def replace_md(m: re.Match) -> str:
        path_str = m.group(2)
        # Normalize angle-bracketed paths to match upload keys
        normalized = path_str[1:-1] if path_str.startswith("<") and path_str.endswith(">") else path_str
        if normalized in url_map:
            title = m.group(3) or ""
            return m.group(1) + url_map[normalized] + title + ")"
        return m.group(0)

    def replace_html(m: re.Match) -> str:
        path_str = m.group(2)
        if path_str in url_map:
            return m.group(1) + url_map[path_str] + m.group(3)
        return m.group(0)

    content = MD_IMAGE_RE.sub(replace_md, content)
    content = HTML_IMG_RE.sub(replace_html, content)

    print(f"✅ 已替换 {len(url_map)} 张图片链接。", file=sys.stderr)
    return content


def main() -> None:
    parser = argparse.ArgumentParser(
        description="将 Markdown 中的本地图片上传到 OSS 并替换为签名 URL"
    )
    parser.add_argument("--content", default="", help="Markdown 内容")
    parser.add_argument("--content-file", default="", help="Markdown 文件路径")
    parser.add_argument(
        "--setup-lifecycle",
        action="store_true",
        help="设置 OSS 生命周期规则（只需执行一次）",
    )
    args = parser.parse_args()

    load_env_file()

    if args.setup_lifecycle:
        bucket = create_bucket()
        setup_lifecycle(bucket)
        return

    content = args.content
    base_dir = None

    if args.content_file:
        p = Path(args.content_file)
        if not p.exists():
            print(f"错误：文件不存在: {p}", file=sys.stderr)
            sys.exit(1)
        content = p.read_text(encoding="utf-8")
        base_dir = p.resolve().parent

    if not content:
        print("错误：需要 --content 或 --content-file", file=sys.stderr)
        sys.exit(1)

    result = process_markdown(content, base_dir)
    sys.stdout.write(result)


if __name__ == "__main__":
    main()
