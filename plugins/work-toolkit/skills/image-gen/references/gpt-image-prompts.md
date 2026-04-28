# GPT Image 2 Prompt Cookbook

Curated prompts and best practices for `gpt-image-2`. Sources attributed inline.

> **Official guide**: [OpenAI Image Gen Models Prompting Guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
> **Community**: [awesome-gpt-image-2-prompts](https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts) (4.8k stars), [awesome-gpt-image](https://github.com/ZeroLu/awesome-gpt-image)

## Core Prompting Rules

From [OpenAI official guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide) and [pixverse.ai](https://pixverse.ai/en/blog/gpt-image-2-review-and-prompt-guide):

1. **Write like a director, not a keyword list.** Instead of "beautiful woman, studio lighting, 8K, masterpiece," describe the scene like a photographer brief
2. **Front-load the most important details.** The model gives more weight to the first ~50 words. Put style, subject, mood at the beginning
3. **Specify aspect ratio explicitly** — `"aspect ratio 9:16"` for vertical, `"aspect ratio 16:9"` for horizontal
4. **Use negative constraints when needed** — `"no text overlay, no watermark, no border"` to prevent unwanted elements
5. **For text rendering**: put the text in "QUOTES" and use phrases like `"The text reads..."`. Best at 1–5 words per element

## Photography & Photorealism

```
35mm film photography, warm natural window light. A young woman sitting in a
vintage bookshop, reading a hardcover book. Soft afternoon sunlight filtering
through dusty windows, casting warm golden light across the scene. Medium shot,
slightly off-center composition with shallow depth of field. Aspect ratio 3:4.
```
— [pixverse.ai GPT Image 2 guide](https://pixverse.ai/en/blog/gpt-image-2-review-and-prompt-guide)

```
A portrait of a woman in her late twenties, lit by a single softbox from
camera-left, with a clean gray backdrop. Her expression is relaxed and slightly
amused.
```
— [pixverse.ai](https://pixverse.ai/en/blog/gpt-image-2-review-and-prompt-guide) (natural language vs keyword style comparison)

```
Professional food photography: a rustic sourdough bread loaf freshly sliced on
a wooden cutting board, steam rising, artisan butter and honey jars nearby,
natural window light from the left, shallow depth of field
```
— [notegpt.io prompt guide](https://notegpt.io/blog/gpt-image-2-prompt-guide-use-cases)

## Product & Commercial

From [OpenAI official cookbook](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide):

```
Create a close-up commercial product photo of wireless over-ear headphones
resting on a brushed metal surface. Emphasize fabric texture, hinge detail,
soft rim lighting, premium black and graphite tones, realistic reflections,
and a composition that leaves clean space for web copy on the right.
```

```
A bright outdoor product photo of a stainless steel reusable water bottle
standing on a sunlit rock near a mountain trail. Use realistic condensation,
a slightly blurred landscape background, clean natural colors, crisp product
edges, and a practical ecommerce campaign mood.
```

## Typography & Logo Design

From [OpenAI official cookbook](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide):

```
Create an original, non-infringing logo for a company called Field & Flour,
a local bakery. The logo should feel warm, simple, and timeless. Use clean,
vector-like shapes, a strong silhouette, and balanced negative space. Favor
simplicity over detail so it reads clearly at small and large sizes. Flat
design, minimal strokes, no gradients unless essential. Plain background.
Deliver a single centered logo with generous padding. No watermark.
```

```
A 3D isometric illustration of a digital workspace. A glowing laptop in the
center with a 3D speech bubble coming out of the screen saying 'AI IS HERE'
in bold, clean 3D letters. Vibrant purple and blue color palette. Soft
clay-style render, high-quality 3D art.
```
— [notegpt.io](https://notegpt.io/blog/gpt-image-2-prompt-guide-use-cases)

## Infographics & Diagrams

From [OpenAI official cookbook](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide):

```
Create a detailed Infographic of the functioning and flow of an automatic
coffee machine like a Jura. From bean basket, to grinding, to scale, water
tank, boiler, etc. I'd like to understand technically and visually the flow.
```

```
A clean infographic showing the 3-step 'Seed to Tree' process. 1. Seed,
2. Sprout, 3. Tree. Simple flat vector icons, pastel colors. Perfectly legible
numbers and titles for each stage.
```
— [notegpt.io](https://notegpt.io/blog/gpt-image-2-prompt-guide-use-cases)

## Character Consistency

From [fal.ai GPT Image 2 guide](https://fal.ai/learn/tools/prompting-gpt-image-2):

```
Create a children's book illustration introducing a main character. A young
forest helper wearing a green hooded tunic, soft brown boots, and a small belt
pouch. Kind expression, gentle eyes, warm but brave personality. Hand-painted
watercolor look, earthy colors, soft outlines, whimsical but grounded. No text.
No watermark.
```

Second prompt for consistency:

```
Continue the children's book story using the same character. The same forest
helper is rescuing a frightened squirrel after a winter storm. Keep the same
face, same green hooded tunic, same proportions, same color palette, and same
gentle personality. Same watercolor look, snowy forest light, warm comforting
mood. Do not redesign the character. No text. No watermark.
```

## Image Editing (with --ref)

From [fal.ai](https://fal.ai/learn/tools/prompting-gpt-image-2):

```
Image 1: the woman to preserve. Image 2: the tank top reference. Image 3: the
jacket reference. Image 4: the boots reference. Dress the woman from Image 1
using the clothing from Images 2, 3, and 4. Preserve her face, facial features,
skin tone, body shape, hands, pose, hair, expression, background, camera angle,
framing, and lighting exactly. Replace only the clothing. Fit the garments
naturally with realistic folds, drape, occlusion, and shadows. Do not add
jewelry, bags, text, or logos.
```

## Cinematic Poster (中文)

From [awesome-gpt-image-2-prompts](https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts) (@a9quant):

```
【构图与空间】
- 竖版构图,比例 2:3
- 完全依赖体积光、阴影切割、反射、高光、雾气、粉尘、湿润岩石来建构画面
- 不使用轮廓线,不使用平面化描边

【排版系统】
- 整体 80% 视觉,20% 文字
- 主标题简洁、有气势、有电影海报感
- 主标题可沿光束垂直排布,仿佛由光本身构成
- 文字必须锐利、干净、真实嵌入环境,不得廉价漂浮
```

## Tips Summary

- **Text rendering** is GPT Image 2's killer feature — specify exact words in quotes
- **"Shot on [camera]"** forces photorealistic output (e.g., "Shot on Sony A7R IV")
- **Material keywords** beat generic "realistic" — use "visible pores", "fabric weave", "film grain"
- **For editing with `--ref`**: explicitly list what to preserve and what to change
- **Quality settings**: `high` for maximum fidelity, `auto` for general use
