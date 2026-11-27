// The rules the site, the browser and the guests' audit all share.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SLOTS, addDays, firstAvailableFrom, isSoldOut, longDate, priceOf, validateBooking } from '../app/shared/catalog.js';

const TODAY = '2026-11-27';
const LAST_SLOT = SLOTS.at(-1).id;
const days = Array.from({ length: 60 }, (_, i) => addDays(TODAY, i + 1));

// A day with at least one sold-out time, and a time on it that is free.
const busyDay = days.find((d) => SLOTS.some((s) => isSoldOut(d, s.id)));
const soldOutSlot = SLOTS.find((s) => isSoldOut(busyDay, s.id)).id;
const valid = { date: busyDay, slot: LAST_SLOT, guests: 3, bath: 'cedar', addons: ['tea'], name: 'Mika Tanaka', email: 'mika@example.com', rules: true };

test('price is the bath per guest plus each extra once', () => {
  assert.equal(priceOf({ bath: 'cedar', guests: 3, addons: ['tea', 'towel'] }), 34 * 3 + 9 + 6);
  assert.equal(priceOf({ bath: 'yuzu', guests: 1, addons: [] }), 28);
});

test('dates are read as calendar days, not local times', () => {
  assert.equal(longDate('2026-12-12'), 'Saturday 12 December 2026');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('sold-out times are stable, and the last time of a day is never sold out', () => {
  for (const day of days) {
    assert.equal(isSoldOut(day, LAST_SLOT), false);
    for (const slot of SLOTS) assert.equal(isSoldOut(day, slot.id), isSoldOut(day, slot.id));
  }
  const others = days.flatMap((d) => SLOTS.slice(0, -1).map((s) => isSoldOut(d, s.id)));
  const share = others.filter(Boolean).length / others.length;
  assert.ok(share > 0.15 && share < 0.4, `about a quarter should be sold out, got ${share.toFixed(2)}`);
});

test('the next available time is the preferred one, or the first later one that is free', () => {
  for (const day of days) {
    for (const [i, slot] of SLOTS.entries()) {
      const got = firstAvailableFrom(day, slot.id);
      const j = SLOTS.findIndex((s) => s.id === got);
      assert.ok(j >= i, 'never earlier than the preferred time');
      assert.equal(isSoldOut(day, got), false);
      for (const skipped of SLOTS.slice(i, j)) assert.equal(isSoldOut(day, skipped.id), true, 'every skipped time was sold out');
    }
  }
});

test('a complete booking is valid', () => {
  assert.deepEqual(validateBooking(valid, TODAY), {});
});

test('the server refuses what the form should not allow', () => {
  const errors = (change) => Object.keys(validateBooking({ ...valid, ...change }, TODAY));
  assert.deepEqual(errors({ slot: soldOutSlot }), ['slot']);
  assert.deepEqual(errors({ date: TODAY }), ['date'], 'same-day bookings are closed');
  assert.deepEqual(errors({ date: addDays(TODAY, 61) }), ['date'], 'more than 60 days ahead is closed');
  assert.deepEqual(errors({ guests: 7 }), ['guests']);
  assert.deepEqual(errors({ bath: 'lava' }), ['bath']);
  assert.deepEqual(errors({ addons: ['jetpack'] }), ['addons']);
  assert.deepEqual(errors({ name: '  ' }), ['name']);
  assert.deepEqual(errors({ email: 'mika at example' }), ['email']);
  assert.deepEqual(errors({ rules: false }), ['rules']);
});
