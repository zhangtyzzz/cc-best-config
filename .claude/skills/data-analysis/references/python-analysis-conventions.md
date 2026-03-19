# Python Analysis Conventions

Use these conventions whenever analysis code is needed.

## Environment policy

- Prefer `python3`.
- Run `scripts/ensure_python_env.py` before any analysis. It auto-detects and auto-installs missing dependencies into a local `.venv`.
- If the script created a `.venv`, use the `PYTHON_EXEC` path from its output for all subsequent code.

## Default library stack

Use this order of preference:

1. `pandas` for tabular work
2. `matplotlib` for baseline plotting
3. `seaborn` when it improves chart clarity without adding unnecessary complexity

Do not assume heavier libraries unless the task clearly needs them.

## Execution rules

- Keep scripts reproducible and readable.
- Use explicit column names and transformations.
- Save figures with stable names when the report references them.
- Avoid hidden notebook-only state when a script is more reliable.
- When code materially supports the report, include key code or SQL in the appendix.

## Output conventions

- Use tables for exact values and chart summaries for patterns.
- Prefer PNG output for charts unless another format is clearly better.
- Write conclusion-oriented chart titles.
- Keep axes, units, and legends explicit.

## Failure handling

If code cannot run because the environment is missing:

- say which dependency is missing
- say whether a local `.venv` was attempted or recommended
- say what part of the analysis is blocked
- do not claim that charts or calculations were produced
