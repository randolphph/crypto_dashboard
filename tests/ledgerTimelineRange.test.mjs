import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';
const { selectTimelineActivities, timelineDomain, valuationReference } = createTsLoader()('lib/ledger/timelineRange.ts');
const ts = (day) => new Date(2026, 9, day, 12).getTime();
const snapshots = [{ timestamp: ts(9), value: 10000 }, { timestamp: ts(10), value: 11000 }];

test('today’s trade remains visible when the last asset snapshot is four days old', () => {
  const trade = { id: 'new', occurredAt: ts(14), status: 'confirmed' };
  assert.deepEqual(selectTimelineActivities([trade], ts(1)), [trade]);
  assert.deepEqual(timelineDomain(snapshots, [trade.occurredAt]), [ts(9), ts(14)]);
  assert.equal(valuationReference(snapshots, trade.occurredAt), ts(10));
  assert.equal(snapshots.length, 2);
});

test('the selected calendar range controls trades while cancelled and corrected rows stay excluded', () => {
  const rows = [{ id: 'old', occurredAt: ts(1), status: 'confirmed' }, { id: 'before-first-snapshot', occurredAt: ts(8), status: 'confirmed' }, { id: 'cancelled', occurredAt: ts(14), status: 'cancelled' }, { id: 'corrected', occurredAt: ts(14), status: 'corrected' }];
  assert.deepEqual(selectTimelineActivities(rows, ts(5)).map(row => row.id), ['before-first-snapshot']);
  assert.equal(valuationReference(snapshots, ts(8)), ts(9));
  assert.equal(valuationReference(snapshots, ts(9) + 1000), undefined);
});
