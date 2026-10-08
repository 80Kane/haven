import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = `${root}dist`;
await rm(target, { recursive: true, force: true });
await mkdir(target);
// Publish an allowlist, never .git, environment files, tests, or dependencies.
for (const path of ['index.html', 'resources.html', 'privacy.html', 'guidelines.html', '404.html', 'assets', 'data', 'CNAME', '.nojekyll']) {
  await cp(`${root}${path}`, `${target}/${path}`, { recursive: true });
}
console.log('Built static public site in dist/; no member services are included.');
