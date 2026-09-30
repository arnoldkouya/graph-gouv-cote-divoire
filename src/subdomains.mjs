import { config, path, readCsv, readJson, writeJson, registrable, arg, sleep } from './lib.mjs';

async function crtsh(racine, tentatives = 3) {
  const url = `https://crt.sh/?q=${encodeURIComponent('%.' + racine)}&output=json`;
  for (let i = 1; i <= tentatives; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(90000), headers: { 'user-agent': 'graph-gouv-ci' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`  crt.sh ${racine} (essai ${i}/${tentatives}) : ${e.message}`);
      await sleep(4000 * i);
    }
  }
  return [];
}

export function nomsDepuisCrtsh(lignes, racine) {
  const noms = new Set();
  for (const l of lignes) {
    for (const n of String(l.name_value ?? '').split('\n')) {
      const nom = n.trim().toLowerCase().replace(/^\*\./, '');
      if (!nom || nom.includes('*') || !/^[a-z0-9.-]+$/.test(nom)) continue;
      if (nom === racine || nom.endsWith('.' + racine)) noms.add(nom.replace(/^www\./, ''));
    }
  }
  return [...noms];
}

/** Parent = le plus long site connu dont le candidat est un sous-domaine. */
export function trouverParent(nom, connus) {
  let best = null;
  for (const k of connus) {
    if (nom.endsWith('.' + k) && (!best || k.length > best.length)) best = k;
  }
  return best;
}

export async function runSubdomains(argv = process.argv.slice(2)) {
  const cfg = config().sousDomaines ?? {};
  const exclusions = (cfg.excludePatterns ?? []).map((p) => new RegExp(p, 'i'));
  const sites = readCsv(path('config', 'sites.csv'));
  const connus = new Set(sites.map((s) => s.domaine));

  const racines = new Set(cfg.racines ?? ['gouv.ci']);
  for (const d of connus) {
    const r = registrable(d);
    if (!r.endsWith('gouv.ci')) racines.add(r);
  }
  let liste = [...racines];
  const limit = Number(arg('limit', argv));
  if (limit) liste = liste.slice(0, limit);

  const trouves = new Map();
  for (const racine of liste) {
    console.log(`crt.sh : ${racine}`);
    const noms = nomsDepuisCrtsh(await crtsh(racine), racine);
    for (const nom of noms) {
      if (connus.has(nom) || trouves.has(nom)) continue;
      const etiquette = nom.slice(0, nom.length - racine.length - 1);
      if (nom !== racine && exclusions.some((re) => re.test(etiquette))) continue;
      trouves.set(nom, { domaine: nom, parent: trouverParent(nom, connus), source: `crt.sh (${racine})` });
    }
    await sleep(cfg.delaiMs ?? 2000);
  }
  const anciens = readJson(path('donnees', 'candidats.json'), []);
  const fusion = new Map(anciens.map((c) => [c.domaine, c]));
  for (const [k, v] of trouves) fusion.set(k, v);
  const out = [...fusion.values()].sort((a, b) => a.domaine.localeCompare(b.domaine));
  writeJson(path('donnees', 'candidats.json'), out);
  console.log(`${trouves.size} nouveau(x) candidat(s), ${out.length} au total.`);
}
