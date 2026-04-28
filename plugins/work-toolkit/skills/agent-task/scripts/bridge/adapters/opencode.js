import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { BaseAdapter } from "./base.js";
export class OpenCodeAdapter extends BaseAdapter {
    config = {
        name: "opencode",
        displayName: "OpenCode",
        cliBinary: "opencode",
        authEnvVar: "OPENROUTER_API_KEY",
        capabilities: ["review", "adversarial-review", "task", "explain"],
        strengths: ["multi-model", "python", "cost-efficient", "local-models"],
    };
    modelName;
    constructor(cfg) {
        super();
        this.applyConfigOverrides(cfg);
        if (cfg?.model) {
            this.modelName = cfg.model;
        }
        else {
            this.modelName = this.resolveOpenCodeModel();
        }
    }
    /**
     * Auto-detect the user's preferred opencode model from opencode's own config chain.
     *
     * Priority (matches opencode's documented loading order):
     *   1. Project opencode.json / opencode.jsonc  →  "model" field
     *   2. Global  ~/.config/opencode/opencode.json(c) →  "model" field
     *   3. State   ~/.local/state/opencode/model.json →  recent[0]  (TUI selection)
     *
     * Returns undefined when nothing is found — opencode will pick its own default.
     */
    resolveOpenCodeModel() {
        // 1. Project-level opencode config
        const cwd = process.cwd();
        for (const name of ["opencode.json", "opencode.jsonc"]) {
            const m = this.readModelFromConfig(join(cwd, name));
            if (m)
                return m;
        }
        // 2. Global opencode config
        const globalDir = process.env.XDG_CONFIG_HOME
            ? join(process.env.XDG_CONFIG_HOME, "opencode")
            : join(homedir(), ".config", "opencode");
        for (const name of ["opencode.json", "opencode.jsonc"]) {
            const m = this.readModelFromConfig(join(globalDir, name));
            if (m)
                return m;
        }
        // 3. TUI state — recent model selection
        const stateDir = process.env.XDG_STATE_HOME
            ? join(process.env.XDG_STATE_HOME, "opencode")
            : join(homedir(), ".local", "state", "opencode");
        const modelJsonPath = join(stateDir, "model.json");
        try {
            const data = JSON.parse(readFileSync(modelJsonPath, "utf-8"));
            if (Array.isArray(data.recent) && data.recent.length > 0) {
                const { providerID, modelID } = data.recent[0];
                if (typeof providerID === "string" && typeof modelID === "string") {
                    return `${providerID}/${modelID}`;
                }
            }
        }
        catch {
            // model.json missing or unreadable — no problem
        }
        return undefined;
    }
    /** Read the top-level "model" field from an opencode config file. */
    readModelFromConfig(filePath) {
        try {
            let text = readFileSync(filePath, "utf-8");
            // Strip JSONC single-line comments (but not // inside strings)
            if (filePath.endsWith(".jsonc")) {
                text = text.replace(/"(?:[^"\\]|\\.)*"|\/\/.*$/gm, (m) => m.startsWith('"') ? m : "");
            }
            const data = JSON.parse(text);
            if (typeof data.model === "string" && data.model)
                return data.model;
        }
        catch {
            // ENOENT, parse error, or other IO error — skip
        }
        return undefined;
    }
    async healthCheck() {
        try {
            const version = await this.runCli(this.config.cliBinary, ["--version"], 5000);
            if (this.hasAuthEnvValue()) {
                return { ok: true, version: version.trim(), error: `authenticated via ${this.config.authEnvVar}` };
            }
            try {
                const providers = this.stripAnsi(await this.runCli(this.config.cliBinary, ["providers", "list"], 5000));
                const match = providers.match(/\b(\d+)\s+credentials?\b/i);
                const credentialCount = match ? Number.parseInt(match[1], 10) : 0;
                if (credentialCount > 0) {
                    return {
                        ok: true,
                        version: version.trim(),
                        error: `${credentialCount} credential${credentialCount === 1 ? "" : "s"} configured`,
                    };
                }
                return { ok: false, version: version.trim(), error: "not logged in" };
            }
            catch {
                return { ok: false, version: version.trim(), error: "unable to verify login" };
            }
        }
        catch {
            return { ok: false, error: "opencode CLI not installed" };
        }
    }
    async execute(task) {
        const start = Date.now();
        const prompt = this.buildReviewPrompt(task);
        const raw = await this.runOpenCode(prompt);
        const result = this.parseJsonOutput(raw);
        const latencyMs = Date.now() - start;
        this.logCost({ agent: "opencode", task: task.type, latencyMs, model: this.modelName || "default" });
        return {
            agent: "opencode",
            model: this.modelName || "default",
            result,
            latencyMs,
        };
    }
    /**
     * opencode run hangs when spawned as a subprocess via Node.js spawn/exec
     * because it does not write to stdout in non-TTY mode and internal servers
     * (SSE, LSP, file watcher) keep the event loop alive indefinitely.
     * See: https://github.com/anomalyco/opencode/issues/11891
     *
     * Workaround: write prompt to temp file, pipe via stdin redirection
     * (avoids shell expansion/injection), output redirected to a temp file.
     */
    async runOpenCode(prompt, timeoutMs = 120_000) {
        const tmpDir = mkdtempSync(join(tmpdir(), "uab-oc-"));
        const promptFile = join(tmpDir, "prompt.txt");
        const outFile = join(tmpDir, "out.json");
        writeFileSync(promptFile, prompt, { encoding: "utf-8", mode: 0o600 });
        try {
            const shellEscape = (s) => "'" + s.replace(/'/g, "'\\''") + "'";
            const parts = [
                shellEscape(this.config.cliBinary),
                "run", "--format", "json",
            ];
            if (this.modelName) {
                parts.push("--model", shellEscape(this.modelName));
            }
            // Use stdin redirection to avoid shell expansion of prompt content.
            // Redirect stderr to /dev/null to keep output clean.
            parts.push(`< ${shellEscape(promptFile)}`, ">", shellEscape(outFile), "2>/dev/null");
            const cmd = parts.join(" ");
            execSync(cmd, {
                timeout: timeoutMs,
                shell: "/bin/bash",
                stdio: "ignore",
                killSignal: "SIGKILL",
            });
            // Happy path — read output
            const content = readFileSync(outFile, "utf-8");
            if (!content.trim()) {
                throw new Error("opencode produced no output");
            }
            return content;
        }
        catch (e) {
            // Check timeout first — most actionable error message
            if (e.killed || e.signal === "SIGKILL") {
                const partial = this.tryReadFile(outFile);
                throw new Error(`opencode timed out after ${timeoutMs}ms` +
                    (partial ? `\nPartial output:\n${partial.slice(0, 500)}` : ""));
            }
            // Non-zero exit but outFile may have valid content
            if (existsSync(outFile)) {
                const content = readFileSync(outFile, "utf-8");
                if (content.trim())
                    return content;
            }
            throw new Error(`opencode failed: ${e.message}`);
        }
        finally {
            try {
                rmSync(tmpDir, { recursive: true, force: true });
            }
            catch { }
        }
    }
    tryReadFile(path) {
        try {
            return readFileSync(path, "utf-8");
        }
        catch {
            return undefined;
        }
    }
    /** Parse opencode JSON stream output — extract text parts */
    parseJsonOutput(raw) {
        const texts = [];
        for (const line of raw.split("\n")) {
            if (!line.trim())
                continue;
            try {
                const event = JSON.parse(line);
                if (event.type === "text" && event.part?.text) {
                    texts.push(event.part.text);
                }
            }
            catch {
                // Not JSON, include as-is
                if (line.trim())
                    texts.push(line);
            }
        }
        return texts.join("\n") || raw;
    }
}
