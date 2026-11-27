// The audit decides whether a guest's booking was correct, which is the
// experiment's primary metric. These tests pin down what "correct" means.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SLOTS, addDays, isSoldOut } from '../app/shared/catalog.js';
import { auditGuest, briefText, makeBrief, minimumActions } from '../guests/briefs.mjs';

const TODAY = '2026-11-27';
const briefs = Array.from({ length: 300 }, (_, i) => makeBrief({ runId: 't', index: i + 1, seed: 7, today: TODAY }));
const brief = briefs[0];
// The booking a guest makes when it follows the brief exactly.
const perfect = (b) => ({ date: b.date, slot: b.expectedSlot, guests: b.guests, bath: b.bath, addons: [...b.addons], name: b.name, email: b.email });

test('the same seed gives the same guests', () => {
  assert.deepEqual(makeBrief({ runId: 't', index: 1, seed: 7, today: TODAY }), brief);
  assert.notDeepEqual(makeBrief({ runId: 't', index: 1, seed: 8, today: TODAY }), brief);
  assert.equal(new Set(briefs.map((b) => b.guestId)).size, briefs.length);
});

test('every brief can be booked', () => {
  for (const b of briefs) {
    assert.ok(b.date >= addDays(TODAY, 3) && b.date <= addDays(TODAY, 50));
    assert.equal(isSoldOut(b.date, b.expectedSlot), false);
    assert.ok(SLOTS.findIndex((s) => s.id === b.expectedSlot) >= SLOTS.findIndex((s) => s.id === b.preferredSlot));
  }
});

test('some guests prefer a sold-out time, and their brief does not say so', () => {
  const blocked = briefs.filter((b) => b.expectedSlot !== b.preferredSlot);
  assert.ok(blocked.length > 20, `expected a fair share of sold-out preferences, got ${blocked.length}`);
  const preferred = SLOTS.find((s) => s.id === blocked[0].preferredSlot).label;
  const expected = SLOTS.find((s) => s.id === blocked[0].expectedSlot).label;
  assert.ok(briefText(blocked[0]).includes(`Preferred time: ${preferred}.`));
  assert.ok(!briefText(blocked[0]).includes(expected), 'the guest has to find the next free time itself');
});

test('a booking that matches the brief is correct', () => {
  assert.deepEqual(auditGuest(brief, [perfect(brief)]), { completed: true, correct: true, problems: [] });
});

test('harmless differences in how a name or email was typed do not count', () => {
  const typed = { ...perfect(brief), name: `  ${brief.name.replace(' ', '   ')} `, email: ` ${brief.email.toUpperCase()} `, addons: [...brief.addons].reverse() };
  assert.equal(auditGuest(brief, [typed]).correct, true);
});

test('no booking is neither completed nor correct', () => {
  assert.deepEqual(auditGuest(brief, []), { completed: false, correct: false, problems: ['no booking'] });
});

test('any wrong field makes the booking incorrect', () => {
  const otherSlot = SLOTS.find((s) => s.id !== brief.expectedSlot).id;
  const wrong = {
    'wrong day': { date: addDays(brief.date, 1) },
    'wrong time': { slot: otherSlot },
    'wrong number of guests': { guests: brief.guests + 1 },
    'wrong bath': { bath: brief.bath === 'moon' ? 'yuzu' : 'moon' },
    'wrong extras': { addons: brief.addons.includes('plush') ? [] : [...brief.addons, 'plush'] },
    'wrong name': { name: 'Someone Else' },
    'wrong email': { email: 'someone@example.com' },
  };
  for (const [problem, change] of Object.entries(wrong)) {
    assert.deepEqual(auditGuest(brief, [{ ...perfect(brief), ...change }]), { completed: true, correct: false, problems: [problem] });
  }
});

test('booking the preferred time when it is sold out would be wrong, not just late', () => {
  const blocked = briefs.find((b) => b.expectedSlot !== b.preferredSlot);
  assert.deepEqual(auditGuest(blocked, [{ ...perfect(blocked), slot: blocked.preferredSlot }]).problems, ['wrong time']);
});

test('booking twice is incorrect even if both bookings match', () => {
  const audit = auditGuest(brief, [perfect(brief), perfect(brief)]);
  assert.equal(audit.completed, true);
  assert.equal(audit.correct, false);
  assert.deepEqual(audit.problems, ['2 bookings made']);
});

test('the fewest actions for a brief counts every control the guest must use', () => {
  const simple = { ...brief, date: '2026-11-30', guests: 2, addons: [] };
  // open the form, day, time, bath, name, email, rules, confirm
  assert.equal(minimumActions(simple, TODAY), 8);
  // plus one month forward, two more guests and two extras
  assert.equal(minimumActions({ ...simple, date: '2026-12-12', guests: 4, addons: ['tea', 'towel'] }, TODAY), 13);
  // stepping down from the default of two guests is one action as well
  assert.equal(minimumActions({ ...simple, guests: 1 }, TODAY), 9);
});
