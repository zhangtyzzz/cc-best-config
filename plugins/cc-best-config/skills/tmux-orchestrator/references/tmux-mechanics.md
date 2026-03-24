# tmux Mechanics Reference

This document covers the tmux operations used by the orchestrator, common pitfalls, and workarounds.

## Core Operations

### Creating Sessions and Windows

```bash
# Create a new detached session with a named window
tmux new-session -d -s my-session -n window-1

# Add a window to an existing session
tmux new-window -t my-session -n window-2

# Check if a session exists
tmux has-session -t my-session 2>/dev/null && echo "exists"
```

### Sending Input (send-keys)

```bash
# Basic: send text and Enter
tmux send-keys -t my-session:window-1 "echo hello" Enter

# Literal mode (-l): prevents # ! ~ from being interpreted as tmux special keys
tmux send-keys -t my-session:window-1 -l "text with #special !chars"

# Send Enter separately (safer for long prompts)
tmux send-keys -t my-session:window-1 -l "my prompt text"
sleep 0.2
tmux send-keys -t my-session:window-1 Enter

# Send Ctrl-C (interrupt)
tmux send-keys -t my-session:window-1 C-c
```

**Pitfalls with send-keys:**

| Issue | Cause | Fix |
|-------|-------|-----|
| `#` starts a comment | tmux interprets `#` as a comment character | Use `-l` (literal mode) |
| `!` triggers history expansion | Shell interprets `!` in the prompt | Use `-l` mode |
| Prompt truncated | Very long strings hit terminal line limits | Use `load-buffer` + `paste-buffer` instead |
| Race condition | Enter sent before text is fully received | Add `sleep 0.2` between text and Enter |
| Special chars eaten | `~`, `^`, etc. interpreted by tmux | Always use `-l` for user content |

### Sending Long Prompts (load-buffer + paste-buffer)

For prompts longer than ~200 characters, write to a temp file and paste:

```bash
# Write prompt to temp file
TMPFILE=$(mktemp)
cat > "$TMPFILE" << 'PROMPT'
This is a very long prompt that might contain
multiple lines, special characters like # ! ~ and
other things that could confuse send-keys.
PROMPT

# Load into tmux buffer and paste
tmux load-buffer "$TMPFILE"
tmux paste-buffer -t my-session:window-1 -d   # -d deletes the buffer after pasting

# Send Enter
sleep 0.2
tmux send-keys -t my-session:window-1 Enter

# Clean up
rm "$TMPFILE"
```

**Note:** `paste-buffer -d` deletes the buffer after pasting, preventing buffer accumulation.

### Reading Output (capture-pane)

```bash
# Capture visible pane content
tmux capture-pane -t my-session:window-1 -p

# Capture with scrollback (last 200 lines)
tmux capture-pane -t my-session:window-1 -p -S -200

# Capture entire scrollback history
tmux capture-pane -t my-session:window-1 -p -S -

# Capture to a file
tmux capture-pane -t my-session:window-1 -p -S -200 > output.txt
```

**Pitfalls with capture-pane:**

| Issue | Cause | Fix |
|-------|-------|-----|
| Output contains ANSI codes | Agent CLI uses colors/formatting | Pipe through `strip-ansi.sh` |
| Output truncated | Default scrollback limit (~2000 lines) | Increase with `set-option -g history-limit 50000` |
| Empty output | Wrong target or pane hasn't rendered yet | Verify target, add brief sleep |
| Stale content | Captured before agent finished writing | Poll in a loop with delay |
| Wide chars garbled | Unicode/CJK characters | Set `tmux set-option -g utf8 on` (tmux < 2.2) |

### Window and Session Management

```bash
# List all windows in a session
tmux list-windows -t my-session

# Kill a specific window
tmux kill-window -t my-session:window-1

# Kill an entire session
tmux kill-session -t my-session

# List all sessions
tmux list-sessions
```

## Scrollback Configuration

The default tmux scrollback is 2000 lines, which may be insufficient for verbose agents.

```bash
# Increase scrollback for the current session
tmux set-option -t my-session history-limit 50000

# Set globally in ~/.tmux.conf
echo "set-option -g history-limit 50000" >> ~/.tmux.conf
```

## Target Syntax

tmux uses a consistent target syntax:

```
session:window          → target a window by name
session:window.pane     → target a specific pane (if window is split)
```

The orchestrator always uses `session:window` format (one pane per window).

## Multiplexing Considerations

### CPU and Memory

Each agent CLI process consumes resources:
- Claude Code: ~500MB+ RAM
- Codex: ~200MB+ RAM
- tmux itself: negligible

Running 5+ workers simultaneously may require significant system resources. Monitor with `htop` or `top`.

### API Rate Limits

Multiple instances of the same agent may share rate limits:
- Claude Code instances share the same Anthropic API key
- Codex instances share the same OpenAI API key
- Mixing different agents distributes the load across providers

Stagger worker launches by 2-3 seconds to avoid burst rate limit hits.

### Terminal Size

The tmux pane size affects how agents render their output. Set a reasonable size:

```bash
# Resize a window to 200 columns × 50 rows
tmux resize-window -t my-session:window-1 -x 200 -y 50
```

Some agents adjust their output format based on terminal width. A wider terminal generally produces cleaner output.

## Debugging

### View a worker's pane live

```bash
# Attach to the session and switch to the worker's window
tmux attach-session -t my-session
# Then use Ctrl-b + w to select a window

# Or switch to a specific window
tmux select-window -t my-session:window-1
```

### Check if a process is running in a pane

```bash
# List processes in a pane
tmux list-panes -t my-session:window-1 -F '#{pane_pid}'
ps -p <pid> -o comm=
```

### Force-kill a stuck agent

```bash
# Send Ctrl-C, then Ctrl-D
tmux send-keys -t my-session:window-1 C-c
sleep 0.5
tmux send-keys -t my-session:window-1 C-d

# Or kill the pane directly
tmux kill-pane -t my-session:window-1
```
