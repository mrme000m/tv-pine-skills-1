# CLI Comparison: tvcli.js vs tv-cli.js vs publist.cjs

## Overview

| Feature | tvcli.js | tv-cli.js | publist.cjs |
|---------|----------|-----------|-------------|
| **Size** | 2598 lines | 1749 lines | 267 lines |
| **Description** | TradingView AI Agent CLI - Market Data Analysis Tool | TradingView Pine Script Manager - Unified CLI | TradingView Public Scripts - CLI |
| **Auth Required** | Yes (for most commands) | Yes (for write ops) | No |
| **Output Formats** | json, human, csv, yaml | Text, JSON (per command) | Table, JSON |
| **Config File** | Environment variables | .tv-meta.json + env vars | Environment variables (via tv.cjs) |

---

## Command Comparison

### Common Commands (all three support)

| Command | tvcli.js | tv-cli.js | publist.cjs |
|---------|----------|-----------|-------------|
| **list** | `list [--remote]` | `list [-r, --remote]` | `list [--offset N] [--limit N]` |
| **search** | `search <query> [--json] [--limit N]` | `search <query> [--limit N] [--json]` | `search <query> [--limit N] [--json]` |

### Commands in tvcli.js and tv-cli.js (not in publist.cjs)

| Command | tvcli.js | tv-cli.js |
|---------|----------|-----------|
| **create** | `create <file> --name <name> [--wait]` | `create <file.pine> [--name]` |
| **pull** | `pull <pineId> [--out file.pine] [--force]` | `pull <id\|pineId>` |
| **push** | `push <file> [--create-if-missing] [--sync]` | `push <id\|file> [--force]` |
| **run** | `run <id\|file> <symbol> [--tf 5m] [--json]` | `run <id\|file> [--symbol] [--tf] [--inputs] [--json]` |
| **delete** | `delete <id> [--confirm]` | `delete <id> [--yes]` |
| **compile** | `compile <file>` | `compile <file.pine>` |

### Unique to tvcli.js (AI Agent features)

| Command | Description |
|---------|-------------|
| **validate** | Check auth & connectivity |
| **scan** | Multi-timeframe market screening |
| **backtest** | Run historical analysis |
| **compare** | Compare indicator performance |
| **watch** | Stream live updates (WebSocket) |
| **runx** | Extended multi-variant execution with multiple timeframes |
| **batch** | Execute multiple operations from JSON file |

### Unique to tv-cli.js (Script management features)

| Command | Description |
|---------|-------------|
| **inputs** | Generate/show inputs YAML from script |

### Unique to publist.cjs (Public script features)

| Command | Description |
|---------|-------------|
| **top** | Fetch top scripts and save to JSON file |

---

## Feature Comparison

### Output & Formatting

| Feature | tvcli.js | tv-cli.js | publist.cjs |
|---------|----------|-----------|-------------|
| JSON output | ✅ Default | ✅ Per command | ✅ `--json` flag |
| Human-readable | ✅ `--format=human` | ✅ Default | ✅ Default |
| CSV output | ✅ `--format=csv` | ❌ | ❌ |
| YAML output | ✅ `--format=yaml` | ❌ | ❌ |
| Compact JSON | ✅ `--compact` | ❌ | ❌ |
| Structured errors | ✅ Exit codes 0-6 | ❌ Exit 0/1 | ❌ Exit 0/1 |

### Script Management

| Feature | tvcli.js | tv-cli.js | publist.cjs |
|---------|----------|-----------|-------------|
| Local ID tracking | ❌ | ✅ `.tv-meta.json` | ❌ |
| Pull-before-push | ❌ | ✅ Built-in | ❌ |
| Input YAML files | ❌ | ✅ Convention-based | ❌ |
| Version tracking | ✅ | ✅ | ❌ |
| Script hashing | ❌ | ✅ SHA-256 | ❌ |

### Authentication & Security

| Feature | tvcli.js | tv-cli.js | publist.cjs |
|---------|----------|-----------|-------------|
| Session validation | ✅ `validate` command | ✅ On demand | N/A (public only) |
| Cookie management | ✅ Built-in | ✅ Built-in + `TV_COOKIES` | ✅ Via tv.cjs |
| Environment vars | ✅ `SESSION`, `SIGNATURE` | ✅ `SESSION`, `SIGNATURE`, `TV_USER` | ✅ Via tv.cjs |

### Advanced Features

| Feature | tvcli.js | tv-cli.js | publist.cjs |
|---------|----------|-----------|-------------|
| WebSocket streaming | ✅ `watch` command | ❌ | ❌ |
| Multi-timeframe analysis | ✅ `scan`, `runx` | ❌ | ❌ |
| Batch operations | ✅ `batch` command | ❌ | ❌ |
| Quality scoring | ✅ `runx --no-score` | ❌ | ❌ |
| Variant testing | ✅ `runx --variants` | ❌ | ❌ |
| Public script search | ✅ | ✅ | ✅ |
| Top scripts fetch | ❌ | ❌ | ✅ `top` command |

---

## Code Architecture

### tvcli.js Architecture
```
tvcli.js (2598 lines)
├── Exit Codes & Error Taxonomy (AgentError, AuthError, etc.)
├── OutputFormatter class (json/human/csv/yaml)
├── Config class (validation, auth checks)
├── API Client (axios-based)
├── Commands:
│   ├── Agent-First: validate, scan, backtest, compare, watch, batch
│   └── Core: list, search, create, pull, push, run, runx, delete, compile
└── Main switch statement (lines 2421-2490)
```

### tv-cli.js Architecture
```
tv-cli.js (1749 lines)
├── CONFIG object (environment variables)
├── Utility functions (sha256, slugify, normalizePineId, etc.)
├── MetaStore class (script tracking with .tv-meta.json)
├── API Client (axios-based, similar to tvcli.js)
├── Commands: list, create, pull, push, delete, search, compile, inputs, run
└── Main switch statement (lines 1688-1730)
```

### publist.cjs Architecture
```
publist.cjs (267 lines)
├── Uses tv.cjs library (require('./tv.cjs'))
├── normalizeAuthor, normalizeItem functions
├── printTable function (human output)
├── Commands: list, search, top
└── Main switch (lines 232-256)
```

---

## Similarities

1. **Search functionality**: All three have `search <query>` with `--json` and `--limit` options
2. **List functionality**: All three can list scripts (tvcli.js and tv-cli.js for user scripts, publist.cjs for public)
3. **Axios-based HTTP**: tvcli.js and tv-cli.js use axios directly; publist.cjs uses tv.cjs which likely uses axios
4. **Environment variables**: All use `SESSION`, `SIGNATURE` for auth (publist.cjs via tv.cjs)
5. **Pine ID handling**: tvcli.js and tv-cli.js both have functions to normalize/extract Pine IDs

---

## Key Differences

### 1. **Target Audience**
- **tvcli.js**: AI agents and programmatic usage (structured JSON, exit codes)
- **tv-cli.js**: Human developers managing Pine Scripts (local tracking, simple commands)
- **publist.cjs**: Anyone wanting to browse public TradingView scripts (no auth needed)

### 2. **Output Philosophy**
- **tvcli.js**: "Structured JSON by default" - designed for machine parsing
- **tv-cli.js**: Human-readable by default, JSON optional per command
- **publist.cjs**: Simple table or JSON

### 3. **Script Management Approach**
- **tvcli.js**: Stateless - operates on Pine IDs directly
- **tv-cli.js**: Stateful - tracks scripts locally with numeric IDs in `.tv-meta.json`
- **publist.cjs**: Read-only public scripts, no management

### 4. **Advanced Capabilities**
- **tvcli.js**: Has AI-agent features (scan, backtest, compare, watch, batch, runx)
- **tv-cli.js**: Focused on script lifecycle management
- **publist.cjs**: Focused on public script discovery

---

## Consolidation Recommendations

### Option A: Unified CLI with Subcommands
Create a single CLI with subcommands for each domain:
```bash
tv-cli agent <command>    # AI agent features (from tvcli.js)
tv-cli manage <command>   # Script management (from tv-cli.js)
tv-cli public <command>   # Public scripts (from publist.cjs)
```

### Option B: Modular Plugin Architecture
Keep a core CLI and load plugins:
```bash
tv-cli --plugin agent <command>
tv-cli --plugin manage <command>
tv-cli --plugin public <command>
```

### Option C: Single CLI with All Commands
Merge all commands into one CLI with clear grouping:
```bash
# Script Management
tv-cli list, create, pull, push, delete, inputs, compile

# Agent Features
tv-cli validate, scan, backtest, compare, watch, batch, runx

# Public Scripts
tv-cli public-list, public-search, public-top
```

### Recommended: Option A (Unified CLI with Subcommands)
- Cleanest separation of concerns
- Easy to maintain and extend
- Familiar pattern (like `git <subcommand>`)
- Can share common utilities (auth, API client, output formatting)

---

## Next Steps for Consolidation

1. **Extract common utilities**:
   - API client (axios setup, cookie handling)
   - Pine ID normalization
   - Output formatting (support json/human/csv/yaml)
   - Error handling

2. **Create unified CLI structure**:
   ```
   tv-cli/
   ├── core/
   │   ├── api-client.js
   │   ├── auth.js
   │   ├── output.js
   │   └── utils.js
   ├── commands/
   │   ├── agent/      # From tvcli.js advanced features
   │   ├── manage/     # From tv-cli.js script management
   │   └── public/     # From publist.cjs
   ├── index.js        # Main CLI entry point
   └── package.json
   ```

3. **Preserve best features**:
   - From tvcli.js: Exit codes, output formats, error taxonomy
   - From tv-cli.js: Local ID tracking, pull-before-push, input YAML
   - From publist.cjs: Simplicity, public script focus

4. **Add tests** for each command group
