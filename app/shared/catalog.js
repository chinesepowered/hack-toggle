// What the onsen sells and when. Pure functions and data, shared by the server,
// the browser, and the AI guests' brief generator and auditor, so that all of
// them agree on prices, time slots and which slots are sold out.

export const BATHS = [
  { id: 'yuzu', name: 'Yuzu Bath', price: 28, blurb: 'Open-air pool with floating yuzu' },
  { id: 'cedar', name: 'Cedar Tub', price: 34, blurb: 'Private soaking tub, cedar-scented' },
  { id: 'moon', name: 'Moonlight Pool', price: 42, blurb: 'Rooftop pool under the stars' },
];

export const ADDONS = [
  { id: 'towel', name: 'Towel set', price: 6 },
  { id: 'tea', name: 'Yuzu tea service', price: 9 },
  { id: 'plush', name: 'Capybara plushie', price: 18 },
];

export const SLOTS = [
  { id: '10:00', label: '10:00 AM' },
  { id: '11:30', label: '11:30 AM' },
  { id: '13:00', label: '1:00 PM' },
  { id: '14:30', label: '2:30 PM' },
  { id: '16:00', label: '4:00 PM' },
  { id: '17:30', label: '5:30 PM' },
  { id: '19:00', label: '7:00 PM' },
];

export const MIN_GUESTS = 1;
export const MAX_GUESTS = 6;
export const DEFAULT_GUESTS = 2;
export const BOOKING_WINDOW_DAYS = 60;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Dates are plain 'YYYY-MM-DD' strings handled in UTC, so a booking means the
// same calendar day on the server and in every browser.
export const toISO = (d) => d.toISOString().slice(0, 10);
export const fromISO = (iso) => new Date(`${iso}T00:00:00Z`);
export const addDays = (iso, n) => {
  const d = fromISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
};
export const monthName = (year, month) => `${MONTHS[month]} ${year}`;
// "Saturday 12 December 2026"
export const longDate = (iso) => {
  const d = fromISO(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export const isBookableDate = (iso, today) => iso > today && iso <= addDays(today, BOOKING_WINDOW_DAYS);

// Small deterministic string hash (FNV-1a), so "sold out" is stable across
// processes without a database.
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// About a quarter of slots are sold out. The last slot of the day is never
// sold out, so every day has a time that can be booked.
export function isSoldOut(dateISO, slotId) {
  if (slotId === SLOTS[SLOTS.length - 1].id) return false;
  return hash(`${dateISO}|${slotId}`) % 100 < 26;
}

// The slot a guest should end up with: their preferred time, or the next later
// time that is not sold out.
export function firstAvailableFrom(dateISO, preferredSlotId) {
  const start = SLOTS.findIndex((s) => s.id === preferredSlotId);
  for (let i = Math.max(start, 0); i < SLOTS.length; i++) {
    if (!isSoldOut(dateISO, SLOTS[i].id)) return SLOTS[i].id;
  }
  return SLOTS[SLOTS.length - 1].id;
}

export function priceOf({ bath, guests, addons }) {
  const b = BATHS.find((x) => x.id === bath);
  const extras = (addons || []).reduce((sum, id) => sum + (ADDONS.find((a) => a.id === id)?.price ?? 0), 0);
  return (b ? b.price * guests : 0) + extras;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Returns { field: message } for everything wrong with a booking; empty when valid.
export function validateBooking(b, today) {
  const errors = {};
  if (!b.date) errors.date = 'Please choose a date.';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !isBookableDate(b.date, today)) errors.date = 'That date cannot be booked.';
  if (!b.slot) errors.slot = 'Please choose a time.';
  else if (!SLOTS.some((s) => s.id === b.slot)) errors.slot = 'That time does not exist.';
  else if (b.date && isSoldOut(b.date, b.slot)) errors.slot = 'That time is sold out.';
  if (!Number.isInteger(b.guests) || b.guests < MIN_GUESTS || b.guests > MAX_GUESTS) errors.guests = `Guests must be between ${MIN_GUESTS} and ${MAX_GUESTS}.`;
  if (!BATHS.some((x) => x.id === b.bath)) errors.bath = 'Please choose a bath.';
  if (!Array.isArray(b.addons) || b.addons.some((id) => !ADDONS.some((a) => a.id === id))) errors.addons = 'Unknown extra.';
  if (!b.name || !b.name.trim()) errors.name = 'Please enter your name.';
  if (!b.email || !EMAIL.test(b.email.trim())) errors.email = 'Please enter a valid email address.';
  if (b.rules !== true) errors.rules = 'Please accept the house rules.';
  return errors;
}
