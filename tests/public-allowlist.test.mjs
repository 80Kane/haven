import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import {
  BUILD_ENTRIES,
  PAGES,
  SECURITY_HEADERS,
  isFunctionPath,
  isPublicPath,
} from "../scripts/public-site.mjs";
import { onRequest } from "../functions/_middleware.js";

// Repository files that must never be served, plus traversal and encoding
// tricks. Stale edge copies of the first group survived a cache purge.
const sourcePaths = [
  "/member-app/package.json",
  "/member-app/app/layout.tsx",
  "/member-app/next.config.ts",
  "/member-app/vercel.json",
  "/member-app/.env.example",
  "/docs/member-signin.md",
  "/tests/site.test.mjs",
  "/README.md",
  "/.env.example",
  "/package.json",
  "/package-lock.json",
  "/scripts/build.mjs",
  "/scripts/public-site.mjs",
  "/.github/workflows/public-site.yml",
  "/backend/public-api.mjs",
  "/playwright.config.mjs",
  "/member-playwright.config.mjs",
  "/functions/api/%5B%5Bpath%5D%5D.js",
  "/functions/_middleware.js",
  "/node_modules/.package-lock.json",
  "/dist/index.html",
  "/supabase/config.toml",
  "/.gitignore",
  "/_headers",
  "/.git/config",
];
const trickyPaths = [
  "/assets/../package.json",
  "/assets/%2e%2e/package.json",
  "/assets%2Fstyles.css",
  "/assets/%2E%2E%2Fpackage.json",
  "/assets/.hidden",
  "/assets\\..\\package.json",
  "/README.MD",
  "/Guidelines",
  "/assets/",
  "/assets",
  "/data/",
  "//package.json",
  "/favicon.ico",
];

async function listFiles(path) {
  if (!(await stat(path)).isDirectory()) return [path];
  const out = [];
  for (const entry of await readdir(path))
    out.push(...(await listFiles(`${path}/${entry}`)));
  return out;
}

// Paths as the middleware sees them: through the WHATWG URL parser.
const pathnameOf = (path) => new URL(`https://example.test${path}`).pathname;

test("every published file is allowed and maps to a build entry", async () => {
  const published = [];
  for (const entry of BUILD_ENTRIES)
    published.push(...(await listFiles(entry)));
  assert.ok(published.length > 15);
  for (const file of published) {
    if (file === "_headers") continue; // read by Pages at deploy, never served
    assert.ok(
      isPublicPath(pathnameOf(`/${file}`)),
      `/${file} should be public`,
    );
  }
  for (const page of PAGES) {
    assert.ok(isPublicPath(`/${page}`), `/${page}`);
    assert.ok(isPublicPath(`/${page}/`), `/${page}/`);
  }
  assert.ok(isPublicPath("/"));
});

test("repository source and tricky paths are not public", () => {
  for (const path of [...sourcePaths, ...trickyPaths]) {
    const pathname = pathnameOf(path);
    assert.equal(isPublicPath(pathname), false, `${path} (${pathname})`);
    assert.equal(isFunctionPath(pathname), false, `${path} (${pathname})`);
  }
});

test("existing Function routes pass through unchanged", () => {
  for (const path of [
    "/api",
    "/api/",
    "/api/public/hugs",
    "/api/member/x",
    "/staging-interactions",
  ])
    assert.ok(isFunctionPath(pathnameOf(path)), path);
});

test("middleware security headers match the _headers file", async () => {
  const text = await readFile("_headers", "utf8");
  const fromFile = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^\s+([A-Za-z-]+):\s*(.+)$/);
    if (match) fromFile[match[1]] = match[2].trim();
  }
  assert.deepEqual(fromFile, SECURITY_HEADERS);
});

function context(path, method = "GET", assets) {
  let passed = false;
  return {
    get passed() {
      return passed;
    },
    ctx: {
      request: new Request(`https://example.test${path}`, { method }),
      env: {
        ASSETS: {
          fetch:
            assets ||
            (async (url) => {
              assert.equal(new URL(url).pathname, "/404");
              return new Response("<title>Page unavailable</title>", {
                status: 200,
              });
            }),
        },
      },
      next: async () => {
        passed = true;
        return new Response("asset", { status: 200 });
      },
    },
  };
}

test("middleware returns the custom 404 with no-store and security headers", async () => {
  for (const path of [...sourcePaths, ...trickyPaths]) {
    for (const suffix of ["", "?cb=123"]) {
      const c = context(`${path}${suffix}`);
      const response = await onRequest(c.ctx);
      assert.equal(c.passed, false, path);
      assert.equal(response.status, 404, path);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal(response.headers.get("X-Robots-Tag"), "noindex");
      assert.equal(response.headers.get("X-Haven-Guard"), "1");
      for (const [name, value] of Object.entries(SECURITY_HEADERS))
        assert.equal(response.headers.get(name), value, `${path} ${name}`);
      assert.match(await response.text(), /Page unavailable/);
    }
  }
});

test("middleware passes public pages, files and Functions to next()", async () => {
  for (const path of [
    "/",
    "/?utm_source=x",
    "/guidelines",
    "/guidelines.html",
    "/resources?q=food",
    "/support",
    "/robots.txt",
    "/sitemap.xml",
    "/CNAME",
    "/.nojekyll",
    "/assets/styles.css",
    "/assets/fonts/fraunces-latin-wght-normal.woff2",
    "/data/resources.json",
    "/api/public/hugs",
    "/staging-interactions",
  ]) {
    const c = context(path, "POST");
    const response = await onRequest(c.ctx);
    assert.equal(c.passed, true, path);
    assert.equal(await response.text(), "asset");
  }
});

test("middleware HEAD 404 has no body and survives a missing 404 page", async () => {
  const head = context("/README.md", "HEAD");
  const response = await onRequest(head.ctx);
  assert.equal(response.status, 404);
  assert.equal(await response.text(), "");
  const broken = context("/README.md", "GET", async () => {
    throw new Error("assets unavailable");
  });
  const fallback = await onRequest(broken.ctx);
  assert.equal(fallback.status, 404);
  assert.equal(fallback.headers.get("Cache-Control"), "no-store");
});
