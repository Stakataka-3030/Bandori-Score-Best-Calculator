import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

const ROOT = resolve(process.cwd());
const UPSTREAM_REPO = "BluewaterAlnilamII/hhwx";
const UPSTREAM_COMMIT = "d208e8cc4d4632c4f6d0927ec2244e535a2b29c0";
const CHECK_ONLY = process.argv.includes("--check");

// Deliberately narrow allowlist: only the public, pure Bandori team-search dependency
// closure. Account sync, user-fetcher, auth, Supabase and tracker infrastructure are excluded.
const FILES = {
  "src/lib/bandori-area-item-groups.ts": "6c434a1cf19c96c8b37a4d224447f5b493601369",
  "src/lib/bandori-team-calculator.ts": "ea4a5d862807daafb3749385228fa7c4a25c2601",
  "src/lib/bandori/team-builder/core/calculator.ts": "a312292bb013b5d7b4e4e58338d3249cfbb1785f",
  "src/lib/bandori/team-builder/core/card-identity.ts": "f3003878c292c10919255161cbb94268f089ea2c",
  "src/lib/bandori/team-builder/core/cards.ts": "a01c9bf21642631493c840a8dde04f0eef2fd7d3",
  "src/lib/bandori/team-builder/core/character-bounds.ts": "b64ff0884889891a140d3b3266d33bb5ac6cf9ec",
  "src/lib/bandori/team-builder/core/chart.ts": "7d24d60fcb715b9d7abc73119ee4d9da3af707ee",
  "src/lib/bandori/team-builder/core/constants.ts": "a624bac30c2d888175ad2d968aa8951f2e9d6398",
  "src/lib/bandori/team-builder/core/constraints.ts": "56066da56ec69adcfb8e9bae81662a6e0e2239f1",
  "src/lib/bandori/team-builder/core/events.ts": "1283f67cf41a58724ec4a4b80b57fb8661384ab0",
  "src/lib/bandori/team-builder/core/scoring.ts": "72ba9539ddcdae004ec0ad8d4912710785568c86",
  "src/lib/bandori/team-builder/core/team-context.ts": "ec77faaf34ad209ee4585f9bb3d9b70826ba0ae2",
  "src/lib/bandori/team-builder/core/team-evaluation.ts": "4c8c5167df9505842c5d272dc3bd41f6f36ee968",
  "src/lib/bandori/team-builder/core/types.ts": "0c4c7bc8f52a9f547fddaee7e4fca1584954b7de",
  "src/lib/bandori/team-builder/core/utils.ts": "04d991b33b08fd35f515b7bc6df38517fe197314",
  "src/lib/bandori/team-builder/single/objective.ts": "c4a96f4b7de6581fe89588904b083f46c40e8cc6",
  "src/lib/bandori/team-builder/single/results.ts": "e12a5a6b8299946bcd62ef8bc53febd617072b4e",
  "src/lib/bandori/team-builder/single/scopes.ts": "99bdc214d3272f0f2966d972d66a12247dbe32af",
  "src/lib/bandori/team-builder/single/search-execution.ts": "1c5c86545a3d1ffbad02ba3971755eb70976acbd",
  "src/lib/bandori/team-builder/single/search-prep.ts": "3277f4d20b4e1164a806cee1f2a87c6e2cabcf85",
  "src/lib/bandori/team-builder/single/search.ts": "5ebb6927d298333a469691ce4b2cbfc309bdaa57",
  "src/lib/bandori/team-builder/single/seeds.ts": "90a4a9e2c1a0be712994f74f7a254b343a7eaa34",
};

function gitBlobSha(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`);
  return createHash("sha1").update(header).update(bytes).digest("hex");
}

async function fetchPinnedFile(path, expectedSha) {
  const url = `https://raw.githubusercontent.com/${UPSTREAM_REPO}/${UPSTREAM_COMMIT}/${path}`;
  const response = await fetch(url, {
    headers: {
      Accept: "text/plain",
      "User-Agent": "Bandori-Score-Best-Calculator-vendor/1",
    },
  });
  if (!response.ok) {
    throw new Error(`${path}: upstream HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const actualSha = gitBlobSha(bytes);
  if (actualSha !== expectedSha) {
    throw new Error(`${path}: expected blob ${expectedSha}, received ${actualSha}`);
  }
  return bytes;
}

let changed = 0;
for (const [path, expectedSha] of Object.entries(FILES)) {
  const bytes = await fetchPinnedFile(path, expectedSha);
  const target = resolve(ROOT, path);
  let current = null;
  try {
    current = await readFile(target);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (current && current.equals(bytes)) {
    console.log(`ok       ${path}`);
    continue;
  }
  changed += 1;
  if (CHECK_ONLY) {
    console.error(`outdated ${path}`);
    continue;
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  console.log(`updated  ${path}`);
}

if (CHECK_ONLY && changed > 0) {
  console.error(`${changed} vendored HHWX file(s) differ from pinned upstream`);
  process.exitCode = 1;
} else {
  console.log(`${CHECK_ONLY ? "checked" : "vendored"}: ${Object.keys(FILES).length} files, ${changed} changed`);
}
