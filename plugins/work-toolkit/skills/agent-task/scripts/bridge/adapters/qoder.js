import { BaseAdapter } from "./base.js";
export class QoderAdapter extends BaseAdapter {
    config = {
        name: "qoder",
        displayName: "Qoder",
        cliBinary: "qodercli",
        authEnvVar: "QODER_API_KEY",
        capabilities: ["review", "adversarial-review", "task", "explain"],
        strengths: ["data-analysis", "sql", "business-logic"],
    };
    modelLevel;
    constructor(cfg) {
        super();
        this.applyConfigOverrides(cfg);
        if (cfg?.model)
            this.modelLevel = cfg.model;
    }
    async healthCheck() {
        try {
            const version = await this.runCli(this.config.cliBinary, ["-v"], 5000);
            if (this.hasAuthEnvValue()) {
                return { ok: true, version: version.trim(), error: `authenticated via ${this.config.authEnvVar}` };
            }
            try {
                const statusRaw = await this.runCli(this.config.cliBinary, ["status", "-o", "json"], 5000);
                const status = this.parseTrailingJson(statusRaw);
                if (status?.logged_in) {
                    return { ok: true, version: version.trim(), error: "authenticated" };
                }
                return { ok: false, version: version.trim(), error: "not logged in" };
            }
            catch {
                return { ok: false, version: version.trim(), error: "unable to verify login" };
            }
        }
        catch {
            return { ok: false, error: "qodercli not installed" };
        }
    }
    async execute(task) {
        const start = Date.now();
        const prompt = this.buildReviewPrompt(task);
        // qodercli -p "<prompt>" --yolo --output-format text [--model <level>]
        const args = ["-p", prompt, "--yolo", "--output-format", "text"];
        if (this.modelLevel) {
            args.push("--model", this.modelLevel);
        }
        const result = await this.runCliWithRetry(this.config.cliBinary, args);
        const model = this.modelLevel || "auto";
        const latencyMs = Date.now() - start;
        this.logCost({ agent: "qoder", task: task.type, latencyMs, model });
        return {
            agent: "qoder",
            model,
            result,
            latencyMs,
        };
    }
}
