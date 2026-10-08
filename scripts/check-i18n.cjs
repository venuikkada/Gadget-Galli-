#!/usr/bin/env node
/**
 * Translation checks for the mobile app (run: pnpm i18n:check).
 *
 * 1. te.ts and hi.ts against en.ts, key by key: no missing/extra keys, same key order, the same
 *    {{placeholders}}, the same line breaks, brand names and codes kept verbatim (WhatsApp, UPI…).
 * 2. Every t('…') key used in apps/mobile/src exists in en.ts.
 * Exits 1 and lists the problems if anything is off.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const I18N = path.join(repoRoot, 'apps/mobile/src/shared/i18n');
const ts = require(require.resolve('typescript', { paths: [repoRoot] }));

function load(file, name) {
  const src = fs.readFileSync(file, 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: path.basename(file),
    reportDiagnostics: true,
  });
  if (out.diagnostics && out.diagnostics.length) {
    for (const d of out.diagnostics) console.log(`${file}: syntax: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
    process.exit(1);
  }
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: (m) => {
      throw new Error(`${file} has a runtime import of ${m}; only "import type" is expected`);
    },
  };
  vm.runInNewContext(out.outputText, sandbox, { filename: file });
  const obj = module.exports[name];
  if (!obj || typeof obj !== 'object') {
    console.log(`${file}: export "${name}" not found`);
    process.exit(1);
  }
  return obj;
}

/** Flatten to ordered [path, value] pairs, keeping non-string leaves so they can be reported. */
function flatten(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out);
    else out.push([p, v]);
  }
  return out;
}

const placeholders = (s) => (s.match(/\{\{\s*[\w.]+\s*\}\}/g) || []).map((x) => x.replace(/\s+/g, '')).sort();
const newlines = (s) => (s.match(/\n/g) || []).length;

// Latin-script tokens that must appear verbatim in the translation whenever they appear in English.
const KEEP = [
  'Gadget Galli', 'WhatsApp Business', 'WhatsApp', 'Google Maps', 'Google Sheets', 'Google Business',
  'Porter', 'Rapido', 'Uber', 'PhonePe', 'GPay', 'Paytm', 'iPhone', 'Excel',
  'UPI', 'OTP', 'GST', 'MRP', 'CSV', 'QR', 'ID', 'RAM', 'CCTV', 'PAN', 'DL', 'SMS',
  'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'shopname@okhdfcbank',
  'name, brand, model_number, category, condition, price, mrp, stock_qty, warranty_months',
  'new, open_box, refurbished', 'used',
  '+91 90000 00001', '+91 90000 10002', '123456', '98765 43210', 'rtx 4060', 'iphone 15',
  '₹', '👉', '👋', '🎉', '★', '·', '→', '…',
];
// "used" and "new, open_box, refurbished" are only literal codes inside the bulk-upload strings.
const KEEP_ONLY_IN = { used: /^p\.bulk\./, 'new, open_box, refurbished': /^p\.bulk\./ };
const countOf = (s, tok) => s.split(tok).length - 1;


function compareLanguage(exportName) {
  const en = flatten(load(path.join(I18N, 'en.ts'), 'en'));
  const xx = flatten(load(path.join(I18N, `${exportName}.ts`), exportName));
  const enMap = new Map(en);
  const xxMap = new Map(xx);
  const problems = [];

  for (const [k] of en) if (!xxMap.has(k)) problems.push(`missing key: ${k}`);
  for (const [k] of xx) if (!enMap.has(k)) problems.push(`extra key: ${k}`);

  // Key order: compare the sequence of keys both files share.
  const shared = en.map(([k]) => k).filter((k) => xxMap.has(k));
  const xxShared = xx.map(([k]) => k).filter((k) => enMap.has(k));
  for (let i = 0; i < shared.length; i++) {
    if (shared[i] !== xxShared[i]) {
      problems.push(`key order differs at position ${i}: en has ${shared[i]}, ${exportName} has ${xxShared[i]}`);
      break;
    }
  }

  let identical = 0;
  const identicalKeys = [];
  for (const [k, enVal] of en) {
    if (!xxMap.has(k)) continue;
    const v = xxMap.get(k);
    if (typeof v !== 'string') { problems.push(`${k}: not a string (${typeof v})`); continue; }
    if (!v.trim()) { problems.push(`${k}: empty string`); continue; }

    const a = placeholders(enVal).join(',');
    const b = placeholders(v).join(',');
    if (a !== b) problems.push(`${k}: placeholders differ\n    en: [${a}]\n    ${exportName}: [${b}]`);
    // Any brace use that is not a well-formed {{name}} (e.g. "{count}}", "{{ count }") is suspicious.
    const stray = v.replace(/\{\{\w+\}\}/g, '').match(/[{}]/g);
    if (stray) problems.push(`${k}: stray brace(s) outside {{placeholders}}: ${JSON.stringify(v)}`);

    if (newlines(enVal) !== newlines(v)) problems.push(`${k}: line breaks differ (en ${newlines(enVal)}, ${exportName} ${newlines(v)})`);

    for (const tok of KEEP) {
      if (KEEP_ONLY_IN[tok] && !KEEP_ONLY_IN[tok].test(k)) continue;
      const re = /^[A-Za-z]/.test(tok) ? new RegExp(`(^|[^A-Za-z_])${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z_])`, 'g') : null;
      const n = re ? (enVal.match(re) || []).length : countOf(enVal, tok);
      if (!n) continue;
      const m = re ? (v.match(re) || []).length : countOf(v, tok);
      if (m < n) problems.push(`${k}: "${tok}" appears ${n}x in en but ${m}x in ${exportName}`);
    }

    if (/[​-‍⁠﻿]/.test(v)) problems.push(`${k}: contains a zero-width character`);

    if (v === enVal) { identical++; identicalKeys.push(k); }
  }

  return { problems, count: xx.length, identical };
}

function usedKeysMissing() {
  const en = load(path.join(I18N, 'en.ts'), 'en');
  const has = (key) => key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), en) !== undefined;
  const missing = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f) && !p.includes(`${path.sep}i18n${path.sep}`)) {
        const text = fs.readFileSync(p, 'utf8');
        for (const m of text.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) if (!has(m[1])) missing.push(`${path.relative(repoRoot, p)}: t('${m[1]}') is not in en.ts`);
        for (const m of text.matchAll(/\bt\(\s*`([a-zA-Z0-9_.]+)\.\$\{/g)) if (!has(m[1])) missing.push(`${path.relative(repoRoot, p)}: t(\`${m[1]}.\${…}\`) prefix is not in en.ts`);
      }
    }
  };
  walk(path.join(repoRoot, 'apps/mobile/src'));
  return missing;
}

let failed = false;
for (const lang of ['te', 'hi']) {
  const { problems, count, identical } = compareLanguage(lang);
  if (problems.length) {
    failed = true;
    console.log(`✘ ${lang}.ts`);
    for (const p of problems) console.log(`  ${p}`);
  } else {
    console.log(`✔ ${lang}.ts: ${count} strings match en.ts (${identical} kept in English on purpose)`);
  }
}
const missing = usedKeysMissing();
if (missing.length) {
  failed = true;
  console.log('✘ keys used in code but missing from en.ts');
  for (const m of missing) console.log(`  ${m}`);
} else {
  console.log('✔ every t() key used in the app exists in en.ts');
}
process.exit(failed ? 1 : 0);
