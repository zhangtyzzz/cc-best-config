# Agent Profiles Reference

This document provides behavioral details for CLI agents the orchestrator can work with. The orchestrator uses these notes to understand each agent's UI patterns, but **all state detection is done by reading raw terminal output** — no regex matching or automated detection.

## Core Principle

Every agent is just: **a launch command + behavioral knowledge**. The orchestrator reads terminal output and interprets it naturally. Adding a new agent requires zero code changes — just know how to launch it and how its UI works.

## Built-in Agents

### Claude Code

- **Launch**: `claude`
- **Prompt**: Shows `❯` character when idle, sometimes with `? for shortcuts` below it
- **Approval UI**: Renders a numbered selection list (e.g., `1. Yes`, `2. No`). **Send `Enter` to accept the default (Yes), `Escape` to cancel.**
- **Activity indicators**: Shows lines like "Running bash", "Reading file", "Writing to file", "Editing file", "Searching"
- **Completion**: Returns to `❯` prompt after finishing. Worker should also output "TASK COMPLETE" per prompt instructions.
- **Exit command**: `/exit`
- **Resource usage**: ~500MB+ RAM per instance. Subject to Anthropic API rate limits.
- **Notes**: This is the default worker agent. Uses the same CLI as the orchestrator itself.

### Codex (OpenAI)

- **Launch**: `codex`
- **Prompt**: Shows `>` when idle
- **Approval UI**: Proposes patches for approval. **Send `Enter` to approve, `Escape` to reject.**
- **Activity indicators**: Shows "Working (N patches)" when modifying files
- **Exit command**: `exit` or Ctrl-C
- **Resource usage**: Uses OpenAI API — separate rate limits from Claude.
- **Notes**: Tends to produce shorter, more focused outputs. Good for targeted refactoring.

### Gemini CLI (Google)

- **Launch**: `gemini`
- **Prompt**: Shows `❯` or `>` when idle
- **Approval UI**: Asks questions with Allow/Yes/No prompts. **Send `y` to approve, `n` to deny.**
- **Activity indicators**: Shows "Generating", "Searching"
- **Exit command**: `exit` or Ctrl-C
- **Resource usage**: Uses Google AI API — separate rate limits.
- **Notes**: May produce verbose output.

### aider

- **Launch**: `aider`
- **Prompt**: Shows `>` when idle
- **Approval UI**: Asks before applying edits. **Send `y` to approve, `n` to deny.**
- **Activity indicators**: Shows "Thinking", "Applying"
- **Exit command**: `/exit` or Ctrl-C
- **Resource usage**: Supports many LLM backends (OpenAI, Anthropic, local models).
- **Notes**: Uses a git-commit-per-edit workflow — each change is a separate commit. Lightweight, good for simple file edits.

### OpenCode

- **Launch**: `opencode`
- **Prompt**: Shows `>` when idle
- **Approval UI**: Asks for confirmation. **Send `y` to approve, `n` to deny.**
- **Activity indicators**: Shows "thinking", "generating"
- **Exit command**: `exit` or Ctrl-C
- **Notes**: TUI-based — output may contain box-drawing characters. ANSI stripping is especially important. Supports multiple LLM backends.

## Adding Custom Agents

To use an agent not listed above, the orchestrator just needs to know:

1. **How to launch it** — the shell command (e.g., `my-agent`)
2. **How its prompt looks** — so the orchestrator can tell when it's idle
3. **How it asks for approval** — and what key to send (usually `y`/`n` or `Enter`/`Escape`)

That's it. The orchestrator will read the terminal output and figure out the rest. No code changes, no regex patterns, no configuration files.

## Profile Selection Guide

| Scenario | Recommended Agent | Reason |
|----------|-------------------|--------|
| General coding tasks | Claude Code | Strongest reasoning, broadest tool support |
| Fast refactoring | Codex | Quick, focused file edits |
| Code review | Gemini or Claude Code | Good at identifying patterns and issues |
| Multi-file changes | Claude Code or aider | Best at understanding cross-file dependencies |
| Simple file edits | aider | Lightweight, commit-per-edit workflow |
| Avoiding rate limits | Mix providers | Claude + Codex + Gemini distributes load across APIs |
