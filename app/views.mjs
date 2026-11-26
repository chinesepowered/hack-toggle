// Server-rendered page shells. The booking form itself is drawn in the browser
// by public/booking.js, from the variant passed in the page config.

import { ADDONS, BATHS, SLOTS, longDate } from './shared/catalog.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Yuzu the capybara, up to the chin in hot water with a yuzu on its head.
// Decorative everywhere it is used, so it is hidden from assistive technology.
export function capybara({ size = 260, steam = true } = {}) {
  return `
<svg class="capy" width="${size}" height="${Math.round(size * 0.86)}" viewBox="0 0 300 258" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="capy-water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9fd9d3"/><stop offset="1" stop-color="#5fb3ad"/>
    </linearGradient>
    <linearGradient id="capy-fur" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b98558"/><stop offset="1" stop-color="#a06f45"/>
    </linearGradient>
    <clipPath id="capy-above"><rect x="0" y="0" width="300" height="186"/></clipPath>
  </defs>
  ${
    steam
      ? `<g class="capy-steam" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" opacity="0.85">
    <path d="M62 78c-10-12 10-20 0-34s10-20 0-32"/>
    <path d="M238 82c-10-12 10-20 0-34s10-20 0-32"/>
    <path d="M150 30c-8-9 8-15 0-25"/>
  </g>`
      : ''
  }
  <ellipse cx="150" cy="206" rx="146" ry="46" fill="#8a8f8c"/>
  <ellipse cx="150" cy="200" rx="132" ry="40" fill="url(#capy-water)"/>
  <g clip-path="url(#capy-above)">
    <ellipse cx="100" cy="92" rx="15" ry="13" fill="#8c5e3a"/>
    <ellipse cx="200" cy="92" rx="15" ry="13" fill="#8c5e3a"/>
    <ellipse cx="100" cy="94" rx="7" ry="6" fill="#6f4628"/>
    <ellipse cx="200" cy="94" rx="7" ry="6" fill="#6f4628"/>
    <rect x="82" y="86" width="136" height="128" rx="52" fill="url(#capy-fur)"/>
    <rect x="104" y="140" width="92" height="70" rx="34" fill="#8c5e3a"/>
    <ellipse cx="150" cy="152" rx="17" ry="10" fill="#4a2f1c"/>
    <path d="M150 162v10m-10 6c5 5 15 5 20 0" fill="none" stroke="#4a2f1c" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M110 126q8-8 16 0M174 126q8-8 16 0" fill="none" stroke="#3b2416" stroke-width="4.5" stroke-linecap="round"/>
    <ellipse cx="102" cy="150" rx="9" ry="6" fill="#f2a08c" opacity="0.75"/>
    <ellipse cx="198" cy="150" rx="9" ry="6" fill="#f2a08c" opacity="0.75"/>
  </g>
  <circle cx="150" cy="74" r="21" fill="#f6b93b"/>
  <circle cx="143" cy="67" r="6" fill="#fbd67b" opacity="0.9"/>
  <path d="M150 54c2-9 12-13 20-10-2 9-11 13-20 10z" fill="#5f9f4a"/>
  <path d="M150 55v-6" stroke="#4d7f3b" stroke-width="3" stroke-linecap="round"/>
  <path d="M40 196q14-9 28 0t28 0M204 196q14-9 28 0t28 0M96 214q14-9 28 0t28 0t28 0t28 0" fill="none" stroke="#e8f7f5" stroke-width="4" stroke-linecap="round" opacity="0.9"/>
</svg>`;
}

function layout({ title, body, bodyClass = '', head = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/static/styles.css">
${head}
</head>
<body class="${bodyClass}">
<header class="top">
  <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">♨</span> Capybara Onsen</a>
  <span class="top-note">A demo site. No real bookings are made.</span>
</header>
${body}
<footer class="foot">Built for a Flagsmith experiment on how AI guests book. Capybaras approve of long soaks.</footer>
</body>
</html>`;
}

export function landingPage() {
  const cards = BATHS.map(
    (b) => `<li class="bath-tile"><h3>${esc(b.name)}</h3><p>${esc(b.blurb)}</p><p class="price">$${b.price} per guest</p></li>`,
  ).join('');
  return layout({
    title: 'Capybara Onsen: soak like a capybara',
    bodyClass: 'page-landing',
    body: `
<main>
  <section class="hero">
    <div class="hero-text">
      <h1>Soak like a capybara.</h1>
      <p>Hot spring water, floating yuzu, and nowhere to be. Pick a day, pick a bath, and we will keep the water warm.</p>
      <a class="btn" href="/book">Book a soak</a>
    </div>
    <div class="hero-art">${capybara({ size: 340 })}</div>
  </section>
  <section class="baths" aria-labelledby="baths-title">
    <h2 id="baths-title">Three ways to soak</h2>
    <ul class="bath-tiles">${cards}</ul>
  </section>
</main>`,
  });
}

export function bookingPage({ variant, today, preview }) {
  const config = { variant, today, preview };
  return layout({
    title: 'Book a soak · Capybara Onsen',
    bodyClass: 'page-book',
    head: `<script>window.ONSEN = ${JSON.stringify(config)};</script>
<script type="module" src="/static/booking.js"></script>`,
    body: `
<main class="book-wrap">
  <div class="book-head">
    <div>
      <h1>Book a soak</h1>
      <p>Choose a day, a time and a bath. It takes about a minute.</p>
    </div>
    ${capybara({ size: 120, steam: false })}
  </div>
  <div id="app"></div>
</main>`,
  });
}

export function confirmationPage(b) {
  const bath = BATHS.find((x) => x.id === b.bath);
  const slot = SLOTS.find((s) => s.id === b.slot);
  const extras = b.addons.map((id) => ADDONS.find((a) => a.id === id)?.name).filter(Boolean);
  const rows = [
    ['Booking reference', b.id],
    ['Date', longDate(b.date)],
    ['Time', slot?.label ?? b.slot],
    ['Guests', String(b.guests)],
    ['Bath', bath?.name ?? b.bath],
    ['Extras', extras.length ? extras.join(', ') : 'None'],
    ['Name', b.name],
    ['Email', b.email],
    ['Total', `$${b.total}`],
  ];
  return layout({
    title: 'You are booked · Capybara Onsen',
    bodyClass: 'page-confirm',
    body: `
<main class="confirm">
  ${capybara({ size: 200 })}
  <h1>You are booked!</h1>
  <p>Your booking is confirmed. We will keep the water warm for you.</p>
  <dl class="confirm-list">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
  <a class="btn btn-quiet" href="/">Back to the onsen</a>
</main>`,
  });
}

export function notFoundPage() {
  return layout({
    title: 'Not found · Capybara Onsen',
    body: `<main class="confirm"><h1>That page has floated away.</h1><a class="btn" href="/">Back to the onsen</a></main>`,
  });
}
