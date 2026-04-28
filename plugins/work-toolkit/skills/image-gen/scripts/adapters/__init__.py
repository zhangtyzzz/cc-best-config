"""Adapter registry — auto-detect model and dispatch to the right adapter.

To add a new adapter:
  1. Create a new file in this directory (e.g., qwen.py)
  2. Implement can_handle(model) -> bool and run(**kwargs) -> dict
  3. Add it to _ADAPTERS below (order matters — first match wins)
"""

from typing import Dict, Any
from . import gpt_image, chat_completions

# Ordered list of adapters — first match wins.
# chat_completions is the fallback (can_handle always returns True).
_ADAPTERS = [
    gpt_image,
    chat_completions,
]


def run_generation(prompt: str, api_key: str, base_url: str, model: str,
                   **kwargs) -> Dict[str, Any]:
    """Auto-detect model type and route to the correct adapter."""
    for adapter in _ADAPTERS:
        if adapter.can_handle(model):
            return adapter.run(prompt, api_key, base_url, model, **kwargs)
    # Should never reach here since chat_completions is a catch-all
    return chat_completions.run(prompt, api_key, base_url, model, **kwargs)
