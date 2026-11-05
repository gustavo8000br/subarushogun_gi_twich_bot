import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('apps/frontend/styles/panel.css', 'utf8');

function stripBlocks(source, header) {
  let result = source;
  for (;;) {
    const start = result.indexOf(header);
    if (start < 0) return result;
    const open = result.indexOf('{', start);
    let depth = 0; let index = open;
    for (; index < result.length; index += 1) {
      if (result[index] === '{') depth += 1;
      if (result[index] === '}') { depth -= 1; if (depth === 0) break; }
    }
    result = result.slice(0, start) + result.slice(index + 1);
  }
}

function rules(source) {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({ selector: match[1].trim(), body: match[2] }));
}
const outcomeRules = rules(css).filter(({ selector }) => /\.outcome-/.test(selector));

function luminance(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value;
  const channels = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
export function contrast(foreground, background) {
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

describe('C23-02 / R8: the outcome region is legible (arithmetic on the DECLARED values, not a pixel measurement)', () => {
  it('declares outcome rules at all', () => {
    expect(outcomeRules.length).toBeGreaterThan(0);
  });

  it('the message text is at least 14px', () => {
    const message = outcomeRules.filter(({ selector }) => /^\.outcome-message(?![\w-])/.test(selector.split(',')[0].trim()) || selector.includes('.outcome-message'));
    const sizes = message.map(({ body }) => body.match(/font-size:\s*(\d+(?:\.\d+)?)px/)?.[1]).filter(Boolean).map(Number);
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
    const controls = outcomeRules.filter(({ selector }) => /outcome-(action|dismiss|controls)/.test(selector));
    for (const { body } of controls) {
      const size = body.match(/font-size:\s*(\d+(?:\.\d+)?)px/)?.[1];
      if (size) expect(Number(size)).toBeGreaterThanOrEqual(14);
    }
  });

  it('the status, warning and alert colors reach 4.5:1 on the declared region background', () => {
    const background = outcomeRules.map(({ body }) => body.match(/background(?:-color)?:\s*(#[0-9a-fA-F]{3,6})/)?.[1]).find(Boolean);
    expect(background).toMatch(/^#/);
    const colors = outcomeRules.filter(({ selector }) => /\.outcome-message/.test(selector)).map(({ selector, body }) => [selector, body.match(/(?:^|;|\s)color:\s*(#[0-9a-fA-F]{3,6})/)?.[1]]).filter(([, color]) => color);
    expect(colors.length).toBeGreaterThanOrEqual(2); // status + alert at least
    for (const [selector, color] of colors) expect(contrast(color, background), `${selector} ${color} on ${background}`).toBeGreaterThanOrEqual(4.5);
    const linkColors = outcomeRules.filter(({ selector }) => /outcome-(action|dismiss)/.test(selector)).map(({ body }) => body.match(/(?:^|;|\s)color:\s*(#[0-9a-fA-F]{3,6})/)?.[1]).filter(Boolean);
    for (const color of linkColors) expect(contrast(color, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('the contrast helper is correct (white on black is 21:1, grey #777 on white is below 4.5)', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrast('#777777', '#ffffff')).toBeLessThan(4.5);
  });
});

describe('C23-01 / UX-15: no outcome animation outside prefers-reduced-motion: no-preference', () => {
  it('has no animation or transition on the region outside the media block', () => {
    const outside = stripBlocks(css, '@media (prefers-reduced-motion: no-preference)');
    for (const { selector, body } of rules(outside).filter(({ selector }) => /\.outcome-/.test(selector))) {
      expect(body, selector).not.toMatch(/animation|transition|scroll-behavior:\s*smooth/);
    }
  });

  it('the sticky region leaves room for the focused title (scroll-margin on the focus targets)', () => {
    expect(css).toMatch(/\.queue-list-card h2\[tabindex\][^{}]*\{[^}]*scroll-margin-top/);
  });
});
