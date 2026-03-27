---
name: image-gen
description: |
  AI画图和图片生成工具。当用户想画图、画插画、画海报、生成图片、做风格转换、基于参考图生成新图时，使用此技能。Use this skill for any AI image generation task: drawing illustrations, creating posters, generating avatars, style transfer from reference images, fusing styles from multiple images, maintaining character/IP consistency, or face stylization. Supports Gemini and any OpenAI-compatible API, custom aspect ratios (16:9, 9:16), up to 4K resolution, and multi-image reference input. Do NOT use for image processing tasks like compression, cropping, stitching, watermarking, format conversion, or for writing code that manipulates images (PIL, OpenCV, ffmpeg).
  Triggers: 画图, 生成图片, 画插画, 画海报, 风格转换, 参考图, 类似风格, 融合风格, 角色一致, 生成头像, generate image, draw, illustration, style transfer, reference image, AI art, face editing, image gen, character consistency
version: 1.0.0
---

# Image Gen — Universal AI Image Generation

Generate and edit images through any OpenAI-compatible API endpoint. Supports both pure text-to-image and reference-image workflows — give reference images and the model generates new content that matches the style, character design, and IP.

## Script Directory

1. `{baseDir}` = this SKILL.md file's directory
2. Script path = `{baseDir}/scripts/image_gen.py`
3. Python venv path = `{baseDir}/.venv`

## Setup (First Use) — BLOCKING

On first invocation, ensure the environment is ready:

1. Check if `{baseDir}/.venv` exists. If not, create and install:
   ```bash
   python3 -m venv {baseDir}/.venv
   {baseDir}/.venv/bin/pip install -r {baseDir}/requirements.txt
   ```

2. Check if `{baseDir}/.env` exists. If not, ask the user for:
   - **IMAGE_GEN_API_KEY** (required): API key for the endpoint
   - **IMAGE_GEN_BASE_URL** (required): Base URL of the OpenAI-compatible endpoint
   - **IMAGE_GEN_MODEL** (optional): model name, defaults to `google/gemini-3-1-flash-image-preview`

   Write to `{baseDir}/.env`. Only show the first 8 chars of the API key when confirming.

## Provider Architecture

The skill uses a single **OpenAI-compatible abstraction layer**. Any API that implements the OpenAI chat completions format with image output works out of the box:

| Endpoint | Example BASE_URL |
|----------|-----------------|
| OpenRouter | `https://openrouter.ai/api/v1` |
| Google AI Studio (OpenAI compat) | `https://generativelanguage.googleapis.com/v1beta/openai` |
| Custom proxy / self-hosted | `https://your-proxy.example.com/v1` |
| Any NewAPI instance | `https://your-newapi.example.com/v1` |

To switch provider, just change `IMAGE_GEN_BASE_URL` and `IMAGE_GEN_API_KEY`. No code changes needed.

## Usage

```bash
# Text-to-image
{baseDir}/.venv/bin/python {baseDir}/scripts/image_gen.py \
  --prompt "A cat in watercolor style" --output-dir ./images --json

# Reference image — generate in similar style/IP
{baseDir}/.venv/bin/python {baseDir}/scripts/image_gen.py \
  --prompt "A new character pose" \
  --ref ./style_ref.png \
  --output-dir ./images --json

# Multiple reference images for richer style/IP context
{baseDir}/.venv/bin/python {baseDir}/scripts/image_gen.py \
  --prompt "Design a new scene with these characters" \
  --ref ./char1.png ./char2.png ./scene_ref.jpg \
  --output-dir ./images --json

# Mix local files and URLs
{baseDir}/.venv/bin/python {baseDir}/scripts/image_gen.py \
  --prompt "Same character, different outfit" \
  --ref https://example.com/character.png ./local_ref.png \
  --output-dir ./images --json

# Disable auto-prompt augmentation (send raw prompt only)
{baseDir}/.venv/bin/python {baseDir}/scripts/image_gen.py \
  --prompt "Your exact prompt" \
  --ref ./ref.png --no-auto-prompt \
  --output-dir ./images --json

# Face-based editing
{baseDir}/.venv/bin/python {baseDir}/scripts/image_gen.py \
  --prompt "Transform this face into anime style" \
  --face ./face.jpg \
  --output-dir ./images --json

# Custom aspect ratio and resolution
{baseDir}/.venv/bin/python {baseDir}/scripts/image_gen.py \
  --prompt "A landscape" --aspect-ratio 16:9 --resolution 4K \
  --output-dir ./images --json
```

## Reference Image Workflow

When `--ref` is provided, the skill automatically prepends context to instruct the model to maintain visual style and IP consistency:

> Based on the reference image(s) provided, generate an image that maintains the same visual style, character design/IP, and artistic consistency.

This auto-prompt can be disabled with `--no-auto-prompt` when you want full control.

Reference images can be:
- **Local file paths** — auto-detected and sent as inline base64 data URLs
- **URLs** — passed directly to the API

No limit on reference image count. More references give the model richer context about style and characters.

## Parameters

| Param | Default | Description |
|-------|---------|-------------|
| `--prompt`, `-p` | required | Image description or editing instruction |
| `--ref` | none | One or more reference image paths/URLs for style and IP consistency |
| `--no-auto-prompt` | false | Disable automatic prompt augmentation in reference mode |
| `--face` | from env | Face image URL or local path for face-based editing |
| `--images` | none | Additional input image URLs/paths |
| `--model`, `-m` | from env | Model name override |
| `--base-url` | from env | API base URL override |
| `--api-key` | from env | API key override |
| `--aspect-ratio` | 1:1 | 1:1, 16:9, 9:16, 4:3, 3:4, 2:3, 3:2, auto |
| `--resolution` | 1K | 1K, 2K, 4K |
| `--output-dir`, `-o` | ./generated_images | Save location |
| `--json` | false | Output as JSON for structured parsing |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `IMAGE_GEN_API_KEY` | API key for the OpenAI-compatible endpoint |
| `IMAGE_GEN_BASE_URL` | Base URL (default: `https://openrouter.ai/api/v1`) |
| `IMAGE_GEN_MODEL` | Model name (default: `google/gemini-3-1-flash-image-preview`) |
| `IMAGE_GEN_FACE_URL` | Default face image URL |

**Load Priority**: CLI args > `.env` in skill directory > environment variables

## User Configuration

When the user provides API key, base URL, or model name in conversation, write them to `{baseDir}/.env`. If `.env` already exists, read it first and only update the mentioned fields.

## After Generation

Always use `--json` for structured output. After a successful generation, show the image to the user by reading the saved file with the Read tool.

## Error Handling

- Missing API key → error with setup instructions pointing to `.env`
- Generation failure → show error message from API
- Local file not found → clear error with the path that failed
