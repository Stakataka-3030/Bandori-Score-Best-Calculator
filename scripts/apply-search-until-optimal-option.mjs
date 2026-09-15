import { readFileSync, writeFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content, "utf8");
}

function replaceOnce(path, before, after, label) {
  const content = read(path);
  if (content.includes(after)) return false;
  if (!content.includes(before)) {
    throw new Error(`Missing patch anchor (${label}) in ${path}`);
  }
  write(path, content.replace(before, after));
  return true;
}

function appendOnce(path, marker, addition) {
  const content = read(path);
  if (content.includes(marker)) return false;
  write(path, `${content.trimEnd()}\n\n${addition.trim()}\n`);
  return true;
}

let changed = false;

changed = replaceOnce(
  "src/App.tsx",
  'const EVENT_TYPE_LABELS: Record<BandoriTeamSearchEventType, string> = {',
  'const DEFAULT_SEARCH_DURATION_MS = 60_000;\nconst OPTIMAL_SEARCH_DURATION_MS = 1_800_000;\n\nconst EVENT_TYPE_LABELS: Record<BandoriTeamSearchEventType, string> = {',
  "search duration constants",
) || changed;

changed = replaceOnce(
  "src/App.tsx",
  '  const [resultLimit, setResultLimit] = useState(10);\n',
  '  const [resultLimit, setResultLimit] = useState(10);\n  const [searchUntilOptimal, setSearchUntilOptimal] = useState(false);\n',
  "search-until-optimal state",
) || changed;

changed = replaceOnce(
  "src/App.tsx",
  '    setMedleyInput(null);\n    setMedleyResponse(null);\n\n    try {\n',
  '    setMedleyInput(null);\n    setMedleyResponse(null);\n    const maxSearchDurationMs = searchUntilOptimal ? OPTIMAL_SEARCH_DURATION_MS : DEFAULT_SEARCH_DURATION_MS;\n\n    try {\n',
  "resolved duration",
) || changed;

changed = replaceOnce(
  "src/App.tsx",
  '          maxDurationMs: 60_000,\n',
  '          maxDurationMs: maxSearchDurationMs,\n',
  "Medley duration",
) || changed;

changed = replaceOnce(
  "src/App.tsx",
  '        maxSearchDurationMs: 60_000,\n',
  '        maxSearchDurationMs,\n',
  "single-song duration",
) || changed;

changed = replaceOnce(
  "src/App.tsx",
  '              <label className="field">\n                <span>结果数量</span>\n                <input type="number" min="1" max="50" step="1" value={resultLimit} disabled={selectedEventType === "medley"} onChange={(event) => setResultLimit(Math.max(1, Math.min(50, Number(event.currentTarget.value))))} />\n              </label>\n            </div>\n',
  '              <label className="field">\n                <span>结果数量</span>\n                <input type="number" min="1" max="50" step="1" value={resultLimit} disabled={selectedEventType === "medley"} onChange={(event) => setResultLimit(Math.max(1, Math.min(50, Number(event.currentTarget.value))))} />\n              </label>\n\n              <label className="search-budget-option field-wide">\n                <input\n                  type="checkbox"\n                  checked={searchUntilOptimal}\n                  onChange={(event) => setSearchUntilOptimal(event.currentTarget.checked)}\n                />\n                <span>\n                  <strong>不限时，计算到最优为止</strong>\n                  <small>启用后将搜索时间上限从 60 秒提高到 1800 秒（30 分钟）；若提前证明最优则立即结束。</small>\n                </span>\n              </label>\n            </div>\n',
  "search budget option UI",
) || changed;

changed = appendOnce(
  "src/styles.css",
  ".search-budget-option {",
  `.search-budget-option {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 50px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 11px;
  color: var(--text);
  background: rgba(248, 248, 252, 0.72);
  cursor: pointer;
}
.search-budget-option input[type="checkbox"] {
  width: 18px;
  height: 18px;
  min-height: 0;
  flex: 0 0 auto;
  padding: 0;
  accent-color: var(--accent);
}
.search-budget-option > span { display: grid; gap: 2px; }
.search-budget-option strong { font-size: 0.82rem; }
.search-budget-option small { color: var(--muted); font-size: 0.72rem; font-weight: 500; line-height: 1.4; }

@media (prefers-color-scheme: dark) {
  .search-budget-option { background: #20212d; }
}
`,
) || changed;

console.log(changed ? "30-minute optimal-search option applied." : "30-minute optimal-search option already applied.");
