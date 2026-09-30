import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const path = (...parts) => resolve(ROOT, ...parts);

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

export function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

export const readText = (file) => readFileSync(file, 'utf8');
export const readCsv = (file) => parseCsv(readText(file));
export const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readText(file)) : fallback);

export function writeText(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}
export const writeJson = (file, data, pretty = true) =>
  writeText(file, JSON.stringify(data, null, pretty ? 2 : 0) + '\n');

export const config = () => readJson(path('config', 'config.json'), {});

const THREE_LABELS = new Set(['gouv.ci', 'co.ci', 'com.ci', 'org.ci', 'net.ci', 'edu.ci', 'asso.ci', 'or.ci', 'ac.ci', 'go.ci']);

export function hostOf(input) {
  const s = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  return new URL(s).hostname.toLowerCase().replace(/^www\./, '');
}

/** Domaine « propriétaire » : x.gouv.ci pour les sites de l'État, sinon les deux derniers libellés. */
export function registrable(host) {
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  const suffix2 = labels.slice(-2).join('.');
  return labels.slice(THREE_LABELS.has(suffix2) ? -3 : -2).join('.');
}

export const today = () => new Date().toISOString().slice(0, 10);

export function arg(name, argv = process.argv.slice(2)) {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
}

export async function pool(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
