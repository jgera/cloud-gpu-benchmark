// Run with Node.js: node tests/check-data.cjs
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/data.js'),'utf8'),sandbox);
const {gpus,offers,sources,snapshot} = sandbox.window.GPU_DATA;
const ids = new Set(gpus.map(g=>g.id));
assert.equal(ids.size,gpus.length,'Duplicate GPU identifier');
assert.match(snapshot,/^20\d{2}-\d\d-\d\d$/);
for (const g of gpus) {
  assert(Number.isInteger(g.vram)&&g.vram>0,`Invalid VRAM: ${g.id}`);
}
for (const offer of offers) {
  assert(ids.has(offer.gpu),`Unknown GPU: ${offer.gpu}`);
  assert(offer.rate>0,`Invalid rate: ${offer.id}`);
  assert(['INR','USD'].includes(offer.currency),`Invalid currency: ${offer.id}`);
  assert(sources[offer.source],`Unknown source: ${offer.id}`);
}
const get = id=>gpus.find(g=>g.id===id);
assert.equal(get('rtx4080').vram,16);
assert.equal(get('rtx5080').vram,16);
assert.equal(get('a100_40').vram,40);
assert.equal(get('a100_80').vram,80);
assert.equal(get('rtx4090').vision,306);
assert.equal(get('rtx4090').transformer,472.39);
console.log(`OK: ${gpus.length} GPU records, ${offers.length} rental offers, ${Object.keys(sources).length} sources`);
