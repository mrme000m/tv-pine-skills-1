# Delegation Configuration — OpenRouter Free Tier

This skill uses **Hermes subagent delegation** for code generation.
The parent agent gathers context; child agents write and verify the runner code.

## Why Delegate?

- **Reasoning-heavy generation**: Writing a correct graphic parser requires
  understanding the indicator's purpose from its inputs and description
- **Context isolation**: The code-generation subagent starts fresh with reference
  examples, unburdened by the gathering-phase conversation
- **Verification loop**: A separate subagent can verify the generated code without
  the biases of the author subagent

## OpenRouter Setup

### 1. Get an API Key

1. Visit https://openrouter.ai/keys
2. Create a free key (no credit card required for free-tier models)
3. Export it:

```bash
export OPENROUTER_API_KEY="sk-or-v1-..."
```

### 2. Hermes Config

Edit `~/.hermes/config.yaml`:

```yaml
model:
  provider: openrouter
  model: google/gemini-2.5-pro-exp-03-25:free
  api_key: ${OPENROUTER_API_KEY}

delegation:
  max_concurrent_children: 3      # Run 3 subagents in parallel
  max_spawn_depth: 2              # Parent → Child → Grandchild allowed
  orchestrator_enabled: true      # Child agents can also delegate
  default_max_iterations: 50      # Limit per subagent
```

### 3. Model Selection by Task

| Task | Recommended Model | Why |
|------|-------------------|-----|
| Context gathering | (parent model) | Direct tool calls, no delegation needed |
| Code generation | `tencent/hy3-preview:free` | Long context for reference files + manifest |
| Code verification | `inclusionai/ling-2.6-1t:free` | Fast syntax check and dry-run |
| Refinement | `nvidia/nemotron-3-super-120b-a12b:free` | Good at fixing specific parser bugs |

### 4. Delegation Flow for This Skill

```
Parent Agent
│
├─► Run: node scripts/youtube-to-tv-pine.cjs "<url>" > /tmp/manifest.json
├─► Read: smart-money-concepts/scripts/smart-money-concepts.cjs (example)
├─► Read: volume-gaps-imbalances-zeiierman/scripts/...cjs (example)
│
└─► delegate_task(
      goal="Generate indicator runner and SKILL.md from manifest",
      context="""
        Manifest: /tmp/manifest.json
        Project root: /Volumes/ExMac/code/tradingview/js-experiment06
        Reference skill A: smart-money-concepts/scripts/smart-money-concepts.cjs
        Reference skill B: volume-gaps-imbalances-zeiierman/scripts/...
        Output dir: <slug>/ (create under project root)
      """,
      toolsets=["terminal", "file"],
      max_iterations=50
    )

    Subagent (generation)
    │
    ├─ 1. Read manifest
    ├─ 2. Read reference skills
    ├─ 3. Write runner + SKILL.md + references/
    ├─ 4. Run node --check
    ├─ 5. Run dry-run smoke test
    └─ 6. Return results

Parent Agent
│
├─► Run live test: node <slug>/scripts/<slug>.cjs BTCUSDT --agent
└─► If output looks wrong:
    delegate_task(
      goal="Refine graphic parser based on live output",
      context="Runner path + live JSON output + what's wrong",
      toolsets=["terminal", "file"],
      max_iterations=30
    )
```

## Constraints

- Free-tier models have **rate limits** (~10 RPM). Add delays between delegations.
- Free-tier models have **lower context windows** (~128K). For large manifests,
  the parent agent should summarize the manifest rather than passing the raw file.
- OpenRouter free models are **best-effort**; if unavailable, fall back to the parent model.
- Subagents cannot call `delegate_task` unless `orchestrator_enabled: true` and
  `max_spawn_depth >= 2`.
