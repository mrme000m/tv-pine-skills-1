#!/usr/bin/env node
/**
 * TradingView Public Scripts - CLI
 *
 * List, search, and fetch top public scripts from TradingView.
 * Uses the tv.js library for API calls.
 *
 * Usage:
 *   publist list [--offset 0] [--limit 20] [--json]
 *   publist search <query> [--limit 20] [--json]
 *   publist top [--limit 100] [--output top_scripts.json]
 */

const tv = require('./tv.cjs');
const fs = require('fs');
const path = require('path');

// =============================================================================
// Data Normalization
// =============================================================================

function normalizeAuthor(author) {
	if (typeof author === 'object' && author !== null) {
		return {
			id: author.id ?? null,
			username: author.username || '',
		};
	}
	return { id: null, username: '' };
}

function normalizeItem(item) {
	if (!item || typeof item !== 'object') return null;
	return {
		scriptIdPart: item.scriptIdPart || item.script_id_part || '',
		title: item.title || item.scriptName || item.name || '',
		scriptName: item.scriptName || '',
		shortTitle: item.shortTitle || '',
		author: normalizeAuthor(item.author),
		type: item.type || item.script_type || '',
		access: item.access ?? item.script_access ?? null,
		version: item.version ?? null,
		agreeCount: item.agreeCount ?? 0,
		isRecommended: Boolean(item.isRecommended),
		imageUrl: item.imageUrl || item.image_url || '',
		url: item.chart_url || item.chartUrl || item.url || '',
		extra: typeof item.extra === 'object' ? item.extra : {},
	};
}

// =============================================================================
// Output Formatting
// =============================================================================

function printTable(items) {
	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		const author = it.author?.username || '';
		const rec = it.isRecommended ? ' ★' : '';
		const agrees = it.agreeCount > 0 ? ` 👍${it.agreeCount}` : '';
		console.log(`${String(i + 1).padStart(3)}. ${it.title}${rec}${agrees}`);
		console.log(`     id: ${it.scriptIdPart}`);
		console.log(`     author: ${author} | type: ${it.type} | access: ${it.access}`);
		if (it.shortTitle && it.shortTitle !== it.title) {
			console.log(`     short: ${it.shortTitle}`);
		}
		if (it.url) {
			console.log(`     url: ${it.url}`);
		}
		console.log('');
	}
}

// =============================================================================
// Commands
// =============================================================================

async function cmdList({ offset = 0, limit = 20, json = false } = {}) {
	const data = await tv.listPublicScripts(offset);
	const results = Array.isArray(data?.results) ? data.results : [];
	const items = results.map(normalizeItem).filter(Boolean).slice(0, limit);

	const payload = {
		offset,
		limit,
		count: items.length,
		next: data.next ?? null,
		results: items,
	};

	if (json) {
		console.log(JSON.stringify(payload, null, 2));
	} else {
		console.log(`\nPublic scripts: ${items.length} (offset=${offset}, next=${payload.next})`);
		console.log('='.repeat(60));
		printTable(items);
	}

	return 0;
}

async function cmdSearch({ query, limit = 20, json = false } = {}) {
	if (!query) throw new Error('Usage: publist search <query> [--limit N] [--json]');

	const data = await tv.searchPublicScripts(query);
	const results = Array.isArray(data?.items) ? data.items : [];
	const items = results.map(normalizeItem).filter(Boolean).slice(0, limit);

	const payload = {
		query,
		limit,
		count: items.length,
		next: data.next ?? null,
		stats_by_type: data.stats_by_type ?? null,
		results: items,
	};

	if (json) {
		console.log(JSON.stringify(payload, null, 2));
	} else {
		console.log(`\nSearch '${query}': ${items.length} results`);
		console.log('='.repeat(60));
		printTable(items);
	}

	return 0;
}

async function cmdTop({ limit = 100, output = 'top_scripts.json' } = {}) {
	console.log(`Fetching top ${limit} scripts...`);

	const allItems = [];
	let offset = 0;
	const batchSize = 20;

	while (allItems.length < limit) {
		const data = await tv.listPublicScripts(offset);
		const results = Array.isArray(data?.results) ? data.results : [];

		if (!results.length) break;

		for (const item of results) {
			const normalized = normalizeItem(item);
			if (normalized) allItems.push(normalized);
			if (allItems.length >= limit) break;
		}

		offset += batchSize;
		console.log(`  Fetched ${allItems.length} scripts...`);

		if (results.length < batchSize) break;
	}

	const payload = {
		total: allItems.length,
		fetchedAt: new Date().toISOString(),
		scripts: allItems,
	};

	const outputPath = path.resolve(process.cwd(), output);
	fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');

	console.log(`\n✓ Saved ${allItems.length} scripts to ${outputPath}`);
	return 0;
}

// =============================================================================
// CLI Argument Parser
// =============================================================================

function parseArgs(argv) {
	const args = { positional: [], flags: {} };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith('--')) {
			const [key, ...rest] = a.slice(2).split('=');
			args.flags[key] = rest.length ? rest.join('=') : (argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[++i] : true);
		} else {
			args.positional.push(a);
		}
	}
	return args;
}

function parseBool(val, def = false) {
	if (val === undefined) return def;
	return val === true || val === 'true' || val === '1' || val === 'yes';
}

function parseIntSafe(val, def) {
	const n = Number(val);
	return Number.isFinite(n) ? n : def;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const cmd = args.positional[0];

	if (!cmd) {
		console.log(`
Usage: publist <command> [options]

Commands:
  list                        List public scripts
    --offset <n>              Starting offset (default: 0)
    --limit <n>               Max results (default: 20)
    --json                    Output as JSON

  search <query>              Search public scripts
    --limit <n>               Max results (default: 20)
    --json                    Output as JSON

  top                         Fetch top scripts and save to JSON
    --limit <n>               Number to fetch (default: 100)
    --output <file>           Output file (default: top_scripts.json)

Examples:
  publist list --json
  publist list --offset 50 --limit 10
  publist search "RSI" --json
  publist search "moving average" --limit 50
  publist top --limit 200 --output my_scripts.json
`);
		return 1;
	}

	try {
		switch (cmd) {
			case 'list': {
				const offset = parseIntSafe(args.flags.offset, 0);
				const limit = parseIntSafe(args.flags.limit, 20);
				const json = parseBool(args.flags.json);
				return await cmdList({ offset, limit, json });
			}

			case 'search': {
				const query = args.positional[1];
				const limit = parseIntSafe(args.flags.limit, 20);
				const json = parseBool(args.flags.json);
				return await cmdSearch({ query, limit, json });
			}

			case 'top': {
				const limit = parseIntSafe(args.flags.limit, 100);
				const output = args.flags.output || 'top_scripts.json';
				return await cmdTop({ limit, output });
			}

			default:
				console.error(`Unknown command: ${cmd}`);
				return 1;
		}
	} catch (err) {
		console.error(`Error: ${err.message}`);
		return 1;
	}
}

main().then((code) => process.exit(code)).catch((err) => {
	console.error(`Fatal: ${err.message}`);
	process.exit(1);
});
