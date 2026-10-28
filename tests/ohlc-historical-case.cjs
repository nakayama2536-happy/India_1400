'use strict';
// Test-only historical scenario: use genuine stored OHLC rows and their matching
// 60-candle subset. A later close-only daily update must never be turned into
// a made-up 200-candle OHLC record.
const assert = require('node:assert/strict');
const validate = require('../chart-experience.js').validateLongCandles;

function historicalAlignedDetail(history, detail) {
  const rows = history?.records;
  assert.ok(Array.isArray(rows) && rows.length >= 200, '200 actual OHLC observations required for acceptance fixture');
  assert.ok(Array.isArray(detail?.candles) && detail.candles.length >= 30, 'actual 60-candle evidence is required');
  const last = rows.at(-1);
  assert.equal(last.date, detail.latest_ohlc_date, 'historical fixture must use verified OHLC endpoint');
  assert.equal(detail.candles.at(-1).date, last.date, 'do not hide a missing/changed OHLC candle');
  const sourceByDate = new Map(rows.map(r => [r.date, r]));
  for (const candle of detail.candles) {
    const original = sourceByDate.get(candle.date);
    assert.ok(original, 'no synthetic candle: ' + candle.date);
    for (const key of ['open','high','low','close']) {
      assert.equal(Number(candle[key]), Number(original[key]), 'observed OHLC mismatch: ' + candle.date + '/' + key);
    }
  }
  const aligned = structuredClone(detail);
  // This is a hypothetical historical as-of view on the last *observed*
  // OHLC date only. Do not change, emit, or publish live market JSON.
  aligned.latest_confirmed_date = last.date;
  aligned.lag_calendar_days = 0;
  const accepted = validate(history, aligned);
  assert.equal(accepted.ok, true, 'historical aligned scenario must be accepted: ' + accepted.reason);
  assert.equal(accepted.rows.length, rows.length);
  return aligned;
}

function assertLiveReconciliation(history, detail) {
  const result = validate(history, detail);
  if (detail.latest_ohlc_date !== detail.latest_confirmed_date) {
    assert.equal(result.ok, false, 'stale OHLC must remain fail-closed');
    assert.equal(result.rows.length, 0, 'stale OHLC must never expose long rows');
    assert.match(result.reason, /基準が一致しません/);
  } else {
    assert.equal(result.ok, true, 'same-date verified OHLC must be usable: ' + result.reason);
    assert.equal(result.rows.length, history.records.length);
  }
}
module.exports = { historicalAlignedDetail, assertLiveReconciliation };
