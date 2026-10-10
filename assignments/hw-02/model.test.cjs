'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('./model.js');
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

test('calibration row decreases as height rises; absent stripe is missing, never zero', () => {
  assert.deepEqual(M.calibration, [{height_mm: 0, row_px: 220}, {height_mm: 10, row_px: 200}, {height_mm: 20, row_px: 180}]);
  for (const [height, row] of [[0, 220], [10, 200], [20, 180], [7.25, 205.5]]) {
    const reading = M.laser({height_mm: height, stripe: 'visible'});
    close(reading.row_px, row);
    close(reading.height_mm, height);
    assert.equal(reading.status, 'valid');
  }
  assert.deepEqual(M.laser({height_mm: 10, stripe: 'occluded'}), {row_px: null, height_mm: null, status: 'missing'});
  assert.deepEqual(Array.from({length: 3}, () => M.laser({height_mm: 10})), Array(3).fill({row_px: 200, height_mm: 10, status: 'valid'}));
  assert.throws(() => M.laser({height_mm: 21}), RangeError);
});

test('stop trajectory has known transitions, distance plateau, and acceleration gate while moving', () => {
  const expected = [[0,8,0,0], [6,8,-4,48], [7,4,-4,54], [8,0,0,56], [9,0,0,56], [10,0,4,56], [11,4,4,58], [12,8,0,64], [18,8,0,112]];
  for (const [time, speed, acceleration, distance] of expected) {
    const row = M.motionAt(time);
    close(row.v_mps, speed); close(row.a_long_mps2, acceleration); close(row.s_m, distance);
  }
  assert.equal(M.motionAt(7).valid, false);
  assert.equal(M.motionAt(11).valid, false);
  assert.equal(M.motionAt(5).valid, true);
  assert.equal(M.motionAt(12).valid, true);
  assert.throws(() => M.motionAt(-1), RangeError);
});

test('vertical disturbance changes reconstruction without changing motion, laser, or quality', () => {
  const off = M.stopSeries({disturbance: false});
  const on = M.stopSeries({disturbance: true});
  assert.equal(off.length, 181);
  close(off[1].time_s - off[0].time_s, .1);
  off.forEach((row, index) => {
    const other = on[index];
    for (const key of ['time_s','v_mps','a_long_mps2','s_m','laser_mm','valid','status']) assert.equal(row[key], other[key]);
  });
  assert.ok(off.every(row => Math.abs(row.reconstructed_height_mm) < .01));
  assert.ok(Math.abs(on[90].reconstructed_height_mm - off[90].reconstructed_height_mm) > 15);
  assert.ok(on.some((row, index) => row.a_vert_mps2 !== off[index].a_vert_mps2));
});

test('quality policies preserve null versus zero and only-stop retains moving invalid records', () => {
  const rows = M.stopSeries({disturbance: true});
  const at7 = rows.find(row => row.time_s === 7);
  assert.equal(M.applyPolicy(at7, 'correct'), null);
  assert.equal(M.applyPolicy(at7, 'zero'), 0);
  assert.equal(M.applyPolicy(at7, 'only-stop'), at7.reconstructed_height_mm);
  const stopped = rows.find(row => row.time_s === 9);
  assert.equal(M.applyPolicy(stopped, 'only-stop'), null);
  assert.equal(M.applyPolicy(rows[0], 'correct'), rows[0].reconstructed_height_mm);
  assert.throws(() => M.applyPolicy(rows[0], 'unknown'), RangeError);
});

test('separate equal-weight count example uses greater-than five percent and needs denominator', () => {
  assert.deepEqual(M.qualityCount({invalid: 5, total: 100}), {ratio: .05, status: 'valid', criterion: '> 5%'});
  assert.deepEqual(M.qualityCount({invalid: 6, total: 100}), {ratio: .06, status: 'invalid', criterion: '> 5%'});
  assert.equal(M.qualityCount({invalid: 5, total: null}).status, 'insufficient');
  assert.equal(M.qualityCount({invalid: 101, total: 100}).status, 'insufficient');
});

test('constant roll reference is independently about 355 mm after five seconds', () => {
  const result = M.rollReference({speed_mps: 8, radius_m: 80, phi_deg: 3, duration_s: 5});
  close(result.a_y_mps2, .8);
  const independent = 9.81 * (Math.cos(Math.PI / 60) - 1) + .8 * Math.sin(Math.PI / 60);
  close(result.a_error_mps2, independent);
  close(result.displacement_mm, independent * 12.5 * 1000);
  assert.ok(result.displacement_mm > 355 && result.displacement_mm < 356);
});

test('curve corrections alter one channel at each step and subtract explicit error terms', () => {
  const none = M.curveSeries({mode: 'none'});
  const path = M.curveSeries({mode: 'path'});
  const attitude = M.curveSeries({mode: 'attitude'});
  const all = M.curveSeries({mode: 'all'});
  assert.equal(none.length, 1101);
  none.forEach((row, index) => {
    assert.equal(row.true_s_m, path[index].true_s_m);
    assert.equal(row.estimated_height_mm, path[index].estimated_height_mm);
    assert.equal(path[index].reported_path_m, row.true_s_m);
    assert.equal(attitude[index].reported_path_m, path[index].reported_path_m);
    close(attitude[index].estimated_height_mm, row.observed_height_mm - row.attitude_error_mm, 1e-8);
    close(all[index].estimated_height_mm, row.observed_height_mm - row.attitude_error_mm - row.beam_error_mm, 1e-8);
    close(all[index].estimated_height_mm, row.true_height_mm, 1e-8);
  });
  const peak = all.find(row => row.true_s_m === 64.9);
  close(peak.true_height_mm, 10);
  const phi = peak.phi_deg * Math.PI / 180;
  close(peak.laser_range_mm, 290 / Math.cos(phi));
  close(peak.beam_error_mm, -290 * (1 / Math.cos(phi) - 1));
  assert.ok(peak.beam_error_mm < 0, 'tilted range is longer, so uncompensated height is too low');
  close(peak.observed_height_mm, peak.attitude_error_mm - (peak.laser_range_mm - 300));
  close(peak.estimated_height_mm, 300 - peak.laser_range_mm * Math.cos(phi));
  close(peak.mapped_k_m, 1059);
  assert.deepEqual(M.stationBin(peak.mapped_k_m), {start_m: 1050, end_m: 1060});
  assert.deepEqual(M.stationBin(none.find(row => row.true_s_m === 64.9).mapped_k_m), {start_m: 1060, end_m: 1070});
  assert.ok(none.at(-1).attitude_error_mm !== M.rollReference().displacement_mm);
});

test('straight baseline has no curve errors; mapping is left-closed, right-open', () => {
  const straight = M.curveSeries({baseline: 'straight', mode: 'none'});
  assert.ok(straight.every(row => row.reported_path_m === row.true_s_m && row.attitude_error_mm === 0 && row.beam_error_mm === 0));
  close(M.mapStation(0), 1000); close(M.mapStation(110), 1100); close(M.mapStation(55), 1050);
  assert.deepEqual(M.stationBin(1050), {start_m: 1050, end_m: 1060});
  assert.deepEqual(M.stationBin(1060), {start_m: 1060, end_m: 1070});
  assert.equal(M.mapStation(-.1), null);
  assert.equal(M.mapStation(110.1), null);
  assert.equal(M.stationBin(null), null);
});

test('completion keeps draft export honest and requires distinct experiments plus updated quadrants', () => {
  const quads = {knownKnown:'仍未知',knownUnknown:'待检验',implicitKnowledge:'暂无',unknownUnknown:'仍未知'};
  const prediction = {statement:'遮挡需要检验',reason:'同高度对照',confidence:40,initial4quadrants:quads,lockedAt:'2026-10-10T00:00:00Z'};
  const round = {case:'laser',prediction,records:[{recordId:'R01',operation:'laser-reading',parameters:{height_mm:10,stripe:'visible'}}],after:null};
  assert.equal(M.assessCompletion(round).status,'incomplete');
  round.records.push({recordId:'R02',operation:'laser-reading',parameters:{height_mm:10,stripe:'visible',repeat_index:2}});
  assert.ok(M.assessCompletion(round).missing.includes('distinct-experiment-comparison'));
  round.records[1].parameters.stripe='occluded';
  round.after={originalStatement:prediction.statement,updatedStatement:'保留缺测',supported:'R01、R02',unsupported:'暂无',stillUnknown:'精度',nextTest:'真实仪器',boundary:'合成教学',confidence:60,savedAt:'2026-10-10T00:01:00Z',recordIds:['R01','R02']};
  assert.ok(M.assessCompletion(round).missing.includes('updated-four-quadrants'));
  round.after.updated4quadrants=quads;
  assert.deepEqual(M.assessCompletion(round),{status:'complete',missing:[]});
  round.draftAfter={updatedStatement:'尚未保存'};
  assert.equal(M.assessCompletion(round).status,'incomplete');
  delete round.draftAfter;
  round.records.push({recordId:'R03',operation:'laser-reading',parameters:{height_mm:20,stripe:'visible'}});
  assert.ok(M.assessCompletion(round).missing.includes('after-does-not-cover-latest-records'));
});
