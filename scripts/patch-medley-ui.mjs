import { readFile, writeFile } from "node:fs/promises";

const appPath = "src/App.tsx";
let app = await readFile(appPath, "utf8");

function replaceOne(before, after, label) {
  const first = app.indexOf(before);
  if (first < 0) throw new Error(`${label}: source fragment not found`);
  if (app.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: source fragment is not unique`);
  app = app.slice(0, first) + after + app.slice(first + before.length);
}

replaceOne(
  'import TeamSearchResultCard from "@/components/TeamSearchResultCard";\n',
  'import TeamSearchResultCard from "@/components/TeamSearchResultCard";\nimport MedleySearchResultCard from "@/components/MedleySearchResultCard";\n',
  "Medley result component import",
);

replaceOne(
  '  createBandoriSearchInput,\n',
  '  createBandoriSearchInput,\n  createMedleySearchInput,\n',
  "Medley data adapter import",
);

replaceOne(
  'import { importProfileFile, type ImportedProfile } from "@/lib/profile-import";\nimport { runBandoriTeamSearch } from "@/search/run-team-search";\n',
  'import type { MedleySearchInputV1 } from "@/lib/bandori/medley-foundation";\nimport { importProfileFile, type ImportedProfile } from "@/lib/profile-import";\nimport { runBandoriTeamSearch } from "@/search/run-team-search";\nimport { runNativeMedleySearch, type MedleySearchRunResult } from "@/search/run-medley-search";\n',
  "Medley search imports",
);

replaceOne(
  '  const [songId, setSongId] = useState<number | null>(null);\n  const [difficulty, setDifficulty] = useState<BandoriTeamSearchDifficulty>("expert");\n',
  '  const [songId, setSongId] = useState<number | null>(null);\n  const [difficulty, setDifficulty] = useState<BandoriTeamSearchDifficulty>("expert");\n  const [medleySong2Id, setMedleySong2Id] = useState<number | null>(null);\n  const [medleySong3Id, setMedleySong3Id] = useState<number | null>(null);\n  const [medleyDifficulty2, setMedleyDifficulty2] = useState<BandoriTeamSearchDifficulty>("expert");\n  const [medleyDifficulty3, setMedleyDifficulty3] = useState<BandoriTeamSearchDifficulty>("expert");\n',
  "Medley song state",
);

replaceOne(
  '  const [searchResponse, setSearchResponse] = useState<BandoriTeamSearchResponse | null>(null);\n  const abortRef = useRef<AbortController | null>(null);\n',
  '  const [searchResponse, setSearchResponse] = useState<BandoriTeamSearchResponse | null>(null);\n  const [medleyInput, setMedleyInput] = useState<MedleySearchInputV1 | null>(null);\n  const [medleyResponse, setMedleyResponse] = useState<MedleySearchRunResult | null>(null);\n  const abortRef = useRef<AbortController | null>(null);\n',
  "Medley result state",
);

replaceOne(
  '  const availableDifficulties = useMemo(() => getAvailableDifficulties(gameData, songId), [gameData, songId]);\n',
  '  const availableDifficulties = useMemo(() => getAvailableDifficulties(gameData, songId), [gameData, songId]);\n  const medleyDifficulties2 = useMemo(() => getAvailableDifficulties(gameData, medleySong2Id), [gameData, medleySong2Id]);\n  const medleyDifficulties3 = useMemo(() => getAvailableDifficulties(gameData, medleySong3Id), [gameData, medleySong3Id]);\n',
  "Medley difficulty choices",
);

replaceOne(
  '  useEffect(() => {\n    if (songId === null && songs.length > 0) setSongId(songs[0].id);\n  }, [songId, songs]);\n',
  '  useEffect(() => {\n    if (songId === null && songs.length > 0) setSongId(songs[0].id);\n    if (medleySong2Id === null && songs.length > 1) setMedleySong2Id(songs[1].id);\n    if (medleySong3Id === null && songs.length > 2) setMedleySong3Id(songs[2].id);\n  }, [medleySong2Id, medleySong3Id, songId, songs]);\n',
  "Medley default songs",
);

replaceOne(
  '  useEffect(() => {\n    if (!availableDifficulties.includes(difficulty)) {\n      setDifficulty(availableDifficulties.includes("expert") ? "expert" : availableDifficulties[availableDifficulties.length - 1] ?? "expert");\n    }\n  }, [availableDifficulties, difficulty]);\n',
  '  useEffect(() => {\n    if (!availableDifficulties.includes(difficulty)) {\n      setDifficulty(availableDifficulties.includes("expert") ? "expert" : availableDifficulties[availableDifficulties.length - 1] ?? "expert");\n    }\n  }, [availableDifficulties, difficulty]);\n\n  useEffect(() => {\n    if (!medleyDifficulties2.includes(medleyDifficulty2)) {\n      setMedleyDifficulty2(medleyDifficulties2.includes("expert") ? "expert" : medleyDifficulties2[medleyDifficulties2.length - 1] ?? "expert");\n    }\n    if (!medleyDifficulties3.includes(medleyDifficulty3)) {\n      setMedleyDifficulty3(medleyDifficulties3.includes("expert") ? "expert" : medleyDifficulties3[medleyDifficulties3.length - 1] ?? "expert");\n    }\n  }, [medleyDifficulties2, medleyDifficulties3, medleyDifficulty2, medleyDifficulty3]);\n',
  "Medley difficulty normalization",
);

replaceOne(
  '  useEffect(() => {\n    if (!allowedLiveTypes.includes(liveType)) {\n      setLiveType(allowedLiveTypes.includes("multi") ? "multi" : allowedLiveTypes[0] ?? "free");\n    }\n  }, [allowedLiveTypes, liveType]);\n',
  '  useEffect(() => {\n    if (!allowedLiveTypes.includes(liveType)) {\n      setLiveType(allowedLiveTypes.includes("multi") ? "multi" : allowedLiveTypes[0] ?? "free");\n    }\n  }, [allowedLiveTypes, liveType]);\n\n  useEffect(() => {\n    if (selectedEventType === "medley" && target !== "score") setTarget("score");\n  }, [selectedEventType, target]);\n',
  "Medley target normalization",
);

replaceOne(
  '      setSearchResponse(null);\n    } catch (cause) {\n',
  '      setSearchResponse(null);\n      setMedleyInput(null);\n      setMedleyResponse(null);\n    } catch (cause) {\n',
  "Clear Medley after profile import",
);

replaceOne(
  '    setSearchResponse(null);\n\n    try {\n      const externalSkills = materializeExternalSkills(eventControls.externalSkills);\n',
  '    setSearchResponse(null);\n    setMedleyInput(null);\n    setMedleyResponse(null);\n\n    try {\n      if (selectedEventType === "medley") {\n        if (medleySong2Id === null || medleySong3Id === null) {\n          throw new Error("请选择完整的三首 Medley 歌曲");\n        }\n        const input = await createMedleySearchInput(profile, gameData, {\n          songs: [\n            { songId, difficulty },\n            { songId: medleySong2Id, difficulty: medleyDifficulty2 },\n            { songId: medleySong3Id, difficulty: medleyDifficulty3 },\n          ],\n          eventId,\n          perfectRatePercent: Math.max(0, Math.min(100, perfectRatePercent)),\n          ownedCardParameters: cardPreferences.ownedCardParameters,\n          temporaryCards: cardPreferences.temporaryCards,\n        });\n        if (controller.signal.aborted) return;\n        setMedleyInput(input);\n        setSearchState("searching");\n        setSearchMessage("正在用原生 Rust 搜索三队 Medley 最优解…");\n        const startedAt = performance.now();\n        const response = await runNativeMedleySearch(input, {\n          signal: controller.signal,\n          maxDurationMs: 30_000,\n        });\n        if (controller.signal.aborted) return;\n        setMedleyResponse(response);\n        setSearchState("idle");\n        const elapsedMs = Math.round(performance.now() - startedAt);\n        setSearchMessage(\n          response.outcome.status === "exact"\n            ? `Medley 精确搜索完成 · ${elapsedMs.toLocaleString()} ms`\n            : `Medley 搜索未穷尽（${response.outcome.reason}）· ${elapsedMs.toLocaleString()} ms`,\n        );\n        return;\n      }\n\n      const externalSkills = materializeExternalSkills(eventControls.externalSkills);\n',
  "Native Medley startSearch branch",
);

replaceOne(
  '  const canSearch = Boolean(\n    profile\n    && gameData\n    && songId !== null\n    && selectedEventType !== "medley"\n    && searchState !== "preparing"\n    && searchState !== "searching"\n  );\n',
  '  const canSearch = Boolean(\n    profile\n    && gameData\n    && songId !== null\n    && (selectedEventType !== "medley" || (medleySong2Id !== null && medleySong3Id !== null))\n    && searchState !== "preparing"\n    && searchState !== "searching"\n  );\n',
  "Enable Medley search button",
);

replaceOne(
  '                <span>歌曲</span>\n',
  '                <span>{selectedEventType === "medley" ? "第 1 曲" : "歌曲"}</span>\n',
  "First song label",
);

replaceOne(
  '              <label className="field">\n                <span>目标</span>\n',
  '              {selectedEventType === "medley" && (<>\n                <label className="field field-wide">\n                  <span>第 2 曲</span>\n                  <SearchableSelect\n                    value={medleySong2Id}\n                    options={songs}\n                    onChange={(value) => { if (value !== null) setMedleySong2Id(value); }}\n                    placeholder="搜索第 2 曲…"\n                    disabled={!gameData}\n                  />\n                </label>\n                <label className="field">\n                  <span>第 2 曲难度</span>\n                  <select value={medleyDifficulty2} onChange={(event) => setMedleyDifficulty2(event.currentTarget.value as BandoriTeamSearchDifficulty)}>\n                    {medleyDifficulties2.map((item) => <option key={item} value={item}>{DIFFICULTY_LABELS[item]}</option>)}\n                  </select>\n                </label>\n                <label className="field field-wide">\n                  <span>第 3 曲</span>\n                  <SearchableSelect\n                    value={medleySong3Id}\n                    options={songs}\n                    onChange={(value) => { if (value !== null) setMedleySong3Id(value); }}\n                    placeholder="搜索第 3 曲…"\n                    disabled={!gameData}\n                  />\n                </label>\n                <label className="field">\n                  <span>第 3 曲难度</span>\n                  <select value={medleyDifficulty3} onChange={(event) => setMedleyDifficulty3(event.currentTarget.value as BandoriTeamSearchDifficulty)}>\n                    {medleyDifficulties3.map((item) => <option key={item} value={item}>{DIFFICULTY_LABELS[item]}</option>)}\n                  </select>\n                </label>\n              </>)}\n\n              <label className="field">\n                <span>目标</span>\n',
  "Medley song selectors",
);

replaceOne(
  '                <select value={target} onChange={(event) => setTarget(event.currentTarget.value as BandoriTeamSearchTarget)}>\n',
  '                <select value={target} disabled={selectedEventType === "medley"} onChange={(event) => setTarget(event.currentTarget.value as BandoriTeamSearchTarget)}>\n',
  "Disable Medley target selector",
);

replaceOne(
  '                <input type="number" min="1" max="50" step="1" value={resultLimit} onChange={(event) => setResultLimit(Math.max(1, Math.min(50, Number(event.currentTarget.value))))} />\n',
  '                <input type="number" min="1" max="50" step="1" value={resultLimit} disabled={selectedEventType === "medley"} onChange={(event) => setResultLimit(Math.max(1, Math.min(50, Number(event.currentTarget.value))))} />\n',
  "Disable Medley result count",
);

replaceOne(
  '            {selectedEventType === "medley" && (\n              <p className="status-line status-error">Medley 是 HHWX 的独立三曲 Rust/WASM 搜索器，不是单曲活动公式的一个开关。当前客户端暂不允许用单曲结果冒充 Medley 最优解；它会作为下一块独立迁移。</p>\n            )}\n',
  '            {selectedEventType === "medley" && (\n              <p className="status-line">Medley 使用桌面端原生 Rust 三队搜索器：三首歌共享卡池与区域道具，并按真实 1024 RNG 路径优化每队初始五人站位。</p>\n            )}\n',
  "Medley status copy",
);

replaceOne(
  '              setSearchResponse(null);\n            }}\n',
  '              setSearchResponse(null);\n              setMedleyInput(null);\n              setMedleyResponse(null);\n            }}\n',
  "Clear Medley on preferences",
);

replaceOne(
  '          {searchResponse && <span className="result-count">{searchResponse.results.length} results</span>}\n',
  '          {selectedEventType === "medley"\n            ? medleyResponse && <span className="result-count">{medleyResponse.hydration.candidates.length} candidates</span>\n            : searchResponse && <span className="result-count">{searchResponse.results.length} results</span>}\n',
  "Medley result count",
);

replaceOne(
  '        {!searchResponse && <div className="empty-state">完成档案导入并选择歌曲后，搜索结果会显示在这里。</div>}\n        {searchResponse?.results.length === 0 && <div className="empty-state">没有找到满足条件的合法五人队伍。</div>}\n        <div className="result-list">\n          {searchResponse?.results.map((result) => (\n            <TeamSearchResultCard\n              key={`${result.rank}-${result.leaderCardId}-${result.targetValue}`}\n              result={result}\n              data={gameData}\n              profile={profile}\n              server={server}\n              eventPointSelection={{\n                liveBoostCount: eventControls.liveBoostCount,\n                challengeCpCost: eventControls.challengeCpCost,\n                placement: eventControls.resultPlacement,\n                festivalResult: eventControls.resultFestivalResult,\n              }}\n            />\n          ))}\n        </div>\n',
  '        {selectedEventType === "medley" ? (\n          <>\n            {!medleyResponse && <div className="empty-state">选择 Medley 活动与三首歌曲后，原生 Rust 搜索结果会显示在这里。</div>}\n            {medleyResponse?.hydration.candidates.length === 0 && <div className="empty-state">没有找到满足条件的三队 Medley 合法解。</div>}\n            <div className="result-list">\n              {medleyResponse && medleyInput && medleyResponse.hydration.candidates.map((candidate, index) => (\n                <MedleySearchResultCard\n                  key={`${index}-${candidate.totalAverageScore}`}\n                  candidate={candidate}\n                  rank={index + 1}\n                  input={medleyInput}\n                  data={gameData}\n                  profile={profile}\n                  preferences={cardPreferences}\n                  server={server}\n                  highlightMaximum={medleyResponse.hydration.maximumScoreCandidateIndex === index}\n                />\n              ))}\n            </div>\n          </>\n        ) : (\n          <>\n            {!searchResponse && <div className="empty-state">完成档案导入并选择歌曲后，搜索结果会显示在这里。</div>}\n            {searchResponse?.results.length === 0 && <div className="empty-state">没有找到满足条件的合法五人队伍。</div>}\n            <div className="result-list">\n              {searchResponse?.results.map((result) => (\n                <TeamSearchResultCard\n                  key={`${result.rank}-${result.leaderCardId}-${result.targetValue}`}\n                  result={result}\n                  data={gameData}\n                  profile={profile}\n                  server={server}\n                  eventPointSelection={{\n                    liveBoostCount: eventControls.liveBoostCount,\n                    challengeCpCost: eventControls.challengeCpCost,\n                    placement: eventControls.resultPlacement,\n                    festivalResult: eventControls.resultFestivalResult,\n                  }}\n                />\n              ))}\n            </div>\n          </>\n        )}\n',
  "Medley results renderer",
);

await writeFile(appPath, app, "utf8");

const cssPath = "src/styles.css";
let css = await readFile(cssPath, "utf8");
const marker = "/* Native Medley result layout */";
if (!css.includes(marker)) {
  css += `\n\n${marker}\n.medley-result-card { display: grid; gap: 18px; }\n.medley-maximum-card { outline: 2px solid var(--accent-border); outline-offset: 2px; }\n.medley-total-metrics { margin-top: 0; }\n.medley-song-result {\n  display: grid;\n  gap: 14px;\n  padding: 16px;\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: rgba(248, 248, 252, 0.72);\n}\n.medley-song-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }\n.medley-song-heading > div:first-child { display: grid; gap: 3px; }\n.medley-song-heading > div:first-child > span:last-child { color: var(--muted); font-size: 0.78rem; }\n.medley-song-score { display: grid; justify-items: end; gap: 2px; }\n.medley-song-score span { color: var(--muted); font-size: 0.72rem; }\n.medley-song-score strong { font-size: 1.15rem; }\n@media (max-width: 720px) {\n  .medley-song-heading { align-items: stretch; flex-direction: column; }\n  .medley-song-score { justify-items: start; }\n}\n`;
  await writeFile(cssPath, css, "utf8");
}

console.log("patched Medley native UI");
