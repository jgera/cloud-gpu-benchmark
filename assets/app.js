/* GPU Cost Explorer. Zero external libraries or network requests. */
(() => {
  'use strict';

  const data = window.GPU_DATA;
  const gpuById = new Map(data.gpus.map(gpu => [gpu.id, gpu]));
  const sources = data.sources;
  const storageKey = 'gpu-cost-explorer-settings-v3';

  const DEFAULT = Object.freeze({
    workload: 'vision',
    baseGpu: 'rtx4090',
    baseHours: 24,
    t4Factor: 6,
    visionShare: 60,
    gpuCount: 1,
    modelPreset: 'custom',
    vramMin: 0,
    tier: 'all',
    confidence: 'all',
    currency: 'USD',
    fx: data.fx,
    storageGb: 0,
    idleHours: 0,
    overhead: 0,
    fixedCost: 0,
    providerFilter: 'all',
    scatterScale: 'linear',
    barMetric: 'cost',
    search: '',
    sort: 'costUsd',
    sortDir: 1,
    selected: 'rpc4090',
    theme: 'light',
    noticeDismissed: false,
    rateOverrides: {},
    customQuotes: [],
    compared: []
  });

  const byId = id => document.getElementById(id);
  const all = selector => [...document.querySelectorAll(selector)];
  const validNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (number, min, max) => Math.min(max, Math.max(min, number));
  const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const formatted = (n, digits = 1) => Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

  function parseHash() {
    try {
      const hash = window.location.hash.replace(/^#/, '');
      if (!hash) return null;
      const params = new URLSearchParams(hash);
      const res = {};
      if (params.has('workload')) res.workload = params.get('workload');
      if (params.has('baseGpu')) res.baseGpu = params.get('baseGpu');
      if (params.has('hours')) res.baseHours = Number(params.get('hours'));
      if (params.has('gpus')) res.gpuCount = Number(params.get('gpus'));
      if (params.has('vram')) res.vramMin = Number(params.get('vram'));
      if (params.has('curr')) res.currency = params.get('curr');
      if (params.has('tier')) res.tier = params.get('tier');
      if (params.has('scale')) res.scatterScale = params.get('scale');
      return res;
    } catch { return null; }
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const hashSettings = parseHash() || {};
      const merged = { ...DEFAULT, ...(saved && typeof saved === 'object' ? saved : {}), ...hashSettings };
      return {
        ...merged,
        rateOverrides: merged.rateOverrides && typeof merged.rateOverrides === 'object' ? merged.rateOverrides : {},
        customQuotes: Array.isArray(merged.customQuotes) ? merged.customQuotes : [],
        compared: Array.isArray(merged.compared) ? merged.compared : []
      };
    } catch {
      return { ...DEFAULT };
    }
  }

  let state = loadState();

  function store() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      // Keep hash updated for easy sharing
      const params = new URLSearchParams();
      if (state.workload !== DEFAULT.workload) params.set('workload', state.workload);
      if (state.baseGpu !== DEFAULT.baseGpu) params.set('baseGpu', state.baseGpu);
      if (state.baseHours !== DEFAULT.baseHours) params.set('hours', state.baseHours);
      if (state.gpuCount !== DEFAULT.gpuCount) params.set('gpus', state.gpuCount);
      if (state.vramMin !== DEFAULT.vramMin) params.set('vram', state.vramMin);
      if (state.currency !== DEFAULT.currency) params.set('curr', state.currency);
      if (state.tier !== DEFAULT.tier) params.set('tier', state.tier);
      if (state.scatterScale !== DEFAULT.scatterScale) params.set('scale', state.scatterScale);
      const str = params.toString();
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', str ? '#' + str : window.location.pathname);
      }
    } catch {}
  }

  /* Throughput ratio relative to RTX 4090 */
  function ratioFor(gpuId, workload) {
    const gpu = gpuById.get(gpuId);
    if (!gpu || gpu.reference) return null;
    if (gpu.estimateFrom) {
      const parent = ratioFor(gpu.estimateFrom, workload);
      return parent ? { ratio: parent.ratio * gpu.estimateScale, evidence: 'estimated', why: `A100 40 GB uses ${gpu.estimateScale * 100}% of A100 80 GB throughput as an empirical proxy.` } : null;
    }
    if (workload === 'vision') {
      if (Number.isFinite(gpu.vision)) return { ratio: gpu.vision / 306, evidence: 'measured', why: 'Ultralytics YOLO26n COCO 640px mixed-precision benchmark.' };
      if (Number.isFinite(gpu.mobileNet)) return { ratio: gpu.mobileNet / 268.26, evidence: 'estimated', why: 'MobileNetV3 BF16 proxy ratio substituted for missing YOLO26n result.' };
      if (Number.isFinite(gpu.transformer)) return { ratio: gpu.transformer / 472.39, evidence: 'estimated', why: 'Transformer speed substituted as fallback cross-model proxy.' };
    }
    if (workload === 'transformer') {
      if (Number.isFinite(gpu.transformer)) return { ratio: gpu.transformer / 472.39, evidence: 'measured', why: 'LynxBenchAI DistilBERT BF16 sustained training benchmark.' };
      if (Number.isFinite(gpu.transformerEstimate)) return { ratio: gpu.transformerEstimate, evidence: 'estimated', why: 'Empirical hardware architecture ratio relative to RTX 4090.' };
      if (Number.isFinite(gpu.vision)) return { ratio: gpu.vision / 306, evidence: 'estimated', why: 'Vision throughput ratio substituted as fallback proxy.' };
    }
    if (workload === 'multimodal') {
      const v = ratioFor(gpuId, 'vision');
      const t = ratioFor(gpuId, 'transformer');
      if (!v || !t) return null;
      const share = state.visionShare / 100;
      const ratio = 1 / (share / v.ratio + (1 - share) / t.ratio);
      return { ratio, evidence: 'estimated', why: `Harmonic blend of ${state.visionShare}% vision and ${100 - state.visionShare}% Transformer reference workload.` };
    }
    return null;
  }

  /* Reference GPU speed ratio relative to RTX 4090 */
  function refSpeedRatio(baseGpu, workload) {
    if (baseGpu === 't4') return 1 / state.t4Factor;
    const s = ratioFor(baseGpu, workload);
    return s && s.ratio > 0 ? s.ratio : 1.0;
  }

  function sourceRows() {
    return [...data.offers, ...state.customQuotes].filter(row => gpuById.has(row.gpu));
  }

  function rateUSD(offer) {
    const override = Object.prototype.hasOwnProperty.call(state.rateOverrides, offer.id) ? Number(state.rateOverrides[offer.id]) : offer.rate;
    const price = Number.isFinite(override) && override > 0 ? override : offer.rate;
    return offer.currency === 'INR' ? price / state.fx : price;
  }

  function evaluated(offer) {
    const gpu = gpuById.get(offer.gpu);
    const speed = ratioFor(offer.gpu, state.workload);
    if (!speed || speed.ratio <= 0) return null;

    const refRatio = refSpeedRatio(state.baseGpu, state.workload);
    const on4090 = state.baseHours * refRatio;

    const gCount = Number(state.gpuCount) || 1;
    const efficiency = gCount === 1 ? 1.0 : gCount === 2 ? 0.92 : gCount === 4 ? 0.85 : 0.78;
    const effectiveSpeed = speed.ratio * gCount * efficiency;

    const hours = (on4090 / effectiveSpeed) * (1 + state.overhead / 100);
    const singleHourly = rateUSD(offer);
    const totalHourly = singleHourly * gCount;

    // Monthly storage amortized to runtime hours ($0.10/GB/month, ~730 hours/month)
    const storageCost = ((state.storageGb || 0) * 0.10 / 730) * hours;
    const setupCost = (state.idleHours || 0) * totalHourly;
    const computeUsd = hours * totalHourly;
    const totalCostUsd = computeUsd + state.fixedCost + storageCost + setupCost;

    const speedVsRef = speed.ratio / refRatio;
    const valueScore = speed.ratio / singleHourly;

    return {
      ...offer,
      name: gpu.name,
      vram: gpu.vram,
      relative: speed.ratio,
      relativeToRef: speedVsRef,
      evidence: speed.evidence,
      why: speed.why,
      hours,
      rateUsd: singleHourly,
      totalHourlyUsd: totalHourly,
      costUsd: totalCostUsd,
      computeUsd,
      storageCost,
      setupCost,
      valueScore,
      gCount
    };
  }

  function filtered() {
    const rows = sourceRows().map(evaluated).filter(Boolean).filter(row => {
      const matchVram = row.vram >= state.vramMin;
      const matchTier = state.tier === 'all' || state.tier === row.tier;
      const matchConfidence = state.confidence === 'all' || row.evidence === 'measured';
      const matchProvider = state.providerFilter === 'all' || row.provider.toLowerCase().includes(state.providerFilter.toLowerCase());
      const query = (state.search || '').toLowerCase().trim();
      const matchSearch = !query || (row.name + ' ' + row.provider + ' ' + row.vram + 'gb').toLowerCase().includes(query);
      return matchVram && matchTier && matchConfidence && matchProvider && matchSearch;
    });

    rows.sort((a, b) => {
      const key = state.sort === 'gpu' ? 'name' : state.sort;
      const one = a[key], two = b[key];
      return state.sortDir * (typeof one === 'string' ? one.localeCompare(two) : one - two);
    });

    return rows;
  }

  function pareto(rows) {
    return rows.filter(a => !rows.some(b => b.id !== a.id && b.hours <= a.hours && b.costUsd <= a.costUsd && (b.hours < a.hours || b.costUsd < a.costUsd)));
  }

  function money(usd, digits = 0) {
    if (state.currency === 'INR') {
      return '₹' + formatted(usd * state.fx, digits);
    }
    return '$' + formatted(usd, digits > 0 ? digits : (usd < 10 ? 2 : 0));
  }

  function rate(usd) {
    if (state.currency === 'INR') {
      return '₹' + formatted(usd * state.fx, 2) + '/h';
    }
    return '$' + formatted(usd, 2) + '/h';
  }

  function brief(row) {
    return `${row.name} · ${row.provider}`;
  }

  function renderActivePills() {
    const pills = [];
    pills.push(`<span class="scenario-pill"><strong>Workload:</strong>${state.workload === 'vision' ? 'Vision' : state.workload === 'transformer' ? 'Transformer' : 'Multimodal'}</span>`);
    const refGpu = gpuById.get(state.baseGpu);
    pills.push(`<span class="scenario-pill"><strong>Ref:</strong>${refGpu ? refGpu.name : state.baseGpu} (${state.baseHours}h)</span>`);
    if (state.gpuCount > 1) {
      pills.push(`<span class="scenario-pill"><strong>Cluster:</strong>${state.gpuCount}× GPUs</span>`);
    }
    if (state.vramMin > 0) {
      pills.push(`<span class="scenario-pill"><strong>Min VRAM:</strong>≥ ${state.vramMin} GB</span>`);
    }
    pills.push(`<span class="scenario-pill"><strong>Currency:</strong>${state.currency}</span>`);
    byId('activePills').innerHTML = pills.join('');
  }

  function renderSummary(rows) {
    const cheapest = [...rows].sort((a, b) => a.costUsd - b.costUsd)[0];
    const fastest = [...rows].sort((a, b) => a.hours - b.hours)[0];
    const minRate = [...rows].sort((a, b) => a.rateUsd - b.rateUsd)[0];
    const stats = [
      ['Lowest job cost', cheapest ? money(cheapest.costUsd) : 'None', cheapest ? brief(cheapest) : 'Adjust filters'],
      ['Fastest runtime', fastest ? formatted(fastest.hours, 1) + ' h' : 'None', fastest ? brief(fastest) : 'Adjust filters'],
      ['Lowest hourly rate', minRate ? rate(minRate.rateUsd) : 'None', minRate ? brief(minRate) : 'Adjust filters'],
      ['Matching offers', String(rows.length), state.providerFilter !== 'all' ? `Filtered by ${state.providerFilter}` : 'Across all providers']
    ];
    byId('summary').innerHTML = stats.map(([name, value, desc]) =>
      `<div class="stat"><div class="k">${esc(name)}</div><div class="v">${esc(value)}</div><div class="s">${esc(desc)}</div></div>`
    ).join('');
  }

  const palette = {
    'RunPod Community': '#3b82f6',
    'RunPod Secure': '#6366f1',
    'Hyperstack': '#0d9488',
    'Thunder Compute': '#d97706',
    'Jarvislabs': '#a855f7',
    'Vast.ai': '#ec4899',
    'Lambda Labs': '#8b5cf6'
  };

  function renderScatter(rows) {
    const box = byId('scatter');
    const tooltip = byId('chartTooltip');
    if (!rows.length) {
      box.innerHTML = '<div class="empty">No rental offers match these filters. Try reducing minimum VRAM.</div>';
      return;
    }

    const frontier = pareto(rows);
    const isLog = state.scatterScale === 'log';
    const W = 780, H = 340, pad = { l: 65, r: 24, t: 18, b: 50 };

    const minX = Math.min(...rows.map(r => r.hours));
    const maxX = Math.max(...rows.map(r => r.hours));
    const minY = Math.min(...rows.map(r => r.costUsd));
    const maxY = Math.max(...rows.map(r => r.costUsd));

    const plotMinX = isLog ? Math.max(0.1, minX * 0.8) : 0;
    const plotMaxX = maxX * 1.12;
    const plotMinY = isLog ? Math.max(0.01, minY * 0.8) : 0;
    const plotMaxY = maxY * 1.12;

    const scaleX = x => {
      if (isLog) {
        const lx = Math.log10(Math.max(0.05, x)), lmin = Math.log10(plotMinX), lmax = Math.log10(plotMaxX);
        return pad.l + ((lx - lmin) / (lmax - lmin || 1)) * (W - pad.l - pad.r);
      }
      return pad.l + (x / plotMaxX) * (W - pad.l - pad.r);
    };

    const scaleY = y => {
      if (isLog) {
        const ly = Math.log10(Math.max(0.01, y)), lmin = Math.log10(plotMinY), lmax = Math.log10(plotMaxY);
        return H - pad.b - ((ly - lmin) / (lmax - lmin || 1)) * (H - pad.t - pad.b);
      }
      return H - pad.b - (y / plotMaxY) * (H - pad.t - pad.b);
    };

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Interactive scatter plot of completion time vs estimated job cost">
      <line class="axis-line" x1="${pad.l}" y1="${H - pad.b}" x2="${W - pad.r}" y2="${H - pad.b}"/>
      <line class="axis-line" x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${H - pad.b}"/>`;

    // Grid ticks
    for (let i = 1; i <= 4; i++) {
      let vx, vy;
      if (isLog) {
        const lminX = Math.log10(plotMinX), lmaxX = Math.log10(plotMaxX);
        vx = Math.pow(10, lminX + (lmaxX - lminX) * (i / 4));
        const lminY = Math.log10(plotMinY), lmaxY = Math.log10(plotMaxY);
        vy = Math.pow(10, lminY + (lmaxY - lminY) * (i / 4));
      } else {
        vx = plotMaxX * (i / 4);
        vy = plotMaxY * (i / 4);
      }
      const xx = scaleX(vx), yy = scaleY(vy);
      svg += `<line class="grid-line" x1="${xx}" y1="${pad.t}" x2="${xx}" y2="${H - pad.b}"/>
              <line class="grid-line" x1="${pad.l}" y1="${yy}" x2="${W - pad.r}" y2="${yy}"/>
              <text class="axis-label" x="${xx}" y="${H - pad.b + 18}" text-anchor="middle">${formatted(vx, 1)}h</text>
              <text class="axis-label" x="${pad.l - 7}" y="${yy + 4}" text-anchor="end">${esc(money(vy))}</text>`;
    }

    svg += `<text class="axis-label" x="${W / 2}" y="${H - 8}" text-anchor="middle">Estimated training time ${isLog ? '(Log scale)' : ''}</text>
            <text class="axis-label" x="14" y="${H / 2}" text-anchor="middle" transform="rotate(-90 14 ${H / 2})">Estimated job cost ${isLog ? '(Log scale)' : ''}</text>`;

    // Pareto frontier dashed curve
    const frontierPoints = [...frontier].sort((a, b) => a.hours - b.hours);
    if (frontierPoints.length > 1) {
      svg += `<polyline points="${frontierPoints.map(r => `${scaleX(r.hours)},${scaleY(r.costUsd)}`).join(' ')}" fill="none" stroke="var(--good)" stroke-width="2.2" stroke-dasharray="4 4" opacity="0.9"/>`;
    }

    // Points
    for (const r of [...rows].reverse()) {
      const isPareto = frontier.some(x => x.id === r.id);
      const isSelected = r.id === state.selected;
      const col = isPareto ? 'var(--good)' : (palette[r.provider] || '#8d97ab');
      const cx = scaleX(r.hours), cy = scaleY(r.costUsd);
      svg += `<circle class="chart-point" data-offer="${esc(r.id)}" cx="${cx}" cy="${cy}" r="${isSelected ? 8 : (isPareto ? 6.5 : 5)}" fill="${col}" stroke="${isSelected ? 'var(--ink)' : 'var(--surface)'}" stroke-width="${isSelected ? 2.5 : 1.5}" opacity="${isSelected ? 1 : (isPareto ? 0.95 : 0.75)}"></circle>`;
    }

    svg += '</svg>';
    box.innerHTML = svg;

    // Rich floating tooltip interactions
    const points = box.querySelectorAll('[data-offer]');
    points.forEach(point => {
      point.addEventListener('mouseenter', e => {
        const row = rows.find(x => x.id === point.dataset.offer);
        if (!row) return;
        const isPareto = frontier.some(x => x.id === row.id);
        const rect = box.getBoundingClientRect();
        const left = e.clientX - rect.left + 12;
        const top = e.clientY - rect.top - 12;

        tooltip.innerHTML = `
          <strong>${esc(row.name)}</strong>
          <div>${esc(row.provider)} (${row.vram} GB)</div>
          <div style="margin-top:4px">
            <div><strong>${money(row.costUsd)}</strong> total (${formatted(row.hours, 1)} hrs)</div>
            <div>${rate(row.rateUsd)} · ${formatted(row.relativeToRef, 2)}× vs ref</div>
          </div>
          ${isPareto ? '<span class="tooltip-tag frontier">★ Pareto Frontier</span>' : ''}
        `;
        tooltip.style.left = `${clamp(left, 10, rect.width - 200)}px`;
        tooltip.style.top = `${clamp(top, 10, rect.height - 100)}px`;
        tooltip.hidden = false;
      });

      point.addEventListener('mouseleave', () => {
        tooltip.hidden = true;
      });

      point.addEventListener('click', () => {
        state.selected = point.dataset.offer;
        store();
        render();
        const el = document.getElementById('selection');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
  }

  function renderBars(rows) {
    const metric = state.barMetric || 'cost';
    let top;
    let titleFn;

    if (metric === 'speed') {
      top = [...rows].sort((a, b) => a.hours - b.hours).slice(0, 8);
      titleFn = r => `${formatted(r.hours, 1)} h`;
    } else if (metric === 'rate') {
      top = [...rows].sort((a, b) => a.rateUsd - b.rateUsd).slice(0, 8);
      titleFn = r => rate(r.rateUsd);
    } else if (metric === 'value') {
      top = [...rows].sort((a, b) => b.valueScore - a.valueScore).slice(0, 8);
      titleFn = r => `${formatted(r.valueScore, 1)} pts`;
    } else {
      top = [...rows].sort((a, b) => a.costUsd - b.costUsd).slice(0, 8);
      titleFn = r => money(r.costUsd);
    }

    const frontier = pareto(rows);
    const maxVal = Math.max(0.001, ...top.map(r => metric === 'speed' ? r.hours : metric === 'rate' ? r.rateUsd : metric === 'value' ? r.valueScore : r.costUsd));

    byId('bars').innerHTML = top.length ? top.map(row => {
      const val = metric === 'speed' ? row.hours : metric === 'rate' ? row.rateUsd : metric === 'value' ? row.valueScore : row.costUsd;
      const pct = (val / maxVal * 100).toFixed(1);
      const isFrontier = frontier.some(x => x.id === row.id);
      return `<div class="bar-line" title="${esc(brief(row))}">
        <span class="name" title="${esc(row.name)} (${esc(row.provider)})">${esc(row.name)}</span>
        <div class="bar-track"><div class="bar-fill ${isFrontier ? 'frontier' : ''}" style="width:${pct}%"></div></div>
        <span class="bar-value">${esc(titleFn(row))}</span>
      </div>`;
    }).join('') : '<div class="empty">No qualifying offers</div>';
  }

  function renderProviderPills() {
    const providers = ['all', 'RunPod', 'Hyperstack', 'Thunder', 'Jarvislabs', 'Vast.ai', 'Lambda Labs'];
    const bar = byId('providerPills');
    bar.innerHTML = providers.map(p => {
      const active = state.providerFilter.toLowerCase() === p.toLowerCase();
      return `<button type="button" class="provider-chip ${active ? 'active' : ''}" data-provider="${p}">${p === 'all' ? 'All Providers' : p}</button>`;
    }).join('');

    bar.querySelectorAll('[data-provider]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.providerFilter = btn.dataset.provider;
        store();
        render();
      });
    });
  }

  function renderCompare(rows) {
    const compBox = byId('comparePanel');
    const compGrid = byId('compareGrid');
    const selectedRows = rows.filter(r => state.compared.includes(r.id));

    if (selectedRows.length < 2) {
      compBox.hidden = true;
      return;
    }

    compBox.hidden = false;
    const cheapest = [...selectedRows].sort((a, b) => a.costUsd - b.costUsd)[0];
    const fastest = [...selectedRows].sort((a, b) => a.hours - b.hours)[0];

    compGrid.innerHTML = selectedRows.map(row => {
      const costDiff = row.costUsd - cheapest.costUsd;
      const speedDiff = row.hours - fastest.hours;
      return `<div class="compare-card">
        <h3>${esc(row.name)}</h3>
        <div class="compare-meta">${esc(row.provider)} · ${row.vram} GB VRAM</div>
        <div class="compare-row"><span>Hourly rate</span><strong>${rate(row.rateUsd)}</strong></div>
        <div class="compare-row"><span>Est. runtime</span><strong>${formatted(row.hours, 1)} h</strong></div>
        <div class="compare-row"><span>Est. total cost</span><strong>${money(row.costUsd)}</strong></div>
        <div class="compare-row"><span>Speed vs ref</span><strong>${formatted(row.relativeToRef, 2)}×</strong></div>
        <div class="compare-row">
          <span>Cost vs lowest</span>
          <strong style="color:${costDiff > 0 ? 'var(--amber)' : 'var(--good)'}">
            ${costDiff > 0 ? '+' + money(costDiff) : 'Lowest Cost'}
          </strong>
        </div>
        <div class="compare-row">
          <span>Time vs fastest</span>
          <strong style="color:${speedDiff > 0 ? 'var(--amber)' : 'var(--good)'}">
            ${speedDiff > 0 ? '+' + formatted(speedDiff, 1) + ' h' : 'Fastest'}
          </strong>
        </div>
      </div>`;
    }).join('');
  }

  function renderTable(rows) {
    const tbody = byId('offerRows');
    const frontier = pareto(rows);

    tbody.innerHTML = rows.length ? rows.map(row => {
      const isSelected = state.selected === row.id;
      const isFrontier = frontier.some(x => x.id === row.id);
      const isCompared = state.compared.includes(row.id);
      const src = sources[row.source];
      const link = src ? `<a href="${esc(src)}" target="_blank" rel="noopener noreferrer">Pricing</a>` : 'User quote';
      return `<tr data-offer="${esc(row.id)}" class="${isSelected ? 'selected' : ''}">
        <td><input type="checkbox" class="compare-check" data-compare="${esc(row.id)}" ${isCompared ? 'checked' : ''} title="Compare offer"></td>
        <td>
          <span class="gpu-label">${esc(row.name)}</span>
          ${isFrontier ? '<span class="frontier-badge" title="Pareto Optimal Frontier">★ Frontier</span>' : ''}
          <span class="tier-caption">${row.tier === 'community' ? 'Community' : 'On-demand'}${row.quality === 'indicative' ? ' · indicative' : ''}</span>
        </td>
        <td>${esc(row.provider)}</td>
        <td>${row.vram} GB</td>
        <td>${esc(rate(row.rateUsd))}</td>
        <td>${formatted(row.relativeToRef, 2)}×</td>
        <td>${formatted(row.hours, 1)} h</td>
        <td><strong>${esc(money(row.costUsd))}</strong></td>
        <td><span class="evidence ${row.evidence}">${row.evidence === 'measured' ? 'Measured' : 'Estimated'}</span> · ${link}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="9" class="empty">No matching offers found. Try lowering minimum VRAM or selecting All Tiers.</td></tr>';

    byId('rowCount').textContent = `${rows.length} listed offers (${frontier.length} on Pareto frontier)`;

    tbody.querySelectorAll('tr[data-offer]').forEach(tr => {
      tr.addEventListener('click', e => {
        if (e.target.closest('a') || e.target.closest('input[type="checkbox"]')) return;
        state.selected = tr.dataset.offer;
        store();
        render();
      });
    });

    tbody.querySelectorAll('.compare-check').forEach(chk => {
      chk.addEventListener('change', e => {
        e.stopPropagation();
        const id = chk.dataset.compare;
        if (chk.checked) {
          if (!state.compared.includes(id)) state.compared.push(id);
        } else {
          state.compared = state.compared.filter(x => x !== id);
        }
        store();
        renderCompare(rows);
      });
    });
  }

  function renderDetails(rows) {
    const chosen = rows.find(r => r.id === state.selected) || [...rows].sort((a, b) => a.costUsd - b.costUsd)[0];
    if (!chosen) {
      byId('details').innerHTML = '<p class="muted">No qualifying offer selected.</p>';
      return;
    }
    const source = sources[chosen.source];
    const base = sourceRows().find(o => o.id === chosen.id);
    const overridden = Object.prototype.hasOwnProperty.call(state.rateOverrides, chosen.id);

    byId('details').innerHTML = `
      <div class="details-title">${esc(chosen.name)}</div>
      <p class="help">${esc(chosen.provider)} · ${chosen.vram} GB VRAM · ${chosen.tier === 'community' ? 'Community Marketplace' : 'Dedicated Cloud'}</p>
      <div class="detail-stats">
        <div><strong>${formatted(chosen.hours, 1)} h</strong><span>Estimated Job Time</span></div>
        <div><strong>${esc(money(chosen.costUsd))}</strong><span>Total Projected Cost</span></div>
        <div><strong>${esc(rate(chosen.rateUsd))}</strong><span>Hourly Rate (${chosen.currency})</span></div>
      </div>
      <p class="help">
        <span class="evidence ${chosen.evidence}">${chosen.evidence === 'measured' ? 'Benchmark Measured' : 'Proxy Estimated'}</span>: ${esc(chosen.why)}
      </p>
      <p class="help">
        Compute subtotal: ${money(chosen.computeUsd)}.
        ${chosen.storageCost > 0 ? `Storage: ${money(chosen.storageCost)}. ` : ''}
        ${chosen.setupCost > 0 ? `Setup: ${money(chosen.setupCost)}. ` : ''}
        ${state.fixedCost > 0 ? `Fixed fees: ${money(state.fixedCost)}. ` : ''}
        ${source ? `<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">Official price page</a>.` : ''}
      </p>
      <div class="field" style="margin-top:14px">
        <label for="editRate">Custom override for this rate (${base.currency}/h)</label>
        <input id="editRate" type="number" min="0.001" step="0.01" value="${overridden ? esc(state.rateOverrides[chosen.id]) : base.rate}">
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="button primary" id="saveRate">Save Rate Override</button>
        ${overridden ? '<button type="button" class="button" id="restoreRate">Restore Listed Rate</button>' : ''}
        ${chosen.custom ? '<button type="button" class="button" id="removeQuote">Delete Custom Quote</button>' : ''}
      </div>
    `;

    byId('saveRate').addEventListener('click', () => {
      const val = Number(byId('editRate').value);
      if (!Number.isFinite(val) || val <= 0) {
        alert('Please enter a positive hourly rate.');
        return;
      }
      state.rateOverrides[chosen.id] = val;
      store();
      render();
    });

    byId('restoreRate')?.addEventListener('click', () => {
      delete state.rateOverrides[chosen.id];
      store();
      render();
    });

    byId('removeQuote')?.addEventListener('click', () => {
      state.customQuotes = state.customQuotes.filter(x => x.id !== chosen.id);
      delete state.rateOverrides[chosen.id];
      state.selected = 'rpc4090';
      store();
      render();
    });
  }

  function renderLocal(rows) {
    const cheapestOverall = [...rows].sort((a, b) => a.costUsd - b.costUsd)[0];
    const candidateIds = ['rtx4070ti', 'rtx4080', 'rtx4080s', 'rtx5080', 'rtx5090'];

    byId('localReferences').innerHTML = candidateIds.map(id => {
      const g = gpuById.get(id);
      if (!g) return '';
      const v = ratioFor(id, 'vision');
      const t = ratioFor(id, 'transformer');
      const quoted = sourceRows().filter(o => o.gpu === id).length;

      // Buy vs Rent Break-Even Calculation
      let breakEvenHtml = '';
      if (g.msrp && cheapestOverall) {
        const estCostPerJob = cheapestOverall.costUsd;
        if (estCostPerJob > 0) {
          const jobsNeeded = Math.ceil(g.msrp / estCostPerJob);
          const hoursNeeded = Math.round(jobsNeeded * state.baseHours);
          breakEvenHtml = `<div class="ref-break-even">
            <strong>Buy vs Rent:</strong> MSRP ~$${g.msrp}. Pays for itself in <strong>~${jobsNeeded} jobs</strong> (${hoursNeeded}h) vs cheapest cloud rental.
          </div>`;
        }
      }

      return `<div class="ref-card">
        <strong>${esc(g.name)}</strong>
        <div class="muted">${g.vram} GB VRAM · Desktop Workstation</div>
        <p>Vision ratio: ${v ? formatted(v.ratio, 2) + '×' : 'N/A'} (proxy)</p>
        <p>Transformer ratio: ${t ? formatted(t.ratio, 2) + '×' : 'N/A'} (measured)</p>
        <p>${quoted ? `${quoted} custom user quote(s)` : 'Unpriced reference card'}</p>
        ${breakEvenHtml}
        <button class="button" type="button" data-fill="${id}">Enter rental quote</button>
      </div>`;
    }).join('');

    byId('localReferences').querySelectorAll('[data-fill]').forEach(button => {
      button.addEventListener('click', () => {
        byId('quoteGpu').value = button.dataset.fill;
        byId('quoteProvider').focus();
        byId('quoteForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  function syncControls() {
    ['workload', 'baseGpu', 'baseHours', 't4Factor', 'visionShare', 'gpuCount', 'modelPreset', 'vramMin', 'tier', 'confidence', 'currency', 'fx', 'storageGb', 'idleHours', 'overhead', 'fixedCost'].forEach(id => {
      const el = byId(id);
      if (el) el.value = state[id];
    });

    byId('hoursValue').textContent = `${state.baseHours} h`;
    byId('t4Value').textContent = `${formatted(state.t4Factor, 1)}×`;
    byId('mixValue').textContent = `${state.visionShare}%`;
    byId('gpuCountValue').textContent = `${state.gpuCount}× GPU${state.gpuCount > 1 ? 's' : ''}`;

    byId('t4Control').hidden = state.baseGpu !== 't4';
    byId('mixControl').hidden = state.workload !== 'multimodal';

    byId('workloadHelp').textContent = {
      vision: 'Ultralytics YOLO26n training benchmark (COCO 640px).',
      transformer: 'LynxBenchAI DistilBERT BF16 sustained training results.',
      multimodal: 'Weighted harmonic mean of Vision and Transformer runtime.'
    }[state.workload];

    // Notice bar visibility
    if (state.noticeDismissed) {
      byId('noticeBar').style.display = 'none';
    }

    // Scatter scale toggle buttons
    all('#scatterScaleControl .seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.scale === state.scatterScale);
    });

    // Bar metric
    if (byId('barMetric')) byId('barMetric').value = state.barMetric;

    document.documentElement.dataset.theme = state.theme;
    byId('themeButton').textContent = state.theme === 'light' ? 'Dark' : 'Light';
    byId('themeButton').setAttribute('aria-label', state.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
  }

  function render() {
    syncControls();
    renderActivePills();
    renderProviderPills();
    const rows = filtered();
    renderSummary(rows);
    renderScatter(rows);
    renderBars(rows);
    renderCompare(rows);
    renderTable(rows);
    renderDetails(rows);
    renderLocal(rows);
  }

  function exportFile(filename, content, mime) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function csvCell(val) {
    return '"' + String(val).replaceAll('"', '""') + '"';
  }

  function exportCsv() {
    const heads = ['GPU', 'Provider', 'Tier', 'VRAM GB', 'USD/hour', 'INR/hour', 'Ratio vs RTX 4090', 'Speed vs Ref', 'Evidence', 'Est. Hours', 'Job Cost USD', 'Job Cost INR', 'Source URL'];
    const records = filtered().map(r => [
      r.name, r.provider, r.tier, r.vram,
      formatted(r.rateUsd, 3), formatted(r.rateUsd * state.fx, 2),
      formatted(r.relative, 3), formatted(r.relativeToRef, 3),
      r.evidence, formatted(r.hours, 2),
      formatted(r.costUsd, 2), formatted(r.costUsd * state.fx, 2),
      sources[r.source] || 'User quote'
    ]);
    exportFile('gpu-cost-comparison.csv', [heads, ...records].map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  }

  function exportJson() {
    exportFile('gpu-cost-comparison.json', JSON.stringify({
      snapshot: data.snapshot,
      currency: state.currency,
      settings: state,
      matchingOffers: filtered(),
      sources
    }, null, 2), 'application/json');
  }

  function showToast(msg) {
    const toast = byId('copyToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function shareLink() {
    store();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(window.location.href).then(() => {
        showToast('Shareable link copied to clipboard!');
      }).catch(() => {
        showToast('Link ready in address bar');
      });
    } else {
      showToast('Link ready in address bar');
    }
  }

  function addQuote(event) {
    event.preventDefault();
    const gpu = byId('quoteGpu').value;
    const provider = byId('quoteProvider').value.trim();
    const rateValue = Number(byId('quoteRate').value);
    const tier = byId('quoteTier').value;

    if (!gpuById.has(gpu) || !provider || !Number.isFinite(rateValue) || rateValue <= 0) {
      alert('Please enter a valid GPU, provider name, and positive hourly price.');
      return;
    }
    const id = 'quote-' + Date.now();
    state.customQuotes.push({ id, gpu, provider, tier, rate: rateValue, currency: 'USD', custom: true });
    state.selected = id;
    state.vramMin = Math.min(state.vramMin, gpuById.get(gpu).vram);
    state.search = '';
    state.tier = 'all';
    state.confidence = 'all';
    state.providerFilter = 'all';

    byId('search').value = '';
    store();
    event.target.reset();
    render();
    document.querySelector('.table-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function initialize() {
    byId('quoteGpu').innerHTML = data.gpus.filter(g => !g.reference).map(g =>
      `<option value="${esc(g.id)}">${esc(g.name)} (${g.vram} GB)</option>`
    ).join('');

    // Selects
    ['workload', 'baseGpu', 'gpuCount', 'tier', 'confidence', 'currency'].forEach(id => {
      byId(id).addEventListener('change', e => {
        state[id] = id === 'gpuCount' ? Number(e.target.value) : e.target.value;
        store();
        render();
      });
    });

    // Model memory preset
    byId('modelPreset').addEventListener('change', e => {
      const val = e.target.value;
      state.modelPreset = val;
      if (val === '16_llama' || val === '16_sdxl') state.vramMin = 16;
      else if (val === '24_flux') state.vramMin = 24;
      else if (val === '40_llama70') state.vramMin = 40;
      else if (val === '80_llama70') state.vramMin = 80;
      else if (val === '96_deepseek') state.vramMin = 96;
      byId('vramMin').value = state.vramMin;
      store();
      render();
    });

    byId('vramMin').addEventListener('change', e => {
      state.vramMin = Number(e.target.value);
      state.modelPreset = 'custom';
      byId('modelPreset').value = 'custom';
      store();
      render();
    });

    // Sliders & continuous inputs
    ['baseHours', 't4Factor', 'visionShare'].forEach(id => {
      byId(id).addEventListener('input', e => {
        state[id] = Number(e.target.value);
        store();
        render();
      });
    });

    ['fx', 'storageGb', 'idleHours', 'overhead', 'fixedCost'].forEach(id => {
      byId(id).addEventListener('change', e => {
        const val = validNumber(e.target.value, DEFAULT[id]);
        state[id] = id === 'fx' ? clamp(val, 1, 1000) : id === 'overhead' ? clamp(val, 0, 200) : clamp(val, 0, 100000);
        store();
        render();
      });
    });

    // Scatter scale toggle
    all('#scatterScaleControl .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.scatterScale = btn.dataset.scale;
        store();
        render();
      });
    });

    // Bar metric change
    byId('barMetric').addEventListener('change', e => {
      state.barMetric = e.target.value;
      store();
      render();
    });

    // Dismiss notice
    byId('dismissNotice').addEventListener('click', () => {
      state.noticeDismissed = true;
      byId('noticeBar').style.display = 'none';
      store();
    });

    // Clear comparison
    byId('clearCompare').addEventListener('click', () => {
      state.compared = [];
      store();
      render();
    });

    byId('search').addEventListener('input', e => {
      state.search = e.target.value;
      store();
      const rows = filtered();
      renderSummary(rows);
      renderScatter(rows);
      renderBars(rows);
      renderTable(rows);
      renderDetails(rows);
    });

    all('th button[data-sort]').forEach(button => {
      button.addEventListener('click', () => {
        const key = button.dataset.sort;
        state.sortDir = state.sort === key ? -state.sortDir : 1;
        state.sort = key;
        store();
        render();
      });
    });

    byId('mobileFilterToggle').addEventListener('click', () => {
      const sidebar = document.querySelector('.sidebar');
      const expanded = sidebar.classList.toggle('expanded');
      byId('mobileFilterToggle').setAttribute('aria-expanded', String(expanded));
    });

    byId('themeButton').addEventListener('click', () => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      store();
      render();
    });

    byId('csvButton').addEventListener('click', exportCsv);
    byId('jsonButton').addEventListener('click', exportJson);
    byId('shareBtn').addEventListener('click', shareLink);
    byId('quoteForm').addEventListener('submit', addQuote);

    byId('resetButton').addEventListener('click', () => {
      if (!confirm('Reset all settings, rate overrides, and custom quotes saved in this browser?')) return;
      state = { ...DEFAULT, rateOverrides: {}, customQuotes: [], compared: [] };
      byId('search').value = '';
      window.location.hash = '';
      store();
      render();
    });

    byId('search').value = state.search;
    render();
  }

  window.GpuCostExplorer = {
    evaluate: () => filtered(),
    performance: ratioFor,
    settings: () => ({ ...state })
  };

  initialize();
})();
