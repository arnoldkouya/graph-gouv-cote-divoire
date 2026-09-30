import http from 'node:http';
import https from 'node:https';
import { config, path, readCsv, readJson, writeJson, hostOf, registrable, today, arg, pool } from './lib.mjs';

const TLS_ERRORS = new Set([
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_NOT_YET_VALID',
]);

function request(url, { insecure = false, timeoutMs = 15000, userAgent = 'graph-gouv-ci' } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(
      u,
      {
        method: 'GET',
        timeout: timeoutMs,
        rejectUnauthorized: !insecure,
        headers: { 'user-agent': userAgent, accept: 'text/html,*/*;q=0.8' },
      },
      (res) => {
        resolve({ status: res.statusCode, location: res.headers.location });
        res.destroy();
      },
    );
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    req.end();
  });
}

/** Suit les redirections une à une ; un certificat en erreur est signalé mais n'empêche pas la lecture. */
export async function probe(startUrl, opts = {}) {
  let url = startUrl;
  let tlsErreur = false;
  for (let hop = 0; hop < 6; hop++) {
    let r;
    try {
      r = await request(url, opts);
    } catch (e) {
      if (!TLS_ERRORS.has(e.code)) return { error: e.code || e.message, tlsErreur, url };
      tlsErreur = true;
      try {
        r = await request(url, { ...opts, insecure: true });
      } catch (e2) {
        return { error: e2.code || e2.message, tlsErreur, url };
      }
    }
    if (r.status >= 300 && r.status < 400 && r.location) {
      url = new URL(r.location, url).href;
      continue;
    }
    return { status: r.status, url, tlsErreur };
  }
  return { error: 'TOO_MANY_REDIRECTS', tlsErreur, url };
}

export function classify(domaine, r) {
  if (r.error) {
    return r.error === 'ENOTFOUND'
      ? { statut: 'Hors ligne', note: 'domaine introuvable' }
      : { statut: 'Indéterminé', note: r.error };
  }
  const s = r.status;
  if ((s >= 200 && s < 400) || s === 401 || s === 403) {
    const arrivee = hostOf(r.url);
    return registrable(arrivee) === registrable(domaine)
      ? { statut: 'En ligne' }
      : { statut: 'Redirigé', note: `vers ${arrivee}` };
  }
  if (s === 404 || s === 410) return { statut: 'Hors ligne', note: `HTTP ${s}` };
  return { statut: 'Indéterminé', note: `HTTP ${s}` };
}

/** https, puis http, puis https://www. — la première réponse exploitable l'emporte. */
export async function checkDomain(domaine, opts = {}) {
  const outs = [];
  for (const url of [`https://${domaine}`, `http://${domaine}`, `https://www.${domaine}`]) {
    const r = await probe(url, opts);
    const c = classify(domaine, r);
    const out = { ...c, code_http: r.status ?? null, url_finale: r.url, tls_erreur: Boolean(r.tlsErreur) };
    if (c.statut === 'En ligne' || c.statut === 'Redirigé') return out;
    outs.push(out);
  }
  if (outs.every((o) => o.statut === 'Hors ligne')) return outs[0];
  return outs.find((o) => o.statut === 'Indéterminé') ?? outs[0];
}

export async function runCheck(argv = process.argv.slice(2)) {
  const cfg = config().check ?? {};
  const file = path('donnees', 'checks', 'latest.json');
  const previous = readJson(file, { resultats: {} });
  const domaines = new Set(readCsv(path('config', 'sites.csv')).map((s) => s.domaine));
  if (arg('candidats', argv)) {
    for (const c of readJson(path('donnees', 'candidats.json'), [])) domaines.add(c.domaine);
  }
  const only = arg('only', argv);
  let liste = [...domaines].filter((d) => {
    const prev = previous.resultats[d];
    if (only === 'new') return !prev;
    if (only === 'unknown') return !prev || prev.statut === 'Indéterminé';
    return true;
  });
  const limit = Number(arg('limit', argv));
  if (limit) liste = liste.slice(0, limit);

  console.log(`Vérification de ${liste.length} domaine(s)…`);
  const opts = { timeoutMs: cfg.timeoutMs, userAgent: cfg.userAgent };
  let done = 0;
  await pool(liste, cfg.concurrency ?? 8, async (d) => {
    const res = await checkDomain(d, opts);
    previous.resultats[d] = { ...res, verifie_le: today() };
    if (++done % 10 === 0 || done === liste.length) console.log(`  ${done}/${liste.length}`);
  });
  previous.verifie_le = today();
  writeJson(file, previous);
  const counts = {};
  for (const d of liste) counts[previous.resultats[d].statut] = (counts[previous.resultats[d].statut] ?? 0) + 1;
  console.log('Résultat :', counts);
}
