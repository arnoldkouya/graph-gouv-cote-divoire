import test from 'node:test';
import assert from 'node:assert/strict';
import { path, readCsv } from '../src/lib.mjs';
import { assemble, calculerCarte } from '../src/build.mjs';

const entites = readCsv(path('config', 'entites.csv'));
const seed = readCsv(path('config', 'sites.csv'));

test('les données de référence sont cohérentes', () => {
  const ids = new Set(entites.map((e) => e.id));
  assert.equal(ids.size, entites.length, 'identifiants d\'entités uniques');
  for (const e of entites) {
    assert.ok(ids.has(e.pole), `pôle inconnu pour ${e.id}`);
    if (e.parent) assert.ok(ids.has(e.parent), `parent inconnu pour ${e.id}`);
  }
  const domaines = new Set();
  for (const s of seed) {
    assert.ok(ids.has(s.entite), `entité inconnue pour ${s.domaine}`);
    assert.ok(!domaines.has(s.domaine), `doublon ${s.domaine}`);
    assert.match(s.domaine, /^[a-z0-9.-]+\.ci$/);
    domaines.add(s.domaine);
  }
  assert.equal(entites.filter((e) => e.type === 'ministere').length, 30, '30 ministères (gouvernement du 23 janvier 2026)');
});

test('assemble : statut, archivage, candidats', () => {
  const checks = {
    'presidence.ci': { statut: 'En ligne', code_http: 200, tls_erreur: true, verifie_le: '2026-09-30' },
    'defense.gouv.ci': { statut: 'Hors ligne' },
    'nouveau.sante.gouv.ci': { statut: 'En ligne' },
    'inconnu.gouv.ci': { statut: 'En ligne' },
    'mort.sante.gouv.ci': { statut: 'Hors ligne' },
  };
  const candidats = [
    { domaine: 'nouveau.sante.gouv.ci', parent: 'sante.gouv.ci', source: 'crt.sh' },
    { domaine: 'inconnu.gouv.ci', parent: null, source: 'crt.sh' },
    { domaine: 'mort.sante.gouv.ci', parent: 'sante.gouv.ci', source: 'crt.sh' },
  ];
  const { sites, avertissements } = assemble({ entites, seed, checks, candidats });
  const par = (d) => sites.find((s) => s.domaine === d);
  assert.deepEqual(avertissements, []);
  assert.equal(par('presidence.ci').tls_erreur, 'oui');
  assert.equal(par('defense.gouv.ci').type, 'archivé');
  assert.equal(par('nouveau.sante.gouv.ci').type, 'sous-domaine');
  assert.equal(par('nouveau.sante.gouv.ci').entite, 'sante');
  assert.equal(par('inconnu.gouv.ci').pole_id, 'a-rattacher');
  assert.equal(par('mort.sante.gouv.ci'), undefined, 'un candidat hors ligne n\'est pas ajouté');
  assert.equal(par('finances.gouv.ci').statut, 'Non vérifié');
});

test('calculerCarte : positions finies, identifiants uniques, arêtes valides', () => {
  const { sites } = assemble({ entites, seed, checks: {}, candidats: [] });
  const { noeuds, aretes } = calculerCarte(entites, sites);
  assert.equal(new Set(noeuds.map((n) => n.id)).size, noeuds.length);
  for (const n of noeuds) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), `position de ${n.id}`);
  for (const [a, b] of aretes) assert.ok(noeuds[a] && noeuds[b]);
  for (const s of sites) assert.ok(noeuds.some((n) => n.id === `s:${s.domaine}`), `nœud de ${s.domaine}`);
  const pres = noeuds.find((n) => n.id === 'e:presidence');
  assert.deepEqual([pres.x, pres.y], [0, 0]);
});
