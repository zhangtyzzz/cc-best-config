#!/usr/bin/env node
/**
 * Convert mermaid blocks to excalidraw JSON using Playwright browser context,
 * then export to PNG using Excalidraw's native renderer.
 *
 * Usage: node convert-browser.mjs <input.md> <output-dir>
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const [inputFile, outputDir] = process.argv.slice(2);
if (!inputFile || !outputDir) {
  console.error("Usage: node convert-browser.mjs <input.md> <output-dir>");
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

// Extract mermaid blocks
const content = readFileSync(inputFile, "utf-8");
const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
const blocks = [];
let m;
while ((m = mermaidRegex.exec(content)) !== null) {
  blocks.push(m[1].trim());
}
console.log(`Found ${blocks.length} mermaid blocks`);

// HTML page that loads both libraries from CDN
const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body>
<div id="status">loading</div>
<script type="module">
  window.convertMermaid = async function(mermaidCode) {
    try {
      const { parseMermaidToExcalidraw } = await import(
        "https://esm.sh/@excalidraw/mermaid-to-excalidraw@0.3.0?bundle-deps"
      );
      const { convertToExcalidrawElements } = await import(
        "https://esm.sh/@excalidraw/excalidraw?bundle-deps"
      );
      const result = await parseMermaidToExcalidraw(mermaidCode, { fontSize: 16 });
      // Clean <br> tags in labels before conversion
      for (const el of result.elements) {
        if (el.label && el.label.text) {
          el.label.text = el.label.text.replace(/<br\\s*\\/?>/gi, "\\n");
        }
        if (el.text) {
          el.text = el.text.replace(/<br\\s*\\/?>/gi, "\\n");
        }
      }
      // Convert intermediate format (with nested label) to standard excalidraw elements
      const elements = convertToExcalidrawElements(result.elements);
      return { ok: true, elements, files: result.files || {} };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  window.exportToPng = async function(excalidrawData, scale) {
    try {
      const { exportToBlob } = await import(
        "https://esm.sh/@excalidraw/excalidraw?bundle-deps"
      );
      const blob = await exportToBlob({
        elements: excalidrawData.elements || [],
        appState: {
          exportBackground: true,
          exportWithDarkMode: false,
          viewBackgroundColor: "#ffffff",
        },
        files: excalidrawData.files || {},
        exportPadding: 20,
        getDimensions: (w, h) => ({ width: w * scale, height: h * scale, scale }),
      });
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve({ ok: true, dataUrl: reader.result });
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  document.getElementById("status").textContent = "ready";
</script>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") console.error("BROWSER:", msg.text());
});

await page.setContent(html, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.getElementById("status").textContent === "ready", { timeout: 60000 });
console.log("Browser ready, converting...");

const results = [];
for (let i = 0; i < blocks.length; i++) {
  const idx = i + 1;
  const filename = `mermaid-${String(idx).padStart(2, "0")}`;

  // Step 1: Convert mermaid to excalidraw
  const convertResult = await page.evaluate(async (code) => {
    return await window.convertMermaid(code);
  }, blocks[i]);

  if (!convertResult.ok) {
    console.error(`✗ Block ${idx} convert failed: ${convertResult.error}`);
    results.push({ index: idx, filename, status: "convert_error", error: convertResult.error });
    continue;
  }

  const excalidrawData = {
    type: "excalidraw",
    version: 2,
    source: "mermaid-to-excalidraw",
    elements: convertResult.elements,
    appState: { viewBackgroundColor: "#ffffff", gridSize: null },
    files: convertResult.files,
  };

  // Save excalidraw JSON
  const excalidrawPath = resolve(outputDir, `${filename}.excalidraw`);
  writeFileSync(excalidrawPath, JSON.stringify(excalidrawData, null, 2));

  // Step 2: Export to PNG
  const pngResult = await page.evaluate(async (data) => {
    return await window.exportToPng(data, 2);
  }, excalidrawData);

  if (!pngResult.ok) {
    console.error(`✗ Block ${idx} export failed: ${pngResult.error}`);
    results.push({ index: idx, filename, status: "export_error", error: pngResult.error });
    continue;
  }

  const pngPath = resolve(outputDir, `${filename}.png`);
  const base64Png = pngResult.dataUrl.split(",")[1];
  writeFileSync(pngPath, Buffer.from(base64Png, "base64"));

  console.log(`✓ Block ${idx} → ${filename}.png`);
  results.push({ index: idx, filename, status: "ok", pngPath });
}

await browser.close();

const okCount = results.filter(r => r.status === "ok").length;
console.log(`\nDone: ${okCount}/${blocks.length} succeeded`);
writeFileSync(resolve(outputDir, "results.json"), JSON.stringify(results, null, 2));
