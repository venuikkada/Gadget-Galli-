import { describe, expect, it } from 'vitest';

import { deviceArtDataUri, deviceArtSvg, deviceKindFor, type DeviceKind } from '../art/deviceArt';

describe('deviceKindFor', () => {
  it('uses the category first', () => {
    expect(deviceKindFor('mobiles', 'Anything')).toBe('phone');
    expect(deviceKindFor('dvr-nvr')).toBe('dvr');
    expect(deviceKindFor('power-banks', 'Mi 20000 mAh')).toBe('powerBank');
  });

  it('guesses from the product name when the category is unknown', () => {
    const cases: [string, DeviceKind][] = [
      ['ZOTAC Gaming GeForce RTX 4060 Twin Edge', 'gpu'],
      ['AMD Ryzen 5 7600 Processor', 'cpu'],
      ['Apple iPhone 15 (128 GB, Black)', 'phone'],
      ['Spigen Tough Armor case for iPhone 15', 'phoneCase'],
      ['ASUS TUF Gaming A15 laptop', 'laptop'],
      ['Hikvision 4 channel CCTV camera kit', 'cctvKit'],
      ['WD Purple 1 TB surveillance hard disk', 'hdd'],
      ['Samsung 980 NVMe M.2 SSD', 'ssd'],
      ['Corsair Vengeance DDR5 32 GB RAM', 'ram'],
      ['TP-Link Archer AX55 Wi-Fi router', 'router'],
      ['CCTV installation service', 'tools'],
    ];
    for (const [name, kind] of cases) expect(deviceKindFor(null, name), name).toBe(kind);
  });

  it('falls back to a box', () => {
    expect(deviceKindFor(null, 'Gift voucher')).toBe('box');
    expect(deviceKindFor('no-such-category')).toBe('box');
  });
});

describe('deviceArtSvg', () => {
  it('draws a self-contained SVG', () => {
    const svg = deviceArtSvg({ kind: 'gpu', seed: 'ZOTAC|RTX 4060' });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).not.toMatch(/undefined|NaN/);
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/); // no outside images (the CSP allows none)
  });

  it('is the same every time for the same product, and differs between products', () => {
    const a = deviceArtSvg({ kind: 'phone', seed: 'Apple|iPhone 15' });
    expect(deviceArtSvg({ kind: 'phone', seed: 'Apple|iPhone 15' })).toBe(a);
    const others = ['Samsung|Galaxy S24', 'OnePlus|12R', 'Xiaomi|Redmi Note 13', 'Google|Pixel 8'].map((seed) => deviceArtSvg({ kind: 'phone', seed }));
    expect(new Set([a, ...others]).size).toBeGreaterThan(1);
  });

  it('draws every kind', () => {
    const kinds: DeviceKind[] = [
      'phone', 'tablet', 'watch', 'earbuds', 'headphones', 'headset', 'charger', 'cable', 'phoneCase', 'screenGuard',
      'powerBank', 'cctvCamera', 'dvr', 'hdd', 'powerSupply', 'coaxCable', 'doorPhone', 'cctvKit', 'tools', 'laptop',
      'desktop', 'allInOne', 'monitor', 'gpu', 'cpu', 'motherboard', 'ram', 'ssd', 'psu', 'cabinet', 'cooler',
      'keyboard', 'mouse', 'webcam', 'printer', 'router', 'ups', 'speaker', 'box',
    ];
    for (const kind of kinds) {
      const svg = deviceArtSvg({ kind, seed: 'x', dark: true });
      expect(svg.length, kind).toBeGreaterThan(200);
      expect(svg, kind).not.toMatch(/undefined|NaN/);
    }
  });

  it('makes a data URI for <img>', () => {
    expect(deviceArtDataUri({ kind: 'laptop' })).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
  });
});
