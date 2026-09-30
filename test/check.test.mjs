import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { probe, classify } from '../src/check.mjs';

function serveur() {
  const s = http.createServer((req, res) => {
    if (req.url === '/ok') { res.writeHead(200); res.end('ok'); }
    else if (req.url === '/interdit') { res.writeHead(403); res.end(); }
    else if (req.url === '/absent') { res.writeHead(404); res.end(); }
    else if (req.url === '/panne') { res.writeHead(503); res.end(); }
    else if (req.url === '/interne') { res.writeHead(302, { location: '/ok' }); res.end(); }
    else if (req.url === '/ailleurs') { res.writeHead(301, { location: 'http://example.org/' }); res.end(); }
    else if (req.url === '/boucle') { res.writeHead(302, { location: '/boucle' }); res.end(); }
    else { res.writeHead(500); res.end(); }
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

test('probe et classify sur un serveur local', async (t) => {
  const s = await serveur();
  t.after(() => s.close());
  const base = `http://127.0.0.1:${s.address().port}`;
  const cas = async (chemin) => {
    const r = await probe(base + chemin, { timeoutMs: 3000 });
    return { r, c: classify('127.0.0.1', r) };
  };
  assert.equal((await cas('/ok')).c.statut, 'En ligne');
  assert.equal((await cas('/interdit')).c.statut, 'En ligne'); // accès restreint : pas une erreur
  assert.equal((await cas('/absent')).c.statut, 'Hors ligne');
  assert.equal((await cas('/panne')).c.statut, 'Indéterminé');
  const interne = await cas('/interne');
  assert.equal(interne.c.statut, 'En ligne');
  assert.ok(interne.r.url.endsWith('/ok'));
  assert.equal((await cas('/boucle')).r.error, 'TOO_MANY_REDIRECTS');
});

test('une redirection vers un autre domaine est « Redirigé »', () => {
  const c = classify('ancien.gouv.ci', { status: 200, url: 'https://nouveau.gouv.ci/' });
  assert.equal(c.statut, 'Redirigé');
  assert.equal(classify('a.gouv.ci', { status: 200, url: 'https://www.a.gouv.ci/x' }).statut, 'En ligne');
});

test('domaine introuvable = hors ligne, délai dépassé = indéterminé', () => {
  assert.equal(classify('x.ci', { error: 'ENOTFOUND', url: 'https://x.ci' }).statut, 'Hors ligne');
  assert.equal(classify('x.ci', { error: 'ETIMEDOUT', url: 'https://x.ci' }).statut, 'Indéterminé');
});
