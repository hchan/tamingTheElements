// @ts-nocheck
// One violation per banned item. Linted only by tests/lint/core-bans.test.ts.
import 'phaser';
import 'node:fs';
import '@game/x';
import '@ui/x';
import '@testing/x';
import '../../../src/ui/missing';

export const globalsUsed = [
  Date,
  performance,
  window,
  document,
  setTimeout,
  setInterval,
  requestAnimationFrame,
  crypto,
  fetch,
  localStorage,
  navigator,
];

export const mathUsed = [
  Math.random(),
  Math.sin(1),
  Math.cos(1),
  Math.tan(1),
  Math.asin(1),
  Math.acos(1),
  Math.atan(1),
  Math.atan2(1, 1),
  Math.sinh(1),
  Math.cosh(1),
  Math.tanh(1),
  Math.exp(1),
  Math.expm1(1),
  Math.log(1),
  Math.log1p(1),
  Math.log2(1),
  Math.log10(1),
  Math.pow(1, 2),
  Math.cbrt(1),
  Math.hypot(1, 2),
  Date.now(),
];

let n = 2;
n **= 2;
export const syntaxUsed = [2 ** 3, n, new Date(), (1.5).toFixed(1)];
