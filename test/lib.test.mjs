import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, toCsv, registrable, hostOf } from '../src/lib.mjs';
import { nomsDepuisCrtsh, trouverParent } from '../src/subdomains.mjs';

test('parseCsv gère les guillemets, virgules et sauts de ligne', () => {
  const rows = parseCsv('a,b\n"x, y","il dit ""oui"""\n1,2\r\n');
  assert.deepEqual(rows, [{ a: 'x, y', b: 'il dit "oui"' }, { a: '1', b: '2' }]);
});

test('toCsv échappe et parseCsv relit', () => {
  const rows = [{ a: 'x, y', b: 'z"' }];
  assert.deepEqual(parseCsv(toCsv(rows, ['a', 'b'])), rows);
});

test('registrable : x.gouv.ci pour les sites de l\'État', () => {
  assert.equal(registrable('finances.gouv.ci'), 'finances.gouv.ci');
  assert.equal(registrable('web.sante.gouv.ci'), 'sante.gouv.ci');
  assert.equal(registrable('www.assnat.ci'), 'assnat.ci');
  assert.equal(registrable('a.b.assnat.ci'), 'assnat.ci');
  assert.equal(registrable('gouv.ci'), 'gouv.ci');
});

test('hostOf retire www. et le chemin', () => {
  assert.equal(hostOf('https://www.Education.gouv.ci/index.php'), 'education.gouv.ci');
  assert.equal(hostOf('senat.ci'), 'senat.ci');
});

test('nomsDepuisCrtsh : jokers écartés, doublons fusionnés', () => {
  const lignes = [
    { name_value: '*.sante.gouv.ci\nsante.gouv.ci' },
    { name_value: 'www.plan.gouv.ci\nplan.gouv.ci' },
    { name_value: 'autre.exemple.com' },
  ];
  assert.deepEqual(nomsDepuisCrtsh(lignes, 'gouv.ci').sort(), ['plan.gouv.ci', 'sante.gouv.ci']);
});

test('trouverParent choisit le site connu le plus long', () => {
  const connus = new Set(['gouv.ci', 'sante.gouv.ci']);
  assert.equal(trouverParent('x.sante.gouv.ci', connus), 'sante.gouv.ci');
  assert.equal(trouverParent('y.plan.gouv.ci', connus), 'gouv.ci');
  assert.equal(trouverParent('zzz.exemple.com', connus), null);
});
