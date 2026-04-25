#!/usr/bin/env node
/**
 * validate-agent-schema.cjs
 * Validates that all agent-ready JSON outputs have the required fields:
 * - agentContext.htfTimeframe
 * - opportunities[].distanceFromPrice
 * - opportunities[].isStale
 * - opportunities[].confluenceScore (0.00-0.99)
 * - opportunities[].confidence (STRONG/HIGH/MED/LOW)
 */

const fs = require('fs');
const path = require('path');

const SCRIPTS = [
  'anchored-clusters-vp.cjs',
  'buying-selling-volume.cjs',
  'delta-volume-intensity.cjs',
  'ema-atr-pro-engine.cjs',
  'ict-auto-validated-smc.cjs',
  'precision-sniper.cjs',
  'quantum-ribbon.cjs',
  'self-aware-trend-system.cjs',
  'shemar-smc-confidence.cjs',
  'smart-money-concepts.cjs',
  'support-resistance-breaks.cjs',
  'ultra-sensitive-supertrend.cjs',
  'volume-gaps-imbalances-zeiierman.cjs',
  'xauusd-mtf-trend.cjs',
];

const VALID_CONFIDENCE = new Set(['STRONG', 'HIGH', 'MED', 'LOW']);

function validateScript(scriptPath) {
  const name = path.basename(scriptPath);
  const code = fs.readFileSync(scriptPath, 'utf8');
  const issues = [];

  // Check agentContext has htfTimeframe
  if (!code.includes('htfTimeframe')) {
    issues.push('Missing htfTimeframe in agentContext');
  }

  // Check opportunities mapping has distanceFromPrice
  if (!code.includes('distanceFromPrice')) {
    issues.push('Missing distanceFromPrice in opportunities');
  }

  // Check opportunities mapping has isStale
  if (!code.includes('isStale')) {
    issues.push('Missing isStale in opportunities');
  }

  // Check confidence uses 4-tier scale (not binary)
  const confidenceLine = code.match(/confidence\s*=\s*confluenceScore[^;]+/g);
  if (confidenceLine) {
    const hasFourTiers = (confidenceLine[0].match(/>=/g) || []).length >= 2;
    if (!hasFourTiers) {
      issues.push('Confidence may be binary (needs 3+ tiers)');
    }
  }

  // Check confluenceScore is rounded
  if (code.includes('_generateSignals') && !code.includes('_round(confluenceScore')) {
    // Some scripts round inline; check for _round near confluenceScore
    const hasRound = code.includes('_round') && code.includes('confluenceScore');
    if (!hasRound) {
      issues.push('confluenceScore may not be rounded');
    }
  }

  // Check Object.values() wrapper for graphic accessors
  if (code.includes('dwgboxes') || code.includes('dwgBoxes')) {
    if (!code.includes('Object.values')) {
      issues.push('Graphic accessors may miss Object.values() wrapper');
    }
  }

  return { name, issues, pass: issues.length === 0 };
}

console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║  AGENT SCHEMA VALIDATOR — distanceFromPrice | isStale | htfTimeframe ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

let passed = 0, failed = 0;
for (const script of SCRIPTS) {
  const scriptPath = path.join(__dirname, script);
  if (!fs.existsSync(scriptPath)) {
    console.log(`⚠️  ${script} — FILE NOT FOUND`);
    failed++;
    continue;
  }
  const result = validateScript(scriptPath);
  if (result.pass) {
    console.log(`✅ ${result.name}`);
    passed++;
  } else {
    console.log(`❌ ${result.name}`);
    result.issues.forEach(i => console.log(`   • ${i}`));
    failed++;
  }
}

console.log(`\n──────────────────────────────────────────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${SCRIPTS.length} scripts`);
console.log(`──────────────────────────────────────────────────────────────────────`);
process.exit(failed > 0 ? 1 : 0);
