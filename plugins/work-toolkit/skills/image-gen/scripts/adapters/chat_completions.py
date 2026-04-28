"""Chat Completions adapter — handles Gemini and other models via /chat/completions.

Works with any OpenAI-compatible endpoint that supports:
  - modalities: ["image", "text"]
  - Image output as base64 data-url in content parts
"""

import requests
from typing import Optional, List, Dict, Any

from .common import (
    DEFAULT_BASE_URL, DEFAULT_MODEL,
    collect_input_images, build_final_prompt, resolve_to_content_part,
    request_with_retry, format_api_error, make_result, save_image_output,
)

ADAPTER_NAME = "chat-completions"

# ---------------------------------------------------------------------------
# Model detection
# ---------------------------------------------------------------------------


def can_handle(model: str) -> bool:
    """Fallback adapter — handles any model not claimed by other adapters."""
    return True


# ---------------------------------------------------------------------------
# Message building
# ---------------------------------------------------------------------------


def _build_messages(
    prompt: str, face: Optional[str], images: Optional[List[str]],
    ref_images: Optional[List[str]], auto_prompt: bool,
) -> list:
    parts = []
    for src in collect_input_images(ref_images, face, images):
        parts.append(resolve_to_content_part(src))
    parts.append({"type": "text", "text": build_final_prompt(prompt, ref_images, auto_prompt)})
    return [{"role": "user", "content": parts}]


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------


def _parse_response(data: dict, output_dir: str):
    """Parse choices[0].message.content (list or string) + .images[]."""
    msg = data.get("choices", [{}])[0].get("message", {})
    content = msg.get("content", "")
    saved, texts, idx = [], [], 0

    if isinstance(content, list):
        for part in content:
            if not isinstance(part, dict):
                continue
            pt = part.get("type", "")
            if pt == "image_url":
                url_val = part.get("image_url", {}).get("url", "")
                if url_val:
                    try:
                        saved.append(save_image_output(url_val, output_dir, idx))
                        idx += 1
                    except Exception as e:
                        saved.append({"error": str(e)})
            elif pt == "text":
                t = part.get("text", "")
                if t:
                    texts.append(t)
    elif isinstance(content, str) and content:
        texts.append(content)

    # Some providers put images in a separate field
    for img in msg.get("images", []):
        url_val = (img.get("image_url", {}).get("url", "") or img.get("url", "")
                   if isinstance(img, dict) else str(img))
        if url_val:
            try:
                saved.append(save_image_output(url_val, output_dir, idx))
                idx += 1
            except Exception as e:
                saved.append({"error": str(e)})

    return saved, texts


# ---------------------------------------------------------------------------
# Public entry
# ---------------------------------------------------------------------------


def run(
    prompt: str, api_key: str, base_url: str = DEFAULT_BASE_URL,
    model: str = DEFAULT_MODEL, face: Optional[str] = None,
    images: Optional[List[str]] = None,
    ref_images: Optional[List[str]] = None, auto_prompt: bool = True,
    aspect_ratio: str = "1:1", resolution: str = "1K",
    output_dir: str = "./generated_images",
) -> Dict[str, Any]:
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    payload: Dict[str, Any] = {"model": model, "modalities": ["image", "text"]}
    img_cfg: Dict[str, str] = {}
    if aspect_ratio != "1:1":
        img_cfg["aspect_ratio"] = aspect_ratio
    if resolution != "1K":
        img_cfg["image_size"] = resolution
    if img_cfg:
        payload["image_config"] = img_cfg

    try:
        messages = _build_messages(prompt, face, images, ref_images, auto_prompt)
        payload["messages"] = messages
        resp = request_with_retry(requests.post, url, headers=headers,
                                  json=payload, timeout=180)
        saved, texts = _parse_response(resp.json(), output_dir)
        return make_result(True, model, ADAPTER_NAME, base_url, prompt,
                           ref_images, auto_prompt, saved, texts)
    except (requests.exceptions.RequestException, OSError, ValueError) as e:
        err = format_api_error(e) if isinstance(e, requests.exceptions.RequestException) else str(e)
        return make_result(False, model, ADAPTER_NAME, base_url, prompt,
                           ref_images, auto_prompt, [], [], error=err)
