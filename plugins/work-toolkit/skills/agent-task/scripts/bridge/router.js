export class Router {
    adapters;
    rules;
    fallbackChain;
    constructor(adapters, rules, fallbackChain) {
        this.adapters = adapters;
        this.rules = rules;
        this.fallbackChain = fallbackChain;
    }
    async select(task) {
        // Cache health checks for this selection run
        const healthCache = new Map();
        const checkHealth = async (name) => {
            if (healthCache.has(name))
                return healthCache.get(name);
            const adapter = this.adapters.get(name);
            if (!adapter) {
                const result = { ok: false, error: "not found" };
                healthCache.set(name, result);
                return result;
            }
            const result = await adapter.healthCheck();
            healthCache.set(name, result);
            return result;
        };
        // 1. Match custom rules first
        for (const rule of this.rules) {
            if (this.matchRule(rule, task)) {
                const health = await checkHealth(rule.routeTo);
                if (health.ok) {
                    return { agent: rule.routeTo, reason: rule.reason };
                }
            }
        }
        // 2. Best-fit scoring (only consider agents that support the task type)
        let best = { agent: "", score: -Infinity, reason: "" };
        for (const [name, adapter] of this.adapters) {
            const health = await checkHealth(name);
            if (!health.ok)
                continue;
            // Skip agents that don't support this task type
            if (!adapter.config.capabilities.includes(task.type))
                continue;
            let score = 10; // base score for capability match
            const strengths = adapter.config.strengths.map(s => s.toLowerCase());
            if (task.focus && strengths.includes(task.focus.toLowerCase()))
                score += 5;
            if (task.language && strengths.includes(task.language.toLowerCase()))
                score += 3;
            // Lower cost = higher score (free agents get a bonus)
            const cost = adapter.config.costPer1kTokens;
            if (cost)
                score -= (cost.input + cost.output) * 100;
            else
                score += 3; // free bonus
            if (score > best.score) {
                best = { agent: name, score, reason: `Best fit (score: ${score})` };
            }
        }
        if (best.agent)
            return best;
        // 3. Fallback chain
        for (const name of this.fallbackChain) {
            const health = await checkHealth(name);
            if (health.ok)
                return { agent: name, reason: "Fallback" };
        }
        throw new Error("No available agent");
    }
    matchRule(rule, task) {
        if (rule.match.taskType && rule.match.taskType !== task.type)
            return false;
        if (rule.match.language && rule.match.language?.toLowerCase() !== task.language?.toLowerCase())
            return false;
        if (rule.match.focus && rule.match.focus?.toLowerCase() !== task.focus?.toLowerCase())
            return false;
        if (rule.match.keyword) {
            const content = ((task.code || "") + (task.context || "")).toLowerCase();
            if (!content.includes(rule.match.keyword.toLowerCase()))
                return false;
        }
        return true;
    }
}
