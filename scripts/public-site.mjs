// Single source of truth for what the public site publishes.
// scripts/build.mjs copies exactly these entries into dist/, and
// functions/_middleware.js only lets matching request paths reach the
// static asset server. Everything else gets the custom 404 from a Function.

// HTML pages, published as /<name>.html and served at the clean URL /<name>.
export const PAGES = [
  "index",
  "resources",
  "privacy",
  "guidelines",
  "faq",
  "support",
  "404",
];

// Directories published recursively.
export const DIRECTORIES = ["assets", "data"];

// Single files published at the site root. `_headers` is configuration that
// Cloudflare Pages reads at deploy time and never serves, so it is copied but
// is not a reachable URL.
export const ROOT_FILES = [
  "CNAME",
  ".nojekyll",
  "robots.txt",
  "sitemap.xml",
  "_headers",
];
const UNSERVED_FILES = new Set(["_headers"]);

// Entries scripts/build.mjs copies into dist/.
export const BUILD_ENTRIES = [
  ...PAGES.map((page) => `${page}.html`),
  ...DIRECTORIES,
  ...ROOT_FILES,
];

// Same values as the `/*` block in _headers (a unit test keeps them equal).
// _headers does not apply to Function-generated responses, so the middleware
// sets these itself on its 404s.
export const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

// Paths owned by the existing Pages Functions; passed through untouched.
export function isFunctionPath(pathname) {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/staging-interactions" ||
    pathname === "/staging-interactions/"
  );
}

const pagePaths = new Set(["/"]);
for (const page of PAGES) {
  // Clean URL, the .html form (Pages answers it with a 308 to the clean URL),
  // and a trailing slash (Pages also redirects that to the clean URL).
  pagePaths.add(`/${page}`);
  pagePaths.add(`/${page}.html`);
  pagePaths.add(`/${page}/`);
}
const rootFilePaths = new Set(
  ROOT_FILES.filter((file) => !UNSERVED_FILES.has(file)).map((f) => `/${f}`),
);
// Plain path segments only: no percent-encoding, no dot-segments, no
// backslashes. Real asset links never need them, so anything else fails closed.
const SEGMENT = "[A-Za-z0-9_-][A-Za-z0-9._-]*";
const directoryFile = new RegExp(
  `^/(?:${DIRECTORIES.join("|")})(?:/${SEGMENT})+$`,
);

// `pathname` is the raw, still-encoded URL path (new URL(...).pathname).
// Matching is exact and case-sensitive, like the asset server itself.
export function isPublicPath(pathname) {
  if (pagePaths.has(pathname) || rootFilePaths.has(pathname)) return true;
  return directoryFile.test(pathname) && !/\/\.\.?(?:\/|$)/.test(pathname);
}
