// The booking form, drawn in the browser.
//
// One renderer produces both versions of the form. They use the same CSS
// classes and so the same pixels; what changes is the markup underneath:
//
//   classic     clickable <div>s, labels that are just nearby text, and state
//               (selected, sold out, ticked) shown only through styling
//   accessible  real <button>s and <label>s with names, roles and ARIA state
//
// A sighted person cannot tell them apart. Software that reads the page
// through the accessibility tree, such as a screen reader or an AI agent,
// sees two very different pages.

import {
  ADDONS,
  BATHS,
  DEFAULT_GUESTS,
  MAX_GUESTS,
  MIN_GUESTS,
  SLOTS,
  BOOKING_WINDOW_DAYS,
  addDays,
  fromISO,
  isBookableDate,
  isSoldOut,
  longDate,
  monthName,
  priceOf,
  toISO,
  validateBooking,
} from '/shared/catalog.js';

const { variant, today, preview } = window.ONSEN;
const A11Y = variant === 'accessible';
const app = document.getElementById('app');

const start = fromISO(today);
const lastDay = fromISO(addDays(today, BOOKING_WINDOW_DAYS));
const monthIndex = (y, m) => y * 12 + m;
const MIN_MONTH = monthIndex(start.getUTCFullYear(), start.getUTCMonth());
const MAX_MONTH = monthIndex(lastDay.getUTCFullYear(), lastDay.getUTCMonth());

const state = {
  year: start.getUTCFullYear(),
  month: start.getUTCMonth(),
  date: null,
  slot: null,
  guests: DEFAULT_GUESTS,
  bath: null,
  addons: new Set(),
  rules: false,
  errors: {},
  notice: '',
  submitting: false,
};

// ---- tiny DOM helpers -------------------------------------------------------

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) if (child != null && child !== false) el.append(child);
  return el;
}

function icon(name) {
  const paths = {
    prev: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    minus: '<path d="M6 12h12"/>',
    plus: '<path d="M12 6v12M6 12h12"/>',
    tick: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  };
  const span = h('span', { class: `ico ico-${name}` });
  span.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"${A11Y ? ' aria-hidden="true" focusable="false"' : ''}>${paths[name]}</svg>`;
  return span;
}

// A clickable control: the one place the two versions differ for buttons.
//   key      stable id, used to restore keyboard focus after a redraw
//   label    accessible name, given only where the visible content is not
//            enough of a name on its own (icon-only buttons, calendar days)
//   role     ARIA role, when it is not a plain button
//   stateAs  'pressed' or 'checked': which ARIA state mirrors `on`
//   on       selected / ticked
//   off      unavailable
function control({ key, cls, label, role, stateAs, on = false, off = false, onClick }, ...children) {
  const classes = [cls, on && 'is-on', off && 'is-off'].filter(Boolean).join(' ');
  if (!A11Y) {
    const el = h('div', { class: classes, 'data-k': key }, children);
    if (!off) el.addEventListener('click', onClick);
    return el;
  }
  const el = h(
    'button',
    { class: classes, 'data-k': key, type: 'button', role, 'aria-label': label, [`aria-${stateAs}`]: stateAs ? String(on) : null },
    children,
  );
  if (off) el.disabled = true;
  else el.addEventListener('click', onClick);
  return el;
}

function section(id, title, ...content) {
  if (!A11Y) return h('div', { class: 'sec' }, h('div', { class: 'sec-title' }, title), content);
  return h('section', { class: 'sec', 'aria-labelledby': `${id}-title` }, h('h2', { class: 'sec-title', id: `${id}-title` }, title), content);
}

function errorNote(field) {
  const message = state.errors[field];
  if (!message) return null;
  return h('div', { class: 'err', id: `err-${field}`, role: A11Y ? 'alert' : null }, message);
}

// ---- sections ---------------------------------------------------------------

function calendarSection() {
  const daysInMonth = new Date(Date.UTC(state.year, state.month + 1, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(state.year, state.month, 1)).getUTCDay() + 6) % 7; // weeks start on Monday
  const here = monthIndex(state.year, state.month);
  const title = monthName(state.year, state.month);

  const step = (delta) => () => {
    const next = here + delta;
    state.year = Math.floor(next / 12);
    state.month = next % 12;
    render();
  };

  const head = h(
    'div',
    { class: 'cal-head' },
    control({ key: 'cal-prev', cls: 'cal-nav', label: 'Previous month', off: here <= MIN_MONTH, onClick: step(-1) }, icon('prev')),
    A11Y ? h('h3', { class: 'cal-title', 'aria-live': 'polite' }, title) : h('div', { class: 'cal-title' }, title),
    control({ key: 'cal-next', cls: 'cal-nav', label: 'Next month', off: here >= MAX_MONTH, onClick: step(1) }, icon('next')),
  );

  const dow = h(
    'div',
    { class: 'cal-dow', 'aria-hidden': A11Y ? 'true' : null },
    ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => h('div', {}, d)),
  );

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(h('div', { class: 'day-gap', 'aria-hidden': A11Y ? 'true' : null }));
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = toISO(new Date(Date.UTC(state.year, state.month, day)));
    const bookable = isBookableDate(iso, today);
    cells.push(
      control(
        {
          key: `day-${iso}`,
          cls: 'day',
          label: longDate(iso),
          stateAs: 'pressed',
          on: state.date === iso,
          off: !bookable,
          onClick: () => {
            state.date = iso;
            if (state.slot && isSoldOut(iso, state.slot)) state.slot = null;
            delete state.errors.date;
            render();
          },
        },
        String(day),
      ),
    );
  }
  const grid = h('div', { class: 'cal-grid', role: A11Y ? 'group' : null, 'aria-label': A11Y ? `Days in ${title}` : null }, cells);

  return section('date', '1. Pick a day', h('div', { class: 'cal' }, head, dow, grid), errorNote('date'));
}

function timeSection() {
  let body;
  if (!state.date) {
    body = h('div', { class: 'hint' }, 'Pick a day first to see the times.');
  } else {
    body = h(
      'div',
      { class: 'slots', role: A11Y ? 'radiogroup' : null, 'aria-label': A11Y ? `Time on ${longDate(state.date)}` : null },
      SLOTS.map((slot) => {
        const sold = isSoldOut(state.date, slot.id);
        return control(
          {
            key: `slot-${slot.id}`,
            cls: 'slot',
            role: 'radio',
            stateAs: 'checked',
            on: state.slot === slot.id,
            off: sold,
            onClick: () => {
              state.slot = slot.id;
              delete state.errors.slot;
              render();
            },
          },
          slot.label,
        );
      }),
    );
  }
  return section('time', '2. Pick a time', body, errorNote('slot'));
}

function guestsSection() {
  const change = (delta) => () => {
    state.guests = Math.min(MAX_GUESTS, Math.max(MIN_GUESTS, state.guests + delta));
    render();
  };
  const value = A11Y
    ? h('div', { class: 'step-val', role: 'status', 'aria-label': `${state.guests} ${state.guests === 1 ? 'guest' : 'guests'}` }, String(state.guests))
    : h('div', { class: 'step-val' }, String(state.guests));
  const stepper = h(
    'div',
    { class: 'stepper', role: A11Y ? 'group' : null, 'aria-label': A11Y ? 'Number of guests' : null },
    control({ key: 'guests-minus', cls: 'step', label: 'Remove one guest', off: state.guests <= MIN_GUESTS, onClick: change(-1) }, icon('minus')),
    value,
    control({ key: 'guests-plus', cls: 'step', label: 'Add one guest', off: state.guests >= MAX_GUESTS, onClick: change(1) }, icon('plus')),
  );
  return section('guests', '3. How many guests?', stepper, errorNote('guests'));
}

function bathSection() {
  const cards = h(
    'div',
    { class: 'cards', role: A11Y ? 'radiogroup' : null, 'aria-label': A11Y ? 'Bath' : null },
    BATHS.map((bath) =>
      control(
        {
          key: `bath-${bath.id}`,
          cls: 'card',
          role: 'radio',
          stateAs: 'checked',
          on: state.bath === bath.id,
          onClick: () => {
            state.bath = bath.id;
            delete state.errors.bath;
            render();
          },
        },
        h('span', { class: 'card-name' }, bath.name),
        h('span', { class: 'card-blurb' }, bath.blurb),
        h('span', { class: 'card-price' }, `$${bath.price} per guest`),
      ),
    ),
  );
  return section('bath', '4. Choose your bath', cards, errorNote('bath'));
}

function checkRow({ key, text, extra, on, onClick }) {
  return control(
    { key, cls: 'check', role: 'checkbox', stateAs: 'checked', on, onClick },
    h('span', { class: 'box' }, on ? icon('tick') : null),
    h('span', { class: 'check-text' }, text),
    extra ? h('span', { class: 'check-extra' }, extra) : null,
  );
}

function extrasSection() {
  const rows = h(
    'div',
    { class: 'checks', role: A11Y ? 'group' : null, 'aria-label': A11Y ? 'Extras' : null },
    ADDONS.map((addon) =>
      checkRow({
        key: `addon-${addon.id}`,
        text: addon.name,
        extra: `+$${addon.price}`,
        on: state.addons.has(addon.id),
        onClick: () => {
          if (state.addons.has(addon.id)) state.addons.delete(addon.id);
          else state.addons.add(addon.id);
          render();
        },
      }),
    ),
  );
  return section('extras', '5. Extras', rows);
}

// Text inputs are created once and reused, so a redraw never loses what was typed.
function makeField({ id, labelText, type, autocomplete }) {
  const input = A11Y
    ? h('input', { class: 'inp', id, name: id, type, autocomplete, required: true })
    : h('input', { class: 'inp' });
  input.addEventListener('input', () => {
    if (state.errors[id]) {
      delete state.errors[id];
      render();
    }
  });
  const label = A11Y ? h('label', { class: 'lbl', for: id }, labelText) : h('div', { class: 'lbl' }, labelText);
  return { id, input, label };
}
const nameField = makeField({ id: 'name', labelText: 'Full name', type: 'text', autocomplete: 'name' });
const emailField = makeField({ id: 'email', labelText: 'Email', type: 'email', autocomplete: 'email' });

function contactSection() {
  const row = (field) => {
    const bad = Boolean(state.errors[field.id]);
    field.input.classList.toggle('is-bad', bad);
    if (A11Y) {
      field.input.setAttribute('aria-invalid', String(bad));
      if (bad) field.input.setAttribute('aria-describedby', `err-${field.id}`);
      else field.input.removeAttribute('aria-describedby');
    }
    return h('div', { class: 'field' }, field.label, field.input, errorNote(field.id));
  };
  return section('contact', '6. Your details', row(nameField), row(emailField));
}

function rulesAndSubmit() {
  const rules = checkRow({
    key: 'rules',
    text: 'I accept the house rules: shower first, no splashing, be kind to capybaras.',
    on: state.rules,
    onClick: () => {
      state.rules = !state.rules;
      delete state.errors.rules;
      render();
    },
  });
  const problems = Object.keys(state.errors).length;
  const banner = problems
    ? h('div', { class: 'err err-banner', role: A11Y ? 'alert' : null }, state.errors.form || 'Some details are missing or wrong. Please check the messages above.')
    : null;
  const notice = state.notice ? h('div', { class: 'notice', role: A11Y ? 'status' : null }, state.notice) : null;
  const text = state.submitting ? 'Booking…' : 'Confirm booking';
  let cta;
  if (A11Y) {
    cta = h('button', { class: 'cta', type: 'submit', 'data-k': 'submit' }, text);
    if (state.submitting) cta.disabled = true;
  } else {
    cta = h('div', { class: 'cta', 'data-k': 'submit' }, text);
    cta.addEventListener('click', submit);
  }
  return h('div', { class: 'sec sec-submit' }, rules, errorNote('rules'), banner, notice, cta);
}

function summary() {
  const bath = BATHS.find((b) => b.id === state.bath);
  const slot = SLOTS.find((s) => s.id === state.slot);
  const extras = ADDONS.filter((a) => state.addons.has(a.id)).map((a) => a.name);
  const rows = [
    ['Day', state.date ? longDate(state.date) : 'Not chosen yet'],
    ['Time', slot ? slot.label : 'Not chosen yet'],
    ['Guests', String(state.guests)],
    ['Bath', bath ? bath.name : 'Not chosen yet'],
    ['Extras', extras.length ? extras.join(', ') : 'None'],
  ];
  const total = priceOf({ bath: state.bath, guests: state.guests, addons: [...state.addons] });
  const body = [
    A11Y ? h('h2', { class: 'sum-title', id: 'sum-title' }, 'Your booking') : h('div', { class: 'sum-title' }, 'Your booking'),
    rows.map(([k, v]) => h('div', { class: 'sum-row' }, h('span', { class: 'sum-k' }, k), h('span', { class: 'sum-v' }, v))),
    h('div', { class: 'sum-row sum-total' }, h('span', { class: 'sum-k' }, 'Total'), h('span', { class: 'sum-v' }, `$${total}`)),
  ];
  return A11Y
    ? h('aside', { class: 'summary', 'aria-labelledby': 'sum-title', 'aria-live': 'polite' }, body)
    : h('div', { class: 'summary' }, body);
}

// ---- submit -----------------------------------------------------------------

async function submit(event) {
  event?.preventDefault();
  if (state.submitting) return;
  const payload = {
    date: state.date,
    slot: state.slot,
    guests: state.guests,
    bath: state.bath,
    addons: [...state.addons],
    name: nameField.input.value,
    email: emailField.input.value,
    rules: state.rules,
  };
  state.notice = '';
  state.errors = validateBooking(payload, today);
  if (Object.keys(state.errors).length) return render();
  if (preview) {
    state.notice = 'Preview only: bookings are switched off on this page.';
    return render();
  }
  state.submitting = true;
  render();
  try {
    const res = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 201) {
      window.location.href = `/confirmation/${data.id}`;
      return;
    }
    state.errors = data.errors || { form: 'Something went wrong. Please try again.' };
  } catch {
    state.errors = { form: 'Could not reach the onsen. Please try again.' };
  }
  state.submitting = false;
  render();
}

// ---- render -----------------------------------------------------------------

function render() {
  const active = document.activeElement;
  const focusedKey = active?.dataset?.k;
  const sections = [calendarSection(), timeSection(), guestsSection(), bathSection(), extrasSection(), contactSection(), rulesAndSubmit()];
  let main;
  if (A11Y) {
    main = h('form', { class: 'col-main', novalidate: true, 'aria-label': 'Book a soak' }, sections);
    main.addEventListener('submit', submit);
  } else {
    main = h('div', { class: 'col-main' }, sections);
  }
  app.replaceChildren(h('div', { class: 'book' }, main, h('div', { class: 'col-side' }, summary())));
  // Redrawing replaces the elements, so put keyboard focus back where it was.
  if (active === nameField.input || active === emailField.input) active.focus();
  else if (focusedKey) app.querySelector(`[data-k="${focusedKey}"]`)?.focus();
}

render();
