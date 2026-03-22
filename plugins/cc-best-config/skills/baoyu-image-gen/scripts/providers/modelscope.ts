import type { CliArgs } from "../types";

const DEFAULT_MODEL = "Qwen/Qwen-Image-2512";
const DEFAULT_BASE_URL = "https://api-inference.modelscope.cn";
const TASK_TYPE_HEADER = "image_generation";
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120;
const RECOMMENDED_SIZES: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1280x720",
  "9:16": "720x1280",
  "4:3": "1152x864",
  "3:4": "864x1152",
  "3:2": "1200x800",
  "2.35:1": "1410x600",
};

type ModelScopeCreateResponse = {
  task_id?: string;
};

type ModelScopeTaskResponse = {
  task_status?: string;
  output_images?: string[];
  message?: string;
  error?: string;
};

export function getDefaultModel(): string {
  return process.env.MODELSCOPE_IMAGE_MODEL || DEFAULT_MODEL;
}

function getApiKey(): string | null {
  return process.env.MODELSCOPE_API_KEY || null;
}

function getBaseUrl(): string {
  const base = process.env.MODELSCOPE_BASE_URL || DEFAULT_BASE_URL;
  return base.replace(/\/+$/g, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSize(size: string): string {
  return size.toLowerCase().replace("*", "x");
}

function getRequestedSize(args: CliArgs): string | null {
  if (args.size) return normalizeSize(args.size);
  if (args.aspectRatio && RECOMMENDED_SIZES[args.aspectRatio]) {
    return RECOMMENDED_SIZES[args.aspectRatio];
  }
  return null;
}

export function validateArgs(_model: string, args: CliArgs): void {
  if (args.referenceImages.length > 0) {
    throw new Error(
      "Reference images are not supported with ModelScope provider in baoyu-image-gen."
    );
  }
}

export async function generateImage(
  prompt: string,
  model: string,
  args: CliArgs
): Promise<Uint8Array> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("MODELSCOPE_API_KEY is required.");
  }

  const size = getRequestedSize(args);

  const createRes = await fetch(`${getBaseUrl()}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-ModelScope-Async-Mode": "true",
    },
    body: JSON.stringify({
      model,
      prompt,
      ...(size ? { size } : {}),
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`ModelScope API error (${createRes.status}): ${err}`);
  }

  const createData = (await createRes.json()) as ModelScopeCreateResponse;
  const taskId = createData.task_id;
  if (!taskId) {
    throw new Error("ModelScope response missing task_id.");
  }

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const pollRes = await fetch(`${getBaseUrl()}/v1/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-ModelScope-Task-Type": TASK_TYPE_HEADER,
      },
    });

    if (!pollRes.ok) {
      const err = await pollRes.text();
      throw new Error(`ModelScope polling error (${pollRes.status}): ${err}`);
    }

    const pollData = (await pollRes.json()) as ModelScopeTaskResponse;
    const status = (pollData.task_status || "").toUpperCase();

    if (status === "SUCCEED") {
      const imageUrl = pollData.output_images?.[0];
      if (!imageUrl) {
        throw new Error("ModelScope task succeeded but no output image was returned.");
      }
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) {
        throw new Error(`Failed to download ModelScope image (${imageRes.status}).`);
      }
      const buffer = await imageRes.arrayBuffer();
      return new Uint8Array(buffer);
    }

    if (status === "FAILED") {
      throw new Error(
        `ModelScope image generation failed: ${pollData.message || pollData.error || "unknown error"}`
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error("ModelScope image generation timed out while waiting for task completion.");
}
