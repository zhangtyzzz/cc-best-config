# Gemini / Nano Banana Prompt Cookbook

Curated prompts and best practices for Gemini image generation models (`gemini-3.1-flash-image-preview`, `nano-banana-pro`, etc.).

> **Official guide**: [How to prompt Gemini 2.5 Flash Image Generation](https://developers.googleblog.com/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/) — Google Developers Blog
> **Community**: [AIEnhancer 150+ Gemini Prompts](https://aienhancer.ai/blog/150-best-google-gemini-prompts-guide), [NoCodeAPI Gemini Examples](https://nocodeapi.com/tutorials/google-gemini-prompts-with-10-examples/)

## Core Prompting Rules

From [Google Developers Blog](https://developers.googleblog.com/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/):

1. **Be descriptive and specific** — Gemini excels with long, natural-language prompts (3-4 sentences)
2. **One subject, one style lane** — don't mix "cinematic" + "pixel art" + "watercolor" in one prompt
3. **One camera hint** — a single lens cue is enough ("50mm", "wide angle", "macro")
4. **Two or three quality tags only** — too many signals increase noise
5. **Reference images are the killer feature** — use `--ref` for style consistency

From [simplifyaitools.com](https://simplifyaitools.com/blog/gemini-prompts-for-ai-image-generation-in-2025/):

**Prompt shape**: Subject → Style → Mood/Scene → Camera/Lens → Quality tags

## Text in Images

From [Google Developers Blog](https://developers.googleblog.com/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/):

Template:
```
Create a [image type] for [brand/concept] with the text "[text to render]"
in a [font style]. The design should be [style description], with a
[color scheme].
```

Example:
```
Create a modern, minimalist logo for a coffee shop called 'The Daily Grind'.
The text should be in a clean, bold, sans-serif font. The design should
feature a simple, stylized icon of a coffee bean seamlessly integrated with
the text. The color scheme is black and white.
```

## Style Transfer (with --ref)

From [Google Developers Blog](https://developers.googleblog.com/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/):

Template:
```
Using the provided image, recreate its content in the style of [art style
or movement]. Maintain the original composition and subject matter.
```

Example:
```
Using the provided image, recreate this cityscape in the style of Van Gogh's
Starry Night. Maintain the original building layout and composition, but
apply swirling brushstrokes, vibrant blues and yellows, and thick impasto
texture throughout the sky and reflections.
```

## Inpainting / Partial Editing (with --ref)

From [Google Developers Blog](https://developers.googleblog.com/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/):

Template:
```
Using the provided image, change only the [specific element] to [new
element/description]. Keep everything else in the image exactly the same,
preserving the original style, lighting, and composition.
```

Example:
```
Using the provided image of a living room, change only the blue sofa to be
a vintage, brown leather chesterfield sofa. Keep the rest of the room,
including the pillows on the sofa and the lighting, unchanged.
```

## Product Mockups

From [Google Developers Blog](https://developers.googleblog.com/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/):

```
Professional product photography of a luxury perfume bottle on a black stone
podium, water droplets, dramatic spotlight, 3D render.
```

## Photography Styles

From [AIEnhancer](https://aienhancer.ai/blog/150-best-google-gemini-prompts-guide):

```
A candid street portrait of a young woman in Paris wearing a red beret, shot
on Kodak Portra 400, bokeh background of a cafe, natural soft lighting, high
detail.
```

```
Extreme close-up of an elderly fisherman's face, deep wrinkles, weathered skin,
salt and pepper beard, eyes looking at the horizon, natural sunlight, raw format.
```

```
High-fashion full-body shot of a model wearing an avant-garde dress made of
recycled plastic, standing in a desert, harsh noon lighting, strong shadows,
Vogue magazine style.
```

## 3D & Isometric

From [AIEnhancer](https://aienhancer.ai/blog/150-best-google-gemini-prompts-guide):

```
Isometric 3D render of a gamer's bedroom, neon lights, computer setup, posters,
cozy atmosphere, cute 3D style, blender render.
```

```
Abstract 3D shape, flowing liquid gold and black marble, glossy texture, studio
lighting, 4k resolution, wallpaper.
```

## Multi-Image Grid

From [NoCodeAPI](https://nocodeapi.com/tutorials/google-gemini-prompts-with-10-examples/):

```
Generate a 3×3 grid of portraits of the subject, showcasing different emotions
and camera angles in every frame. Each picture should have a distinct backdrop
with vivid colors and textures, creating a visually engaging and cohesive
narrative while preserving the subject's likeness in high-resolution detail.
```

## Character Consistency (with --ref)

```
This is the same character from the reference image. Draw them sitting in a
cozy café reading a book, same outfit and hairstyle, warm interior lighting,
consistent art style.
```

```
Combine the architecture style from reference 1 with the color palette from
reference 2. Generate a fantasy castle entrance with these combined aesthetics.
```

## Prompt Progression Example

From [AIEnhancer](https://aienhancer.ai/blog/150-best-google-gemini-prompts-guide):

```
# Too simple — unpredictable results
A cat sitting on a wall.

# Better — adds key context
A ginger cat sitting on a brick wall at sunset.

# Best — full creative brief
Close up of a fluffy ginger cat sitting on an old textured brick wall, golden
hour lighting, cinematic bokeh, highly detailed fur.
```

## Tips Summary

- **Reference images (`--ref`) are Gemini's strongest feature** — always consider using them for style/IP consistency
- **Gemini handles CJK prompts natively** — Chinese, Japanese, Korean prompts work well
- **Long descriptive prompts work** — unlike keyword-based models, Gemini responds to natural language
- **For editing**: tell the model exactly what to change AND what to preserve
- **Style keywords that work well**: "watercolor", "ink wash", "cel shading", "concept art", "children's book illustration", "art nouveau", "ukiyo-e", "Kodak Portra 400"
- **If results look noisy**: remove extra quality tags and try again with fewer constraints
