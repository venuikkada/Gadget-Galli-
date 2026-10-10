import { describe, expect, it } from 'vitest';

import {
  avatarColors,
  bannerPresets,
  bannerStyle,
  blend,
  contrast,
  darkTokens,
  families,
  gradients,
  lightTokens,
  ORDER_STATUSES,
  readableOn,
  statusPalette,
  type ThemeTokens,
} from '../index';

const TEXT = 4.5; // WCAG AA for normal text
const ICON = 3; // WCAG AA for icons and large text

/** Every text-on-colour pair the apps draw, per theme. `alpha` is for semi-transparent captions. */
function pairs(t: ThemeTokens): [string, string, string, number][] {
  const list: [string, string, string, number][] = [];
  const add = (name: string, fg: string, bg: string, min = TEXT) => list.push([name, fg, bg, min]);
  for (const bg of ['background', 'surface', 'elevated', 'surfaceAlt'] as const) {
    add(`text on ${bg}`, t.text, t[bg]);
    add(`textMuted on ${bg}`, t.textMuted, t[bg]);
    add(`textSubtle on ${bg}`, t.textSubtle, t[bg]);
    add(`primary on ${bg}`, t.primary, t[bg]);
    add(`offer on ${bg}`, t.offer, t[bg]);
    add(`error on ${bg}`, t.error, t[bg]);
  }
  add('primary on primarySoft', t.primary, t.primarySoft);
  add('onPrimary on primary', t.onPrimary, t.primary);
  add('onPrimary on primaryPressed', t.onPrimary, t.primaryPressed);
  add('onAction on action', t.onAction, t.action);
  add('onAction on actionPressed', t.onAction, t.actionPressed);
  add('82% caption on action', blend(t.onAction, t.action, 0.82), t.action);
  add('action on actionSoft', t.action, t.actionSoft);
  add('onAccent on accent', t.onAccent, t.accent);
  add('onAccent on accentPressed', t.onAccent, t.accentPressed);
  add('accentInk on accentSoft', t.accentInk, t.accentSoft);
  add('accentInk on surface', t.accentInk, t.surface);
  add('onSuccess on success', t.onSuccess, t.success);
  add('success on successSoft', t.success, t.successSoft);
  add('onWarning on warning', t.onWarning, t.warning);
  add('warning on warningSoft', t.warning, t.warningSoft);
  add('onError on error', t.onError, t.error);
  add('error on errorSoft', t.error, t.errorSoft);
  add('onWhatsapp on whatsapp', t.onWhatsapp, t.whatsapp);
  add('onInverse on inverse', t.onInverse, t.inverse);
  add('star icon on surface', t.star, t.surface, t === lightTokens ? 1.5 : ICON); // stars always sit next to a number
  return list;
}

describe('palette contrast', () => {
  for (const [mode, t] of [['light', lightTokens], ['dark', darkTokens]] as const) {
    it(`${mode} theme: every text-on-colour pair is readable`, () => {
      const failures = pairs(t)
        .map(([name, fg, bg, min]) => ({ name, ratio: contrast(fg, bg), min }))
        .filter((p) => p.ratio < p.min)
        .map((p) => `${p.name}: ${p.ratio.toFixed(2)} < ${p.min}`);
      expect(failures).toEqual([]);
    });

    it(`${mode} theme: text on the brand gradients is readable`, () => {
      const g = gradients[mode];
      const onBrandMuted = (bg: string) => blend('#FFFFFF', bg, 0.85);
      for (const stop of [...g.header, ...g.partnerHeader]) {
        expect(contrast('#FFFFFF', stop)).toBeGreaterThanOrEqual(TEXT);
        expect(contrast(onBrandMuted(stop), stop)).toBeGreaterThanOrEqual(TEXT);
      }
      // The open/closed shop cards use full white for every line (85% white is 4.4:1 there).
      for (const stop of [...g.open, ...g.closed]) expect(contrast('#FFFFFF', stop)).toBeGreaterThanOrEqual(TEXT);
      for (const stop of g.header) expect(contrast(t.accent, stop)).toBeGreaterThanOrEqual(ICON); // marigold pin/badge
      for (const stop of g.cartBar) {
        expect(contrast(t.onAction, stop)).toBeGreaterThanOrEqual(TEXT);
        expect(contrast(blend(t.onAction, stop, 0.82), stop)).toBeGreaterThanOrEqual(TEXT);
      }
    });

    it(`${mode} theme: order status chips are readable`, () => {
      for (const s of ORDER_STATUSES) {
        const c = statusPalette[mode][s];
        expect(contrast(c.fg, c.bg), s).toBeGreaterThanOrEqual(TEXT);
      }
    });

    it(`${mode} theme: category family icons stand out on their tiles`, () => {
      for (const f of Object.values(families)) {
        const c = f[mode];
        expect(contrast(c.icon, c.tint), f.key).toBeGreaterThanOrEqual(TEXT);
        expect(contrast(c.icon, c.tint2), f.key).toBeGreaterThanOrEqual(ICON);
      }
    });
  }

  it('banner presets and shop-logo colours carry readable text', () => {
    for (const p of bannerPresets) for (const stop of p.gradient) expect(contrast(p.text, stop), p.key).toBeGreaterThanOrEqual(TEXT);
    for (const c of avatarColors) expect(contrast('#FFFFFF', c), c).toBeGreaterThanOrEqual(TEXT);
  });

  it('marigold never carries white text', () => {
    expect(contrast('#FFFFFF', lightTokens.accent)).toBeLessThan(TEXT);
    expect(readableOn(lightTokens.accent)).not.toBe('#FFFFFF');
  });

  it('banner colours from before the redesign map to the new presets', () => {
    expect(bannerStyle('#4F46E5').gradient).toEqual(bannerPresets[0].gradient);
    expect(bannerStyle('#ff6b35').text).toBe(bannerPresets.find((p) => p.key === 'marigold')!.text);
    const custom = bannerStyle('#123456');
    expect(custom.gradient[0]).toBe('#123456');
    expect(contrast(custom.text, custom.gradient[0])).toBeGreaterThanOrEqual(TEXT);
  });
});
