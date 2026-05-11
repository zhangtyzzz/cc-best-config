---
name: hf-papers
description: |
  Search, read, and browse academic papers via the Hugging Face CLI (hf papers).
  Use when the user wants to find papers, read a paper, check daily/trending papers,
  or get paper details. Triggers include: 搜论文, 找论文, 读论文, 看论文, paper search,
  read paper, daily papers, trending papers, arXiv, 论文检索, 论文阅读, what papers,
  latest papers, paper info, hf papers.
  Do not use for downloading model weights, datasets, or non-paper HF Hub operations.
version: 1.0.0
---

# HF Papers — Search & Read Academic Papers

Search, browse, and read academic papers through the Hugging Face Hub CLI (`hf papers`).

## Prerequisites — BLOCKING

The `hf` CLI must be installed. Check with:

```bash
command -v hf
```

If not found, tell the user to install it:

```bash
pip install -U "huggingface_hub[cli]"
```

## Available Commands

### Search papers

```bash
hf papers search "<query>" --limit <N> --json
```

- Default limit: 20
- Always use `--json` for structured output, then present results in a readable table

### List daily / trending papers

```bash
hf papers list --sort trending --limit <N> --json
hf papers list --date <YYYY-MM-DD> --json
hf papers list --week <YYYY-Wnn> --json
hf papers list --month <YYYY-MM> --json
```

- `--sort trending` for trending papers
- `--date today` for today's papers
- Default limit: 50

### Get paper info

```bash
hf papers info <paper_id> --json
```

- `paper_id` is the arXiv ID (e.g. `2601.15621`)
- Returns title, authors, abstract, upvotes, comments

### Read paper (full text as markdown)

```bash
hf papers read <paper_id>
```

- Returns the full paper content as markdown
- Output can be very long — when the user just wants a summary, use `info` first then summarize the abstract
- For deep reading, pipe to a file: `hf papers read <id> > /tmp/paper_<id>.md` then read the file

## Execution Rules

1. **Always use `--json` for search, list, and info** — parse the JSON output and present results in a human-friendly format (table for lists, structured summary for info).

2. **For search results**, present a table with columns: Paper ID | Title | Date | Upvotes, sorted by relevance.

3. **For paper reading**, check the paper length first with `info`. If the user wants a quick overview, summarize the abstract from `info`. Only use `read` when the user explicitly wants the full text.

4. **Paper IDs** are arXiv IDs (e.g. `1706.03762`, `2601.15621`). When the user provides a full arXiv URL like `https://arxiv.org/abs/1706.03762`, extract just the ID part.

5. **Error handling**: If `hf` is not installed, provide installation instructions. If a paper is not found, suggest checking the ID or searching by title.

## Example Workflows

### Quick paper search
```
User: "找一下 attention mechanism 相关的论文"
→ hf papers search "attention mechanism" --limit 10 --json
→ Present table of results
```

### Read a specific paper
```
User: "读一下 2601.15621"
→ hf papers info 2601.15621 --json  (get overview first)
→ Present title + abstract summary
→ If user wants full text: hf papers read 2601.15621 > /tmp/paper_2601.15621.md
```

### Browse trending papers
```
User: "今天有什么热门论文"
→ hf papers list --sort trending --date today --limit 10 --json
→ Present trending papers table
```
