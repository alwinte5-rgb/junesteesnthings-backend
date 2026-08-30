'use strict';

/* The review marquee stopped and stayed stopped. Three causes, none of which
 * looks wrong when you read the CSS:
 *
 *   1. `:hover` STICKS ON TOUCH. Tapping or dragging over the strip on a phone
 *      applies :hover and holds it until something else is tapped, so the
 *      animation paused on first contact and never resumed. `:active` made it
 *      worse, firing on every tap.
 *   2. On desktop the pointer RESTS over the strip while reading — the page
 *      scrolls under a stationary mouse — so hover-pause meant "paused most of
 *      the time".
 *   3. `prefers-reduced-motion` correctly turned the animation off, but the wrap
 *      was `overflow:hidden`, so those users could see two reviews and reach
 *      none of the other seven. That is the real bug the stopping hid.
 *
 * The rule these encode: an animation may DECORATE content, never be the only
 * way to reach it.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const css = src.slice(src.indexOf('const REVIEW_CSS'), src.indexOf('const QUOTE_CODE_RE'));

test('hover-pause applies only where a real cursor exists', () => {
  /* Without the media query this pauses forever on any touch device. */
  assert.match(css, /@media \(hover:hover\) and \(pointer:fine\)\{\s*\.rv-wrap:hover \.rv-track\{animation-play-state:paused\}/,
    'the hover pause must be gated behind a fine pointer');
});

test('the strip never pauses on :active', () => {
  /* :active fires on every tap and can stick on touch. */
  assert.doesNotMatch(css, /\.rv-wrap:active/,
    ':active pause reintroduces the touch-sticking bug');
});

test('the reviews are reachable without the animation', () => {
  /* The one that mattered. With animation off — reduced motion, or simply
     paused — overflow:hidden means everything past the visible cards is
     unreachable. */
  assert.match(css, /\.rv-wrap\{overflow-x:auto/,
    'the strip must scroll by hand, so the animation is decoration and not the ' +
    'only way to see the reviews');
  assert.doesNotMatch(css, /\.rv-wrap\{overflow:hidden\}/,
    'overflow:hidden makes the off-screen reviews unreachable when paused');
});

test('reduced motion still turns the animation off', () => {
  /* Fixing reachability must not quietly remove the accessibility rule. */
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.rv-track\{animation:none\}\}/,
    'reduced motion must still disable the animation');
});

test('the marquee still loops seamlessly', () => {
  /* The track holds the set twice and slides exactly one set width, so the
     wrap-around is invisible. Change one without the other and it jumps. */
  const strip = src.slice(src.indexOf('function reviewStrip'), src.indexOf('const REVIEW_CSS'));
  const sets = (strip.match(/<div class="rv-set">/g) || []).length;
  assert.strictEqual(sets, 2, 'the card set must be rendered exactly twice');
  assert.match(css, /to\{transform:translateX\(-50%\)\}/,
    'the slide must be exactly half the track — one full set');
});
