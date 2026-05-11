#!/usr/bin/env python3
"""
Image Gen — Universal AI image generation via OpenAI-compatible API.

Auto-detects model type and routes to the correct adapter:
  - GPT Image (gpt-image-*, dall-e-*) → OpenAI Images API
  - Chat Completions (Gemini, etc.)   → /chat/completions with modalities

Usage:
    python image_gen.py --prompt "A portrait in watercolor style"
    python image_gen.py --prompt "Same character, new pose" --ref char1.png char2.png
    python image_gen.py --prompt "A cat" -m openai/gpt-image-2
"""

import sys
import json
import argparse
from pathlib import Path

# Ensure adapters package is importable regardless of CWD
sys.path.insert(0, str(Path(__file__).parent))

# Load .env — later files do NOT override earlier ones or existing env vars.
# Priority: process.env (settings.json) > skill dir .env > ~/.cc-best-config/.env
try:
    from dotenv import load_dotenv
    _env_candidates = [
        Path(__file__).parent.parent / ".env",       # skill directory
        Path.cwd() / ".env",                          # current working directory
        Path.home() / ".cc-best-config" / ".env",     # user-level persistent config
    ]
    for _env_path in _env_candidates:
        if _env_path.exists():
            load_dotenv(_env_path, override=False)
except ImportError:
    pass

from adapters import run_generation
from adapters.common import get_config


def main():
    parser = argparse.ArgumentParser(
        description="Image Gen — Universal AI image generation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python image_gen.py --prompt "A futuristic cityscape at sunset"
  python image_gen.py --prompt "New character pose" --ref char.png
  python image_gen.py --prompt "A cat" -m openai/gpt-image-2
  python image_gen.py --prompt "Logo design" --aspect-ratio 16:9 --resolution 4K
        """,
    )

    parser.add_argument("--prompt", "-p", required=True, help="Image prompt")
    parser.add_argument("--ref", nargs="+", default=None,
                        help="Reference image paths/URLs for style/IP consistency")
    parser.add_argument("--no-auto-prompt", action="store_true",
                        help="Disable automatic prompt augmentation in reference mode")
    parser.add_argument("--face", help="Face image URL or local path")
    parser.add_argument("--images", nargs="+", help="Additional input image URLs/paths")
    parser.add_argument("--model", "-m", help="Model name override")
    parser.add_argument("--base-url", help="API base URL override")
    parser.add_argument("--api-key", help="API key override")
    parser.add_argument("--aspect-ratio", default="1:1",
                        choices=["1:1", "16:9", "9:16", "4:3", "3:4", "2:3", "3:2", "auto"],
                        help="Aspect ratio (default: 1:1)")
    parser.add_argument("--resolution", default="1K", choices=["1K", "2K", "4K"],
                        help="Resolution (default: 1K)")
    parser.add_argument("--output-dir", "-o", default="./generated_images",
                        help="Output directory (default: ./generated_images)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()
    config = get_config()

    api_key = args.api_key or config["api_key"]
    if not api_key:
        env_file = Path.home() / ".cc-best-config" / ".env"
        print(json.dumps({
            "success": False, "error": "Missing API key",
            "hint": f"Set IMAGE_GEN_API_KEY in {env_file} or pass --api-key",
        }, indent=2))
        sys.exit(1)

    result = run_generation(
        prompt=args.prompt,
        api_key=api_key,
        base_url=args.base_url or config["base_url"],
        model=args.model or config["model"],
        face=args.face or config["face_url"],
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
            print(f"Image generation successful! (model: {result['model']}, "
                  f"adapter: {result['adapter']})")
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
