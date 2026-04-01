---
name: data-analysis
description: Analyze structured data and produce evidence backed reports with Python. Use when the user asks to analyze CSV, Excel, SQL results, KPIs, business metrics, or other tabular data, including requests like "look at this data", "what trends do you see", "make a chart", "summarize these numbers", or "write a report from this spreadsheet". Also trigger for research synthesis from multiple sources and for database table analysis involving systems like ODPS, BigQuery, or MySQL. This skill covers data requirements, sufficiency checks, Python analysis, charts, and a polished Markdown report with limits and sources.
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "_R=\"${CLAUDE_SKILL_DIR}\"; [ -z \"$_R\" ] && _R=\"$HOME/.claude/skills/data-analysis\"; python3 \"$_R/scripts/ensure_python_env.py\""
---

# Data Analysis

## Overview

This skill turns raw materials — tables, metrics, research notes, search results — into professional, evidence-backed reports. It follows a deliberate workflow: define what's needed, verify what's actually available, analyze with Python, and produce a structured Markdown report.

The goal is credible analysis, not maximal confidence. When evidence is incomplete, say what's known, what's uncertain, and what would resolve it.

Default to the user's conversation language. Default to Python for any structured data work.

## Core principle: verify before you act

Never generate SQL, analysis code, or field references based on assumptions. If you haven't seen the actual table schema, column names, data types, or sample rows, you don't know what's there — and guessing leads to broken queries and wasted effort.

The right sequence is always: **learn what exists → plan based on reality → execute**.

## Workflow

Follow these steps in order. Skip to a later step only if the user explicitly asks for a rough first pass.

### 1. Define the analytic task

Clarify the question, audience, time range, granularity, key dimensions, and desired output. If underspecified, make minimum reasonable assumptions and state them.

### 2. Understand available data

This step has two goals: (a) figure out what data is needed to answer the question credibly, and (b) figure out what data is actually available.

**When data files are already provided** (CSV, Excel, etc.):
- Read the file first. Check columns, types, row count, sample values, missing data.
- Only then decide if it's sufficient for the analysis.

**When the user mentions database tables** (ODPS, BigQuery, MySQL, etc.):
- Do NOT generate analysis SQL yet. You don't know the real schema.
- First, ask the main agent to use other available tools or skills (e.g., an ODPS skill, a BigQuery MCP, or any database query tool) to inspect the table structure — run `DESCRIBE TABLE`, `SELECT * LIMIT 5`, check column comments and partition info.
- This skill does not query databases directly. It tells the agent what to explore, the agent uses the appropriate query tool, and brings the results back.
- If no query tool is available, ask the user to provide the schema or a sample.
- Only after you've seen the real fields, types, and sample data should you proceed to plan the analysis.

**When no data is provided yet**:
- Define what data would be needed: metrics, dimensions, time range, grain, mandatory fields, optional fields.
- Return a concrete **Data Requirements** section the user can act on.

**Proactively identify what data would strengthen the analysis**: Based on the analytic task, think about what data is needed — including data the user may not have thought of. For example, if the task is retention analysis and the user only mentioned an events table, you should recognize that acquisition channel data would enable cohort-by-channel breakdown, or that a user profile table would allow segmentation by user attributes. Then ask the user whether that data is available: "To do a stronger analysis, I'd also want [X] because [reason] — can you get that?" This turns a basic analysis into a high-value one.

### 3. Check sufficiency and trustworthiness

For structured data: check row/column scope, field meanings, duplicates, missing values, outliers, time coverage, metric definition mismatches, and sample size.

For research materials: check source identity, quality, recency, cross-source consistency, unsupported assertions, and missing primary evidence.

If materials are too weak, say so and narrow claim strength. Read [references/source-trustworthiness.md](references/source-trustworthiness.md) when source quality matters.

### 4. Choose the analysis mode

**Structured Data Analysis** — for CSV, Excel, SQL results, KPI tables, tabular exports. Use Python. Focus on descriptive statistics, comparisons, trends, distributions, anomalies, segmentation, and candidate explanations with evidence.

**Research Material Analysis** — for articles, notes, search summaries, multi-source briefings. Use Python when it adds value (summary tables, timelines, charts). Focus on source grouping, consensus/disagreement, evidence strength, key themes, and decision-relevant takeaways.

**Database-Assisted Analysis** — when data lives in a database and a query tool is available. This skill does not query databases or write SQL itself — it defines what data is needed and delegates execution to query tools/skills. The workflow is:
1. Tell the agent to use the appropriate query tool to inspect table schemas — get real field names, types, and sample data
2. Based on verified schema, define the data extraction requirements: what metrics, dimensions, filters, time range, and grain are needed — expressed as a clear task description, not SQL
3. The query tool/skill generates and executes the SQL based on these requirements
4. Receive results, then proceed as Structured Data Analysis

If multiple query rounds are needed (e.g., exploratory queries reveal the need for joins with other tables), iterate: explore → learn → refine → execute.

### 5. Python environment (automatic)

The Python environment (pandas, matplotlib, seaborn) is checked and set up automatically via a PreToolUse hook — no manual action needed. When the first Bash command runs, the hook will:
- Confirm the environment is ready, or
- Auto-install missing packages into a local `.venv` and report the path, or
- Warn if installation failed

Read the `additionalContext` injected by the hook to know the environment status. If a `.venv` was created, use the `PYTHON_EXEC` path from the context for subsequent analysis code.

Read [references/python-analysis-conventions.md](references/python-analysis-conventions.md) before writing analysis code.

### 6. Analyze

Separate facts (directly from materials), inferences (drawn from facts), and recommendations (based on inferences). Use explicit phrasing: "the data shows", "this suggests", "a plausible explanation is". Keep analysis reproducible — preserve enough code detail to explain how results were produced.

### 7. Visualize intentionally

Use charts only when they improve comprehension. Prefer line charts for trends, bar charts for comparisons, histograms for distributions, tables for exact values. Avoid decorative charts and pie charts.

Read [references/visualization-guidelines.md](references/visualization-guidelines.md) when choosing visuals.

### 8. Write the report

Default to Markdown with this structure: Title → Executive Summary → Objective and Scope → Data Overview → Key Findings → Detailed Analysis → Conclusions and Recommendations → Limitations and Risks → Appendix (sources, SQL, method notes).

Read [references/report-structure.md](references/report-structure.md) before writing the final report.

Always include a Limitations section covering sample size, definition inconsistencies, weak sources, missing history, selection bias, or correlation-vs-causation limits.

Always include a traceability appendix with data sources, methodology notes, assumptions, and any SQL used for data extraction (if applicable). Even for quick answers, retain a compact sources appendix unless the user says not to.

## Scope boundary

This skill handles the analysis layer: define data needs, assess sufficiency, analyze inputs, generate charts and reports. It can coordinate with query tools (ODPS, BigQuery, etc.) for data retrieval, but does not perform web scraping or search.

## References

Load these only when relevant:

- [references/analysis-checklist.md](references/analysis-checklist.md): compact pre-flight and delivery checklist
- [references/python-analysis-conventions.md](references/python-analysis-conventions.md): Python runtime, library, and charting conventions
- [references/report-structure.md](references/report-structure.md): default Markdown report skeleton and writing rules
- [references/source-trustworthiness.md](references/source-trustworthiness.md): source quality evaluation and claim strength
- [references/visualization-guidelines.md](references/visualization-guidelines.md): chart and table selection rules
