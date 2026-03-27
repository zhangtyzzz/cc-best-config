#!/usr/bin/env python3
"""
Image Gen — Universal AI image generation via OpenAI-compatible API.

Works with any OpenAI-compatible endpoint (OpenRouter, Google AI Studio,
custom proxies, self-hosted models).

Features:
  - Text-to-image generation
  - Reference image workflow (one or more refs for style/IP consistency)
  - Face-based editing/stylization
  - Local file + URL support for input images
  - Custom aspect ratios and resolutions

Usage:
    python image_gen.py --prompt "A portrait in watercolor style"
    python image_gen.py --prompt "Same character, new pose" --ref char1.png char2.png
    python image_gen.py --prompt "Transform into anime" --face face.jpg
"""

import os
import sys
import json
import base64
import time
import mimetypes
import argparse
import requests
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any


# Load .env file — prioritize the skill's own .env over CWD
try:
    from dotenv import load_dotenv
    skill_env = Path(__file__).parent.parent / ".env"
    if skill_env.exists():
        load_dotenv(skill_env)
    else:
        cwd_env = Path.cwd() / ".env"
        if cwd_env.exists():
            load_dotenv(cwd_env)
except ImportError:
    pass


DEFAULT_MODEL = "google/gemini-3-1-flash-image-preview"
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"

REF_IMAGE_AUTO_PROMPT = (
    "Based on the reference image(s) provided, generate an image that "
    "maintains the same visual style, character design/IP, and artistic "
    "consistency. "
)


def get_config() -> Dict[str, Any]:
    """Read configuration from environment variables."""
    api_key = os.environ.get("IMAGE_GEN_API_KEY", "").strip()
    base_url = os.environ.get("IMAGE_GEN_BASE_URL", "").strip() or DEFAULT_BASE_URL
    face_url = os.environ.get("IMAGE_GEN_FACE_URL", "").strip()
    model = os.environ.get("IMAGE_GEN_MODEL", "").strip() or DEFAULT_MODEL

    missing = []
    if not api_key:
        missing.append("IMAGE_GEN_API_KEY")

    return {
        "api_key": api_key,
        "base_url": base_url,
        "face_url": face_url or None,
        "model": model,
        "missing": missing,
    }


def resolve_image(image_path_or_url: str) -> Dict[str, Any]:
    """
    Resolve an image input to an API-compatible format.
    - Local file → read as base64 data URL
    - URL → pass through directly
    """
    path = Path(image_path_or_url)
    if path.exists() and path.is_file():
        mime_type, _ = mimetypes.guess_type(str(path))
        if not mime_type:
            # Fallback based on extension
            ext = path.suffix.lower()
            mime_map = {
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".gif": "image/gif",
                ".webp": "image/webp",
                ".bmp": "image/bmp",
            }
            mime_type = mime_map.get(ext, "image/png")
        with open(path, "rb") as f:
            data = base64.b64encode(f.read()).decode("utf-8")
        return {
            "type": "image_url",
            "image_url": {"url": f"data:{mime_type};base64,{data}"},
        }
    else:
        # Treat as URL. If it doesn't look like a URL and doesn't exist as
        # a file, it might be a mistake — but we still pass it through and
        # let the API handle the error.
        return {
            "type": "image_url",
            "image_url": {"url": image_path_or_url},
        }


def build_messages(
    prompt: str,
    face: Optional[str] = None,
    images: Optional[List[str]] = None,
    ref_images: Optional[List[str]] = None,
    auto_prompt: bool = True,
) -> list:
    """Build chat messages with optional image inputs."""
    content_parts = []

    # Collect all input images: ref_images first, then face, then legacy images
    all_image_sources = []
    if ref_images:
        all_image_sources.extend(ref_images)
    if face:
        all_image_sources.append(face)
    if images:
        all_image_sources.extend(images)

    for img_source in all_image_sources:
        content_parts.append(resolve_image(img_source))

    # Build the final prompt text
    final_prompt = prompt
    if ref_images and auto_prompt:
        final_prompt = REF_IMAGE_AUTO_PROMPT + prompt

    content_parts.append({"type": "text", "text": final_prompt})

    return [{"role": "user", "content": content_parts}]


def save_base64_image(data_url: str, output_dir: str, index: int) -> Dict[str, str]:
    """Save a base64 data URL image to disk."""
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")

    # Detect file extension from data URL mime type
    ext = ".png"
    if "," in data_url:
        header = data_url.split(",", 1)[0]  # e.g. "data:image/jpeg;base64"
        b64_data = data_url.split(",", 1)[1]
        if "image/" in header:
            mime_ext = header.split("image/")[1].split(";")[0].strip()
            ext_map = {"jpeg": ".jpg", "png": ".png", "gif": ".gif",
                       "webp": ".webp", "bmp": ".bmp"}
            ext = ext_map.get(mime_ext, f".{mime_ext}")
    else:
        b64_data = data_url

    filename = f"image_gen_{timestamp}_{index}{ext}"
    filepath = Path(output_dir) / filename

    img_bytes = base64.b64decode(b64_data)
    with open(filepath, "wb") as f:
        f.write(img_bytes)

    return {"local_path": str(filepath.absolute())}


def run_generation(
    prompt: str,
    api_key: str,
    base_url: str = DEFAULT_BASE_URL,
    model: str = DEFAULT_MODEL,
    face: Optional[str] = None,
    images: Optional[List[str]] = None,
    ref_images: Optional[List[str]] = None,
    auto_prompt: bool = True,
    aspect_ratio: str = "1:1",
    resolution: str = "1K",
    output_dir: str = "./generated_images",
) -> Dict[str, Any]:
    """Generate image via OpenAI-compatible chat completions endpoint."""
    url = f"{base_url.rstrip('/')}/chat/completions"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    messages = build_messages(prompt, face, images, ref_images, auto_prompt)

    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "modalities": ["image", "text"],
    }

    # Add image_config if non-default
    image_config = {}
    if aspect_ratio != "1:1":
        image_config["aspect_ratio"] = aspect_ratio
    if resolution != "1K":
        image_config["image_size"] = resolution
    if image_config:
        payload["image_config"] = image_config

    try:
        # Retry once on rate-limit (429) or server error (5xx)
        max_attempts = 2
        for attempt in range(max_attempts):
            resp = requests.post(url, headers=headers, json=payload, timeout=180)
            if resp.status_code in (429, 500, 502, 503, 504) and attempt < max_attempts - 1:
                time.sleep(5)
                continue
            resp.raise_for_status()
            break

        data = resp.json()

        message = data.get("choices", [{}])[0].get("message", {})
        content = message.get("content", "")

        saved_images = []
        text_parts = []
        img_index = 0

        # content can be a string or a list of parts
        if isinstance(content, list):
            for part in content:
                if not isinstance(part, dict):
                    continue
                part_type = part.get("type", "")
                if part_type == "image_url":
                    b64 = part.get("image_url", {}).get("url", "")
                    if b64:
                        try:
                            saved = save_base64_image(b64, output_dir, img_index)
                            saved_images.append(saved)
                            img_index += 1
                        except Exception as e:
                            saved_images.append({"error": str(e)})
                elif part_type == "text":
                    text_val = part.get("text", "")
                    if text_val:
                        text_parts.append(text_val)
        elif isinstance(content, str) and content:
            text_parts.append(content)

        # Also check alternative "images" field (some providers use this)
        for img in message.get("images", []):
            if isinstance(img, dict):
                img_url = img.get("image_url", {}).get("url", "") or img.get("url", "")
            else:
                img_url = str(img)
            if img_url:
                try:
                    saved = save_base64_image(img_url, output_dir, img_index)
                    saved_images.append(saved)
                    img_index += 1
                except Exception as e:
                    saved_images.append({"error": str(e)})

        return {
            "success": True,
            "model": model,
            "base_url": base_url,
            "prompt": prompt,
            "ref_images_count": len(ref_images) if ref_images else 0,
            "auto_prompt_used": auto_prompt and bool(ref_images),
            "images": saved_images,
            "text": "\n".join(text_parts),
        }

    except requests.exceptions.RequestException as e:
        error_msg = str(e)
        if hasattr(e, "response") and e.response is not None:
            try:
                error_data = e.response.json()
                error_msg = json.dumps(error_data, ensure_ascii=False)
            except Exception:
                error_msg = e.response.text
        return {"success": False, "error": error_msg}


def main():
    parser = argparse.ArgumentParser(
        description="Image Gen — Universal AI image generation via OpenAI-compatible API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Text-to-image
  python image_gen.py --prompt "A futuristic cityscape at sunset"

  # Reference image — generate in similar style/IP
  python image_gen.py --prompt "New character pose" --ref char.png

  # Multiple reference images
  python image_gen.py --prompt "A new scene" --ref ref1.png ref2.png ref3.png

  # Face editing
  python image_gen.py --prompt "Transform into anime" --face face.jpg

  # Custom aspect ratio and resolution
  python image_gen.py --prompt "Logo design" --aspect-ratio 16:9 --resolution 4K
        """,
    )

    parser.add_argument("--prompt", "-p", required=True, help="Image prompt")
    parser.add_argument(
        "--ref", nargs="+", default=None,
        help="One or more reference image paths/URLs for style and IP consistency"
    )
    parser.add_argument(
        "--no-auto-prompt", action="store_true",
        help="Disable automatic prompt augmentation in reference mode"
    )
    parser.add_argument("--face", help="Face image URL or local path")
    parser.add_argument("--images", nargs="+", help="Additional input image URLs/paths")
    parser.add_argument("--model", "-m", help="Model name override")
    parser.add_argument("--base-url", help="API base URL override")
    parser.add_argument("--api-key", help="API key override")
    parser.add_argument(
        "--aspect-ratio", default="1:1",
        choices=["1:1", "16:9", "9:16", "4:3", "3:4", "2:3", "3:2", "auto"],
        help="Aspect ratio (default: 1:1)"
    )
    parser.add_argument(
        "--resolution", default="1K", choices=["1K", "2K", "4K"],
        help="Resolution (default: 1K)"
    )
    parser.add_argument(
        "--output-dir", "-o", default="./generated_images",
        help="Output directory (default: ./generated_images)"
    )
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    config = get_config()

    # CLI overrides
    api_key = args.api_key or config["api_key"]
    if not api_key:
        env_file = Path(__file__).parent.parent / ".env"
        print(json.dumps({
            "success": False,
            "error": "Missing API key",
            "hint": f"Set IMAGE_GEN_API_KEY in {env_file} or pass --api-key",
            "setup": {
                "IMAGE_GEN_API_KEY": "Your API key for the OpenAI-compatible endpoint",
                "IMAGE_GEN_BASE_URL": f"API base URL (default: {DEFAULT_BASE_URL})",
                "IMAGE_GEN_MODEL": f"Model name (default: {DEFAULT_MODEL})",
                "env_file": str(env_file),
            },
        }, indent=2))
        sys.exit(1)

    face = args.face or config["face_url"]

    result = run_generation(
        prompt=args.prompt,
        api_key=api_key,
        base_url=args.base_url or config["base_url"],
        model=args.model or config["model"],
        face=face,
        images=args.images,
        ref_images=args.ref,
        auto_prompt=not args.no_auto_prompt,
        aspect_ratio=args.aspect_ratio,
        resolution=args.resolution,
        output_dir=args.output_dir,
    )

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        if result["success"]:
            print(f"Image generation successful! (model: {result['model']})")
            if result.get("ref_images_count", 0) > 0:
                print(f"  Reference images: {result['ref_images_count']}")
                print(f"  Auto-prompt: {'yes' if result.get('auto_prompt_used') else 'no'}")
            for i, img in enumerate(result.get("images", [])):
                if img.get("local_path"):
                    print(f"  Image {i + 1}: {img['local_path']}")
                elif img.get("error"):
                    print(f"  Image {i + 1} error: {img['error']}")
            if result.get("text"):
                print(f"\n  Model response: {result['text']}")
        else:
            print(f"Error: {result['error']}")
            sys.exit(1)


if __name__ == "__main__":
    main()
