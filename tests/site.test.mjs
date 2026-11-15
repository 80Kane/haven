import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
const pages = [
  "index.html",
  "resources.html",
  "privacy.html",
  "guidelines.html",
  "faq.html",
  "support.html",
  "404.html",
];
test("public pages use local scripts and a restrictive CSP without inline handlers", async () => {
  for (const path of pages) {
    const html = await readFile(path, "utf8");
    assert.match(html, /<html lang="en">/);
    assert.match(html, /id="main"/);
    assert.match(html, /Content-Security-Policy/);
    assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>|\son\w+=|href="#"/i);
    assert.doesNotMatch(
      html,
      /<form\b|type="email"|localStorage|sessionStorage/,
    );
  }
});
test("all internal page, asset and fragment links resolve", async () => {
  for (const path of pages) {
    const html = await readFile(path, "utf8");
    for (const match of html.matchAll(/(?:href|src)="([^" ]+)"/g)) {
      const href = match[1];
      if (/^(https:|tel:|sms:)/.test(href)) continue;
      const [file, fragment] = href.split("#");
      const target = file
        ? file === "/"
          ? "index.html"
          : file.replace(/^\//, "")
        : path;
      await access(target);
      if (fragment)
        assert.ok(
          (await readFile(target, "utf8")).includes(`id="${fragment}"`),
          `${path}: ${href}`,
        );
    }
  }
});
test("resource records have unique IDs, secure URLs, contact details, and honest verification status", async () => {
  const resources = JSON.parse(await readFile("data/resources.json", "utf8"));
  assert.equal(resources.length, 7);
  assert.equal(new Set(resources.map((r) => r.id)).size, resources.length);
  const html = await readFile("resources.html", "utf8");
  const renderedText = html.replace(/\s+/g, " ");
  for (const resource of resources) {
    assert.equal(new URL(resource.url).protocol, "https:");
    assert.ok(
      resource.eligibility &&
        resource.contact &&
        resource.region &&
        resource.category,
    );
    assert.ok(
      resource.lastVerified === null ||
        /^\d{4}-\d{2}-\d{2}$/.test(resource.lastVerified),
    );
    assert.ok(html.includes(resource.url));
    assert.ok(renderedText.includes(resource.contact));
    if (resource.lastVerified === null)
      assert.match(renderedText, /no verification date is recorded/);
    else assert.ok(renderedText.includes(resource.lastVerified));
  }
  assert.match(html, /not yet independently verified/);
  assert.match(html, /aria-label="Resource directory"/);
  assert.match(html, /label for="resource-search"/);
  assert.match(html, /label for="resource-category"/);
});
test("site has no invented engagement counts, endorsements, or activated member services", async () => {
  const html = await readFile("index.html", "utf8");
  assert.doesNotMatch(
    html,
    /98,247|12,400|340\+|TRUSTED BY|Starlight_M|AI-guided|24\/7 Available/,
  );
  assert.match(html, /Member enrollment is not open yet/);
  assert.match(html, /Hug reactions are planned/);
  assert.match(html, /Recovery &amp; Healing/);
  assert.match(html, /Choices &amp; Change/);
});
test("production domain remains unchanged", async () => {
  assert.equal(
    (await readFile("CNAME", "utf8")).trim().toLowerCase(),
    "havenforward.com",
  );
});
test("public pages have unique SEO metadata and a crawlable sitemap", async () => {
  const descriptions = new Set();
  for (const path of [
    "index.html",
    "resources.html",
    "privacy.html",
    "guidelines.html",
    "faq.html",
    "support.html",
  ]) {
    const html = await readFile(path, "utf8");
    const description = html.match(/name="description"\s+content="([^"]+)"/)[1];
    assert.ok(description.length <= 160, `${path}: description too long`);
    descriptions.add(description);
    assert.match(
      html,
      /<link rel="canonical" href="https:\/\/havenforward\.com\//,
    );
    assert.match(html, /property="og:title"/);
  }
  assert.equal(descriptions.size, 6);
  assert.match(
    await readFile("404.html", "utf8"),
    /name="robots" content="noindex"/,
  );
  const sitemap = await readFile("sitemap.xml", "utf8");
  assert.equal((sitemap.match(/<loc>/g) || []).length, 6);
  assert.match(
    await readFile("robots.txt", "utf8"),
    /Sitemap: https:\/\/havenforward\.com\/sitemap\.xml/,
  );
});

test("every public page labels both crisis lines and links to support resources", async () => {
  for (const path of pages) {
    const html = await readFile(path, "utf8");
    const text = html
      .replace(/<svg[\s\S]*?<\/svg>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ");
    assert.ok(
      text.includes("Emotional distress: call/text 988"),
      `${path}: 988 label`,
    );
    assert.ok(
      text.includes("Immediate danger or medical emergency: call 911"),
      `${path}: 911 label`,
    );
    const band = html.match(
      /<div class="help-band" role="region" aria-label="Crisis support">[\s\S]*?<header class="site-header">/,
    )[0];
    for (const href of ["tel:988", "sms:988", "tel:911", "support.html"])
      assert.ok(band.includes(`href="${href}"`), `${path}: help band ${href}`);
    const crisis = html.match(/<section\s+id="crisis"[\s\S]*?<\/section>/)[0];
    for (const href of ["tel:988", "sms:988", "tel:911"])
      assert.ok(crisis.includes(`href="${href}"`), `${path}: crisis ${href}`);
  }
});
