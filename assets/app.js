/* GPU Cost Explorer. No external libraries or network requests. */
(() => {
  'use strict';

  const data = window.GPU_DATA;
  const gpuById = new Map(data.gpus.map(gpu => [gpu.id, gpu]));
  const sources = data.sources;
  const storageKey = 'gpu-cost-explorer-settings-v2';
  const DEFAULT = Object.freeze({
    workload: 'vision', baseGpu: 'rtx4090', baseHours: 24, t4Factor: 6,
    visionShare: 60, vramMin: 24, tier: 'all', confidence: 'all',
    currency: 'INR', fx: data.fx, overhead: 0, fixedCost: 0,
    search: '', sort: 'costUsd', sortDir: 1, selected: 'rpc4090',
    theme: 'light', rateOverrides: {}, customQuotes: []
  });

  const byId = id => document.getElementById(id);
  const all = selector => [...document.querySelectorAll(selector)];
  const validNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (number, min, max) => Math.min(max, Math.max(min, number));
  const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const formatted = (n, digits=1) => Number(n).toLocaleString('en-IN', {minimumFractionDigits:digits,maximumFractionDigits:digits});

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {...DEFAULT};
      return {...DEFAULT,...saved,
        rateOverrides: saved.rateOverrides && typeof saved.rateOverrides === 'object' ? saved.rateOverrides : {},
        customQuotes: Array.isArray(saved.customQuotes) ? saved.customQuotes : []};
    } catch {return {...DEFAULT};}
  }
  let state = loadState();
  function store() {try {localStorage.setItem(storageKey,JSON.stringify(state));} catch {}}

  /* All relative performance is normalized to RTX 4090 for the same profile. */
  function ratioFor(gpuId, workload) {
    const gpu = gpuById.get(gpuId);
    if (!gpu || gpu.reference) return null;
    if (gpu.estimateFrom) {
      const parent = ratioFor(gpu.estimateFrom,workload);
      return parent ? {ratio:parent.ratio*gpu.estimateScale, evidence:'estimated',why:'A100 40 GB uses 95.5% of A100 80 GB throughput as a working proxy.'} : null;
    }
    if (workload === 'vision') {
      if (Number.isFinite(gpu.vision)) return {ratio:gpu.vision/306, evidence:'measured',why:'YOLO26n COCO training, mixed precision (Ultralytics).'};
      if (Number.isFinite(gpu.mobileNet)) return {ratio:gpu.mobileNet/268.26,evidence:'estimated',why:'MobileNetV3 BF16 ratio substituted for missing YOLO26n data. Cross-model proxy.'};
      if (Number.isFinite(gpu.transformer)) return {ratio:gpu.transformer/472.39,evidence:'estimated',why:'Transformer ratio substituted for missing vision data. Cross-model proxy.'};
    }
    if (workload === 'transformer') {
      if (Number.isFinite(gpu.transformer)) return {ratio:gpu.transformer/472.39,evidence:'measured',why:'DistilBERT BF16 sustained training results (LynxBenchAI 26Q3).'};
      if (Number.isFinite(gpu.transformerEstimate)) return {ratio:gpu.transformerEstimate,evidence:'estimated',why:'Working assumption, not a matched DistilBERT result.'};
      if (Number.isFinite(gpu.vision)) return {ratio:gpu.vision/306,evidence:'estimated',why:'YOLO26n ratio substituted for missing DistilBERT data. Cross-model proxy.'};
    }
    if (workload === 'multimodal') {
      const v=ratioFor(gpuId,'vision'),t=ratioFor(gpuId,'transformer');
      if (!v || !t) return null;
      const share=state.visionShare/100;
      const ratio=1/(share/v.ratio+(1-share)/t.ratio);
      return {ratio,evidence:'estimated',why:`Modeled combination of ${state.visionShare}% vision and ${100-state.visionShare}% Transformer reference runtime. Not a measured multimodal benchmark.`};
    }
    return null;
  }

  function sourceRows() {return [...data.offers,...state.customQuotes].filter(row => gpuById.has(row.gpu));}
  function rateUSD(offer) {
    const override = Object.prototype.hasOwnProperty.call(state.rateOverrides,offer.id) ? Number(state.rateOverrides[offer.id]) : offer.rate;
    const price = Number.isFinite(override) && override > 0 ? override : offer.rate;
    return offer.currency === 'INR' ? price/state.fx : price;
  }
  function evaluated(offer) {
    const gpu = gpuById.get(offer.gpu);
    const speed = ratioFor(offer.gpu,state.workload);
    if (!speed || speed.ratio <= 0) return null;
    const on4090 = state.baseGpu === 't4' ? state.baseHours/state.t4Factor : state.baseHours;
    const hours = on4090/speed.ratio*(1+state.overhead/100);
    const hourly = rateUSD(offer);
    return {...offer, name:gpu.name, vram:gpu.vram, relative:speed.ratio,
      evidence:speed.evidence, why:speed.why, hours, rateUsd:hourly,
      costUsd:hours*hourly+state.fixedCost, computeUsd:hours*hourly};
  }
  function filtered() {
    const rows = sourceRows().map(evaluated).filter(Boolean).filter(row =>
      row.vram >= state.vramMin &&
      (state.tier === 'all' || state.tier === row.tier) &&
      (state.confidence === 'all' || row.evidence === 'measured') &&
      (!state.search || (row.name+' '+row.provider).toLowerCase().includes(state.search.toLowerCase())));
    rows.sort((a,b) => {
      const key = state.sort === 'gpu' ? 'name' : state.sort;
      const one=a[key],two=b[key];
      return state.sortDir*(typeof one==='string' ? one.localeCompare(two) : one-two);
    });
    return rows;
  }
  function pareto(rows) {
    return rows.filter(a => !rows.some(b => b.id!==a.id && b.hours<=a.hours && b.costUsd<=a.costUsd && (b.hours<a.hours || b.costUsd<a.costUsd)));
  }
  function money(usd, digits=0) {return state.currency==='INR'?'₹'+formatted(usd*state.fx,digits):'$'+formatted(usd,2);}
  function rate(usd) {return money(usd,2)+'/h';}
  function brief(row) {return row.name+' · '+row.provider;}

  function renderSummary(rows) {
    const cheapest=[...rows].sort((a,b)=>a.costUsd-b.costUsd)[0];
    const fastest=[...rows].sort((a,b)=>a.hours-b.hours)[0];
    const minRate=[...rows].sort((a,b)=>a.rateUsd-b.rateUsd)[0];
    const stats=[
      ['Lowest job cost',cheapest?money(cheapest.costUsd):'None',cheapest?brief(cheapest):'Adjust filters'],
      ['Fastest runtime',fastest?formatted(fastest.hours,1)+' h':'None',fastest?brief(fastest):'Adjust filters'],
      ['Lowest hourly rate',minRate?rate(minRate.rateUsd):'None',minRate?brief(minRate):'Adjust filters'],
      ['Matching offers',String(rows.length),state.workload==='multimodal'?'Modeled profile':state.workload==='vision'?'Vision profile':'Transformer profile']
    ];
    byId('summary').innerHTML=stats.map(([name,value,desc])=>`<div class="stat"><div class="k">${esc(name)}</div><div class="v">${esc(value)}</div><div class="s">${esc(desc)}</div></div>`).join('');
  }
  const palette = {'RunPod Community':'#4f91cc','RunPod Secure':'#6b78bd','Hyperstack':'#188b7b','Thunder Compute':'#ca8837','Jarvislabs':'#b076b1'};
  function renderScatter(rows) {
    const box=byId('scatter');
    if(!rows.length){box.innerHTML='<div class="empty">No offers match these filters.</div>';return;}
    const frontier=pareto(rows),W=770,H=360, pad={l:73,r:26,t:20,b:56};
    const maxX=Math.max(0.1,...rows.map(row=>row.hours))*1.15,maxY=Math.max(.01,...rows.map(row=>row.costUsd))*1.15;
    const sx=x=>pad.l+(x/maxX)*(W-pad.l-pad.r),sy=y=>H-pad.b-(y/maxY)*(H-pad.t-pad.b);
    let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Chart showing completion hours on horizontal axis and estimated job cost on vertical axis"><line class="axis-line" x1="${pad.l}" y1="${H-pad.b}" x2="${W-pad.r}" y2="${H-pad.b}"/><line class="axis-line" x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${H-pad.b}"/>`;
    for(let i=1;i<=4;i++){
      const xx=sx(maxX*i/4),yy=sy(maxY*i/4);
      svg+=`<line class="grid-line" x1="${xx}" y1="${pad.t}" x2="${xx}" y2="${H-pad.b}"/><line class="grid-line" x1="${pad.l}" y1="${yy}" x2="${W-pad.r}" y2="${yy}"/><text class="axis-label" x="${xx}" y="${H-pad.b+20}" text-anchor="middle">${formatted(maxX*i/4,1)}h</text><text class="axis-label" x="${pad.l-8}" y="${yy+4}" text-anchor="end">${esc(money(maxY*i/4))}</text>`;
    }
    svg+=`<text class="axis-label" x="${W/2}" y="${H-8}" text-anchor="middle">Estimated training time</text><text class="axis-label" x="16" y="${H/2}" text-anchor="middle" transform="rotate(-90 16 ${H/2})">Estimated job cost</text>`;
    const points=[...frontier].sort((a,b)=>a.hours-b.hours);
    if(points.length>1) svg+=`<polyline points="${points.map(r=>`${sx(r.hours)},${sy(r.costUsd)}`).join(' ')}" fill="none" stroke="var(--good)" stroke-width="2" stroke-dasharray="4 4"/>`;
    for(const r of [...rows].reverse()){
      const isPareto=frontier.some(x=>x.id===r.id);
      const color=isPareto?'var(--good)':palette[r.provider]||'#8d97ab';
      svg+=`<circle class="chart-point" data-offer="${esc(r.id)}" cx="${sx(r.hours)}" cy="${sy(r.costUsd)}" r="${isPareto?7:5}" fill="${color}" stroke="${r.id===state.selected?'var(--ink)':'var(--surface)'}" stroke-width="2" opacity="${isPareto?1:.78}"><title>${esc(brief(r))}: ${formatted(r.hours,2)}h; ${esc(money(r.costUsd))}</title></circle>`;
    }
    box.innerHTML=svg+'</svg>';
    box.querySelectorAll('[data-offer]').forEach(point=>point.addEventListener('click',()=>{state.selected=point.dataset.offer;store();render();}));
  }
  function renderBars(rows) {
    const top=[...rows].sort((a,b)=>a.costUsd-b.costUsd).slice(0,8);
    const max=Math.max(0.001,...top.map(r=>r.costUsd));
    byId('bars').innerHTML=top.length?top.map(row=>`<div class="bar-line" title="${esc(brief(row))}"><span class="name">${esc(row.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${(row.costUsd/max*100).toFixed(1)}%"></div></div><span class="bar-value">${esc(money(row.costUsd))}</span></div>`).join(''):'<div class="empty">No qualifying offers</div>';
  }
  function renderTable(rows) {
    const tbody=byId('offerRows');
    tbody.innerHTML=rows.length?rows.map(row=>{
      const emphasize=['rtx4080','rtx4080s'].includes(row.gpu);
      const src=sources[row.source];
      const evidence=row.evidence==='measured'?'Measured':'Estimated';
      const link=src?`<a href="${esc(src)}" target="_blank" rel="noopener noreferrer">Price</a>`:'User quote';
      return `<tr data-offer="${esc(row.id)}" class="${state.selected===row.id?'selected':''}"><td><span class="gpu-label ${emphasize?'focus':''}">${esc(row.name)}</span><span class="tier-caption">${row.tier==='community'?'Community':'On-demand'}${row.quality==='indicative'?' · indicative':''}</span></td><td>${esc(row.provider)}</td><td>${row.vram} GB</td><td>${esc(rate(row.rateUsd))}</td><td>${formatted(row.relative,2)}×</td><td>${formatted(row.hours,2)} h</td><td><strong>${esc(money(row.costUsd))}</strong></td><td><span class="evidence ${row.evidence}">${evidence}</span> · ${link}</td></tr>`;
    }).join(''):'<tr><td colspan="8" class="empty">No matching offers. Reduce the VRAM filter or include estimated benchmark data.</td></tr>';
    byId('rowCount').textContent=rows.length+' listed offers';
    tbody.querySelectorAll('tr[data-offer]').forEach(row=>row.addEventListener('click',event=>{
      if(event.target.closest('a'))return;
      state.selected=row.dataset.offer;store();render();
    }));
  }
  function renderDetails(rows) {
    const chosen=rows.find(row=>row.id===state.selected)||[...rows].sort((a,b)=>a.costUsd-b.costUsd)[0];
    if(!chosen){byId('details').innerHTML='<p class="muted">No qualifying offer selected.</p>';return;}
    const source=sources[chosen.source];
    const base=sourceRows().find(o=>o.id===chosen.id);
    const overridden=Object.prototype.hasOwnProperty.call(state.rateOverrides,chosen.id);
    byId('details').innerHTML=`<div class="details-title">${esc(chosen.name)}</div><p class="help">${esc(chosen.provider)} · ${chosen.vram} GB VRAM · ${chosen.tier==='community'?'Community marketplace':'On-demand'}</p>
      <div class="detail-stats"><div><strong>${formatted(chosen.hours,2)}h</strong><span>Estimated training</span></div><div><strong>${esc(money(chosen.costUsd))}</strong><span>Estimated total</span></div><div><strong>${esc(rate(chosen.rateUsd))}</strong><span>Hourly rental</span></div></div>
      <p class="help"><span class="evidence ${chosen.evidence}">${chosen.evidence==='measured'?'Measured':'Estimated'} ratio</span>: ${esc(chosen.why)}</p>
      <p class="help">Compute subtotal: ${esc(money(chosen.computeUsd))}. Additional costs: ${esc(money(state.fixedCost))}. ${source?`<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">Provider price page</a>.`:''}</p>
      <div class="field" style="margin-top:16px"><label for="editRate">Edit this offer's hourly rate (${base.currency})</label><input id="editRate" type="number" min="0.001" step="0.01" value="${overridden?esc(state.rateOverrides[chosen.id]):base.rate}"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="button primary" id="saveRate">Save rate</button>${overridden?'<button type="button" class="button" id="restoreRate">Restore listed rate</button>':''}${chosen.custom?'<button type="button" class="button" id="removeQuote">Remove custom quote</button>':''}</div>`;
    byId('saveRate').addEventListener('click',()=>{
      const val=Number(byId('editRate').value);
      if(!Number.isFinite(val)||val<=0){alert('Enter a positive hourly rate.');return;}
      state.rateOverrides[chosen.id]=val;store();render();
    });
    byId('restoreRate')?.addEventListener('click',()=>{delete state.rateOverrides[chosen.id];store();render();});
    byId('removeQuote')?.addEventListener('click',()=>{state.customQuotes=state.customQuotes.filter(x=>x.id!==chosen.id);delete state.rateOverrides[chosen.id];state.selected='rpc4090';store();render();});
  }
  function renderLocal() {
    byId('localReferences').innerHTML=['rtx4080','rtx4080s','rtx5080'].map(id=>{
      const g=gpuById.get(id);const v=ratioFor(id,'vision');const t=ratioFor(id,'transformer');
      const quoted=sourceRows().filter(o=>o.gpu===id).length;
      return `<div class="ref-card"><strong>${esc(g.name)}</strong><div class="muted">${g.vram} GB VRAM</div><p>Vision ratio: ${v?formatted(v.ratio,2)+'×':'Unavailable'} (proxy)</p><p>Transformer ratio: ${t?formatted(t.ratio,2)+'×':'Unavailable'} (measured)</p><p>${quoted?quoted+' user-added rental quote(s)':'No included cloud rate'}</p><button class="button" type="button" data-fill="${id}">Add rental quote</button></div>`;
    }).join('');
    byId('localReferences').querySelectorAll('[data-fill]').forEach(button=>button.addEventListener('click',()=>{
      byId('quoteGpu').value=button.dataset.fill;
      byId('quoteProvider').focus();
      byId('quoteForm').scrollIntoView({behavior:'smooth',block:'center'});
    }));
  }
  function syncControls() {
    ['workload','baseGpu','baseHours','t4Factor','visionShare','vramMin','tier','confidence','currency','fx','overhead','fixedCost'].forEach(id=>{byId(id).value=state[id];});
    byId('hoursValue').textContent=state.baseHours+' h';
    byId('t4Value').textContent=formatted(state.t4Factor,1)+'×';
    byId('mixValue').textContent=state.visionShare+'%';
    byId('t4Control').hidden=state.baseGpu!=='t4';
    byId('mixControl').hidden=state.workload!=='multimodal';
    byId('workloadHelp').textContent={vision:'YOLO26n training. Missing GPU results use marked proxies.',transformer:'DistilBERT BF16 training. Missing GPU results use marked proxies.',multimodal:'Weighted scenario based on vision and Transformer profiles; not directly measured.'}[state.workload];
    document.documentElement.dataset.theme=state.theme;
    byId('themeButton').textContent=state.theme==='light'?'Dark theme':'Light theme';
    byId('themeButton').setAttribute('aria-label',state.theme==='light'?'Switch to dark theme':'Switch to light theme');
  }
  function render() {syncControls();const rows=filtered();renderSummary(rows);renderScatter(rows);renderBars(rows);renderTable(rows);renderDetails(rows);renderLocal();}
  function exportFile(filename,content,mime){const url=URL.createObjectURL(new Blob([content],{type:mime}));const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function csvCell(val){return '"'+String(val).replaceAll('"','""')+'"';}
  function exportCsv(){const heads=['GPU','Provider','Tier','VRAM GB','USD/hour','INR/hour','Ratio vs RTX 4090','Evidence','Training hours','Job cost USD','Job cost INR','Source URL'];const records=filtered().map(r=>[r.name,r.provider,r.tier,r.vram,formatted(r.rateUsd,3),formatted(r.rateUsd*state.fx,2),formatted(r.relative,3),r.evidence,formatted(r.hours,3),formatted(r.costUsd,2),formatted(r.costUsd*state.fx,2),sources[r.source]||'User-entered']);exportFile('gpu-cost-comparison.csv',[heads,...records].map(row=>row.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');}
  function exportJson(){exportFile('gpu-cost-comparison.json',JSON.stringify({snapshot:data.snapshot,settings:state,offers:filtered(),sources},null,2),'application/json');}
  function addQuote(event) {
    event.preventDefault();
    const gpu=byId('quoteGpu').value,provider=byId('quoteProvider').value.trim(),rateValue=Number(byId('quoteRate').value),tier=byId('quoteTier').value;
    if(!gpuById.has(gpu)||!provider||!Number.isFinite(rateValue)||rateValue<=0){alert('Enter a GPU, provider and positive hourly price.');return;}
    const id='quote-'+Date.now();
    state.customQuotes.push({id,gpu,provider,tier,rate:rateValue,currency:'USD',custom:true});
    state.selected=id;state.vramMin=Math.min(state.vramMin,gpuById.get(gpu).vram);state.search='';state.tier='all';state.confidence='all';
    byId('search').value='';store();event.target.reset();render();document.querySelector('.table-panel').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function initialize(){
    byId('quoteGpu').innerHTML=data.gpus.filter(g=>!g.reference).map(g=>`<option value="${esc(g.id)}">${esc(g.name)} (${g.vram} GB)</option>`).join('');
    const selects=['workload','baseGpu','vramMin','tier','confidence','currency'];
    for(const id of selects)byId(id).addEventListener('change',e=>{state[id]=id==='vramMin'?Number(e.target.value):e.target.value;store();render();});
    for(const id of ['baseHours','t4Factor','visionShare'])byId(id).addEventListener('input',e=>{state[id]=Number(e.target.value);store();render();});
    for(const id of ['fx','overhead','fixedCost'])byId(id).addEventListener('change',e=>{const value=validNumber(e.target.value,DEFAULT[id]);state[id]=id==='fx'?clamp(value,1,1000):id==='overhead'?clamp(value,0,200):clamp(value,0,100000);store();render();});
    byId('search').addEventListener('input',e=>{state.search=e.target.value;store();const rows=filtered();renderSummary(rows);renderScatter(rows);renderBars(rows);renderTable(rows);renderDetails(rows);});
    all('th button[data-sort]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.sort;state.sortDir=state.sort===key?-state.sortDir:1;state.sort=key;store();render();}));
    byId('mobileFilterToggle').addEventListener('click',()=>{const sidebar=document.querySelector('.sidebar');const expanded=sidebar.classList.toggle('expanded');byId('mobileFilterToggle').setAttribute('aria-expanded',String(expanded));});
    byId('themeButton').addEventListener('click',()=>{state.theme=state.theme==='light'?'dark':'light';store();render();});
    byId('csvButton').addEventListener('click',exportCsv);
    byId('jsonButton').addEventListener('click',exportJson);
    byId('quoteForm').addEventListener('submit',addQuote);
    byId('resetButton').addEventListener('click',()=>{if(!confirm('Reset settings, custom quotes and edited rates saved in this browser?'))return;state={...DEFAULT,rateOverrides:{},customQuotes:[]};byId('search').value='';store();render();});
    byId('search').value=state.search;
    render();
  }
  window.GpuCostExplorer = {evaluate:()=>filtered(),performance:ratioFor,settings:()=>({...state})};
  initialize();
})();
