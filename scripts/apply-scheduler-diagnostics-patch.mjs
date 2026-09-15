import { readFileSync, writeFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content, "utf8");
}

function replaceOnce(path, before, after) {
  const content = read(path);
  if (content.includes(after)) return false;
  if (!content.includes(before)) {
    throw new Error(`Patch anchor not found in ${path}: ${before.slice(0, 120)}`);
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
  "vite.config.ts",
  'import { fileURLToPath, URL } from "node:url";\n',
  'import { execFileSync } from "node:child_process";\nimport { fileURLToPath, URL } from "node:url";\n',
) || changed;

changed = replaceOnce(
  "vite.config.ts",
  'import { defineConfig } from "vite";\n\nexport default defineConfig({\n',
  `import { defineConfig } from "vite";\n\nfunction resolveBuildSha(): string {\n  const githubSha = process.env.GITHUB_SHA?.trim();\n  if (githubSha) return githubSha.slice(0, 12);\n  try {\n    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim();\n  } catch {\n    return "dev";\n  }\n}\n\nexport default defineConfig({\n  define: {\n    __BUILD_SHA__: JSON.stringify(resolveBuildSha()),\n  },\n`,
) || changed;

changed = appendOnce(
  "src/vite-env.d.ts",
  "declare const __BUILD_SHA__: string;",
  'declare const __BUILD_SHA__: string;',
) || changed;

changed = replaceOnce(
  "src/App.tsx",
  'import { runNativeMedleySearch, type MedleySearchRunResult } from "@/search/run-medley-search";\n',
  'import { runNativeMedleySearch, type MedleySearchRunResult } from "@/search/run-medley-search";\nimport { getCachedPreparedChart } from "@/lib/bandori/team-builder/core/chart";\n',
) || changed;

changed = replaceOnce(
  "src/App.tsx",
  '  const [searchResponse, setSearchResponse] = useState<BandoriTeamSearchResponse | null>(null);\n  const [medleyInput, setMedleyInput] = useState<MedleySearchInputV1 | null>(null);\n',
  '  const [searchResponse, setSearchResponse] = useState<BandoriTeamSearchResponse | null>(null);\n  const [lastSkillTriggerTimes, setLastSkillTriggerTimes] = useState<number[] | null>(null);\n  const [medleyInput, setMedleyInput] = useState<MedleySearchInputV1 | null>(null);\n',
) || changed;

changed = replaceOnce(
  "src/App.tsx",
  '      setSearchResponse(null);\n      setMedleyInput(null);\n      setMedleyResponse(null);\n',
  '      setSearchResponse(null);\n      setLastSkillTriggerTimes(null);\n      setMedleyInput(null);\n      setMedleyResponse(null);\n',
) || changed;

changed = replaceOnce(
  "src/App.tsx",
  '    setSearchResponse(null);\n    setMedleyInput(null);\n    setMedleyResponse(null);\n\n    try {\n',
  '    setSearchResponse(null);\n    setLastSkillTriggerTimes(null);\n    setMedleyInput(null);\n    setMedleyResponse(null);\n\n    try {\n',
) || changed;

changed = replaceOnce(
  "src/App.tsx",
  '      if (controller.signal.aborted) return;\n      setSearchState("searching");\n      setSearchMessage("正在搜索最优队伍…");\n',
  '      if (controller.signal.aborted) return;\n      setLastSkillTriggerTimes(getCachedPreparedChart(input).skillTriggerTimes.slice(0, 6));\n      setSearchState("searching");\n      setSearchMessage("正在搜索最优队伍…");\n',
) || changed;

changed = replaceOnce(
  "src/App.tsx",
  '          <p className="header-copy">根据本地档案与最新游戏数据搜索最优队伍；游戏 Master 与谱面由客户端自动同步。</p>\n        </div>\n      </header>\n',
  '          <p className="header-copy">根据本地档案与最新游戏数据搜索最优队伍；游戏 Master 与谱面由客户端自动同步。</p>\n        </div>\n        <span className="build-stamp" title="当前客户端构建对应的 Git 提交">Build {__BUILD_SHA__}</span>\n      </header>\n',
) || changed;

changed = replaceOnce(
  "src/App.tsx",
  '                  profile={profile}\n                  server={server}\n                  eventPointSelection={{\n',
  '                  profile={profile}\n                  server={server}\n                  skillTriggerTimes={lastSkillTriggerTimes ?? undefined}\n                  eventPointSelection={{\n',
) || changed;

changed = replaceOnce(
  "src/components/TeamSearchResultCard.tsx",
  'import type { GameDataGeneration } from "@/data";\n',
  'import type { GameDataGeneration } from "@/data";\nimport { bandoriSkillTriggersCanShift, scheduleBandoriSkillTriggerTimes } from "@/lib/bandori/team-builder/core/skill-trigger-scheduler";\n',
) || changed;

changed = replaceOnce(
  "src/components/TeamSearchResultCard.tsx",
  '  server: number;\n  eventPointSelection: EventPointDisplaySelection;\n};\n',
  '  server: number;\n  skillTriggerTimes?: readonly number[];\n  eventPointSelection: EventPointDisplaySelection;\n};\n',
) || changed;

changed = replaceOnce(
  "src/components/TeamSearchResultCard.tsx",
  `function formatProbability(numerator: number, denominator: number): string {\n  if (denominator <= 0) return "—";\n  const percent = numerator / denominator * 100;\n  return \`${'${numerator}/${denominator} · ${percent.toFixed(percent < 1 ? 2 : 1)}%'}\`;\n}\n\n`,
  `function formatProbability(numerator: number, denominator: number): string {\n  if (denominator <= 0) return "—";\n  const percent = numerator / denominator * 100;\n  return \`${'${numerator}/${denominator} · ${percent.toFixed(percent < 1 ? 2 : 1)}%'}\`;\n}\n\ntype SkillScheduleEntry = {\n  activationIndex: number;\n  cardId: number;\n  nominalTime: number;\n  actualTime: number;\n  delaySeconds: number;\n};\n\ntype SkillScheduleDiagnostic = {\n  dynamicPath: boolean;\n  shiftedCount: number;\n  maxDelaySeconds: number;\n  entries: SkillScheduleEntry[];\n};\n\nfunction buildSkillScheduleDiagnostic(\n  result: BandoriTeamSearchResult,\n  skillTriggerTimes: readonly number[] | undefined,\n): SkillScheduleDiagnostic | null {\n  if (!skillTriggerTimes || skillTriggerTimes.length < 6 || result.skillOrderCardIds.length < 6) return null;\n  if (result.skillOrderActors?.some((actor) => actor !== "self")) return null;\n\n  const nominalTimes = skillTriggerTimes.slice(0, 6);\n  const skillByCardId = new Map(result.skills.map((skill) => [skill.cardId, skill.resolvedSkill]));\n  const activationCardIds = result.skillOrderCardIds.slice(0, 6);\n  if (activationCardIds.some((cardId) => cardId <= 0 || !skillByCardId.has(cardId))) return null;\n\n  const firstFiveDurations = result.skills.map((skill) => skill.resolvedSkill?.durationSeconds ?? 0);\n  const activationDurations = activationCardIds.map((cardId) => skillByCardId.get(cardId)?.durationSeconds ?? 0);\n  const scheduled = scheduleBandoriSkillTriggerTimes(nominalTimes, activationDurations);\n  const entries = nominalTimes.map((nominalTime, activationIndex) => {\n    const actualTime = scheduled.starts[activationIndex] ?? nominalTime;\n    return {\n      activationIndex,\n      cardId: activationCardIds[activationIndex],\n      nominalTime,\n      actualTime,\n      delaySeconds: Math.max(0, actualTime - nominalTime),\n    };\n  });\n  const delayed = entries.filter((entry) => entry.delaySeconds > 1e-9);\n  return {\n    dynamicPath: bandoriSkillTriggersCanShift(nominalTimes, firstFiveDurations),\n    shiftedCount: delayed.length,\n    maxDelaySeconds: delayed.reduce((maximum, entry) => Math.max(maximum, entry.delaySeconds), 0),\n    entries,\n  };\n}\n\n`,
) || changed;

changed = replaceOnce(
  "src/components/TeamSearchResultCard.tsx",
  '  profile,\n  server,\n  eventPointSelection,\n}: Props) {\n',
  '  profile,\n  server,\n  skillTriggerTimes,\n  eventPointSelection,\n}: Props) {\n',
) || changed;

changed = replaceOnce(
  "src/components/TeamSearchResultCard.tsx",
  '  const areaLevels = profileAreaItemLevelMap(profile);\n\n  return (\n',
  '  const areaLevels = profileAreaItemLevelMap(profile);\n  const skillSchedule = buildSkillScheduleDiagnostic(result, skillTriggerTimes);\n\n  return (\n',
) || changed;

changed = replaceOnce(
  "src/components/TeamSearchResultCard.tsx",
  `      )}\n\n      <div className="result-detail-block">\n        <span className="detail-title">区域道具配置</span>\n`,
  `      )}\n\n      {skillSchedule && (\n        <details className={\`skill-schedule-diagnostic ${'${skillSchedule.dynamicPath ? "schedule-dynamic" : "schedule-normal"}'}\`}>\n          <summary>\n            <span>精确技能调度</span>\n            <strong>{skillSchedule.dynamicPath ? "动态路径" : "普通"}</strong>\n            <span>\n              {skillSchedule.dynamicPath\n                ? skillSchedule.shiftedCount > 0\n                  ? \`最佳顺序后移 ${'${skillSchedule.shiftedCount}'} 次 · 最大 +${'${skillSchedule.maxDelaySeconds.toFixed(3)}'}s\`\n                  : "最佳顺序无后移"\n                : "无窗口后移"}\n            </span>\n          </summary>\n          <p className="skill-schedule-note">\n            {skillSchedule.dynamicPath\n              ? "当前队伍在本谱面存在触发窗口冲突可能，已使用 0.75s 精确调度。"\n              : "当前队伍的技能窗口彼此安全，固定窗口与精确调度结果一致。"}\n          </p>\n          <div className="skill-timeline">\n            {skillSchedule.entries.map((entry) => (\n              <div className="skill-timeline-row" key={entry.activationIndex}>\n                <span>{entry.activationIndex === 5 ? "返场" : \`技能 ${'${entry.activationIndex + 1}'}\`} · #{entry.cardId}</span>\n                <span>{entry.nominalTime.toFixed(3)}s → {entry.actualTime.toFixed(3)}s</span>\n                <strong className={entry.delaySeconds > 1e-9 ? "skill-delay-positive" : ""}>\n                  {entry.delaySeconds > 1e-9 ? \`+${'${entry.delaySeconds.toFixed(3)}'}s\` : "原时刻"}\n                </strong>\n              </div>\n            ))}\n          </div>\n        </details>\n      )}\n\n      <div className="result-detail-block">\n        <span className="detail-title">区域道具配置</span>\n`,
) || changed;

changed = appendOnce(
  "src/styles.css",
  ".skill-schedule-diagnostic",
  `.build-stamp {\n  flex: 0 0 auto;\n  border: 1px solid var(--accent-border);\n  border-radius: 999px;\n  padding: 7px 11px;\n  color: var(--accent-strong);\n  background: var(--accent-soft);\n  font-size: 0.74rem;\n  font-weight: 750;\n  letter-spacing: 0.03em;\n}\n\n.skill-schedule-diagnostic {\n  margin-top: 14px;\n  border: 1px solid var(--border);\n  border-radius: 13px;\n  background: rgba(248, 248, 252, 0.72);\n  overflow: hidden;\n}\n.skill-schedule-diagnostic > summary {\n  display: flex;\n  align-items: center;\n  gap: 9px;\n  padding: 11px 13px;\n  cursor: pointer;\n  list-style: none;\n  color: var(--muted);\n  font-size: 0.82rem;\n}\n.skill-schedule-diagnostic > summary::-webkit-details-marker { display: none; }\n.skill-schedule-diagnostic > summary strong { color: var(--text); }\n.skill-schedule-diagnostic.schedule-dynamic > summary strong { color: var(--accent-strong); }\n.skill-schedule-note {\n  margin: 0;\n  padding: 0 13px 10px;\n  color: var(--muted);\n  font-size: 0.78rem;\n}\n.skill-timeline {\n  display: grid;\n  gap: 1px;\n  border-top: 1px solid var(--border);\n  background: var(--border);\n}\n.skill-timeline-row {\n  display: grid;\n  grid-template-columns: minmax(110px, 1fr) minmax(180px, auto) 80px;\n  gap: 12px;\n  align-items: center;\n  padding: 9px 13px;\n  background: var(--panel-solid);\n  font-size: 0.78rem;\n}\n.skill-timeline-row > span:nth-child(2) {\n  font-variant-numeric: tabular-nums;\n  color: var(--muted);\n}\n.skill-timeline-row > strong {\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n}\n.skill-delay-positive { color: var(--accent-strong); }\n\n@media (max-width: 700px) {\n  .build-stamp { align-self: flex-start; }\n  .skill-timeline-row {\n    grid-template-columns: 1fr auto;\n  }\n  .skill-timeline-row > span:nth-child(2) {\n    grid-column: 1 / -1;\n  }\n}\n`,
) || changed;

if (!changed) {
  console.log("Scheduler diagnostics patch already applied.");
} else {
  console.log("Scheduler diagnostics patch applied.");
}
