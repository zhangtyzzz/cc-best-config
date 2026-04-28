"""GPT Image adapter — handles gpt-image-* and chatgpt-image-* models.

Uses OpenAI Images API:
  - /images/generations  (text-to-image, JSON)
  - /images/edits        (image editing, multipart form)
"""

import io
import time
import requests
from typing import Optional, List, Dict, Any

from .common import (
    collect_input_images, build_final_prompt, resolve_to_bytes,
    resolve_api_model, format_api_error, make_result,
    save_b64, download_and_save, request_with_retry,
)

# ---------------------------------------------------------------------------
# Model detection
# ---------------------------------------------------------------------------


def _bare_model(model: str) -> str:
    return model.rsplit("/", 1)[-1]


def can_handle(model: str) -> bool:
    """Return True if this adapter should handle the given model."""
    bare = _bare_model(model)
    return bare.startswith("gpt-image") or bare.startswith("chatgpt-image")


# ---------------------------------------------------------------------------
# Param mapping
# ---------------------------------------------------------------------------

_SIZE_MAP = {
    "1:1": "1024x1024",
    "16:9": "1536x1024", "4:3": "1536x1024", "3:2": "1536x1024",
    "9:16": "1024x1536", "3:4": "1024x1536", "2:3": "1024x1536",
    "auto": "1024x1024",
}
_QUALITY_MAP = {"1K": "medium", "2K": "high", "4K": "high"}

ADAPTER_NAME = "gpt-image"

# ---------------------------------------------------------------------------
# API calls
# ---------------------------------------------------------------------------


def _generate(
    url: str, headers: Dict, api_model: str,
    prompt: str, size: str, quality: str,
) -> requests.Response:
    """Text-to-image via /images/generations."""
    payload: Dict[str, Any] = {
        "model": api_model, "prompt": prompt, "n": 1,
        "size": size, "quality": quality,
    }
    return request_with_retry(
        requests.post, url,
        headers={**headers, "Content-Type": "application/json"},
        json=payload, timeout=300,
    )


def _edit(
    url: str, headers: Dict, api_model: str,
    prompt: str, size: str, quality: str,
    input_images: List[str],
) -> requests.Response:
    """Image editing via /images/edits (multipart form).

    Rebuilds BytesIO streams per attempt to handle retry correctly.
    """
    def _build_files():
        primary_bytes, primary_name, primary_mime = resolve_to_bytes(input_images[0])
        files = [("image", (primary_name, io.BytesIO(primary_bytes), primary_mime))]
        for extra in input_images[1:]:
            eb, en, em = resolve_to_bytes(extra)
            files.append(("image[]", (en, io.BytesIO(eb), em)))
        return files

    form = {
        "prompt": prompt, "model": api_model,
        "size": size, "quality": quality,
    }
    max_attempts = 2
    resp = None
    for attempt in range(max_attempts):
        files = _build_files()
        resp = requests.post(url, headers=headers, data=form,
                             files=files, timeout=300)
        if resp.status_code in (429, 500, 502, 503, 504) and attempt < max_attempts - 1:
            time.sleep(5)
            continue
        resp.raise_for_status()
        return resp
    return resp


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------


def _parse_response(data: dict, output_dir: str):
    """Parse {data: [{b64_json, url, revised_prompt}, ...]}."""
    saved, texts, idx = [], [], 0
    for item in data.get("data", []):
        b64 = item.get("b64_json", "")
        img_url = item.get("url", "")
        if b64:
            try:
                saved.append(save_b64(b64, output_dir, idx)); idx += 1
            except Exception as e:
                saved.append({"error": str(e)})
        elif img_url:
            try:
                saved.append(download_and_save(img_url, output_dir, idx)); idx += 1
            except Exception as e:
                saved.append({"error": str(e)})
        rp = item.get("revised_prompt", "")
        if rp:
            texts.append(f"Revised prompt: {rp}")
    return saved, texts


# ---------------------------------------------------------------------------
# Public entry
# ---------------------------------------------------------------------------


def run(
    prompt: str, api_key: str, base_url: str, model: str,
    face: Optional[str] = None, images: Optional[List[str]] = None,
    ref_images: Optional[List[str]] = None, auto_prompt: bool = True,
    aspect_ratio: str = "1:1", resolution: str = "1K",
    output_dir: str = "./generated_images",
) -> Dict[str, Any]:
    all_imgs = collect_input_images(ref_images, face, images)
    final_prompt = build_final_prompt(prompt, ref_images, auto_prompt)
    size = _SIZE_MAP.get(aspect_ratio, "1024x1024")
    quality = _QUALITY_MAP.get(resolution, "auto")
    api_model = resolve_api_model(model, base_url)
    headers = {"Authorization": f"Bearer {api_key}"}
    base = base_url.rstrip("/")

    try:
        if all_imgs:
            resp = _edit(f"{base}/images/edits", headers, api_model,
                         final_prompt, size, quality, all_imgs)
        else:
            resp = _generate(f"{base}/images/generations", headers, api_model,
                             final_prompt, size, quality)

        saved, texts = _parse_response(resp.json(), output_dir)
        return make_result(True, model, ADAPTER_NAME, base_url, prompt,
                           ref_images, auto_prompt, saved, texts)
    except (requests.exceptions.RequestException, OSError, ValueError) as e:
        err = format_api_error(e) if isinstance(e, requests.exceptions.RequestException) else str(e)
        return make_result(False, model, ADAPTER_NAME, base_url, prompt,
                           ref_images, auto_prompt, [], [], error=err)
