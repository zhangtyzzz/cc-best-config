// plugins/agent-bridge/scripts/bridge.ts
//
// Usage:
//   node <path>/dist/bridge.js --agent codex "fix the login bug"          (--task defaults to "task")
//   node <path>/dist/bridge.js --task review --agent codex --code-file /tmp/uab-input.txt
//   node <path>/dist/bridge.js --task health
//   node <path>/dist/bridge.js --task list
//   node <path>/dist/bridge.js --task compare --agents codex,opencode --code-file /tmp/code.txt
//   node <path>/dist/bridge.js --task status [--job-id <id>] [--wait]
//   node <path>/dist/bridge.js --task result --job-id <id>
//   node <path>/dist/bridge.js --task cancel --job-id <id>
//   node <path>/dist/bridge.js --task task-worker --job-id <id> --cwd <path>
import { parseArgs } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// -- Import modules --
import { loadConfig } from "./config.js";
import { Router } from "./router.js";
import { CodexAdapter } from "./adapters/codex.js";
import { OpenCodeAdapter } from "./adapters/opencode.js";
import { QoderAdapter } from "./adapters/qoder.js";
import { generateJobId, upsertJob, listJobs, readJobFile, writeJobFile, appendLogLine, matchJobRef, isAmbiguousJobRef, resolveJobLogFile, } from "./state.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// -- Parse command line args --
const { values: rawArgs, positionals: rawPositionals } = parseArgs({
    options: {
        task: { type: "string", short: "t" },
        agent: { type: "string", short: "a" },
        agents: { type: "string" },
        "code-file": { type: "string", short: "f" },
        "prompt-file": { type: "string" },
        focus: { type: "string" },
        language: { type: "string", short: "l" },
        context: { type: "string", short: "c" },
        background: { type: "boolean", short: "b", default: false },
        base: { type: "string" },
        scope: { type: "string" },
        "job-id": { type: "string" },
        cwd: { type: "string" },
        wait: { type: "boolean", default: false },
        all: { type: "boolean", default: false },
    },
    strict: false,
    allowPositionals: true,
});
// Helper: extract string args (parseArgs returns string | boolean for non-strict)
const str = (key) => {
    const v = rawArgs[key];
    return typeof v === "string" ? v : undefined;
};
// Compat: LLM fork agents sometimes generate key=value positionals (e.g. `agent=codex`)
// instead of --key value flags. Extract known keys from the LEADING positionals only —
// stop at the first token that isn't a recognized key=value pair to avoid consuming
// user prompt content like "fix task=management system".
const knownStringKeys = ["task", "agent", "agents", "code-file", "prompt-file", "focus", "language", "context", "base", "scope", "job-id", "cwd"];
const knownBoolKeys = ["background", "wait", "all"];
let kvDone = false;
const cleanPositionals = [];
for (const arg of rawPositionals) {
    if (!kvDone) {
        const eqIdx = arg.indexOf("=");
        if (eqIdx > 0) {
            const key = arg.slice(0, eqIdx);
            const val = arg.slice(eqIdx + 1);
            if (val && knownStringKeys.includes(key) && !str(key)) {
                rawArgs[key] = val;
                continue;
            }
            if (knownBoolKeys.includes(key) && (val === "true" || val === "false") && rawArgs[key] === undefined) {
                rawArgs[key] = val === "true";
                continue;
            }
            // Unrecognized or invalid key=value — stop compat, fall through to prompt
        }
        else {
            // No '=' at all — this is prompt text, stop compat parsing
        }
        kvDone = true;
    }
    cleanPositionals.push(arg);
}
// Replace rawPositionals with cleaned version (remove consumed key=value pairs)
const positionals = cleanPositionals;
// -- Extract first positional as task type if it matches a known keyword --
const KNOWN_TASK_TYPES = ["review", "adversarial-review", "explain", "compare"];
if (!str("task") && positionals.length > 0 && KNOWN_TASK_TYPES.includes(positionals[0].toLowerCase())) {
    rawArgs["task"] = positionals[0].toLowerCase();
    positionals.splice(0, 1);
}
function normalizeAgentName(name) {
    return name === "qodercli" ? "qoder" : name;
}
// -- Initialize Adapter Registry --
function createAdapterRegistry(config) {
    const registry = new Map();
    const agentConfigs = config.agents;
    const adapterClasses = {
        codex: CodexAdapter,
        opencode: OpenCodeAdapter,
        qoder: QoderAdapter,
    };
    for (const [name, agentCfg] of Object.entries(agentConfigs)) {
        if (!agentCfg.enabled)
            continue;
        const AdapterClass = adapterClasses[name];
        if (AdapterClass) {
            registry.set(name, new AdapterClass(agentCfg));
        }
    }
    return registry;
}
// -- Background job helpers --
function autoCollectGitDiff(cwd, scope, base) {
    const run = (cmd) => {
        try {
            return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).toString();
        }
        catch {
            return "";
        }
    };
    const safeBase = base.replace(/[^a-zA-Z0-9._/-]/g, "");
    if (scope === "working-tree") {
        return run("git diff HEAD");
    }
    if (scope === "branch") {
        return run(`git diff ${safeBase}...HEAD`);
    }
    // auto: prefer working tree if dirty, else branch diff
    const dirty = run("git status --porcelain").trim();
    if (dirty) {
        return run("git diff HEAD") || run("git diff --cached") || dirty;
    }
    return run(`git diff ${safeBase}...HEAD`);
}
function spawnDetachedWorker(cwd, jobId) {
    const scriptPath = join(__dirname, "bridge.js");
    const child = spawn(process.execPath, [scriptPath, "--task", "task-worker", "--job-id", jobId, "--cwd", cwd], {
        cwd,
        env: process.env,
        detached: true,
        stdio: "ignore",
    });
    child.unref();
    return child.pid ?? null;
}
function formatStatusTable(jobs) {
    if (jobs.length === 0)
        return "No jobs found.";
    const lines = [];
    lines.push("| ID | Kind | Agent | Status | Summary | Updated |");
    lines.push("|----|------|-------|--------|---------|---------|");
    for (const j of jobs) {
        const shortId = j.id.length > 20 ? j.id.slice(0, 20) + "..." : j.id;
        const cleanSummary = j.summary.replace(/[\r\n|]/g, " ");
        const summary = cleanSummary.length > 40 ? cleanSummary.slice(0, 40) + "..." : cleanSummary;
        const updatedAgo = timeSince(j.updatedAt);
        lines.push(`| ${shortId} | ${j.kind} | ${j.agent} | ${j.status} | ${summary} | ${updatedAgo} |`);
    }
    return lines.join("\n");
}
function timeSince(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0)
        return "just now";
    if (ms < 60_000)
        return `${Math.floor(ms / 1000)}s ago`;
    if (ms < 3_600_000)
        return `${Math.floor(ms / 60_000)}m ago`;
    return `${Math.floor(ms / 3_600_000)}h ago`;
}
/** Look up a job by ID or prefix, exit with appropriate error if not found. */
function resolveJobOrExit(jobs, ref) {
    const job = matchJobRef(jobs, ref);
    if (job)
        return job;
    if (isAmbiguousJobRef(jobs, ref)) {
        console.error(`Error: job prefix "${ref}" is ambiguous — matches multiple jobs. Use a longer prefix.`);
    }
    else {
        console.error(`Error: job "${ref}" not found.`);
    }
    process.exit(1);
}
function terminateProcessTree(pid) {
    // Verify the process still exists before killing
    try {
        process.kill(pid, 0); // signal 0 = existence check
    }
    catch {
        return false; // PID no longer exists or not owned by us
    }
    try {
        process.kill(-pid, "SIGTERM");
    }
    catch {
        try {
            process.kill(pid, "SIGTERM");
        }
        catch {
            // Process already gone
        }
    }
    return true;
}
// -- Main flow --
async function main() {
    const config = loadConfig();
    const registry = createAdapterRegistry(config);
    // Convert routing_rules from config format to Router format
    const routingRules = (config.routing_rules || []).map((r) => ({
        match: {
            taskType: r.match.task_type,
            language: r.match.language,
            focus: r.match.focus,
            keyword: r.match.keyword,
        },
        routeTo: r.route_to,
        reason: r.reason,
    }));
    const router = new Router(registry, routingRules, config.fallback_chain || []);
    // Default to "task" only when the caller provided some input (prompt, file, or --agent)
    // but omitted --task. This supports the /agent:task slash command which skips --task to avoid
    // the confusing `--task task` pattern. Other commands still pass --task explicitly.
    const hasInput = positionals.length > 0 || str("code-file") || str("prompt-file") || str("agent") || str("context");
    const task = (str("task") || (hasInput ? "task" : null))?.toLowerCase() ?? null;
    if (!task) {
        console.error("Error: --task is required");
        process.exit(1);
    }
    const workingDir = str("cwd") || process.cwd();
    // ---- health command ----
    if (task === "health") {
        console.log("## Agent Health Check\n");
        console.log("| Agent | Status | Version | Info |");
        console.log("|-------|--------|---------|------|");
        for (const [name, adapter] of registry) {
            const health = await adapter.healthCheck();
            const status = health.ok ? "OK" : "Fail";
            const version = health.version || "-";
            const error = health.error || "OK";
            console.log(`| ${name} | ${status} | ${version} | ${error} |`);
        }
        return;
    }
    // ---- list command ----
    if (task === "list") {
        console.log("## Available Agents\n");
        for (const [name, adapter] of registry) {
            const cfg = adapter.config;
            console.log(`### ${cfg.displayName} (\`${name}\`)`);
            console.log(`- CLI: \`${cfg.cliBinary}\``);
            console.log(`- Capabilities: ${cfg.capabilities.join(", ")}`);
            console.log(`- Strengths: ${cfg.strengths.join(", ")}`);
            if (cfg.costPer1kTokens) {
                console.log(`- Cost: $${cfg.costPer1kTokens.input}/$${cfg.costPer1kTokens.output} per 1k tokens`);
            }
            else {
                console.log(`- Cost: Free`);
            }
            console.log("");
        }
        return;
    }
    // ---- status command ----
    if (task === "status") {
        const jobId = str("job-id");
        const jobs = listJobs(workingDir);
        if (jobId) {
            const job = resolveJobOrExit(jobs, jobId);
            // --wait: poll until finished
            if (rawArgs.wait === true) {
                const deadline = Date.now() + 6 * 60 * 1000; // 6min (must exceed adapter timeout)
                let current = job;
                while (current && (current.status === "queued" || current.status === "running")) {
                    if (Date.now() > deadline) {
                        console.error("Timed out waiting for job to finish.");
                        process.exit(1);
                    }
                    await new Promise((r) => setTimeout(r, 2000));
                    const refreshed = listJobs(workingDir);
                    current = matchJobRef(refreshed, job.id) || current;
                }
                // Print final state
                const full = readJobFile(workingDir, current.id) || current;
                console.log(`## Job ${full.id}\n`);
                console.log(`- Status: ${full.status}`);
                console.log(`- Agent: ${full.agent}`);
                if (full.result) {
                    console.log(`\n### Result\n`);
                    console.log(full.result.result);
                }
                if (full.errorMessage) {
                    console.log(`\n### Error\n\n${full.errorMessage}`);
                }
                return;
            }
            // Single job detail
            const full = readJobFile(workingDir, job.id) || job;
            console.log(`## Job ${full.id}\n`);
            console.log(`- Kind: ${full.kind}`);
            console.log(`- Agent: ${full.agent}`);
            console.log(`- Status: ${full.status}`);
            console.log(`- Phase: ${full.phase}`);
            console.log(`- Created: ${full.createdAt}`);
            console.log(`- Updated: ${full.updatedAt}`);
            if (full.startedAt)
                console.log(`- Started: ${full.startedAt}`);
            if (full.completedAt)
                console.log(`- Completed: ${full.completedAt}`);
            if (full.pid)
                console.log(`- PID: ${full.pid}`);
            if (full.summary)
                console.log(`- Summary: ${full.summary}`);
            if (full.errorMessage)
                console.log(`- Error: ${full.errorMessage}`);
            return;
        }
        // No job-id: show table
        const display = rawArgs.all === true ? jobs : jobs.slice(0, 8);
        console.log("## Agent Jobs\n");
        console.log(formatStatusTable(display));
        if (!rawArgs.all && jobs.length > 8) {
            console.log(`\n*Showing 8 of ${jobs.length} jobs. Use --all to see all.*`);
        }
        return;
    }
    // ---- result command ----
    if (task === "result") {
        const jobId = str("job-id");
        if (!jobId) {
            console.error("Error: --job-id is required for task 'result'");
            process.exit(1);
        }
        const jobs = listJobs(workingDir);
        const job = resolveJobOrExit(jobs, jobId);
        if (job.status === "queued" || job.status === "running") {
            console.error(`Job ${job.id} is still ${job.status}. Use /agent:status --job-id ${job.id} --wait to wait for completion.`);
            process.exit(1);
        }
        const full = readJobFile(workingDir, job.id) || job;
        console.log(`## Result: ${full.id}\n`);
        console.log(`- Status: ${full.status}`);
        console.log(`- Agent: ${full.agent}${full.result?.model ? ` (${full.result.model})` : ""}`);
        if (full.result?.latencyMs)
            console.log(`- Latency: ${full.result.latencyMs}ms`);
        if (full.result) {
            console.log(`\n### Output\n`);
            console.log(full.result.result);
        }
        if (full.errorMessage) {
            console.log(`\n### Error\n\n${full.errorMessage}`);
        }
        return;
    }
    // ---- cancel command ----
    if (task === "cancel") {
        const jobId = str("job-id");
        if (!jobId) {
            console.error("Error: --job-id is required for task 'cancel'");
            process.exit(1);
        }
        const jobs = listJobs(workingDir);
        const job = resolveJobOrExit(jobs, jobId);
        if (job.status !== "queued" && job.status !== "running") {
            console.error(`Job ${job.id} is already ${job.status}, cannot cancel.`);
            process.exit(1);
        }
        // Kill the process tree
        if (job.pid) {
            terminateProcessTree(job.pid);
        }
        // Update state
        const now = new Date().toISOString();
        upsertJob(workingDir, { id: job.id, status: "cancelled", phase: "cancelled", completedAt: now, pid: null });
        const full = readJobFile(workingDir, job.id);
        if (full) {
            writeJobFile(workingDir, job.id, { ...full, status: "cancelled", phase: "cancelled", completedAt: now, pid: null });
        }
        console.log(`Cancelled job ${job.id}.`);
        return;
    }
    // ---- task-worker command (detached background worker) ----
    if (task === "task-worker") {
        const jobId = str("job-id");
        if (!jobId) {
            console.error("Error: --job-id is required for task-worker");
            process.exit(1);
        }
        const stored = readJobFile(workingDir, jobId);
        if (!stored || !stored.request) {
            console.error(`Error: job file for "${jobId}" not found or has no request`);
            process.exit(1);
        }
        const request = stored.request;
        const logFile = stored.logFile;
        // Check if job was cancelled before we started
        const freshState = readJobFile(workingDir, jobId);
        if (freshState && freshState.status === "cancelled") {
            if (logFile)
                appendLogLine(logFile, "Worker exiting: job was cancelled before start");
            return;
        }
        // Mark running
        const startedAt = new Date().toISOString();
        upsertJob(workingDir, { id: jobId, status: "running", phase: "running", startedAt, pid: process.pid });
        writeJobFile(workingDir, jobId, { ...stored, status: "running", phase: "running", startedAt, pid: process.pid });
        if (logFile)
            appendLogLine(logFile, `Worker started (PID ${process.pid})`);
        // Execute
        const adapter = registry.get(request.agent);
        if (!adapter) {
            const err = `Agent "${request.agent}" not available`;
            upsertJob(workingDir, { id: jobId, status: "failed", phase: "failed", errorMessage: err, pid: null });
            const rec = readJobFile(workingDir, jobId);
            if (rec)
                writeJobFile(workingDir, jobId, { ...rec, status: "failed", phase: "failed", errorMessage: err, pid: null });
            if (logFile)
                appendLogLine(logFile, `Failed: ${err}`);
            process.exit(1);
        }
        const taskInput = {
            type: request.type,
            code: request.code,
            context: request.context,
            focus: request.focus,
            language: request.language,
        };
        try {
            if (logFile)
                appendLogLine(logFile, `Executing via ${request.agent}...`);
            const output = await adapter.execute(taskInput);
            const completedAt = new Date().toISOString();
            const result = { agent: output.agent, model: output.model, result: output.result, latencyMs: output.latencyMs };
            // Don't overwrite if job was cancelled while we were executing
            const currentState = readJobFile(workingDir, jobId);
            if (currentState && currentState.status === "cancelled") {
                if (logFile)
                    appendLogLine(logFile, "Worker finished but job was cancelled, not updating state");
                return;
            }
            upsertJob(workingDir, { id: jobId, status: "completed", phase: "done", completedAt, result, pid: null });
            const rec = readJobFile(workingDir, jobId);
            if (rec)
                writeJobFile(workingDir, jobId, { ...rec, status: "completed", phase: "done", completedAt, result, pid: null });
            if (logFile)
                appendLogLine(logFile, `Completed (${output.latencyMs}ms)`);
        }
        catch (e) {
            const completedAt = new Date().toISOString();
            const errorMessage = e.message || String(e);
            // Don't overwrite if job was cancelled while we were executing
            const currentStateOnError = readJobFile(workingDir, jobId);
            if (currentStateOnError && currentStateOnError.status === "cancelled") {
                if (logFile)
                    appendLogLine(logFile, "Worker failed but job was cancelled, not updating state");
                return;
            }
            upsertJob(workingDir, { id: jobId, status: "failed", phase: "failed", completedAt, errorMessage, pid: null });
            const rec = readJobFile(workingDir, jobId);
            if (rec)
                writeJobFile(workingDir, jobId, { ...rec, status: "failed", phase: "failed", completedAt, errorMessage, pid: null });
            if (logFile)
                appendLogLine(logFile, `Failed: ${errorMessage}`);
            process.exit(1);
        }
        return;
    }
    // ---- Commands that need code ----
    const validTasks = ["review", "adversarial-review", "task", "explain", "compare"];
    if (!validTasks.includes(task)) {
        console.error(`Error: unknown task "${task}". Valid tasks: ${validTasks.join(", ")}, health, list, status, result, cancel`);
        process.exit(1);
    }
    // ---- Resolve code/prompt input ----
    // Priority order: --code-file > --prompt-file > positional args > auto-collect (review tasks only)
    let code = "";
    const codeFile = str("code-file") || str("prompt-file");
    if (codeFile && existsSync(codeFile)) {
        code = readFileSync(codeFile, "utf-8");
    }
    else if (positionals.length > 0) {
        code = positionals.join(" ");
    }
    const reviewTasks = ["review", "adversarial-review", "compare"];
    if (!code.trim() && reviewTasks.includes(task)) {
        // Auto-collect git diff based on --scope
        code = autoCollectGitDiff(workingDir, str("scope") || "auto", str("base") || "main");
    }
    // Require code for tasks that need it
    const needsInput = ["review", "adversarial-review", "task", "explain", "compare"];
    if (needsInput.includes(task) && !code.trim()) {
        if (reviewTasks.includes(task)) {
            console.error(`Error: no code to ${task}. Working tree is clean and branch diff against "${str("base") || "main"}" is empty. Provide --code-file or commit changes.`);
        }
        else {
            console.error(`Error: no prompt provided for task "${task}". Pass it as positional args, --prompt-file, or --code-file.`);
        }
        process.exit(1);
    }
    const taskInput = {
        type: task,
        code,
        context: str("context") || "",
        focus: str("focus") || "",
        language: str("language") || "",
        background: rawArgs.background === true,
    };
    // ---- Resolve agent ----
    const agentsArg = str("agents");
    let agentName;
    const specifiedAgent = str("agent");
    if (specifiedAgent) {
        agentName = normalizeAgentName(specifiedAgent);
    }
    else if (task === "compare" || agentsArg) {
        // multi-agent mode handles its own agent selection below
        agentName = "";
    }
    else {
        const routeResult = await router.select(taskInput);
        agentName = routeResult.agent;
        if (!rawArgs.background) {
            console.log(`*Auto-routed to **${agentName}**: ${routeResult.reason}*\n`);
        }
    }
    // ---- Background execution ----
    if (rawArgs.background === true && agentsArg) {
        console.error("Warning: --background is not supported with --agents, running in foreground.");
    }
    // "compare" requires --agents; reject background mode early to avoid queuing an invalid job
    if (rawArgs.background === true && task === "compare" && !agentsArg) {
        console.error("Error: --agents is required for compare (e.g. --agents codex,opencode)");
        process.exit(1);
    }
    if (rawArgs.background === true && !agentsArg) {
        const jobId = generateJobId("task");
        const logFile = resolveJobLogFile(workingDir, jobId);
        const summary = (code || str("context") || "").slice(0, 100);
        const jobRecord = {
            id: jobId,
            kind: task,
            title: `Agent ${task.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`,
            agent: agentName,
            summary,
            status: "queued",
            phase: "queued",
            pid: null,
            logFile,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            request: {
                type: task,
                code,
                context: str("context") || "",
                focus: str("focus") || "",
                language: str("language") || "",
                agent: agentName,
            },
        };
        upsertJob(workingDir, jobRecord);
        writeJobFile(workingDir, jobId, jobRecord);
        appendLogLine(logFile, "Queued for background execution.");
        const pid = spawnDetachedWorker(workingDir, jobId);
        if (pid) {
            upsertJob(workingDir, { id: jobId, pid });
            const stored = readJobFile(workingDir, jobId);
            if (stored)
                writeJobFile(workingDir, jobId, { ...stored, pid });
        }
        console.log(`Background job started: ${jobId}`);
        console.log(`Use /agent:status --job-id ${jobId} to check progress.`);
        return;
    }
    // ---- Multi-agent parallel execution (--agents on any task) ----
    if (agentsArg) {
        const agentNames = agentsArg.split(",").map((s) => normalizeAgentName(s.trim())).filter(Boolean);
        if (agentNames.length < 2) {
            console.error("Error: --agents requires at least 2 comma-separated agent names. Use --agent (singular) for a single agent.");
            process.exit(1);
        }
        // "compare" is not a real task type — it just means multi-agent. Use "review" as default.
        const effectiveType = task === "compare" ? "review" : task;
        const effectiveInput = { ...taskInput, type: effectiveType };
        const label = effectiveType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        console.log(`## ${label}: ${agentNames.join(" vs ")}\n`);
        const promises = agentNames.map(async (name) => {
            const adapter = registry.get(name);
            if (!adapter) {
                return { agent: name, result: `Error: agent "${name}" not found or not enabled`, latencyMs: 0 };
            }
            try {
                return await adapter.execute(effectiveInput);
            }
            catch (e) {
                return { agent: name, result: `Error: ${e.message}`, latencyMs: 0 };
            }
        });
        const outputs = await Promise.all(promises);
        for (const output of outputs) {
            console.log(`### ${label} by ${output.agent}${output.model ? ` (${output.model})` : ""}`);
            console.log(`*Latency: ${output.latencyMs}ms${output.costEstimate ? ` | Est. cost: $${output.costEstimate}` : ""}*`);
            console.log(output.result);
            console.log("\n---\n");
        }
        return;
    }
    // "compare" without --agents is an error
    if (task === "compare") {
        console.error("Error: --agents is required (e.g. --agents codex,opencode)");
        process.exit(1);
    }
    // ---- Single agent foreground execution ----
    const adapter = registry.get(agentName);
    if (!adapter) {
        console.error(`Error: agent "${agentName}" not found or not enabled.`);
        console.error(`Available agents: ${[...registry.keys()].join(", ")}`);
        process.exit(1);
    }
    try {
        const output = await adapter.execute(taskInput);
        console.log(`## ${task.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`);
        console.log(`*Latency: ${output.latencyMs}ms${output.costEstimate ? ` | Est. cost: $${output.costEstimate}` : ""}*`);
        console.log(output.result);
    }
    catch (e) {
        console.error(`Error executing ${agentName}: ${e.message}`);
        process.exit(1);
    }
}
main().catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
});
