#!/usr/bin/env python3
"""
将 Markdown 中的本地图片通过 PicList HTTP API 上传到图床，用返回的 URL 替换本地路径。

依赖 PicList App 运行中（HTTP Server 默认 127.0.0.1:36677）。
无需额外依赖，仅使用 Python 标准库。

用法:
    python md_upload_images.py --content-file report.md
    python md_upload_images.py --content "![图](./chart.png)"
    python md_upload_images.py --files image1.png image2.jpg

输出: 处理后的 Markdown 到 stdout，日志到 stderr。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path

PICLIST_API = "http://127.0.0.1:36677/upload"

# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

# Markdown image: ![alt](path "optional title")
# Handles nested parentheses and spaces in filenames via apostrophe quoting
MD_IMAGE_RE = re.compile(
    r"(!\[[^\]]*\]\()"       # group(1): ![alt](
    r"([^)\s]+)"             # group(2): path
    r"(\s+\"[^\"]*\")?"      # group(3): optional title
    r"\)"                    # closing paren
)

# HTML <img> tag: <img ... src="path" ...>
HTML_IMG_RE = re.compile(
    r"(<img\s[^>]*?\bsrc\s*=\s*[\"'])"  # group(1): <img ... src="
    r"([^\"']+)"                          # group(2): path
    r"([\"'][^>]*?>)"                     # group(3): closing " ...>
)

# Fenced / indented code blocks and inline code — skip these regions
_CODE_RE = re.compile(
    r"((?:^|\n)[ ]{0,3}(`{3,})[^\n]*\n(?:.*?\n)?[ ]{0,3}\2[^\S\n]*(?:\n|$))"
    r"|(?:(?:^|\n)[ ]{0,3}(~{3,})[^\n]*\n(?:.*?\n)?[ ]{0,3}\3[^\S\n]*(?:\n|$))"
    r"|(`+)(?!`).+?\4",
    re.DOTALL,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _replace_outside_code(content: str, replacer) -> str:
    """Apply replacer only to prose regions, preserving code blocks verbatim."""
    parts: list[str] = []
    last = 0
    for m in _CODE_RE.finditer(content):
        parts.append(replacer(content[last : m.start()]))
        parts.append(m.group(0))
        last = m.end()
    parts.append(replacer(content[last:]))
    return "".join(parts)


def is_local_path(path: str) -> bool:
    return not path.startswith(("http://", "https://", "//", "data:"))


def normalize_path(raw: str) -> str:
    """Strip file:// prefix and URL-decode percent-encoded characters."""
    s = raw
    if s.startswith("file://"):
        s = s[7:]
    return urllib.parse.unquote(s)


def resolve_path(raw: str, base_dir: Path | None) -> Path:
    s = normalize_path(raw)
    p = Path(s)
    if p.is_absolute():
        return p
    if base_dir:
        return (base_dir / p).resolve()
    return p.resolve()


# ---------------------------------------------------------------------------
# PicList upload
# ---------------------------------------------------------------------------


def upload_via_piclist(file_path: Path) -> str | None:
    """Upload a single file via PicList HTTP API, return URL or None."""
    abs_path = str(file_path.resolve())
    payload = json.dumps({"list": [abs_path]}).encode("utf-8")

    req = urllib.request.Request(
        PICLIST_API,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        print(
            f"错误: 无法连接 PicList (127.0.0.1:36677)。请确保 PicList App 正在运行。\n  {e}",
            file=sys.stderr,
        )
        return None
    except Exception as e:
        print(f"错误: PicList 上传失败: {e}", file=sys.stderr)
        return None

    if data.get("success") and data.get("result"):
        url = data["result"][0]
        print(f"  {file_path.name} → {url}", file=sys.stderr)
        return url

    print(f"警告: PicList 上传失败 {file_path.name}: {data}", file=sys.stderr)
    return None


# ---------------------------------------------------------------------------
# Markdown processing
# ---------------------------------------------------------------------------


def process_markdown(content: str, base_dir: Path | None) -> str:
    """Scan markdown for local images, upload via PicList, replace paths."""
    # Collect local image paths from both ![alt](path) and <img src="path">
    local_images: dict[str, Path] = {}

    def scan(segment: str) -> str:
        for m in MD_IMAGE_RE.finditer(segment):
            path_str = m.group(2)
            if is_local_path(path_str):
                local_images[path_str] = resolve_path(path_str, base_dir)
        for m in HTML_IMG_RE.finditer(segment):
            path_str = m.group(2)
            if is_local_path(path_str):
                local_images[path_str] = resolve_path(path_str, base_dir)
        return segment

    _replace_outside_code(content, scan)

    if not local_images:
        print("没有发现本地图片，无需处理。", file=sys.stderr)
        return content

    # Filter to existing files
    existing = {k: v for k, v in local_images.items() if v.is_file()}
    for k, v in local_images.items():
        if not v.is_file():
            print(f"警告: 文件不存在，跳过: {v}", file=sys.stderr)

    if not existing:
        print("警告: 所有本地图片路径均不存在，跳过处理。", file=sys.stderr)
        return content

    print(f"发现 {len(existing)} 张本地图片，通过 PicList 上传...", file=sys.stderr)

    # Upload and build URL map
    url_map: dict[str, str] = {}
    for raw_path, file_path in existing.items():
        url = upload_via_piclist(file_path)
        if url:
            url_map[raw_path] = url

    if not url_map:
        print("警告: 没有成功上传的图片。", file=sys.stderr)
        return content

    # Replace paths with URLs in both markdown and HTML img patterns
    def replace_md(m: re.Match) -> str:
        path_str = m.group(2)
        if path_str in url_map:
            title = m.group(3) or ""
            return m.group(1) + url_map[path_str] + title + ")"
        return m.group(0)

    def replace_html(m: re.Match) -> str:
        path_str = m.group(2)
        if path_str in url_map:
            return m.group(1) + url_map[path_str] + m.group(3)
        return m.group(0)

    result = _replace_outside_code(
        content,
        lambda seg: HTML_IMG_RE.sub(replace_html, MD_IMAGE_RE.sub(replace_md, seg)),
    )

    print(f"已替换 {len(url_map)} 张图片为在线 URL。", file=sys.stderr)
    return result


# ---------------------------------------------------------------------------
# Direct file upload
# ---------------------------------------------------------------------------


def upload_files(paths: list[str]) -> None:
    """直接上传本地图片文件，每行输出 URL。"""
    for raw in paths:
        p = Path(raw)
        if not p.is_file():
            print(f"警告: 文件不存在，跳过: {p}", file=sys.stderr)
            continue
        url = upload_via_piclist(p)
        if url:
            print(url)
        else:
            print(f"上传失败: {p}", file=sys.stderr)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="通过 PicList 上传本地图片到图床（支持直接上传文件或处理 Markdown）"
    )
    parser.add_argument("--files", nargs="+", default=None,
                        help="直接上传本地图片文件，返回 URL（每行一个）")
    parser.add_argument("--content", default=None, help="Markdown 内容")
    parser.add_argument("--content-file", default=None, help="Markdown 文件路径")
    args = parser.parse_args()

    # 模式 1: 直接上传文件
    if args.files:
        upload_files(args.files)
        return

    # 模式 2: 处理 Markdown
    content = args.content
    base_dir = None

    if args.content_file:
        p = Path(args.content_file)
        if not p.exists():
            print(f"错误: 文件不存在: {p}", file=sys.stderr)
            sys.exit(1)
        content = p.read_text(encoding="utf-8")
        base_dir = p.resolve().parent

    if content is None:
        print("错误: 需要 --files、--content 或 --content-file", file=sys.stderr)
        sys.exit(1)

    if not content:
        return

    result = process_markdown(content, base_dir)
    sys.stdout.write(result)


if __name__ == "__main__":
    main()
