/* Original deterministic teaching models. All data are synthetic; no standard IRI solver is included. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HW02Model = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const schema = 'hw02-record-v1';
  const modelVersion = 'v1';
  const calibration = Object.freeze([
    Object.freeze({height_mm: 0, row_px: 220}),
    Object.freeze({height_mm: 10, row_px: 200}),
    Object.freeze({height_mm: 20, row_px: 180})
  ]);
  const finite = Number.isFinite;

  function laser({height_mm = 10, stripe = 'visible'} = {}) {
    if (!finite(height_mm) || height_mm < 0 || height_mm > 20) throw new RangeError('height_mm must be in [0, 20]');
    if (!['visible', 'occluded'].includes(stripe)) throw new RangeError('stripe must be visible or occluded');
    if (stripe === 'occluded') return {row_px: null, height_mm: null, status: 'missing'};
    const row_px = 220 - 2 * height_mm;
    return {row_px, height_mm: (220 - row_px) / 2, status: 'valid'};
  }

  function motionAt(time_s) {
    if (!finite(time_s) || time_s < 0 || time_s > 18) throw new RangeError('time_s must be in [0, 18]');
    let v_mps, a_long_mps2, s_m;
    if (time_s < 6) { v_mps = 8; a_long_mps2 = 0; s_m = 8 * time_s; }
    else if (time_s < 8) { const d = time_s - 6; v_mps = 8 - 4 * d; a_long_mps2 = -4; s_m = 48 + 8 * d - 2 * d * d; }
    else if (time_s < 10) { v_mps = 0; a_long_mps2 = 0; s_m = 56; }
    else if (time_s < 12) { const d = time_s - 10; v_mps = 4 * d; a_long_mps2 = 4; s_m = 56 + 2 * d * d; }
    else { v_mps = 8; a_long_mps2 = 0; s_m = 64 + 8 * (time_s - 12); }
    const valid = v_mps >= 3 && v_mps <= 10 && Math.abs(a_long_mps2) <= 2;
    return {time_s, v_mps, a_long_mps2, s_m, valid, status: valid ? 'valid' : 'invalid'};
  }

  function integrate(times, acceleration, initialVelocity = 0) {
    if (!Array.isArray(times) || !Array.isArray(acceleration) || times.length !== acceleration.length || !times.length || !finite(initialVelocity)) throw new RangeError('aligned nonempty arrays required');
    if (!times.every(finite) || !acceleration.every(finite)) throw new RangeError('finite samples required');
    let velocity = initialVelocity, position = 0;
    const positions = [position];
    for (let i = 1; i < times.length; i += 1) {
      const dt = times[i] - times[i - 1];
      if (!(dt > 0)) throw new RangeError('time must increase');
      const nextVelocity = velocity + (acceleration[i - 1] + acceleration[i]) * dt / 2;
      position += (velocity + nextVelocity) * dt / 2;
      velocity = nextVelocity;
      positions.push(position);
    }
    return positions;
  }

  function stopSeries({disturbance = true} = {}) {
    if (typeof disturbance !== 'boolean') throw new RangeError('disturbance must be boolean');
    // Integrate at 0.005 s, then show/export at 0.1 s. Base platform motion is 6 sin(2t) mm.
    const dt = .005;
    const dense = Array.from({length: 3601}, (_, i) => {
      const time_s = i * dt;
      const platform_height_mm = 6 * Math.sin(2 * time_s);
      const baseAcceleration = -.024 * Math.sin(2 * time_s);
      const decelPulse = time_s > 6 && time_s < 8 ? .03 * Math.sin(Math.PI * (time_s - 6)) : 0;
      const restartPulse = time_s > 10 && time_s < 12 ? .02 * Math.sin(Math.PI * (time_s - 10)) : 0;
      const disturbance_mps2 = disturbance ? decelPulse + restartPulse : 0;
      return {...motionAt(time_s), platform_height_mm, laser_mm: 300 + platform_height_mm,
        a_vert_mps2: baseAcceleration + disturbance_mps2, disturbance_mps2};
    });
    const displacement = integrate(dense.map(row => row.time_s), dense.map(row => row.a_vert_mps2), .012);
    return dense.filter((_, i) => i % 20 === 0).map((row, i) => {
      const estimated_platform_mm = displacement[i * 20] * 1000;
      return {...row, estimated_platform_mm, reconstructed_height_mm: estimated_platform_mm - (row.laser_mm - 300)};
    });
  }

  function applyPolicy(row, policy) {
    if (!['correct', 'zero', 'only-stop'].includes(policy)) throw new RangeError('unknown quality policy');
    if (policy === 'correct') return row.valid ? row.reconstructed_height_mm : null;
    if (policy === 'zero') return row.valid ? row.reconstructed_height_mm : 0;
    return row.v_mps === 0 ? null : row.reconstructed_height_mm;
  }

  function qualityCount({invalid, total} = {}) {
    if (!Number.isSafeInteger(total) || total <= 0 || !Number.isSafeInteger(invalid) || invalid < 0 || invalid > total) {
      return {ratio: null, status: 'insufficient', criterion: '> 5%'};
    }
    const ratio = invalid / total;
    return {ratio, status: ratio > .05 ? 'invalid' : 'valid', criterion: '> 5%'};
  }

  function rollReference({speed_mps = 8, radius_m = 80, phi_deg = 3, duration_s = 5} = {}) {
    if (![speed_mps, phi_deg, duration_s].every(finite) || speed_mps < 0 || duration_s < 0 || !(radius_m > 0) || (!finite(radius_m) && radius_m !== Infinity) || Math.abs(phi_deg) >= 90) throw new RangeError('finite physical parameters required');
    const phi = phi_deg * Math.PI / 180;
    const a_y_mps2 = speed_mps * speed_mps / radius_m;
    const a_error_mps2 = 9.81 * (Math.cos(phi) - 1) + a_y_mps2 * Math.sin(phi);
    return {a_y_mps2, a_error_mps2, displacement_mm: .5 * a_error_mps2 * duration_s * duration_s * 1000};
  }

  function mapStation(s_m) {
    if (!finite(s_m) || s_m < 0 || s_m > 110) return null;
    return 1000 + 100 * s_m / 110;
  }

  function stationBin(k_m) {
    if (!finite(k_m)) return null;
    const start_m = Math.floor(k_m / 10) * 10;
    return {start_m, end_m: start_m + 10};
  }

  function curveSeries({mode = 'none', baseline = 'curve'} = {}) {
    if (!['none', 'path', 'attitude', 'all'].includes(mode) || !['straight', 'curve'].includes(baseline)) throw new RangeError('unknown curve mode or baseline');
    const speed_mps = 8, radius_m = baseline === 'curve' ? 80 : Infinity;
    const dx_m = .1, beam_reference_mm = 300;
    const rows = Array.from({length: 1101}, (_, i) => {
      const true_s_m = i / 10, time_s = true_s_m / speed_mps;
      // Roll follows a smooth supplied teaching envelope. The 5 s constant-roll example is separate.
      const phi_deg = baseline === 'curve' ? 3 * Math.sin(Math.PI * true_s_m / 110) ** 2 : 0;
      const phi = phi_deg * Math.PI / 180;
      const a_y_mps2 = speed_mps * speed_mps / radius_m;
      const a_error_mps2 = 9.81 * (Math.cos(phi) - 1) + a_y_mps2 * Math.sin(phi);
      const true_height_mm = 10 * Math.exp(-(((true_s_m - 64.9) / 1.5) ** 2));
      // Positive height is up. A tilted beam reports a longer range, biasing raw height down.
      const laser_range_mm = (beam_reference_mm - true_height_mm) / Math.cos(phi);
      const beam_error_mm = -laser_range_mm * (1 - Math.cos(phi));
      // An uncorrected outside-wheel path, at radius R + 2.4 m, overreports centerline distance.
      const raw_path_m = baseline === 'curve' ? true_s_m * (radius_m + 2.4) / radius_m : true_s_m;
      return {true_s_m, time_s, true_height_mm, raw_path_m, phi_deg, a_y_mps2, a_error_mps2, laser_range_mm, beam_error_mm};
    });
    const attitude = integrate(rows.map(row => row.time_s), rows.map(row => row.a_error_mps2));
    return rows.map((row, i) => {
      const attitude_error_mm = attitude[i] * 1000;
      const observed_height_mm = attitude_error_mm - (row.laser_range_mm - beam_reference_mm);
      const reported_path_m = mode === 'none' ? row.raw_path_m : row.true_s_m;
      const removeAttitude = mode === 'attitude' || mode === 'all';
      const estimated_height_mm = observed_height_mm - (removeAttitude ? attitude_error_mm : 0) - (mode === 'all' ? row.beam_error_mm : 0);
      const mapped_k_m = mapStation(reported_path_m);
      return {...row, attitude_error_mm, observed_height_mm, reported_path_m, mapped_k_m,
        actual_k_m: mapStation(row.true_s_m), estimated_height_mm, mode, baseline, dx_m};
    });
  }

  function assessCompletion(round) {
    const missing = [], nonempty = value => typeof value === 'string' && value.trim().length > 0;
    const validConfidence = value => finite(value) && value >= 0 && value <= 100;
    const hasQuads = value => ['knownKnown','knownUnknown','implicitKnowledge','unknownUnknown'].every(key => nonempty(value?.[key]));
    const prediction = round?.prediction, after = round?.after, records = Array.isArray(round?.records) ? round.records : [];
    if (!prediction || !nonempty(prediction.statement) || !nonempty(prediction.reason) || !validConfidence(prediction.confidence) || !nonempty(prediction.lockedAt) || !hasQuads(prediction.initial4quadrants)) missing.push('locked-initial-prediction');
    const expected = {laser:'laser-reading',quality:'quality-profile',curve:'curve-profile'}[round?.case];
    const distinct = new Set(records.filter(record => record.operation === expected).map(record => {
      const p = record.parameters || {};
      return JSON.stringify(round.case === 'laser' ? [p.height_mm,p.stripe] : round.case === 'quality' ? [p.disturbance,p.policy] : [p.baseline,p.mode]);
    }));
    if (!expected || distinct.size < 2) missing.push('distinct-experiment-comparison');
    if (!after || !['originalStatement','updatedStatement','supported','unsupported','stillUnknown','nextTest','boundary','savedAt'].every(key => nonempty(after[key])) || !validConfidence(after.confidence) || after.originalStatement !== prediction?.statement) missing.push('saved-after-conclusion');
    if (!hasQuads(after?.updated4quadrants)) missing.push('updated-four-quadrants');
    if (after && (!Array.isArray(after.recordIds) || records.some(record => !after.recordIds.includes(record.recordId)))) missing.push('after-does-not-cover-latest-records');
    if (round?.draftAfter) missing.push('unsaved-after-changes');
    return {status: missing.length ? 'incomplete' : 'complete', missing};
  }

  return Object.freeze({schema, modelVersion, calibration, laser, motionAt, integrate, stopSeries, applyPolicy, qualityCount, rollReference, mapStation, stationBin, curveSeries, assessCompletion});
});
