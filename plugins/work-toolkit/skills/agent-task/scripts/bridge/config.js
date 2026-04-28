import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
// Built-in default config — works without any external config file
const BUILTIN_DEFAULT = {
    bridge: {
        default_strategy: "best_fit",
        cost_limit_usd_per_day: 5.0,
        log_level: "info",
    },
    agents: {
        codex: {
            enabled: true,
            auth_env: "OPENAI_API_KEY",
            cli_binary: "codex",
            strengths: ["security", "edge-cases", "deep-reasoning", "typescript"],
            cost_per_1k: { input: 0.003, output: 0.012 },
        },
        opencode: {
            enabled: true,
            auth_env: "OPENROUTER_API_KEY",
            cli_binary: "opencode",
            strengths: ["multi-model", "python", "cost-efficient", "local-models"],
        },
        qoder: {
            enabled: true,
            auth_env: "QODER_API_KEY",
            cli_binary: "qodercli",
            model: "ultimate",
            strengths: ["data-analysis", "sql", "business-logic"],
        },
    },
    routing_rules: [
        {
            match: { task_type: "adversarial-review" },
            route_to: "codex",
            reason: "Codex excels at security audits",
        },
        {
            match: { task_type: "task" },
            route_to: "codex",
            reason: "Codex excels at free-form task execution",
        },
        {
            match: { task_type: "review", language: "python" },
            route_to: "opencode",
            reason: "OpenCode excels at Python",
        },
        {
            match: { task_type: "review", focus: "sql" },
            route_to: "qoder",
            reason: "Qoder specializes in SQL",
        },
    ],
    fallback_chain: ["codex", "opencode", "qoder"],
};
function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (source[key] &&
            typeof source[key] === "object" &&
            !Array.isArray(source[key]) &&
            target[key] &&
            typeof target[key] === "object" &&
            !Array.isArray(target[key])) {
            result[key] = deepMerge(target[key], source[key]);
        }
        else {
            result[key] = source[key];
        }
    }
    return result;
}
function loadJsonFile(path) {
    if (!existsSync(path))
        return null;
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content);
}
export function loadConfig() {
    // Start with built-in defaults (always available, no file dependency)
    let config = structuredClone(BUILTIN_DEFAULT);
    // User-level config override: ~/.universal-agent-bridge/config.json
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    const userConfigPath = resolve(homeDir, ".universal-agent-bridge", "config.json");
    const userConfig = loadJsonFile(userConfigPath);
    if (userConfig)
        config = deepMerge(config, userConfig);
    // Project-level config override: ./.universal-agent-bridge/config.json
    const cwd = process.cwd();
    const projectConfigPath = resolve(cwd, ".universal-agent-bridge", "config.json");
    const projectConfig = loadJsonFile(projectConfigPath);
    if (projectConfig)
        config = deepMerge(config, projectConfig);
    // Arrays (routing_rules, fallback_chain) use standard override semantics:
    // project replaces user, user replaces built-in — no special merge needed.
    // deepMerge already handles this correctly (arrays are replaced wholesale).
    return config;
}
