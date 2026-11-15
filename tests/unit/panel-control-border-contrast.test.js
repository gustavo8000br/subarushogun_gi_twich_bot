import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// F-05 / AC-S13-5 (WCAG 1.4.11 Non-text Contrast): the boundary of every form control must reach 3:1.
// Static computation on the CSS source (WCAG 2.x relative luminance); it is not a browser measurement.
const css = readFileSync('apps/frontend/styles/panel.css', 'utf8');

function luminance(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value;
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({ selector: match[1].trim(), body: match[2] }));
const token = /--control-border:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1];
const CONTROL = /(^|[\s,>])([\w.-]*\s*)?(input|select|textarea)\b|\.widget-link-value/;
const controlRules = rules.filter(({ selector, body }) => CONTROL.test(selector) && /(^|;)\s*border\s*:/.test(body) && !/:focus/.test(selector));
// Dark surfaces a control can sit on: every opaque 6-digit background hex that is darker than a mid-grey.
const surfaces = [...new Set([...css.matchAll(/(?:background(?:-color)?|--surface[\w-]*)\s*:\s*(#[0-9a-fA-F]{6})\b/g)].map((match) => match[1].toLowerCase()))]
  .filter((hex) => luminance(hex) < 0.02);

describe('panel form-control border contrast (WCAG 1.4.11)', () => {
  it('defines the control-border token', () => {
    expect(token).toBeTruthy();
    expect(controlRules.length).toBeGreaterThanOrEqual(10);
    expect(surfaces.length).toBeGreaterThanOrEqual(6);
  });

  it('reaches 3:1 against every dark surface used by the panel', () => {
    for (const surface of surfaces) expect(contrast(token, surface), `${token} on ${surface}`).toBeGreaterThanOrEqual(3);
  });

  it('is the only border color of every input, select, textarea and link field', () => {
    for (const { selector, body } of controlRules) {
      expect(/(^|;)\s*border\s*:\s*1px solid var\(--control-border\)/.test(body), selector).toBe(true);
    }
  });

  it('no longer relies on undefined custom properties', () => {
    for (const name of ['--border', '--text-primary', '--text-secondary']) expect(css, name).toMatch(new RegExp(`${name}:\\s*#`));
  });

  // F-08 (touch target) and F-09 (small-label contrast), same S-13 review.
  it('keeps editor controls at 44 px on phones and section eyebrows above 4.5:1', () => {
    const phone = rules.find(({ selector, body }) => /widget-editor-form input/.test(selector) && /min-height:\s*44px/.test(body));
    expect(phone).toBeTruthy();
    const eyebrow = rules.find(({ selector }) => selector === '.section-heading .eyebrow');
    const color = /color:\s*(#[0-9a-fA-F]{6})/.exec(eyebrow.body)[1];
    expect(contrast(color, '#0c0d12')).toBeGreaterThanOrEqual(4.5 + 0.5);
  });
});

