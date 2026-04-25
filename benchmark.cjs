#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');

function run(script) {
  execSync(
    `node ${script} BTCUSDT --tf 15m --bars 50 --json > /tmp/tv_bench_tmp.json 2>/dev/null`,
    { timeout: 120000 }
  );
  const raw = fs.readFileSync('/tmp/tv_bench_tmp.json', 'utf-8');
  // Find the actual JSON object (skip dotenvx header)
  const idx = raw.indexOf('{');
  const data = JSON.parse(raw.substring(idx));
  fs.unlinkSync('/tmp/tv_bench_tmp.json');
  return data.meta.durationMs;
}

const ORIG = 'self-aware-trend-system.cjs';
const OPT = 'self-aware-trend-system-optimized.cjs';
const RUNS = 3;

console.log(`Benchmark: ${RUNS} runs each\n`);

const orig = [];
for (let i = 0; i < RUNS; i++) {
  const t = run(ORIG);
  orig.push(t);
  console.log(`  ORIG run ${i+1}: ${t}ms`);
  if (i < RUNS - 1) execSync('sleep 2');
}
const origAvg = orig.reduce((a,b)=>a+b,0) / orig.length;
console.log(`ORIG avg  : ${origAvg.toFixed(0)}ms\n`);

const opt = [];
for (let i = 0; i < RUNS; i++) {
  const t = run(OPT);
  opt.push(t);
  console.log(`  OPT  run ${i+1}: ${t}ms`);
  if (i < RUNS - 1) execSync('sleep 2');
}
const optAvg = opt.reduce((a,b)=>a+b,0) / opt.length;
console.log(`OPT  avg  : ${optAvg.toFixed(0)}ms\n`);

const delta = origAvg - optAvg;
const speedup = (delta / origAvg * 100).toFixed(1);
console.log(delta > 0
  ? `FASTER by ${delta.toFixed(0)}ms (${speedup}%)`
  : delta < 0
    ? `SLOWER by ${(-delta).toFixed(0)}ms (${(-speedup)}%)`
    : 'NO DIFFERENCE');
