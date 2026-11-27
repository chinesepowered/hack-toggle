// Booking briefs: what each AI guest has been asked to book.
//
// Briefs are generated from a seed, so a run can be repeated with the same
// population. Nothing here knows which version of the form a guest will get.

import { ADDONS, BATHS, SLOTS, addDays, firstAvailableFrom, longDate } from '../app/shared/catalog.js';

const FIRST = ['Mika', 'Aiko', 'Ren', 'Sora', 'Yuki', 'Hana', 'Kenji', 'Naoko', 'Priya', 'Arjun', 'Lucía', 'Mateo', 'Amara', 'Kwame', 'Ingrid', 'Lars', 'Chloé', 'Hugo', 'Leila', 'Omar', 'Mei', 'Jun', 'Sofia', 'Tomás', 'Zara', 'Noah', 'Ivy', 'Felix', 'Nia', 'Elias'];
const LAST = ['Tanaka', 'Sato', 'Okafor', 'Nakamura', 'Patel', 'Iyer', 'García', 'Rossi', 'Mensah', 'Larsen', 'Dubois', 'Haddad', 'Chen', 'Park', 'Silva', 'Novak', 'Khan', 'Berg', 'Moreau', 'Ito', 'Reyes', 'Lindqvist', 'Adeyemi', 'Kowalski'];

// mulberry32: a small, well-known seeded PRNG.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const asciiSlug = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

export function makeBrief({ runId, index, seed, today }) {
  const rand = prng(seed * 100003 + index * 7919 + 17);
  const pick = (list) => list[Math.floor(rand() * list.length)];

  const date = addDays(today, 3 + Math.floor(rand() * 48)); // 3 to 50 days ahead
  const preferredSlot = pick(SLOTS).id;
  const guests = pick([1, 1, 2, 2, 2, 3, 3, 4, 5, 6]);
  const bath = pick(BATHS).id;
  const addonCount = pick([0, 0, 1, 1, 2]);
  const addons = [...ADDONS]
    .map((a) => ({ id: a.id, r: rand() }))
    .sort((x, y) => x.r - y.r)
    .slice(0, addonCount)
    .map((a) => a.id)
    .sort();
  const first = pick(FIRST);
  const last = pick(LAST);

  return {
    guestId: `${runId}_g${String(index).padStart(4, '0')}`,
    date,
    preferredSlot,
    // What a correct booking contains: the preferred time, or the next later one if it is sold out.
    expectedSlot: firstAvailableFrom(date, preferredSlot),
    guests,
    bath,
    addons,
    name: `${first} ${last}`,
    email: `${asciiSlug(first)}.${asciiSlug(last)}@example.com`,
  };
}

// The instruction the guest is given, in plain language, as a customer would say it.
export function briefText(brief) {
  const bath = BATHS.find((b) => b.id === brief.bath).name;
  const slot = SLOTS.find((s) => s.id === brief.preferredSlot).label;
  const extras = brief.addons.map((id) => ADDONS.find((a) => a.id === id).name);
  return [
    `Book a soak at Capybara Onsen for ${brief.guests} ${brief.guests === 1 ? 'guest' : 'guests'} on ${longDate(brief.date)}.`,
    `Preferred time: ${slot}. If that time is sold out, book the next later time that is available.`,
    `Bath: ${bath}.`,
    `Extras: ${extras.length ? extras.join(' and ') : 'none'}.`,
    `Name: ${brief.name}. Email: ${brief.email}.`,
    'Accept the house rules, confirm the booking, and stop once you see the confirmation.',
  ].join('\n');
}

// The fewest clicks and fills that can complete a brief: open the form, move the
// calendar forward, pick the day, the time and the bath, step the guest count
// from its default of 2, tick each extra, fill in name and email, accept the
// rules and confirm. Anything a guest does beyond this was a detour.
export function minimumActions(brief, today) {
  const [ty, tm] = today.split('-').map(Number);
  const [by, bm] = brief.date.split('-').map(Number);
  const monthsForward = (by - ty) * 12 + (bm - tm);
  return 1 + monthsForward + 1 + 1 + Math.abs(brief.guests - 2) + 1 + brief.addons.length + 2 + 1 + 1;
}

// Compare the bookings a guest actually made with their brief.
export function auditGuest(brief, bookings) {
  if (bookings.length === 0) return { completed: false, correct: false, problems: ['no booking'] };
  const problems = [];
  if (bookings.length > 1) problems.push(`${bookings.length} bookings made`);
  const b = bookings[bookings.length - 1];
  if (b.date !== brief.date) problems.push('wrong day');
  if (b.slot !== brief.expectedSlot) problems.push('wrong time');
  if (b.guests !== brief.guests) problems.push('wrong number of guests');
  if (b.bath !== brief.bath) problems.push('wrong bath');
  if (JSON.stringify([...b.addons].sort()) !== JSON.stringify(brief.addons)) problems.push('wrong extras');
  if (b.name.trim().replace(/\s+/g, ' ') !== brief.name) problems.push('wrong name');
  if (b.email.trim().toLowerCase() !== brief.email) problems.push('wrong email');
  return { completed: true, correct: problems.length === 0, problems };
}
