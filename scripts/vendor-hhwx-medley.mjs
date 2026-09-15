import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const UPSTREAM_OWNER = "BluewaterAlnilamII";
const UPSTREAM_REPO = "hhwx";
const UPSTREAM_REF = "d208e8cc4d4632c4f6d0927ec2244e535a2b29c0";

const ALLOWED_PREFIXES = [
  "src/lib/bandori/medley-foundation/",
  "crates/bandori-medley-model/",
  "crates/bandori-medley-search/",
  "crates/bandori-medley-reference/",
];

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, "utf8");
  return createHash("sha1").update(header).update(buffer).digest("hex");
}

function isAllowed(path) {
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

async function checkedFetch(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "bandori-score-best-calculator-vendor",
      Accept: "application/vnd.github+json",
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  return response;
}

const treeUrl = `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/git/trees/${UPSTREAM_REF}?recursive=1`;
const tree = await (await checkedFetch(treeUrl)).json();
if (tree.truncated) {
  throw new Error("Upstream recursive Git tree was truncated; refusing partial Medley vendoring.");
}

const files = tree.tree
  .filter((entry) => entry.type === "blob" && typeof entry.path === "string" && isAllowed(entry.path))
  .sort((left, right) => left.path.localeCompare(right.path));

if (files.length === 0) {
  throw new Error("No HHWX Medley files matched the pinned allowlist.");
}

for (const entry of files) {
  const rawUrl = `https://raw.githubusercontent.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/${UPSTREAM_REF}/${entry.path}`;
  const buffer = Buffer.from(await (await checkedFetch(rawUrl)).arrayBuffer());
  const actualSha = gitBlobSha(buffer);
  if (actualSha !== entry.sha) {
    throw new Error(`Blob SHA mismatch for ${entry.path}: expected ${entry.sha}, got ${actualSha}`);
  }
  await mkdir(dirname(entry.path), { recursive: true });
  await writeFile(entry.path, buffer);
  console.log(`vendored ${entry.path} (${entry.sha})`);
}

await writeFile(
  "docs/hhwx-medley-upstream.json",
  `${JSON.stringify({
    upstream: `${UPSTREAM_OWNER}/${UPSTREAM_REPO}`,
    ref: UPSTREAM_REF,
    prefixes: ALLOWED_PREFIXES,
    fileCount: files.length,
  }, null, 2)}\n`,
  "utf8",
);

console.log(`Vendored ${files.length} HHWX Medley files from ${UPSTREAM_REF}.`);
