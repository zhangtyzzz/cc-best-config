"""Shared utilities for all image generation adapters."""

import os
import json
import base64
import time
import mimetypes
import requests
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_MODEL = "google/gemini-3-1-flash-image-preview"
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"

REF_IMAGE_AUTO_PROMPT = (
    "Based on the reference image(s) provided, generate an image that "
    "maintains the same visual style, character design/IP, and artistic "
    "consistency. "
)

# .jpg/.jpeg both map to image/jpeg; reverse map prefers .jpg (set explicitly)
_MIME_EXT_MAP = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
}
_EXT_FROM_MIME = {v: k for k, v in _MIME_EXT_MAP.items()}
_EXT_FROM_MIME["image/jpeg"] = ".jpg"

_NATIVE_OPENAI_HOSTS = ("api.openai.com",)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


def get_config() -> Dict[str, Any]:
    api_key = os.environ.get("IMAGE_GEN_API_KEY", "").strip()
    base_url = os.environ.get("IMAGE_GEN_BASE_URL", "").strip() or DEFAULT_BASE_URL
    face_url = os.environ.get("IMAGE_GEN_FACE_URL", "").strip()
    model = os.environ.get("IMAGE_GEN_MODEL", "").strip() or DEFAULT_MODEL
    missing = []
    if not api_key:
        missing.append("IMAGE_GEN_API_KEY")
    return {
        "api_key": api_key, "base_url": base_url,
        "face_url": face_url or None, "model": model, "missing": missing,
    }


# ---------------------------------------------------------------------------
# Prompt helpers
# ---------------------------------------------------------------------------


def collect_input_images(
    ref_images: Optional[List[str]],
    face: Optional[str],
    images: Optional[List[str]],
) -> List[str]:
    """Merge all image sources into a single ordered list."""
    result: List[str] = []
    if ref_images:
        result.extend(ref_images)
    if face:
        result.append(face)
    if images:
        result.extend(images)
    return result


def build_final_prompt(
    prompt: str,
    ref_images: Optional[List[str]],
    auto_prompt: bool,
) -> str:
    if ref_images and auto_prompt:
        return REF_IMAGE_AUTO_PROMPT + prompt
    return prompt


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------


def request_with_retry(method, url, max_attempts=2, **kwargs):
    """Send request with one retry on 429/5xx."""
    resp = None
    for attempt in range(max_attempts):
        resp = method(url, **kwargs)
        if resp.status_code in (429, 500, 502, 503, 504) and attempt < max_attempts - 1:
            time.sleep(5)
            continue
        resp.raise_for_status()
        return resp
    return resp


def format_api_error(exc: requests.exceptions.RequestException) -> str:
    if hasattr(exc, "response") and exc.response is not None:
        try:
            return json.dumps(exc.response.json(), ensure_ascii=False)
        except Exception:
            return exc.response.text
    return str(exc)


# ---------------------------------------------------------------------------
# Model name helpers
# ---------------------------------------------------------------------------


def resolve_api_model(model: str, base_url: str) -> str:
    """Strip provider prefix only for native OpenAI endpoints.

    Routers (OpenRouter, NewAPI, etc.) need the full prefixed name like
    'openai/gpt-image-2' because they use it for routing. Native OpenAI
    doesn't understand prefixed names.
    """
    if "/" not in model:
        return model
    host = urlparse(base_url).hostname or ""
    if any(host.endswith(h) for h in _NATIVE_OPENAI_HOSTS):
        return model.rsplit("/", 1)[-1]
    return model


# ---------------------------------------------------------------------------
# Image I/O
# ---------------------------------------------------------------------------


def guess_mime(path: Path) -> str:
    mime, _ = mimetypes.guess_type(str(path))
    return mime or _MIME_EXT_MAP.get(path.suffix.lower(), "image/png")


def resolve_to_content_part(image_path_or_url: str) -> Dict[str, Any]:
    """Resolve image → Chat Completions content part (base64 data-url or url)."""
    p = Path(image_path_or_url)
    if p.exists() and p.is_file():
        mime = guess_mime(p)
        b64 = base64.b64encode(p.read_bytes()).decode()
        return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}}
    return {"type": "image_url", "image_url": {"url": image_path_or_url}}


def resolve_to_bytes(image_path_or_url: str) -> Tuple[bytes, str, str]:
    """Resolve image → (raw_bytes, filename, mime) for multipart upload."""
    p = Path(image_path_or_url)
    if p.exists() and p.is_file():
        return p.read_bytes(), p.name, guess_mime(p)
    resp = requests.get(image_path_or_url, timeout=60)
    resp.raise_for_status()
    ct = resp.headers.get("content-type", "image/png").split(";")[0].strip()
    ext = _EXT_FROM_MIME.get(ct, ".png")
    return resp.content, f"input_image{ext}", ct


def save_image_file(data: bytes, output_dir: str, index: int,
                    ext: str = ".png") -> Dict[str, str]:
    """Write raw bytes to disk and return path dict."""
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    fp = Path(output_dir) / f"image_gen_{ts}_{index}{ext}"
    fp.write_bytes(data)
    return {"local_path": str(fp.absolute())}


def _detect_ext_from_bytes(data: bytes) -> str:
    """Detect image format from magic bytes."""
    if data[:3] == b'\xff\xd8\xff':
        return ".jpg"
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return ".png"
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return ".webp"
    if data[:3] == b'GIF':
        return ".gif"
    if data[:2] == b'BM':
        return ".bmp"
    return ".png"


def save_b64(b64_or_dataurl: str, output_dir: str, index: int) -> Dict[str, str]:
    """Decode base64 (with or without data-url header) and save."""
    ext = ".png"
    if "," in b64_or_dataurl:
        header, b64_data = b64_or_dataurl.split(",", 1)
        if "image/" in header:
            mime_ext = header.split("image/")[1].split(";")[0].strip()
            ext = {"jpeg": ".jpg", "png": ".png", "gif": ".gif",
                   "webp": ".webp", "bmp": ".bmp"}.get(mime_ext, f".{mime_ext}")
    else:
        b64_data = b64_or_dataurl
    raw = base64.b64decode(b64_data)
    if ext == ".png":
        ext = _detect_ext_from_bytes(raw)
    return save_image_file(raw, output_dir, index, ext)


def download_and_save(url: str, output_dir: str, index: int) -> Dict[str, str]:
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    ct = resp.headers.get("content-type", "image/png").split(";")[0].strip()
    ext = _EXT_FROM_MIME.get(ct, ".png")
    return save_image_file(resp.content, output_dir, index, ext)


def save_image_output(value: str, output_dir: str, index: int) -> Dict[str, str]:
    """Auto-detect whether value is base64/data-url or an HTTP URL and save."""
    if value.startswith("http://") or value.startswith("https://"):
        return download_and_save(value, output_dir, index)
    return save_b64(value, output_dir, index)


# ---------------------------------------------------------------------------
# Result builder
# ---------------------------------------------------------------------------


def make_result(
    success: bool,
    model: str,
    adapter: str,
    base_url: str,
    prompt: str,
    ref_images: Optional[List[str]],
    auto_prompt: bool,
    saved_images: List[Dict],
    text_parts: List[str],
    error: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a uniform result dict shared by all adapters."""
    if not success:
        return {"success": False, "error": error or "Unknown error", "adapter": adapter}
    usable = [img for img in saved_images if "local_path" in img]
    if not usable and not text_parts:
        return {
            "success": False,
            "error": "Generation returned no images",
            "adapter": adapter,
            "images": saved_images,
        }
    return {
        "success": True,
        "model": model,
        "adapter": adapter,
        "base_url": base_url,
        "prompt": prompt,
        "ref_images_count": len(ref_images) if ref_images else 0,
        "auto_prompt_used": auto_prompt and bool(ref_images),
        "images": saved_images,
        "text": "\n".join(text_parts),
    }
