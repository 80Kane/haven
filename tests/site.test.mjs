import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
const pages = ['index.html', 'resources.html', 'privacy.html', 'guidelines.html', '404.html'];
test('public pages use local scripts and a restrictive CSP without inline handlers', async () => {
  for (const path of pages) {
    const html = await readFile(path, 'utf8');
    assert.match(html, /<html lang="en">/);
    assert.match(html, /id="main"/);
    assert.match(html, /Content-Security-Policy/);
    assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>|\son\w+=|href="#"/i);
    assert.doesNotMatch(html, /<form\b|type="email"|localStorage|sessionStorage/);
  }
});
test('all internal page, asset and fragment links resolve', async () => {
  for (const path of pages) {
    const html = await readFile(path, 'utf8');
    for (const match of html.matchAll(/(?:href|src)="([^" ]+)"/g)) {
      const href = match[1];
      if (/^(https:|tel:|sms:)/.test(href)) continue;
      const [file, fragment] = href.split('#');
      const target = file ? (file === '/' ? 'index.html' : file.replace(/^\//, '')) : path;
      await access(target);
      if (fragment) assert.ok((await readFile(target, 'utf8')).includes(`id="${fragment}"`), `${path}: ${href}`);
    }
  }
});
test('resource records have unique IDs, secure URLs, eligibility, and honest verification status', async () => {
  const resources = JSON.parse(await readFile('data/resources.json', 'utf8'));
  assert.equal(resources.length, 7);
  assert.equal(new Set(resources.map(r => r.id)).size, resources.length);
  const html = await readFile('resources.html', 'utf8');
  for (const resource of resources) {
    assert.equal(new URL(resource.url).protocol, 'https:');
    assert.ok(resource.eligibility && resource.region && resource.category);
    assert.equal(resource.lastVerified, null);
    assert.ok(html.includes(resource.url));
  }
  assert.match(html, /not yet independently verified/);
});
test('site has no invented engagement counts, endorsements, or activated member services', async () => {
  const html = await readFile('index.html', 'utf8');
  assert.doesNotMatch(html, /98,247|12,400|340\+|TRUSTED BY|Starlight_M|AI-guided|24\/7 Available/);
  assert.match(html, /Member enrollment is not open yet/);
  assert.match(html, /Hug reactions are planned/);
  assert.match(html, /Recovery &amp; Healing/);
  assert.match(html, /Choices &amp; Change/);
});
test('production domain remains unchanged', async () => {
  assert.equal((await readFile('CNAME', 'utf8')).trim().toLowerCase(), 'havenforward.com');
});
