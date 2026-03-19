# Analysis Checklist

Use this as a compact pre-flight and delivery checklist.

## 1. Task definition

- Identify the decision or question.
- Identify the audience.
- Identify the time range.
- Identify the needed grain.
- Identify the output format.

## 2. Requirement definition

- List required metrics.
- List required dimensions.
- List required fields.
- List optional but useful fields.
- State source expectations.
- State blockers if data is missing.

## 3. Sufficiency review

- Confirm whether current inputs match the question.
- Note missing fields, periods, or segments.
- Note inconsistent definitions.
- Note weak source coverage.
- Decide whether to proceed, narrow scope, or stop and request more material.

## 4. Execution

- Run `ensure_python_env.py` before code execution — it handles detection and installation automatically.
- Separate facts from inference.
- Verify anomalies before highlighting them.
- Prefer the simplest analysis that answers the question.
- Use tables and charts only when they improve understanding.

## 5. Reporting

- Use the user's main language unless told otherwise.
- Write a professional Markdown report by default.
- Include a limitations section.
- Include a sources appendix.
- Include generated SQL when applicable.
