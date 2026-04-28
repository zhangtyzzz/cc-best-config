---
name: image-gen
description: |
  AI 画图和图片生成技能。Use when the user wants illustrations, posters, avatars,
  style transfer, reference image generation, multi image style fusion, character
  consistency, or face stylization. Supports Gemini and OpenAI compatible image
  APIs, custom aspect ratios, high resolution output, and reference images. Do
  not use for image processing tasks such as compression, cropping, stitching,
  watermarking, format conversion, or code that manipulates images with PIL,
  OpenCV, or ffmpeg. Triggers include 画图, 生成图片, 画插画, 画海报, 风格转换,
  参考图, 融合风格, 角色一致, 生成头像, generate image, illustration, style
  transfer, reference image, AI art, face editing, and image gen.
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

The skill auto-detects the model type and routes to the correct API:

| Model Pattern | API Used | Endpoint |
|---------------|----------|----------|
| `gpt-image-*`, `chatgpt-image-*` | OpenAI Images API | `/images/generations` or `/images/edits` |
| Everything else (Gemini, Nano Banana, etc.) | Chat Completions | `/chat/completions` with `modalities=["image","text"]` |

Detection is based on the **bare model name** (provider prefix like `openai/` is stripped for native `api.openai.com` only; routers keep the full name).

Supported endpoints:

| Endpoint | Example BASE_URL |
|----------|-----------------|
| OpenRouter | `https://openrouter.ai/api/v1` |
| Google AI Studio (OpenAI compat) | `https://generativelanguage.googleapis.com/v1beta/openai` |
| OpenAI native | `https://api.openai.com/v1` |
| Custom proxy / self-hosted | `https://your-proxy.example.com/v1` |
| Any NewAPI instance | `https://your-newapi.example.com/v1` |

To switch provider, just change `IMAGE_GEN_BASE_URL` and `IMAGE_GEN_API_KEY`. No code changes needed.

### GPT Image 2 specifics

- Text-to-image uses `/images/generations` (JSON payload)
- Reference/edit images use `/images/edits` (multipart form upload, streams rebuilt per retry)
- Aspect ratio → size: `1:1` → `1024x1024`, `16:9`/`4:3`/`3:2` → `1536x1024`, `9:16`/`3:4`/`2:3` → `1024x1536`
- Resolution → quality: `1K` → `auto`, `2K`/`4K` → `high`

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

## Prompt Cookbooks

Model-specific prompt examples and best practices are in the `references/` directory. Read the relevant cookbook when crafting prompts — each model family has different strengths:

| Model Family | Cookbook | Best For |
|-------------|---------|----------|
| GPT Image 2 (`gpt-image-2`) | [`references/gpt-image-prompts.md`](references/gpt-image-prompts.md) | Text rendering, photorealism, product shots, infographics, character consistency |
| Gemini / Nano Banana (`gemini-*`, `nano-banana-*`) | [`references/gemini-prompts.md`](references/gemini-prompts.md) | Style transfer, reference-based editing, illustration, CJK prompts |

When the user's request is vague, consult the cookbook for the active model to pick a prompt structure that plays to its strengths. When switching models, re-read the relevant cookbook — prompt style that works for Gemini may not be optimal for GPT Image and vice versa.

### Quick model selection guide

| Need | Recommended Model | Why |
|------|------------------|-----|
| Readable text on images | `gpt-image-2` | Best text rendering in the industry |
| Photorealistic product shots | `gpt-image-2` | Strong photorealism and lighting control |
| Style transfer from reference | Gemini (`--ref`) | Multimodal chat with inline images |
| Character consistency across scenes | Gemini with `--ref` | Maintains IP from reference images |
| Chinese/Japanese art styles | Gemini | Native CJK understanding |
| Quick iteration / previews | `gemini-3.1-flash-image-preview` | Fast and cheap |

## After Generation

Always use `--json` for structured output. After a successful generation, show the image to the user by reading the saved file with the Read tool.

## Error Handling

- Missing API key → error with setup instructions pointing to `.env`
- Generation failure → show error message from API
- Local file not found → clear error with the path that failed
