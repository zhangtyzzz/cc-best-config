import { execSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
export class BaseAdapter {
    applyConfigOverrides(cfg) {
        if (!cfg)
            return;
        if (typeof cfg.auth_env === "string" && cfg.auth_env.trim()) {
            this.config.authEnvVar = cfg.auth_env;
        }
        if (typeof cfg.cli_binary === "string" && cfg.cli_binary.trim()) {
            this.config.cliBinary = cfg.cli_binary;
        }
        if (Array.isArray(cfg.strengths) && cfg.strengths.length > 0) {
            this.config.strengths = [...cfg.strengths];
        }
        if (cfg.cost_per_1k && Number.isFinite(cfg.cost_per_1k.input) && Number.isFinite(cfg.cost_per_1k.output)) {
            this.config.costPer1kTokens = {
                input: cfg.cost_per_1k.input,
                output: cfg.cost_per_1k.output,
            };
        }
    }
    /** Shell-escape a string for safe inclusion in a shell command */
    shellEscape(s) {
        return "'" + s.replace(/'/g, "'\\''") + "'";
    }
    /**
     * Run a CLI command synchronously via shell.
     * Using execSync because several CLI tools (notably opencode) hang
     * indefinitely when spawned via Node's async spawn/exec with piped stdio.
     * See: https://github.com/anomalyco/opencode/issues/11891
     */
    runCli(binary, args, timeoutMs = 300_000) {
        const cmd = [this.shellEscape(binary), ...args.map(a => this.shellEscape(a))].join(" ");
        try {
            const stdout = execSync(cmd, {
                env: { ...process.env },
                timeout: timeoutMs,
                maxBuffer: 50 * 1024 * 1024,
                encoding: "utf-8",
                stdio: ["pipe", "pipe", "pipe"],
            });
            return Promise.resolve(stdout);
        }
        catch (err) {
            // If process was killed (timeout/signal) but produced stdout, return it
            const stdout = err.stdout?.toString() || "";
            if (stdout.trim() && (err.status === 0 || err.status === null)) {
                return Promise.resolve(stdout);
            }
            const stderr = err.stderr?.toString() || "";
            const code = err.killed ? `timeout(${timeoutMs}ms)` : (err.status ?? err.signal ?? "unknown");
            return Promise.reject(new Error(`${binary} exited with code ${code}: ${stderr}`));
        }
    }
    async cliExists(binary) {
        try {
            await this.runCli("which", [binary], 5000);
            return true;
        }
        catch {
            return false;
        }
    }
    hasAuthEnvValue() {
        if (!this.config.authEnvVar)
            return false;
        const value = process.env[this.config.authEnvVar];
        return typeof value === "string" && value.trim().length > 0;
    }
    stripAnsi(text) {
        return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
    }
    parseTrailingJson(raw) {
        const cleaned = this.stripAnsi(raw).trim();
        for (let idx = cleaned.lastIndexOf("{"); idx >= 0; idx = cleaned.lastIndexOf("{", idx - 1)) {
            try {
                return JSON.parse(cleaned.slice(idx));
            }
            catch {
                // keep scanning for a valid trailing JSON object
            }
        }
        return undefined;
    }
    /**
     * Run a CLI command with retry on transient failures.
     * Retries on timeout or non-zero exit up to maxRetries times.
     */
    async runCliWithRetry(binary, args, timeoutMs = 300_000, maxRetries = 1) {
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await this.runCli(binary, args, timeoutMs);
            }
            catch (err) {
                lastError = err;
                if (attempt < maxRetries) {
                    const isRetryable = err.message?.includes("timeout") ||
                        err.message?.includes("SIGTERM") ||
                        err.message?.includes("SIGKILL") ||
                        err.message?.includes("rate limit") ||
                        err.message?.includes("ECONNRESET") ||
                        err.message?.includes("ECONNREFUSED") ||
                        err.message?.includes("429");
                    if (!isRetryable)
                        throw err;
                    // brief pause before retry
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        }
        throw lastError;
    }
    /** Log a cost tracking entry to ~/.universal-agent-bridge/cost.log */
    logCost(entry) {
        try {
            const logDir = join(homedir(), ".universal-agent-bridge");
            mkdirSync(logDir, { recursive: true });
            const logFile = join(logDir, "cost.log");
            const record = {
                timestamp: new Date().toISOString(),
                ...entry,
            };
            appendFileSync(logFile, JSON.stringify(record) + "\n", "utf-8");
        }
        catch {
            // cost logging is best-effort, don't fail the task
        }
    }
    buildReviewPrompt(task) {
        const focus = task.focus ? `Focus specifically on: ${task.focus}.\n\n` : "";
        const lang = task.language ? `Language: ${task.language}\n` : "";
        let prompt;
        switch (task.type) {
            case "review":
                prompt = `${focus}${lang}Review the following code for bugs, edge cases, error handling, and improvements:\n\n${task.code}`;
                break;
            case "adversarial-review":
                prompt = `${focus}${lang}Adversarial code review: actively try to break this code, find security vulnerabilities, race conditions, and edge cases:\n\n${task.code}`;
                break;
            case "task":
                prompt = task.code || "";
                break;
            case "explain":
                prompt = `${lang}Explain what this code does, step by step. Include the overall architecture, key decisions, and any potential issues:\n\n${task.code}`;
                break;
            default:
                prompt = task.code || "";
                break;
        }
        // Read-only tasks get an explicit instruction not to modify files
        const readOnlyTypes = ["review", "adversarial-review", "explain"];
        if (readOnlyTypes.includes(task.type)) {
            prompt += "\n\nIMPORTANT: Only analyze and report findings. Do not modify any files.";
        }
        return prompt;
    }
}
