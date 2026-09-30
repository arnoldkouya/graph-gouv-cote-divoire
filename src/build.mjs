import { path, readCsv, readJson, readText, writeJson, writeText, toCsv, config, today } from './lib.mjs';

export const SITE_COLS = [
  'url', 'domaine', 'type', 'statut', 'code_http', 'url_finale', 'tls_erreur', 'verifie_le',
  'site_parent', 'organisme', 'pole', 'rattachement', 'source', 'note',
];

/* ------------------------------------------------------------------ assemblage */

export function assemble({ entites, seed, checks, candidats }) {
  const parId = new Map(entites.map((e) => [e.id, e]));
  const avertissements = [];
  const sites = new Map();

  const finir = (base, entite, parent) => {
    const chk = checks[base.domaine];
    const statut = chk?.statut ?? 'Non vérifié';
    const pole = parId.get(entite.pole);
    const archive = statut === 'Hors ligne' || statut === 'Redirigé';
    return {
      url: `https://${base.domaine}`,
      domaine: base.domaine,
      type: archive ? 'archivé' : parent ? 'sous-domaine' : 'site',
      statut,
      code_http: chk?.code_http ?? '',
      url_finale: chk?.url_finale ?? '',
      tls_erreur: chk?.tls_erreur ? 'oui' : '',
      verifie_le: chk?.verifie_le ?? '',
      site_parent: parent ?? '',
      organisme: entite.nom,
      entite: entite.id,
      pole: pole.nom,
      pole_id: pole.id,
      rattachement: base.rattachement,
      source: base.source,
      note: [base.note, chk?.note].filter(Boolean).join(' — '),
    };
  };

  for (const s of seed) {
    const entite = parId.get(s.entite);
    if (!entite) { avertissements.push(`Entité inconnue « ${s.entite} » pour ${s.domaine}`); continue; }
    if (sites.has(s.domaine)) { avertissements.push(`Doublon dans config/sites.csv : ${s.domaine}`); continue; }
    sites.set(s.domaine, finir(s, entite, s.parent || null));
  }
  for (const s of sites.values()) {
    if (s.site_parent && !sites.has(s.site_parent)) {
      avertissements.push(`Site parent absent : ${s.site_parent} (pour ${s.domaine})`);
      s.site_parent = '';
      if (s.type === 'sous-domaine') s.type = 'site';
    }
  }

  const aRattacher = parId.get('a-rattacher');
  for (const c of candidats) {
    if (sites.has(c.domaine) || checks[c.domaine]?.statut !== 'En ligne') continue;
    const parent = c.parent && sites.get(c.parent);
    const entite = parent ? parId.get(parent.entite) : aRattacher;
    if (!entite) continue;
    sites.set(
      c.domaine,
      finir({ domaine: c.domaine, rattachement: parent ? 'site parent' : 'à rattacher', source: c.source, note: '' }, entite, parent ? c.parent : null),
    );
  }

  const ordrePole = new Map(entites.filter((e) => e.pole === e.id).map((e, i) => [e.id, i]));
  const liste = [...sites.values()].sort(
    (a, b) => ordrePole.get(a.pole_id) - ordrePole.get(b.pole_id) || a.domaine.localeCompare(b.domaine),
  );
  return { sites: liste, avertissements };
}

/* -------------------------------------------------------------------- placement */

const PAS = { 0: 34, 1: 20, 2: 12 };
const BASE = { 0: 54, 1: 30, 2: 18 };

function mesurer(n, profondeur) {
  if (!n.enfants.length) { n.ext = 6; n.r = 0; return; }
  for (const k of n.enfants) mesurer(k, profondeur + 1);
  const pas = PAS[Math.min(profondeur, 2)];
  n.largeurs = n.enfants.map((k) => 2 * k.ext + pas);
  const somme = n.largeurs.reduce((a, b) => a + b, 0);
  n.r = Math.max(BASE[Math.min(profondeur, 2)], somme / (2 * Math.PI));
  n.ext = n.r + Math.max(...n.enfants.map((k) => k.ext)) + 4;
}


function placer(n) {
  if (!n.enfants.length) return;
  const somme = n.largeurs.reduce((a, b) => a + b, 0);
  let angle = n.angle0 ?? 0;
  n.enfants.forEach((k, i) => {
    const part = (n.largeurs[i] / somme) * 2 * Math.PI;
    const mid = angle + part / 2;
    k.x = n.x + n.r * Math.cos(mid);
    k.y = n.y + n.r * Math.sin(mid);
    k.angle0 = mid - Math.PI; // l'éventail des enfants s'ouvre à l'opposé du parent
    angle += part;
    placer(k);
  });
}

export function calculerCarte(entites, sites) {
  const poles = entites.filter((e) => e.pole === e.id);
  const noeuds = [];
  const aretes = [];
  const idxPole = new Map();
  const arbres = [];

  for (const p of poles) {
    const membres = entites.filter((e) => e.pole === p.id && e.id !== p.id);
    const sitesPole = sites.filter((s) => s.pole_id === p.id);
    if (p.id === 'a-rattacher' && !sitesPole.length) continue;
    idxPole.set(p.id, arbres.length);

    const hub = { id: `e:${p.id}`, l: p.court, k: 'pole', ref: p.id, enfants: [], p: arbres.length };
    const parEntite = new Map([[p.id, hub]]);
    for (const e of membres) {
      const n = { id: `e:${e.id}`, l: e.court, k: 'entite', ref: e.id, enfants: [], p: arbres.length };
      parEntite.set(e.id, n);
      hub.enfants.push(n);
    }
    const parSite = new Map();
    for (const s of sitesPole) {
      parSite.set(s.domaine, {
        id: `s:${s.domaine}`, l: s.domaine, k: s.type === 'sous-domaine' ? 'sous-domaine' : 'site',
        ref: s.domaine, statut: s.statut, type: s.type, enfants: [], p: arbres.length,
      });
    }
    for (const s of sitesPole) {
      const n = parSite.get(s.domaine);
      const parent = s.site_parent && parSite.get(s.site_parent);
      (parent || parEntite.get(s.entite)).enfants.push(n);
    }
    mesurer(hub, 0);
    hub.ext = Math.max(hub.ext, 52); // place réservée à l'étiquette du pôle
    arbres.push(hub);
  }

  // Président au centre, Premier ministre à côté, les autres pôles sur un anneau.
  const [pres, prim, ...autres] = ['presidence', 'primature'].map((id) => arbres[idxPole.get(id)]).concat(
    arbres.filter((a) => a.ref !== 'presidence' && a.ref !== 'primature'),
  );
  pres.x = 0; pres.y = 0;
  prim.x = pres.ext + prim.ext + 40; prim.y = 0;
  const largeurs = autres.map((a) => 2 * a.ext + 56);
  const total = largeurs.reduce((a, b) => a + b, 0);
  const Rmin = pres.ext + 2 * prim.ext + Math.max(...autres.map((a) => a.ext)) + 140;
  const R = Math.max(Rmin, total / (2 * Math.PI));
  let angle = -Math.PI / 2;
  autres.forEach((a, i) => {
    const part = (largeurs[i] / total) * 2 * Math.PI;
    const mid = angle + part / 2;
    a.x = R * Math.cos(mid); a.y = R * Math.sin(mid);
    angle += part;
  });
  for (const a of [pres, prim, ...autres]) { a.angle0 = 0; placer(a); }

  const index = new Map();
  const parcourir = (n, parent) => {
    index.set(n.id, noeuds.length);
    noeuds.push({ id: n.id, l: n.l, k: n.k, x: +n.x.toFixed(1), y: +n.y.toFixed(1), p: n.p, s: n.statut ?? '', t: n.type ?? '', ref: n.ref });
    if (parent) aretes.push([index.get(parent.id), index.get(n.id)]);
    for (const k of n.enfants) parcourir(k, n);
  };
  for (const a of [pres, prim, ...autres]) parcourir(a, null);
  // Le Premier ministre est relié au Président, et à chaque ministère.
  aretes.push([index.get(pres.id), index.get(prim.id)]);
  for (const a of autres) if (poles.find((p) => p.id === a.ref)?.type === 'ministere') aretes.push([index.get(prim.id), index.get(a.id), 1]);

  const ordre = [pres, prim, ...autres];
  return { noeuds, aretes, ordrePoles: ordre.map((a) => a.ref) };
}

/* --------------------------------------------------------------------- exports */

const xml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

export function versGexf(carte, titre) {
  const noeuds = carte.noeuds
    .map(
      (n, i) => `      <node id="${i}" label="${xml(n.l)}"><attvalues><attvalue for="0" value="${xml(n.k)}"/><attvalue for="1" value="${xml(n.s)}"/><attvalue for="2" value="${n.p}"/></attvalues><viz:position x="${n.x}" y="${n.y}" z="0"/></node>`,
    )
    .join('\n');
  const aretes = carte.aretes.map(([a, b], i) => `      <edge id="${i}" source="${a}" target="${b}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gexf xmlns="http://gexf.net/1.3" xmlns:viz="http://gexf.net/1.3/viz" version="1.3">
  <meta lastmodifieddate="${today()}"><creator>graph-gouv-cote-divoire</creator><description>${xml(titre)}</description></meta>
  <graph defaultedgetype="undirected">
    <attributes class="node">
      <attribute id="0" title="type" type="string"/>
      <attribute id="1" title="statut" type="string"/>
      <attribute id="2" title="pole" type="integer"/>
    </attributes>
    <nodes>
${noeuds}
    </nodes>
    <edges>
${aretes}
    </edges>
  </graph>
</gexf>
`;
}

export function rapport({ sites, entites, avertissements }) {
  const compte = (f) => sites.filter(f).length;
  const sansSite = entites.filter(
    (e) => (e.type === 'ministere' || e.type === 'ministere_delegue') && !sites.some((s) => s.entite === e.id),
  );
  const ligne = (s) => `- ${s.domaine} — ${s.organisme}`;
  return `# Rapport de construction (${today()})

- ${sites.length} sites et sous-domaines : ${compte((s) => s.type === 'site')} sites, ${compte((s) => s.type === 'sous-domaine')} sous-domaines, ${compte((s) => s.type === 'archivé')} archivés.
- Statuts : ${['En ligne', 'Redirigé', 'Hors ligne', 'Indéterminé', 'Non vérifié'].map((k) => `${compte((s) => s.statut === k)} ${k.toLowerCase()}`).join(', ')}.

## Ministères et entités sans site connu (${sansSite.length})
${sansSite.map((e) => `- ${e.nom}`).join('\n') || '_aucun_'}

## Rattachements à confirmer (« déduit »)
${sites.filter((s) => s.rattachement === 'déduit').map(ligne).join('\n') || '_aucun_'}

## Sites non vérifiés (lancer \`npm run check\`)
${sites.filter((s) => s.statut === 'Non vérifié').map(ligne).join('\n') || '_aucun_'}

## Sites à rattacher
${sites.filter((s) => s.pole_id === 'a-rattacher').map(ligne).join('\n') || '_aucun_'}

## Avertissements
${avertissements.map((a) => `- ${a}`).join('\n') || '_aucun_'}
`;
}

export function runBuild() {
  const cfg = config();
  const entites = readCsv(path('config', 'entites.csv'));
  const seed = readCsv(path('config', 'sites.csv'));
  const checks = readJson(path('donnees', 'checks', 'latest.json'), { resultats: {} }).resultats;
  const candidats = readJson(path('donnees', 'candidats.json'), []);

  const { sites, avertissements } = assemble({ entites, seed, checks, candidats });
  const carte = calculerCarte(entites, sites);
  const titre = cfg.site?.titre ?? 'Sites web publics de Côte d\'Ivoire';

  const propres = sites.map(({ entite, pole_id, ...s }) => s);
  writeText(path('donnees', 'sites.csv'), toCsv(propres, SITE_COLS));
  writeText(path('donnees', 'sites.json'), '[\n' + propres.map((s) => JSON.stringify(s)).join(',\n') + '\n]\n');

  const poles = carte.ordrePoles.map((id) => {
    const e = entites.find((x) => x.id === id);
    return { id, nom: e.nom, court: e.court, type: e.type };
  });
  const data = {
    titre,
    genere_le: today(),
    poles,
    entites: entites.map(({ id, nom, court, type, pole }) => ({ id, nom, court, type, pole })),
    sites,
    noeuds: carte.noeuds,
    aretes: carte.aretes,
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const out = path('out', 'web');
  const page = readText(path('web', 'index.html'))
    .replace('/*DATA*/null', () => json)
    .replaceAll('__TITRE__', titre);
  writeText(path(out, 'index.html'), page);
  writeText(path(out, 'data.json'), json + '\n');
  writeText(path(out, 'sites.csv'), toCsv(propres, SITE_COLS));
  writeText(path(out, 'sites.json'), JSON.stringify(propres, null, 1) + '\n');
  writeText(path(out, 'carte.gexf'), versGexf(carte, titre));
  writeText(path('out', 'rapport.md'), rapport({ sites, entites, avertissements }));
  if (cfg.site?.domaine) writeText(path(out, 'CNAME'), cfg.site.domaine + '\n'); // domaine personnalisé GitHub Pages

  console.log(`Carte construite : ${sites.length} sites, ${carte.noeuds.length} nœuds → out/web/`);
  for (const a of avertissements) console.warn('Avertissement :', a);
}
