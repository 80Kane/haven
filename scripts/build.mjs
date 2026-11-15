import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { BUILD_ENTRIES } from "./public-site.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const target = `${root}dist`;
await rm(target, { recursive: true, force: true });
await mkdir(target);
// Publish an allowlist (scripts/public-site.mjs, shared with
// functions/_middleware.js), never .git, environment files, tests, or
// dependencies.
for (const path of BUILD_ENTRIES) {
  await cp(`${root}${path}`, `${target}/${path}`, { recursive: true });
}
console.log(
  "Built static public site in dist/; no member services are included.",
);
