import { runCheck } from './check.mjs';
import { runSubdomains } from './subdomains.mjs';
import { runBuild } from './build.mjs';

const [commande = 'aide', ...reste] = process.argv.slice(2);

const commandes = {
  subdomains: () => runSubdomains(reste),
  check: () => runCheck(reste),
  build: () => runBuild(),
  all: async () => {
    await runSubdomains(reste);
    await runCheck(['--candidats', ...reste]);
    runBuild();
  },
};

if (!commandes[commande]) {
  console.log(`Commandes : ${Object.keys(commandes).join(', ')}`);
  process.exit(commande === 'aide' ? 0 : 1);
}
await commandes[commande]();
