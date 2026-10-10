(function () {
  'use strict';
  const M = window.HW02Model;
  const $ = id => document.getElementById(id);
  const storageKey = 'hw02-offline-lab-v1';
  const names = {laser: 'A · 激光量块与缺测', quality: 'B · 停车与质量门', curve: 'C · 弯道的三类修正'};
  const questions = {
    laser: '你认为量块高度、图像行号与遮挡后的读数是什么关系？先写下依据。',
    quality: '停车前后的曲线变化可以说明什么？你会用哪些条件判断记录是否可用？',
    curve: '弯道上的位置与高度偏差可能来自哪些环节？你预测逐项修正会改变什么？'
  };
  const quadFields = {knownKnown: 'quad-known-known', knownUnknown: 'quad-known-unknown', implicitKnowledge: 'quad-implicit', unknownUnknown: 'quad-unknown-unknown'};
  const afterQuadFields = {knownKnown: 'after-quad-known-known', knownUnknown: 'after-quad-known-unknown', implicitKnowledge: 'after-quad-implicit', unknownUnknown: 'after-quad-unknown-unknown'};
  const quadLabels = {knownKnown: '① 已知且有依据', knownUnknown: '② 知道自己尚未核验', implicitKnowledge: '③ 有经验但尚未说清', unknownUnknown: '④ 尚未识别的未知'};
  const afterFields = {updatedStatement: 'after-statement', supported: 'after-supported', unsupported: 'after-unsupported', stillUnknown: 'after-unknown', nextTest: 'after-next', boundary: 'after-boundary', confidence: 'after-confidence'};
  const unitsStop = {time_s: 's', v_mps: 'm/s', a_long_mps2: 'm/s²', s_m: 'm', platform_height_mm: 'mm', laser_mm: 'mm', a_vert_mps2: 'm/s²', disturbance_mps2: 'm/s²', estimated_platform_mm: 'mm', reconstructed_height_mm: 'mm', output_height_mm: 'mm', valid: 'boolean', status: 'category'};
  const unitsCurve = {true_s_m: 'm', time_s: 's', true_height_mm: 'mm', raw_path_m: 'm', phi_deg: '°', a_y_mps2: 'm/s²', a_error_mps2: 'm/s²', laser_range_mm: 'mm', beam_error_mm: 'mm', attitude_error_mm: 'mm', observed_height_mm: 'mm', reported_path_m: 'm', mapped_k_m: 'm', actual_k_m: 'm', estimated_height_mm: 'mm', dx_m: 'm', mode: 'category', baseline: 'category'};
  const modeNames = {none: '① 未修正', path: '② 仅路径', attitude: '③ 路径 + 姿态', all: '④ 路径 + 姿态 + 光束'};
  const modeOrder = Object.keys(modeNames);
  const chartSpecs = new Map();
  const now = () => new Date().toISOString();
  const copy = value => JSON.parse(JSON.stringify(value));
  const number = (value, digits = 2) => value === null ? 'null' : Number.isFinite(value) ? value.toFixed(digits).replace(/\.0+$/, '') : '—';
  const text = (id, value) => { $(id).textContent = value; };

  if (!M) {
    text('storage-note', '模型未加载。请把 lab.html、lab.js 与 model.js 保存在同一文件夹，再重新打开。');
    document.querySelectorAll('button,input,select,textarea').forEach(element => { element.disabled = true; });
    return;
  }

  function newRound(caseId, reason = {kind:'initial',label:'首次开启',note:'',at:now()}) {
    return {schema: M.schema, modelVersion: M.modelVersion, case: caseId,
      roundId: `round-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: now(), newRoundReason:copy(reason), prediction: null, records: [], after: null, afterHistory: [], draftPrediction: null, draftAfter: null};
  }
  let state = {current: newRound('laser'), archivedRounds: []};
  let storageAvailable = true;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && saved.current?.schema === M.schema && saved.current.modelVersion === M.modelVersion && names[saved.current.case] && Array.isArray(saved.current.records) && Array.isArray(saved.archivedRounds)) state = saved;
  } catch (_) { storageAvailable = false; }

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      storageAvailable = true;
      text('storage-note', '本设备已保存当前轮次。交付前请导出 JSON，浏览器存储不等于提交。');
    } catch (_) {
      storageAvailable = false;
      text('storage-note', '浏览器存储不可用或已满：本次记录仍在页面内。请及时导出 JSON；关闭页面可能丢失未导出的新记录。');
    }
  }

  function download(value, filename) {
    const blob = new Blob([JSON.stringify(value, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportRound(round, includeArchive, exportKind = 'draft') {
    const payload = copy(round);
    payload.archivedRounds = [];
    payload.completion = M.assessCompletion(round);
    payload.exportKind = exportKind;
    if (exportKind === 'draft') {
      payload.completion.status = 'incomplete';
      payload.completion.missing = [...new Set([...payload.completion.missing,'draft-backup-not-final-submission'])];
    }
    payload.calibration = copy(M.calibration);
    payload.calibrationUnits = {height_mm: 'mm', row_px: 'px'};
    if (includeArchive) payload.archivedRounds = state.archivedRounds.map(old => ({...copy(old),completion:M.assessCompletion(old)}));
    return payload;
  }

  function collectPredictionDraft() {
    return {statement: $('prediction-statement').value.trim(), reason: $('prediction-reason').value.trim(), confidence: $('prediction-confidence').value,
      initial4quadrants: Object.fromEntries(Object.entries(quadFields).map(([key, id]) => [key, $(id).value.trim()]))};
  }

  function collectAfterDraft() {
    return {...Object.fromEntries(Object.entries(afterFields).map(([key, id]) => [key, $(id).value.trim()])),
      updated4quadrants:Object.fromEntries(Object.entries(afterQuadFields).map(([key,id]) => [key,$(id).value.trim()]))};
  }

  function hasWork(round) {
    return round.prediction || round.records.length || round.after || Object.values(round.draftPrediction || {}).some(value => typeof value === 'string' && value.trim()) || Object.values(round.draftPrediction?.initial4quadrants || {}).some(value => value.trim());
  }

  function archiveAndStart(caseId, reason) {
    if (!state.current.prediction) state.current.draftPrediction = collectPredictionDraft();
    else if (state.current.draftAfter || !state.current.after) state.current.draftAfter = collectAfterDraft();
    if (hasWork(state.current)) {
      state.current.archivedAt = now();
      state.current.archiveReason = copy(reason);
      state.archivedRounds.push(copy(state.current));
    }
    state.current = newRound(caseId, reason);
    persist(); renderRound();
    $('prediction-title').scrollIntoView({block: 'start', behavior: 'auto'});
  }

  function readings(id, cells) {
    const box = $(id); box.replaceChildren();
    cells.forEach(([caption, value]) => {
      const cell = document.createElement('div'); cell.className = 'reading';
      const valueNode = document.createElement('span'); valueNode.className = 'value'; valueNode.textContent = value;
      const label = document.createElement('span'); label.className = 'caption'; label.textContent = caption;
      cell.append(valueNode, label); box.appendChild(cell);
    });
  }

  function table(id, caption, columns, rows) {
    const wrap = $(id); wrap.hidden = false; wrap.replaceChildren();
    const element = document.createElement('table');
    const cap = document.createElement('caption'); cap.textContent = caption; element.appendChild(cap);
    const head = document.createElement('thead'), header = document.createElement('tr');
    columns.forEach(column => { const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = column[0]; header.appendChild(cell); });
    head.appendChild(header); element.appendChild(head);
    const body = document.createElement('tbody');
    rows.forEach(row => {
      const line = document.createElement('tr');
      columns.forEach(column => { const cell = document.createElement('td'); cell.textContent = column[1](row); line.appendChild(cell); });
      body.appendChild(line);
    });
    element.appendChild(body); wrap.appendChild(element);
  }

  function chart(id, options) {
    chartSpecs.set(id, options);
    const {title, xLabel, yLabel, series, shade = [], xRange, yRange} = options;
    const wrap = $(id); wrap.hidden = false; wrap.replaceChildren();
    const titleElement = document.createElement('h3'); titleElement.textContent = title; wrap.appendChild(titleElement);
    const legend = document.createElement('div'); legend.className = 'legend';
    series.forEach(item => { const label = document.createElement('span'), swatch = document.createElement('i'); swatch.style.backgroundColor = item.color; label.appendChild(swatch); label.appendChild(document.createTextNode(item.label)); legend.appendChild(label); });
    wrap.appendChild(legend);
    const all = series.flatMap(item => item.points).filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));
    if (!all.length) return;
    let [xmin, xmax] = xRange || [Math.min(...all.map(point => point[0])), Math.max(...all.map(point => point[0]))];
    let [ymin, ymax] = yRange || [Math.min(0, ...all.map(point => point[1])), Math.max(0, ...all.map(point => point[1]))];
    if (xmin === xmax) xmax = xmin + 1;
    if (ymin === ymax) { ymin -= 1; ymax += 1; }
    if (!yRange) { const margin = (ymax - ymin) * .08; ymin -= margin; ymax += margin; }
    // Match mobile SVG coordinates to CSS pixels, so 12 px axis text stays 12 px on screen.
    const padding = getComputedStyle(wrap);
    const measuredContentWidth = wrap.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight);
    const contentWidth = Number.isFinite(measuredContentWidth) && measuredContentWidth > 76 ? measuredContentWidth : 680;
    const compact = contentWidth < 520;
    const width = compact ? contentWidth : 680, height = compact ? 250 : 220;
    const left = compact ? 52 : 58, right = compact ? 24 : 19, top = compact ? 28 : 18, bottom = 45;
    const intervals = compact ? 3 : 4;
    const X = value => left + (value - xmin) / (xmax - xmin) * (width - left - right);
    const Y = value => height - bottom - (value - ymin) / (ymax - ymin) * (height - top - bottom);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.setAttribute('width', width); svg.setAttribute('height', height); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `${title}。横轴 ${xLabel}，纵轴 ${yLabel}。具体读数见表格。`);
    const append = (tag, attrs, value) => { const node = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([key, val]) => node.setAttribute(key, val)); if (value !== undefined) node.textContent = value; svg.appendChild(node); return node; };
    shade.forEach(([start, end]) => append('rect', {x: X(start), y: top, width: X(end) - X(start), height: height - top - bottom, fill: '#e4e9ed'}));
    for (let i = 0; i <= intervals; i += 1) {
      const x = xmin + (xmax - xmin) * i / intervals, y = ymin + (ymax - ymin) * i / intervals;
      append('line', {x1: left, y1: Y(y), x2: width - right, y2: Y(y), stroke: '#dbe4eb', 'stroke-width': 1});
      append('text', {x: left - 8, y: Y(y) + 4, 'text-anchor': 'end', fill: '#315872', 'font-size': 12}, number(y, Math.abs(ymax - ymin) < 1 ? 3 : 1));
      append('text', {x: X(x), y: height - bottom + 19, 'text-anchor': 'middle', fill: '#315872', 'font-size': 12}, number(x, 1));
    }
    append('text', {x: left, y: 12, fill: '#163e69', 'font-size': 12}, yLabel);
    append('text', {x: width - right, y: height - 4, fill: '#163e69', 'font-size': 12, 'text-anchor': 'end'}, xLabel);
    series.forEach(item => {
      let d = '', open = false;
      item.points.forEach(([x, y]) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) { open = false; return; }
        d += `${open ? 'L' : 'M'}${X(x).toFixed(2)},${Y(y).toFixed(2)} `; open = true;
      });
      append('path', {d, fill: 'none', stroke: item.color, 'stroke-width': item.width || 2.2, 'stroke-dasharray': item.dash || '', 'stroke-linejoin': 'round'});
    });
    wrap.appendChild(svg);
  }

  function addRecord(operation, parameters, modelReadings) {
    const record = {recordId: `R${String(state.current.records.length + 1).padStart(2, '0')}`, at: now(), operation, parameters: copy(parameters), readings: copy(modelReadings), modelVersion: M.modelVersion};
    state.current.records.push(record);
    persist(); renderTimeline(); renderArchive();
    text('after-status', state.current.after ? '新增证据已记录；请检查并重新保存更新结论。' : '记录已保存。完成对照后填写更新结论。');
    return record;
  }

  function renderTimeline() {
    const records = state.current.records;
    text('timeline-summary', `本轮操作记录 · ${records.length} 条`);
    const list = $('timeline-list'); list.replaceChildren();
    records.forEach(record => {
      const li = document.createElement('li'), tag = document.createElement('b'), content = document.createElement('span');
      tag.textContent = record.recordId;
      const summary = record.readings.summary || {};
      content.textContent = `${record.operation} · ${Object.entries(summary).filter(([key]) => key !== 'units').map(([key, value]) => `${key}=${value === null ? 'null' : value}`).join('；')}`;
      const meta = document.createElement('span'); meta.className = 'record-meta'; meta.textContent = `${record.at} · 参数 ${JSON.stringify(record.parameters)}`;
      content.appendChild(meta); li.append(tag, content); list.appendChild(li);
    });
  }

  function renderArchive() {
    $('archive').hidden = state.archivedRounds.length === 0;
    text('archive-summary', `此前的实验轮次 · ${state.archivedRounds.length} 轮（保留原文与记录）`);
    const list = $('archive-list'); list.replaceChildren();
    state.archivedRounds.forEach((round, index) => {
      const button = document.createElement('button'); button.type = 'button';
      const complete = M.assessCompletion(round).status === 'complete';
      button.textContent = `${index + 1}. ${names[round.case]} · ${round.records.length} 条 · ${complete?'完整':'未完成'} · 下载 JSON`;
      button.addEventListener('click', () => download(exportRound(round, false, complete?'final':'draft'), `hw02-${complete?'final':'draft'}-${round.case}-${round.roundId}.json`));
      list.appendChild(button);
    });
  }

  function resetEvidence() {
    chartSpecs.clear();
    ['laser-readings', 'quality-readings', 'curve-readings'].forEach(id => $(id).replaceChildren());
    ['laser-table','quality-height','quality-table','quality-count-result','curve-position','curve-table'].forEach(id => { $(id).hidden = true; });
    [['laser-visual','尚未读取。使用上方按钮记录第一次测量。'], ['quality-speed','尚未运行。先选择扰动条件和输出策略。'], ['curve-height','尚未运行。先保留一次未修正记录，再逐项修正。']].forEach(([id, message]) => {
      $(id).replaceChildren(); const p = document.createElement('p'); p.className = 'muted'; p.textContent = message; $(id).appendChild(p);
    });
    $('laser-height').value = '10'; $('laser-stripe').value = 'visible';
    $('quality-disturbance').checked = true; $('quality-policy').value = 'only-stop';
    $('quality-count-invalid').value = '5'; $('quality-count-total').value = '100';
    $('curve-baseline').value = 'curve'; $('curve-mode').value = 'none'; renderCurveOrder();
  }

  function renderRound() {
    const round = state.current, locked = Boolean(round.prediction);
    $('case-select').value = round.case;
    text('case-question', questions[round.case]);
    text('round-status', `本轮 ${round.roundId.slice(6)} · ${locked ? '首次判断已锁定' : '等待首次判断'}`);
    $('prediction-form').hidden = locked; $('locked-summary').hidden = !locked; $('locked-quadrants').hidden = !locked;
    $('experiment-section').hidden = !locked; $('after-section').hidden = !locked;
    ['laser','quality','curve'].forEach(id => { $(`${id}-panel`).hidden = !locked || round.case !== id; });
    const draft = round.prediction || round.draftPrediction || {};
    $('prediction-statement').value = draft.statement || ''; $('prediction-reason').value = draft.reason || ''; $('prediction-confidence').value = draft.confidence ?? '';
    Object.entries(quadFields).forEach(([key, id]) => { $(id).value = draft.initial4quadrants?.[key] || ''; });
    if (locked) {
      text('locked-statement', round.prediction.statement); text('locked-reason', `理由：${round.prediction.reason}`);
      text('locked-confidence', `信心 ${round.prediction.confidence} / 100\n${round.prediction.lockedAt}`);
      const box = $('locked-quad-content'); box.replaceChildren();
      Object.entries(quadLabels).forEach(([key, label]) => { const p = document.createElement('p'); p.className = 'small'; p.textContent = `${label}：${round.prediction.initial4quadrants[key]}`; box.appendChild(p); });
    }
    const after = round.draftAfter || round.after || {};
    Object.entries(afterFields).forEach(([key, id]) => { $(id).value = after[key] ?? ''; });
    Object.entries(afterQuadFields).forEach(([key,id]) => { $(id).value = after.updated4quadrants?.[key] || ''; });
    text('after-status', round.after ? `结论已保存 · ${round.after.savedAt}` : '尚未保存更新结论。');
    resetEvidence(); renderTimeline(); renderArchive();
    const last = [...round.records].reverse().find(record => ['laser-reading','quality-profile','curve-profile'].includes(record.operation));
    if (last) renderRecord(last);
    const count = [...round.records].reverse().find(record => record.operation === 'quality-count');
    if (count) renderCount(count);
    const reference = M.rollReference();
    text('curve-reference', `恒定 φ = 3°、R = 80 m 时，a_y = ${number(reference.a_y_mps2, 1)} m/s²，a_err ≈ ${number(reference.a_error_mps2, 5)} m/s²；从零初值积分 5 s，位移 ≈ ${number(reference.displacement_mm, 1)} mm。`);
  }

  function laserRun(height, stripe, repeats = 1) {
    if (!state.current.prediction) return;
    const heightInput = $('laser-height');
    if (height !== undefined) heightInput.value = String(height);
    if (stripe !== undefined) $('laser-stripe').value = stripe;
    if (!heightInput.reportValidity()) return;
    const value = Number(heightInput.value), condition = $('laser-stripe').value;
    if (heightInput.value.trim() === '') { heightInput.setCustomValidity('请填写量块高度。'); heightInput.reportValidity(); heightInput.setCustomValidity(''); return; }
    for (let i = 0; i < repeats; i += 1) {
      const measured = M.laser({height_mm: value, stripe: condition});
      const record = addRecord('laser-reading', {height_mm: value, stripe: condition, repeat_index: i + 1, repeat_total: repeats, units: {height_mm: 'mm', stripe: 'category', repeat_index: 'count', repeat_total: 'count'}},
        {...measured, units: {row_px: 'px', height_mm: 'mm', status: 'category'}, summary: {row_px: measured.row_px, height_mm: measured.height_mm, status: measured.status}});
      renderLaser(record);
    }
  }

  function renderLaser(record) {
    const result = record.readings;
    $('laser-height').value = record.parameters.height_mm; $('laser-stripe').value = record.parameters.stripe;
    readings('laser-readings', [['图像行号 r / px', number(result.row_px, 2)], ['反算高度 h / mm', number(result.height_mm, 2)], ['记录质量', result.status === 'missing' ? '缺测' : '有效']]);
    const visual = $('laser-visual'); visual.replaceChildren();
    const title = document.createElement('h3'); title.textContent = `${record.recordId} · ${record.parameters.height_mm} mm / ${record.parameters.stripe === 'visible' ? '可见' : '遮挡'}`;
    const scene = document.createElement('div'); scene.className = 'laser-scene';
    const camera = document.createElement('div'); camera.className = 'laser-camera'; camera.setAttribute('role','img'); camera.setAttribute('aria-label', result.row_px === null ? '遮挡，无条纹行号' : `示意条纹行号 ${result.row_px} px；行号向下增加`);
    const label = document.createElement('span'); label.className = 'camera-label'; label.textContent = '图像示意：行号向下增加 ↓'; camera.appendChild(label);
    if (result.row_px === null) { const missing = document.createElement('span'); missing.className = 'missing-label'; missing.textContent = '无可用条纹 · null'; camera.appendChild(missing); }
    else { const stripe = document.createElement('span'); stripe.className = 'stripe'; stripe.style.top = `${38 + (result.row_px - 180) * 2.8}px`; camera.appendChild(stripe); }
    const block = document.createElement('div'); block.className = 'laser-block'; const strong = document.createElement('strong'); strong.textContent = `${number(record.parameters.height_mm, 1)} mm`; block.append(strong, document.createTextNode('输入量块高度（教学已知）'));
    scene.append(camera, block); visual.append(title, scene);
    const rows = state.current.records.filter(item => item.operation === 'laser-reading');
    table('laser-table', '本轮激光读数 · 依执行顺序；完整参数随 JSON 导出', [['记录', row => row.recordId], ['量块 / mm', row => number(row.parameters.height_mm)], ['条纹', row => row.parameters.stripe === 'visible' ? '可见' : '遮挡'], ['行号 / px', row => number(row.readings.row_px)], ['反算 / mm', row => number(row.readings.height_mm)], ['质量', row => row.readings.status]], rows);
  }

  function qualityRun() {
    if (!state.current.prediction) return;
    const disturbance = $('quality-disturbance').checked, policy = $('quality-policy').value;
    const data = M.stopSeries({disturbance}).map(row => ({...row, output_height_mm: M.applyPolicy(row, policy)}));
    const invalidRecords = data.filter(row => !row.valid).length;
    const retainedInvalid = data.filter(row => !row.valid && row.output_height_mm !== null).length;
    const record = addRecord('quality-profile', {disturbance, policy, duration_s: 18, display_dt_s: .1, integration_dt_s: .005, quality_speed_min_mps: 3, quality_speed_max_mps: 10, quality_acceleration_max_mps2: 2, initial_platform_velocity_mps: .012, laser_reference_mm: 300,
      units: {disturbance: 'boolean', policy: 'category', duration_s: 's', display_dt_s: 's', integration_dt_s: 's', quality_speed_min_mps: 'm/s', quality_speed_max_mps: 'm/s', quality_acceleration_max_mps2: 'm/s²', initial_platform_velocity_mps: 'm/s', laser_reference_mm: 'mm'}},
      {data, units: unitsStop, summary: {display_samples: data.length, invalid_samples: invalidRecords, retained_invalid_samples: retainedInvalid, endpoint_s_m: data.at(-1).s_m}, summaryUnits: {display_samples: 'count', invalid_samples: 'count', retained_invalid_samples: 'count', endpoint_s_m: 'm'}});
    renderQuality(record);
  }

  function renderQuality(record) {
    const data = record.readings.data, summary = record.readings.summary;
    $('quality-disturbance').checked = record.parameters.disturbance; $('quality-policy').value = record.parameters.policy;
    readings('quality-readings', [['终点实际里程 / m', number(summary.endpoint_s_m)], ['无效显示样本 / 个', String(summary.invalid_samples)], ['策略保留无效样本 / 个', String(summary.retained_invalid_samples)]]);
    const shade = [[6, 12]];
    chart('quality-speed', {title: `${record.recordId} · 运动质量独立于竖向扰动`, xLabel: '时间 t / s', yLabel: 'v / m·s⁻¹；a_long / m·s⁻²', shade, xRange: [0,18], yRange: [-5,10], series: [{label: '速度 v', color: '#163e69', points: data.map(row => [row.time_s,row.v_mps])}, {label: '纵向加速度 a_long', color: '#915500', points: data.map(row => [row.time_s,row.a_long_mps2])}]});
    const previous = [...state.current.records].reverse().find(item => item.operation === 'quality-profile' && item.recordId !== record.recordId);
    const series = [{label: '原始重建（未筛选）', color: '#879fac', dash: '5 4', points: data.map(row => [row.time_s,row.reconstructed_height_mm])}, {label: '当前策略输出', color: '#a33737', width: 2.8, points: data.map(row => [row.time_s,row.output_height_mm])}, {label: '给定平路真值', color: '#08796f', points: [[0,0],[18,0]]}];
    if (previous) series.unshift({label: `对照 ${previous.recordId} 输出`, color: '#163e69', dash: '3 3', points: previous.readings.data.map(row => [row.time_s,row.output_height_mm])});
    chart('quality-height', {title: `重建与缺口 · 扰动${record.parameters.disturbance ? '开' : '关'} / ${$('quality-policy').selectedOptions[0].textContent}`, xLabel: '时间 t / s', yLabel: '高度 h / mm', shade, xRange: [0,18], series});
    const times = [0,5.9,6,7,8,9,10,11,12,18];
    const rows = times.map(time => data.find(row => Math.abs(row.time_s - time) < 1e-8));
    table('quality-table', '关键时刻 · 停车时重复 s；null 缺口不会被连线', [['t / s', row => number(row.time_s,1)], ['v / m/s', row => number(row.v_mps)], ['a_long / m/s²', row => number(row.a_long_mps2)], ['s / m', row => number(row.s_m)], ['laser / mm', row => number(row.laser_mm,3)], ['a_vert / m/s²', row => number(row.a_vert_mps2,5)], ['重建 / mm', row => number(row.reconstructed_height_mm,3)], ['输出 / mm', row => number(row.output_height_mm,3)], ['状态', row => row.status]], rows);
  }

  function countRun() {
    const input = $('quality-count-invalid');
    if (!state.current.prediction || !input.reportValidity()) return;
    if (!input.value.trim()) { input.setCustomValidity('请填写无效记录数。'); input.reportValidity(); input.setCustomValidity(''); return; }
    const invalid = Number(input.value), total = $('quality-count-total').value === 'unknown' ? null : 100;
    const result = M.qualityCount({invalid,total});
    const record = addRecord('quality-count', {invalid,total,denominator_basis: 'independent equal-weight records', units: {invalid: 'count', total: 'count', denominator_basis: 'description'}}, {...result, units: {ratio: 'dimensionless', status: 'category', criterion: 'percent threshold'}, summary: {invalid,total,ratio:result.ratio,status:result.status}});
    renderCount(record);
  }

  function renderCount(record) {
    $('quality-count-invalid').value = record.parameters.invalid; $('quality-count-total').value = record.parameters.total === null ? 'unknown' : '100';
    $('quality-count-result').hidden = false;
    const result = record.readings, label = {valid:'通过该计数门禁',invalid:'该计数门禁判无效',insufficient:'资料不足（insufficient）'}[result.status];
    text('quality-count-result', `${record.recordId} · ${result.ratio === null ? '比例 null' : `${record.parameters.invalid}/${record.parameters.total} = ${number(result.ratio * 100,1)}%`} → ${label}`);
  }

  function renderCurveOrder() {
    const box = $('curve-order'); box.replaceChildren();
    modeOrder.forEach(mode => { const span = document.createElement('span'); span.textContent = modeNames[mode]; if (mode === $('curve-mode').value) span.className = 'active'; box.appendChild(span); });
    $('curve-next').disabled = $('curve-mode').value === 'all';
  }

  function curveRun() {
    if (!state.current.prediction) return;
    const baseline = $('curve-baseline').value, mode = $('curve-mode').value;
    const data = M.curveSeries({baseline,mode}), peak = data.find(row => row.true_s_m === 64.9), bin = M.stationBin(peak.mapped_k_m);
    const record = addRecord('curve-profile', {baseline,mode,speed_mps:8,radius_m:baseline === 'curve'?80:null,radius_description:baseline === 'curve'?'80 m':'Infinity (straight)',outside_wheel_offset_m:2.4,max_phi_deg:baseline === 'curve'?3:0,phi_envelope:'3 sin²(πs/110) degrees on curve; 0 on straight',gravity_mps2:9.81,beam_reference_mm:300,dx_m:.1,dt_s:.0125,anchors:[{s_m:0,k_m:1000},{s_m:110,k_m:1100}],
      units: {baseline:'category',mode:'category',speed_mps:'m/s',radius_m:'m (null denotes Infinity)',radius_description:'description',outside_wheel_offset_m:'m',max_phi_deg:'°',phi_envelope:'description',gravity_mps2:'m/s²',beam_reference_mm:'mm',dx_m:'m',dt_s:'s',anchors:'s_m and k_m in m'}},
      {data, units:unitsCurve, referenceConstant5s:{...M.rollReference(),units:{a_y_mps2:'m/s²',a_error_mps2:'m/s²',displacement_mm:'mm'}}, summary:{reference_true_s_m:64.9,reference_reported_path_m:peak.reported_path_m,reference_mapped_k_m:peak.mapped_k_m,reference_height_mm:peak.estimated_height_mm,reference_bin:bin?`[${bin.start_m},${bin.end_m})`:'null',endpoint_attitude_error_mm:data.at(-1).attitude_error_mm},summaryUnits:{reference_true_s_m:'m',reference_reported_path_m:'m',reference_mapped_k_m:'m',reference_height_mm:'mm',reference_bin:'m, left-closed right-open',endpoint_attitude_error_mm:'mm'}});
    renderCurve(record);
  }

  function renderCurve(record) {
    const data = record.readings.data, summary = record.readings.summary;
    $('curve-baseline').value = record.parameters.baseline; $('curve-mode').value = record.parameters.mode; renderCurveOrder();
    readings('curve-readings', [['参考凸起映射 K / m', number(summary.reference_mapped_k_m,3)], ['在 s=64.9 的高度 / mm', number(summary.reference_height_mm,3)], ['参考凸起所在区间 / m', summary.reference_bin]]);
    const previous = [...state.current.records].reverse().find(item => item.operation === 'curve-profile' && item.recordId !== record.recordId);
    const series = [{label:'当前高度估计',color:'#a33737',points:data.map(row=>[row.true_s_m,row.estimated_height_mm])},{label:'给定参考真值',color:'#08796f',points:data.map(row=>[row.true_s_m,row.true_height_mm])}];
    if (previous) series.unshift({label:`对照 ${previous.recordId} 高度`,color:'#163e69',dash:'4 4',points:previous.readings.data.map(row=>[row.true_s_m,row.estimated_height_mm])});
    chart('curve-height',{title:`${record.recordId} · ${modeNames[record.parameters.mode]}（高度按实际 s 对照）`,xLabel:'实际中心线路径 true_s / m',yLabel:'高度 h / mm',xRange:[0,110],series});
    const peakIndex = data.findIndex(row=>row.true_s_m===64.9), peak = data[peakIndex], noneK=M.mapStation(peak.raw_path_m);
    chart('curve-position',{title:'只改路径时改变位置，未改高度',xLabel:'桩号 K / m',yLabel:'给定参考凸起 / mm',xRange:[1047,1073],series:[{label:'按本次路径映射',color:'#163e69',points:data.filter(row=>row.true_s_m>=55&&row.true_s_m<=78).map(row=>[row.mapped_k_m,row.true_height_mm])},{label:'按实际中心线映射',color:'#08796f',dash:'4 3',points:data.filter(row=>row.true_s_m>=55&&row.true_s_m<=78).map(row=>[row.actual_k_m,row.true_height_mm])}]});
    const rows = [0,55,64.9,110].map(s=>data.find(row=>row.true_s_m===s));
    table('curve-table', `固定物理位置的读数 · 参考凸起未校路径 K=${number(noneK,3)}；实际 K=1059。表格不重新采样。`, [['true_s / m',row=>number(row.true_s_m,1)], ['reported_path / m',row=>number(row.reported_path_m,3)], ['mapped K / m',row=>number(row.mapped_k_m,3)], ['实际 K / m',row=>number(row.actual_k_m,3)], ['φ / °',row=>number(row.phi_deg,3)], ['姿态误差 / mm',row=>number(row.attitude_error_mm,3)], ['光束误差 / mm',row=>number(row.beam_error_mm,3)], ['观测 / mm',row=>number(row.observed_height_mm,3)], ['估计 / mm',row=>number(row.estimated_height_mm,3)]],rows);
  }

  function renderRecord(record) {
    if (record.operation === 'laser-reading') renderLaser(record);
    if (record.operation === 'quality-profile') renderQuality(record);
    if (record.operation === 'curve-profile') renderCurve(record);
  }

  $('prediction-form').addEventListener('submit', event => {
    event.preventDefault();
    const draft = collectPredictionDraft();
    if (![draft.statement,draft.reason,...Object.values(draft.initial4quadrants)].every(value => value.length > 0)) {
      text('storage-note', '首次主张、理由与四象限请各写一项；可保留“仍未知”。'); return;
    }
    state.current.prediction = {...draft,confidence:Number(draft.confidence),lockedAt:now()};
    state.current.draftPrediction = null;
    persist(); renderRound(); $('experiment-title').scrollIntoView({block:'start',behavior:'auto'});
  });
  $('prediction-form').addEventListener('input', () => { if (!state.current.prediction) { state.current.draftPrediction=collectPredictionDraft(); persist(); } });
  $('after-form').addEventListener('input', () => { state.current.draftAfter=collectAfterDraft(); persist(); text('after-status','草稿已保留；请点击保存更新结论。'); });
  $('after-form').addEventListener('submit', event => {
    event.preventDefault();
    const profileRecords = state.current.records.filter(record=>['laser-reading','quality-profile','curve-profile'].includes(record.operation));
    const distinct = new Set(profileRecords.map(record=>{
      const params=copy(record.parameters); delete params.repeat_index; delete params.repeat_total; return JSON.stringify(params);
    }));
    if (distinct.size < 2) { text('after-status','需要至少两个参数不同的实际实验记录。重复相同条件和独立计数算例不能替代对照。'); return; }
    const draft=collectAfterDraft();
    if (!Object.entries(draft).filter(([key])=>!['confidence','updated4quadrants'].includes(key)).every(([,value])=>value.length>0) || !Object.values(draft.updated4quadrants).every(value=>value.length>0)) { text('after-status','请填写各项更新结论与更新四象限；可写“仍未知”或“暂无”。'); return; }
    if (state.current.after) { state.current.afterHistory ||= []; state.current.afterHistory.push(copy(state.current.after)); }
    state.current.after={originalStatement:state.current.prediction.statement,...draft,confidence:Number(draft.confidence),savedAt:now(),recordIds:state.current.records.map(record=>record.recordId)};
    state.current.draftAfter=null; persist(); text('after-status',`结论已保存 · ${state.current.after.savedAt}`);
  });
  $('export-json').addEventListener('click',()=>{
    if (!state.current.after) { text('after-status','请先保存更新结论，再导出完整记录。'); return; }
    if (state.current.draftAfter || state.current.after.recordIds?.length !== state.current.records.length) { text('after-status','有新增证据或未保存的结论修改，请先重新保存更新结论。'); return; }
    if (M.assessCompletion(state.current).status!=='complete') { text('after-status','请补齐更新四象限并保存结论，完整导出需要两个不同条件的实际实验记录。'); return; }
    download(exportRound(state.current,true,'final'),`hw02-final-${state.current.case}-${state.current.roundId}.json`);
    text('after-status','JSON 已生成；请按作业说明提交，并保留两张对照截图。');
  });
  $('export-draft').addEventListener('click',()=>{
    if (!state.current.prediction) state.current.draftPrediction=collectPredictionDraft();
    else if (!state.current.after || state.current.draftAfter) state.current.draftAfter=collectAfterDraft();
    persist();
    download(exportRound(state.current,true,'draft'),`hw02-draft-${state.current.case}-${state.current.roundId}.json`);
    text('storage-note','草稿 JSON 已生成，completion=incomplete；它是备份，不是完整提交。');
  });
  let pendingCase = null;
  function beginNewRound(caseId) {
    pendingCase=caseId; $('round-form').reset();
    $('new-round-note').required=false; $('new-round-note').setCustomValidity('');
    text('round-dialog-target',`下一轮：${names[caseId]}。当前轮将原样保留。`);
    $('round-dialog').showModal();
  }
  function cancelNewRound() { $('case-select').value=state.current.case; pendingCase=null; $('round-dialog').close(); }
  $('case-select').addEventListener('change',()=>beginNewRound($('case-select').value));
  $('new-round').addEventListener('click',()=>beginNewRound(state.current.case));
  $('cancel-round').addEventListener('click',cancelNewRound);
  $('round-dialog').addEventListener('cancel',()=>{ $('case-select').value=state.current.case; pendingCase=null; });
  $('new-round-reason').addEventListener('change',()=>{ $('new-round-note').required=$('new-round-reason').value==='other'; $('new-round-note').setCustomValidity(''); });
  $('new-round-note').addEventListener('input',()=>{$('new-round-note').setCustomValidity('');});
  $('round-form').addEventListener('submit',event=>{
    event.preventDefault();
    const kind=$('new-round-reason').value, note=$('new-round-note').value.trim();
    if(kind==='other'&&!note){$('new-round-note').setCustomValidity('请用一句话说明开启原因。');$('new-round-note').reportValidity();return;}
    if(!kind||!pendingCase)return;
    const reason={kind,label:$('new-round-reason').selectedOptions[0].textContent,note,at:now()}, caseId=pendingCase;
    $('round-dialog').close(); pendingCase=null; archiveAndStart(caseId,reason);
  });
  $('laser-height').addEventListener('input',()=>{$('laser-height').setCustomValidity('');});
  $('laser-run').addEventListener('click',()=>laserRun());
  $('laser-zero').addEventListener('click',()=>laserRun(0,'visible'));
  $('laser-ten').addEventListener('click',()=>laserRun(10,'visible'));
  $('laser-twenty').addEventListener('click',()=>laserRun(20,'visible'));
  $('laser-repeat').addEventListener('click',()=>laserRun(10,'visible',3));
  $('laser-occlude').addEventListener('click',()=>laserRun(10,'occluded'));
  $('quality-run').addEventListener('click',qualityRun);
  $('quality-count-run').addEventListener('click',countRun);
  $('curve-mode').addEventListener('change',renderCurveOrder);
  $('curve-run').addEventListener('click',curveRun);
  $('curve-next').addEventListener('click',()=>{
    const mode=$('curve-mode').value, last=[...state.current.records].reverse().find(record=>record.operation==='curve-profile');
    if (!last || last.parameters.mode!==mode || last.parameters.baseline!==$('curve-baseline').value) curveRun();
    const index=modeOrder.indexOf(mode); if(index<3){$('curve-mode').value=modeOrder[index+1];curveRun();}
  });
  let chartResizeFrame = 0;
  window.addEventListener('resize',()=>{
    if (chartResizeFrame) cancelAnimationFrame(chartResizeFrame);
    chartResizeFrame=requestAnimationFrame(()=>{
      chartResizeFrame=0;
      chartSpecs.forEach((options,id)=>{ if($(id).offsetWidth) chart(id,options); });
    });
  });
  renderRound();
  if (storageAvailable) persist();
  else text('storage-note','浏览器存储不可用：本次记录仍可导出。关闭页面前请保存 JSON。');
})();
