// Run with Node.js: node tests/check-data.cjs
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/data.js'), 'utf8'), sandbox);
const { gpus, offers, sources, snapshot, fx } = sandbox.window.GPU_DATA;

// 1. Data Schema Verification
const ids = new Set(gpus.map(g => g.id));
assert.equal(ids.size, gpus.length, 'Duplicate GPU identifier found');
assert.match(snapshot, /^20\d{2}-\d\d-\d\d$/, 'Snapshot date format invalid');
assert(Number.isFinite(fx) && fx > 0, 'Invalid FX rate');

for (const g of gpus) {
  assert(Number.isInteger(g.vram) && g.vram > 0, `Invalid VRAM: ${g.id}`);
  if (g.estimateFrom) {
    assert(ids.has(g.estimateFrom), `Invalid estimateFrom reference in ${g.id}`);
    assert(g.estimateScale > 0, `Invalid estimateScale in ${g.id}`);
  }
}

for (const offer of offers) {
  assert(ids.has(offer.gpu), `Unknown GPU: ${offer.gpu} in offer ${offer.id}`);
  assert(offer.rate > 0, `Invalid rate: ${offer.id}`);
  assert(['INR', 'USD'].includes(offer.currency), `Invalid currency: ${offer.id}`);
  assert(sources[offer.source], `Unknown source: ${offer.id}`);
  assert(['community', 'dedicated'].includes(offer.tier), `Invalid tier in ${offer.id}`);
}

const get = id => gpus.find(g => g.id === id);
assert.equal(get('rtx4080').vram, 16);
assert.equal(get('rtx5080').vram, 16);
assert.equal(get('a100_40').vram, 40);
assert.equal(get('a100_80').vram, 80);
assert.equal(get('mi300x').vram, 192);
assert.equal(get('rtx4090').vision, 306);
assert.equal(get('rtx4090').transformer, 472.39);

// 2. Logic Verification for Performance Ratios
const gpuById = new Map(gpus.map(g => [g.id, g]));

function ratioFor(gpuId, workload, visionShare = 60) {
  const gpu = gpuById.get(gpuId);
  if (!gpu || gpu.reference) return null;
  if (gpu.estimateFrom) {
    const parent = ratioFor(gpu.estimateFrom, workload, visionShare);
    return parent ? { ratio: parent.ratio * gpu.estimateScale, evidence: 'estimated' } : null;
  }
  if (workload === 'vision') {
    if (Number.isFinite(gpu.vision)) return { ratio: gpu.vision / 306, evidence: 'measured' };
    if (Number.isFinite(gpu.mobileNet)) return { ratio: gpu.mobileNet / 268.26, evidence: 'estimated' };
    if (Number.isFinite(gpu.transformer)) return { ratio: gpu.transformer / 472.39, evidence: 'estimated' };
  }
  if (workload === 'transformer') {
    if (Number.isFinite(gpu.transformer)) return { ratio: gpu.transformer / 472.39, evidence: 'measured' };
    if (Number.isFinite(gpu.transformerEstimate)) return { ratio: gpu.transformerEstimate, evidence: 'estimated' };
    if (Number.isFinite(gpu.vision)) return { ratio: gpu.vision / 306, evidence: 'estimated' };
  }
  if (workload === 'multimodal') {
    const v = ratioFor(gpuId, 'vision', visionShare);
    const t = ratioFor(gpuId, 'transformer', visionShare);
    if (!v || !t) return null;
    const share = visionShare / 100;
    const ratio = 1 / (share / v.ratio + (1 - share) / t.ratio);
    return { ratio, evidence: 'estimated' };
  }
  return null;
}

// RTX 4090 is baseline 1.0 in both profiles
assert.equal(Math.round(ratioFor('rtx4090', 'vision').ratio * 100) / 100, 1.00);
assert.equal(Math.round(ratioFor('rtx4090', 'transformer').ratio * 100) / 100, 1.00);
assert.equal(Math.round(ratioFor('rtx4090', 'multimodal').ratio * 100) / 100, 1.00);

// A100 40GB uses 0.955 scaling of A100 80GB
const a80v = ratioFor('a100_80', 'vision').ratio;
const a40v = ratioFor('a100_40', 'vision').ratio;
assert(Math.abs(a40v - a80v * 0.955) < 1e-6, 'A100 40GB scale ratio mismatch');

// Reference speed ratio calculations
function refSpeedRatio(baseGpu, workload, t4Factor = 6) {
  if (baseGpu === 't4') return 1 / t4Factor;
  const s = ratioFor(baseGpu, workload);
  return s && s.ratio > 0 ? s.ratio : 1.0;
}

assert.equal(refSpeedRatio('rtx4090', 'transformer'), 1.0);
assert.equal(refSpeedRatio('t4', 'transformer', 6), 1 / 6);
assert(refSpeedRatio('a100_80', 'transformer') > 1.3);

// 3. Pareto Frontier Algorithm Verification
function pareto(rows) {
  return rows.filter(a => !rows.some(b => b.id !== a.id && b.hours <= a.hours && b.costUsd <= a.costUsd && (b.hours < a.hours || b.costUsd < a.costUsd)));
}

const testRows = [
  { id: '1', hours: 10, costUsd: 100 }, // Pareto optimal
  { id: '2', hours: 5,  costUsd: 150 }, // Pareto optimal (faster, more expensive)
  { id: '3', hours: 15, costUsd: 120 }, // Dominated by 1 (slower and more expensive)
  { id: '4', hours: 2,  costUsd: 300 }, // Pareto optimal
  { id: '5', hours: 10, costUsd: 100 }  // Identical to 1, both remain non-dominated
];
const paretoResult = pareto(testRows).map(r => r.id);
assert(paretoResult.includes('1'));
assert(paretoResult.includes('2'));
assert(paretoResult.includes('4'));
assert(!paretoResult.includes('3'), 'Dominated row was not filtered out');

console.log(`OK: All checks passed (${gpus.length} GPUs, ${offers.length} offers, ${Object.keys(sources).length} sources).`);
