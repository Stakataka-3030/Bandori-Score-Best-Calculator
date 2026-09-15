import { useEffect, useMemo, useRef, useState } from "react";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import ActivityControls, {
  DEFAULT_EVENT_CONTROL_STATE,
  materializeExternalSkills,
  type EventControlState,
} from "@/components/ActivityControls";
import CardPreferencesPanel from "@/components/CardPreferencesPanel";
import SearchableSelect from "@/components/SearchableSelect";
import TeamSearchResultCard from "@/components/TeamSearchResultCard";
import MedleySearchResultCard from "@/components/MedleySearchResultCard";
import {
  allowedLiveTypesForEvent,
  createBandoriSearchInput,
  createMedleySearchInput,
  eventTypeFromBestdori,
  loadCurrentGameData,
  syncBestdoriMasters,
  syncBestdoriMastersIfStale,
  type GameDataGeneration,
} from "@/data";
import type {
  BandoriTeamSearchDifficulty,
  BandoriTeamSearchEventType,
  BandoriTeamSearchLiveType,
  BandoriTeamSearchResponse,
  BandoriTeamSearchTarget,
} from "@/lib/bandori/team-builder/core/types";
import {
  createDefaultCardPreferences,
  readCardPreferences,
  writeCardPreferences,
  type TeamBuilderCardPreferences,
} from "@/lib/card-preferences";
import type { MedleySearchInputV1 } from "@/lib/bandori/medley-foundation";
import { importProfileFile, type ImportedProfile } from "@/lib/profile-import";
import { runBandoriTeamSearch } from "@/search/run-team-search";
import { runNativeMedleySearch, type MedleySearchRunResult } from "@/search/run-medley-search";
import { getCachedPreparedChart } from "@/lib/bandori/team-builder/core/chart";

type SyncState = "starting" | "ready" | "syncing" | "error";
type SearchState = "idle" | "preparing" | "searching" | "error";

type SelectOption = {
  id: number;
  label: string;
};

const DIFFICULTIES: BandoriTeamSearchDifficulty[] = ["easy", "normal", "hard", "expert", "special"];
const DIFFICULTY_LABELS: Record<BandoriTeamSearchDifficulty, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
  expert: "Expert",
  special: "Special",
};
const EVENT_TYPE_LABELS: Record<BandoriTeamSearchEventType, string> = {
  none: "无活动",
  story: "普通活动",
  challenge: "挑战活动",
  versus: "对战活动",
  live_try: "演出目标活动",
  mission_live: "任务演出活动",
  festival: "团队演出祭典",
  medley: "组曲演出活动",
};

function liveTypeLabel(liveType: BandoriTeamSearchLiveType, eventType: BandoriTeamSearchEventType): string {
  if (eventType === "medley") return "组曲演出";
  if (liveType === "free") return "单人演出";
  if (liveType === "multi") return "协力演出";
  if (liveType === "challenge") return "挑战演出";
  return eventType === "festival" ? "团队演出" : "对战演出";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function regionalText(value: unknown, preferredServer: number, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!Array.isArray(value)) return fallback;
  for (const server of [preferredServer, 0, 1, 2, 3]) {
    const candidate = value[server];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

function buildSongOptions(data: GameDataGeneration | null, server: number): SelectOption[] {
  if (!data) return [];
  return Object.entries(data.masters.songs)
    .flatMap(([id, value]) => {
      const songId = Number(id);
      if (!Number.isSafeInteger(songId) || !isRecord(value)) return [];
      const label = regionalText(value.musicTitle ?? value.title, server, `Song ${songId}`);
      return [{ id: songId, label: `${label} · #${songId}` }];
    })
    .sort((left, right) => left.label.localeCompare(right.label, "zh-Hans"));
}

function buildEventOptions(data: GameDataGeneration | null, server: number): SelectOption[] {
  if (!data) return [];
  return Object.entries(data.masters.events)
    .flatMap(([id, value]) => {
      const eventId = Number(id);
      if (!Number.isSafeInteger(eventId) || !isRecord(value)) return [];
      const label = regionalText(value.eventName ?? value.name, server, `Event ${eventId}`);
      return [{ id: eventId, label: `${label} · #${eventId}` }];
    })
    .sort((left, right) => right.id - left.id);
}

function getAvailableDifficulties(data: GameDataGeneration | null, songId: number | null): BandoriTeamSearchDifficulty[] {
  if (!data || songId === null) return DIFFICULTIES;
  const song = data.masters.songs[String(songId)];
  if (!isRecord(song) || !isRecord(song.difficulty)) return DIFFICULTIES;
  const difficultyMap = song.difficulty;
  const available = DIFFICULTIES.filter((_, index) => isRecord(difficultyMap[String(index)]));
  return available.length > 0 ? available : DIFFICULTIES;
}

function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : Math.round(value).toLocaleString("zh-CN");
}

function profilePreferenceKey(profile: ImportedProfile): string {
  return `${profile.profile.server}:${profile.profile.name}`;
}

export default function App() {
  const [profile, setProfile] = useState<ImportedProfile | null>(null);
  const [profileError, setProfileError] = useState("");
  const [cardPreferences, setCardPreferences] = useState<TeamBuilderCardPreferences>(() => createDefaultCardPreferences());
  const [gameData, setGameData] = useState<GameDataGeneration | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("starting");
  const [syncMessage, setSyncMessage] = useState("正在读取本地游戏数据…");

  const [songId, setSongId] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<BandoriTeamSearchDifficulty>("expert");
  const [medleySong2Id, setMedleySong2Id] = useState<number | null>(null);
  const [medleySong3Id, setMedleySong3Id] = useState<number | null>(null);
  const [medleyDifficulty2, setMedleyDifficulty2] = useState<BandoriTeamSearchDifficulty>("expert");
  const [medleyDifficulty3, setMedleyDifficulty3] = useState<BandoriTeamSearchDifficulty>("expert");
  const [eventId, setEventId] = useState<number | null>(null);
  const [liveType, setLiveType] = useState<BandoriTeamSearchLiveType>("free");
  const [target, setTarget] = useState<BandoriTeamSearchTarget>("score");
  const [perfectRatePercent, setPerfectRatePercent] = useState(100);
  const [resultLimit, setResultLimit] = useState(10);
  const [eventControls, setEventControls] = useState<EventControlState>(() => ({
    ...DEFAULT_EVENT_CONTROL_STATE,
    externalSkills: DEFAULT_EVENT_CONTROL_STATE.externalSkills.map((skill) => ({ ...skill })),
  }));
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [searchResponse, setSearchResponse] = useState<BandoriTeamSearchResponse | null>(null);
  const [lastSkillTriggerTimes, setLastSkillTriggerTimes] = useState<number[] | null>(null);
  const [medleyInput, setMedleyInput] = useState<MedleySearchInputV1 | null>(null);
  const [medleyResponse, setMedleyResponse] = useState<MedleySearchRunResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const server = profile?.profile.server ?? 3;
  const songs = useMemo(() => buildSongOptions(gameData, server), [gameData, server]);
  const events = useMemo(() => buildEventOptions(gameData, server), [gameData, server]);
  const availableDifficulties = useMemo(() => getAvailableDifficulties(gameData, songId), [gameData, songId]);
  const medleyDifficulties2 = useMemo(() => getAvailableDifficulties(gameData, medleySong2Id), [gameData, medleySong2Id]);
  const medleyDifficulties3 = useMemo(() => getAvailableDifficulties(gameData, medleySong3Id), [gameData, medleySong3Id]);
  const selectedEventType = useMemo<BandoriTeamSearchEventType>(() => {
    if (!gameData || eventId === null) return "none";
    const rawEvent = gameData.masters.events[String(eventId)];
    return eventTypeFromBestdori(isRecord(rawEvent) ? rawEvent.eventType : null);
  }, [eventId, gameData]);
  const allowedLiveTypes = useMemo(() => allowedLiveTypesForEvent(selectedEventType), [selectedEventType]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrapGameData() {
      const cached = await loadCurrentGameData().catch(() => null);
      if (cancelled) return;
      if (cached) {
        setGameData(cached);
        setSyncState("ready");
        setSyncMessage(`本地数据 ${cached.manifest.generation.slice(0, 12)}，正在后台检查更新…`);
        const result = await syncBestdoriMastersIfStale();
        if (cancelled || result === null) return;
        if (result.ok) {
          const current = await loadCurrentGameData();
          if (cancelled) return;
          setGameData(current);
          setSyncState("ready");
          setSyncMessage(result.updated ? "Bestdori 游戏数据已自动更新" : "游戏数据已是最新");
        } else {
          setSyncState("ready");
          setSyncMessage(`更新检查失败，继续使用本地数据：${result.error ?? "未知错误"}`);
        }
        return;
      }
      setSyncState("syncing");
      setSyncMessage("首次启动：正在从 Bestdori 获取游戏数据…");
      const result = await syncBestdoriMasters();
      if (cancelled) return;
      const current = await loadCurrentGameData();
      if (cancelled) return;
      setGameData(current);
      if (result.ok && current) {
        setSyncState("ready");
        setSyncMessage("游戏数据初始化完成");
      } else {
        setSyncState("error");
        setSyncMessage(`暂无可用游戏数据：${result.error ?? "同步失败"}`);
      }
    }
    void bootstrapGameData();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (songId === null && songs.length > 0) setSongId(songs[0].id);
    if (medleySong2Id === null && songs.length > 1) setMedleySong2Id(songs[1].id);
    if (medleySong3Id === null && songs.length > 2) setMedleySong3Id(songs[2].id);
  }, [medleySong2Id, medleySong3Id, songId, songs]);

  useEffect(() => {
    if (!availableDifficulties.includes(difficulty)) {
      setDifficulty(availableDifficulties.includes("expert") ? "expert" : availableDifficulties[availableDifficulties.length - 1] ?? "expert");
    }
  }, [availableDifficulties, difficulty]);

  useEffect(() => {
    if (!medleyDifficulties2.includes(medleyDifficulty2)) {
      setMedleyDifficulty2(medleyDifficulties2.includes("expert") ? "expert" : medleyDifficulties2[medleyDifficulties2.length - 1] ?? "expert");
    }
    if (!medleyDifficulties3.includes(medleyDifficulty3)) {
      setMedleyDifficulty3(medleyDifficulties3.includes("expert") ? "expert" : medleyDifficulties3[medleyDifficulties3.length - 1] ?? "expert");
    }
  }, [medleyDifficulties2, medleyDifficulties3, medleyDifficulty2, medleyDifficulty3]);

  useEffect(() => {
    if (!allowedLiveTypes.includes(liveType)) {
      setLiveType(allowedLiveTypes.includes("multi") ? "multi" : allowedLiveTypes[0] ?? "free");
    }
  }, [allowedLiveTypes, liveType]);

  useEffect(() => {
    if (selectedEventType === "medley" && target !== "score") setTarget("score");
  }, [selectedEventType, target]);

  useEffect(() => {
    if (!profile) return;
    writeCardPreferences(profilePreferenceKey(profile), cardPreferences);
  }, [cardPreferences, profile]);

  async function refreshGameData() {
    setSyncState("syncing");
    setSyncMessage("正在检查 Bestdori 更新…");
    const result = await syncBestdoriMasters();
    const current = await loadCurrentGameData();
    setGameData(current);
    if (result.ok) {
      setSyncState("ready");
      setSyncMessage(result.updated ? "Bestdori 游戏数据已更新" : "游戏数据已是最新");
    } else if (current) {
      setSyncState("ready");
      setSyncMessage(`更新失败，继续使用本地数据：${result.error ?? "未知错误"}`);
    } else {
      setSyncState("error");
      setSyncMessage(`暂无可用游戏数据：${result.error ?? "同步失败"}`);
    }
  }

  function applyImportedProfile(parsed: unknown) {
    const imported = importProfileFile(parsed);
    setProfile(imported);
    setCardPreferences(readCardPreferences(profilePreferenceKey(imported)));
    setProfileError("");
    setSearchResponse(null);
    setLastSkillTriggerTimes(null);
    setMedleyInput(null);
    setMedleyResponse(null);
  }

  async function importProfile(file: File) {
    try {
      applyImportedProfile(JSON.parse(await file.text()));
    } catch (cause) {
      setProfile(null);
      setCardPreferences(createDefaultCardPreferences());
      setProfileError(cause instanceof Error ? cause.message : "无法读取档案");
    }
  }

  async function importProfileFromClipboard() {
    try {
      const text = await readText();
      if (!text.trim()) {
        throw new Error("剪贴板中没有可读取的 JSON 文本");
      }
      applyImportedProfile(JSON.parse(text));
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : "无法从剪贴板读取档案");
    }
  }

  async function startSearch() {
    if (!profile || !gameData || songId === null) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearchState("preparing");
    setSearchMessage("正在读取谱面并准备候选卡…");
    setSearchResponse(null);
    setLastSkillTriggerTimes(null);
    setMedleyInput(null);
    setMedleyResponse(null);

    try {
      if (selectedEventType === "medley") {
        if (medleySong2Id === null || medleySong3Id === null) {
          throw new Error("请选择完整的三首 Medley 歌曲");
        }
        const input = await createMedleySearchInput(profile, gameData, {
          songs: [
            { songId, difficulty },
            { songId: medleySong2Id, difficulty: medleyDifficulty2 },
            { songId: medleySong3Id, difficulty: medleyDifficulty3 },
          ],
          eventId,
          perfectRatePercent: Math.max(0, Math.min(100, perfectRatePercent)),
          ownedCardParameters: cardPreferences.ownedCardParameters,
          temporaryCards: cardPreferences.temporaryCards,
        });
        if (controller.signal.aborted) return;
        setMedleyInput(input);
        setSearchState("searching");
        setSearchMessage("正在搜索三队 Medley 最优解…");
        const startedAt = performance.now();
        const response = await runNativeMedleySearch(input, {
          signal: controller.signal,
          maxDurationMs: 60_000,
        });
        if (controller.signal.aborted) return;
        setMedleyResponse(response);
        setSearchState("idle");
        const elapsedMs = Math.round(performance.now() - startedAt);
        setSearchMessage(
          response.outcome.status === "exact"
            ? `Medley 精确搜索完成 · ${elapsedMs.toLocaleString()} ms`
            : `Medley 搜索未穷尽（${response.outcome.reason}）· ${elapsedMs.toLocaleString()} ms`,
        );
        return;
      }

      const externalSkills = materializeExternalSkills(eventControls.externalSkills);
      const input = await createBandoriSearchInput(profile, gameData, {
        songId,
        difficulty,
        eventId,
        resultLimit,
        perfectRate: Math.max(0, Math.min(100, perfectRatePercent)) / 100,
        target,
        liveType,
        eventFormula: eventControls.eventFormula,
        liveBoostCount: eventControls.liveBoostCount,
        challengeCpCost: eventControls.challengeCpCost,
        otherPlayersAveragePower: liveType === "multi" ? eventControls.otherPlayersAveragePower : undefined,
        otherPlayerSkills: liveType === "multi" && externalSkills.length > 0 ? externalSkills : undefined,
        encoreSkillSource: liveType === "multi" ? eventControls.encoreSkillSource : undefined,
        useSpecialRoomBonus: eventControls.useSpecialRoomBonus,
        ownedCardParameters: cardPreferences.ownedCardParameters,
        temporaryCards: cardPreferences.temporaryCards,
        maxSearchDurationMs: 60_000,
      });
      if (controller.signal.aborted) return;
      setLastSkillTriggerTimes(getCachedPreparedChart(input).skillTriggerTimes.slice(0, 6));
      setSearchState("searching");
      setSearchMessage("正在搜索最优队伍…");
      const response = await runBandoriTeamSearch(input, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setSearchResponse(response);
      setSearchState("idle");
      setSearchMessage(
        response.stats.isExhaustive
          ? `精确搜索完成 · ${response.stats.elapsedMs.toLocaleString()} ms`
          : `达到时间预算，返回当前最优结果 · gap ${formatNumber(response.stats.observedScoreUpperBoundGap)}`,
      );
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setSearchState("idle");
        setSearchMessage("搜索已取消");
        return;
      }
      setSearchState("error");
      setSearchMessage(cause instanceof Error ? cause.message : "搜索失败");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function cancelSearch() {
    abortRef.current?.abort();
  }

  const canSearch = Boolean(
    profile
    && gameData
    && songId !== null
    && (selectedEventType !== "medley" || (medleySong2Id !== null && medleySong3Id !== null))
    && searchState !== "preparing"
    && searchState !== "searching"
  );

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Bandori team optimizer</p>
          <h1>Score Best Calculator</h1>
          <p className="header-copy">根据本地档案与最新游戏数据搜索最优队伍；游戏 Master 与谱面由客户端自动同步。</p>
        </div>
        <span className="build-stamp" title="当前客户端构建对应的 Git 提交">Build {__BUILD_SHA__}</span>
      </header>

      <div className={`workspace-grid ${searchResponse ? "" : "workspace-grid-single"}`}>
        <div className="control-stack">
          <section className="panel compact-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">数据</span>
                <h2>游戏数据</h2>
              </div>
              <button type="button" className="ghost-button" disabled={syncState === "syncing"} onClick={() => void refreshGameData()}>
                {syncState === "syncing" ? "同步中…" : "检查更新"}
              </button>
            </div>
            <p className={`status-line status-${syncState}`}>{syncMessage}</p>
            {gameData && (
              <div className="summary-row">
                <span>卡牌 {gameData.manifest.datasets.cards.recordCount}</span>
                <span>活动 {gameData.manifest.datasets.events.recordCount}</span>
                <span>{new Date(gameData.manifest.fetchedAt).toLocaleString()}</span>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">档案</span>
                <h2>玩家档案</h2>
              </div>
              <div className="profile-import-actions">
                <button type="button" className="ghost-button" onClick={() => void importProfileFromClipboard()}>
                  从剪贴板读取
                </button>
                <label className="primary-button file-button">
                  导入 JSON
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) void importProfile(file);
                    }}
                  />
                </label>
              </div>
            </div>
            {profile ? (
              <div className="profile-summary">
                <strong>{profile.profile.name}</strong>
                <span>服务器 {profile.profile.server} · {profile.profile.cards.length} 张持有卡 · {cardPreferences.temporaryCards.length} 张临时卡</span>
                <span>{profile.hasHhwxExtension ? "HHWX 精确潜能/任务扩展" : "Bestdori 兼容档案"}</span>
              </div>
            ) : (
              <p className="muted">导入 Bestdori 或 HHWX 导出的 Profile JSON 后即可搜索。</p>
            )}
            {profileError && <p className="error">{profileError}</p>}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">搜索</span>
                <h2>搜索条件</h2>
              </div>
            </div>

            <div className="form-grid">
              <label className="field field-wide">
                <span>{selectedEventType === "medley" ? "第 1 曲" : "歌曲"}</span>
                <SearchableSelect
                  value={songId}
                  options={songs}
                  onChange={(value) => { if (value !== null) setSongId(value); }}
                  placeholder="搜索歌曲名或 ID…"
                  disabled={!gameData}
                />
              </label>

              <label className="field">
                <span>难度</span>
                <select value={difficulty} onChange={(event) => setDifficulty(event.currentTarget.value as BandoriTeamSearchDifficulty)}>
                  {availableDifficulties.map((item) => <option key={item} value={item}>{DIFFICULTY_LABELS[item]}</option>)}
                </select>
              </label>

              {selectedEventType === "medley" && (<>
                <label className="field field-wide">
                  <span>第 2 曲</span>
                  <SearchableSelect
                    value={medleySong2Id}
                    options={songs}
                    onChange={(value) => { if (value !== null) setMedleySong2Id(value); }}
                    placeholder="搜索第 2 曲…"
                    disabled={!gameData}
                  />
                </label>
                <label className="field">
                  <span>第 2 曲难度</span>
                  <select value={medleyDifficulty2} onChange={(event) => setMedleyDifficulty2(event.currentTarget.value as BandoriTeamSearchDifficulty)}>
                    {medleyDifficulties2.map((item) => <option key={item} value={item}>{DIFFICULTY_LABELS[item]}</option>)}
                  </select>
                </label>
                <label className="field field-wide">
                  <span>第 3 曲</span>
                  <SearchableSelect
                    value={medleySong3Id}
                    options={songs}
                    onChange={(value) => { if (value !== null) setMedleySong3Id(value); }}
                    placeholder="搜索第 3 曲…"
                    disabled={!gameData}
                  />
                </label>
                <label className="field">
                  <span>第 3 曲难度</span>
                  <select value={medleyDifficulty3} onChange={(event) => setMedleyDifficulty3(event.currentTarget.value as BandoriTeamSearchDifficulty)}>
                    {medleyDifficulties3.map((item) => <option key={item} value={item}>{DIFFICULTY_LABELS[item]}</option>)}
                  </select>
                </label>
              </>)}

              <label className="field">
                <span>目标</span>
                <select value={target} disabled={selectedEventType === "medley"} onChange={(event) => setTarget(event.currentTarget.value as BandoriTeamSearchTarget)}>
                  <option value="score">最高期望分</option>
                  <option value="eventPoint">最高活动 Pt</option>
                </select>
              </label>

              <label className="field field-wide">
                <span>活动</span>
                <SearchableSelect
                  value={eventId}
                  options={events}
                  onChange={setEventId}
                  placeholder="搜索活动名或 ID…"
                  emptyLabel="不使用活动加成"
                  disabled={!gameData}
                />
              </label>

              <label className="field">
                <span>活动类型</span>
                <select value={selectedEventType} disabled>
                  <option value={selectedEventType}>{EVENT_TYPE_LABELS[selectedEventType]}</option>
                </select>
              </label>

              <label className="field">
                <span>Live 类型</span>
                <select value={liveType} onChange={(event) => setLiveType(event.currentTarget.value as BandoriTeamSearchLiveType)}>
                  {allowedLiveTypes.map((item) => <option key={item} value={item}>{liveTypeLabel(item, selectedEventType)}</option>)}
                </select>
              </label>

              <label className="field">
                <span>PERFECT 率</span>
                <div className="number-suffix">
                  <input type="number" min="0" max="100" step="1" value={perfectRatePercent} onChange={(event) => setPerfectRatePercent(Number(event.currentTarget.value))} />
                  <span>%</span>
                </div>
              </label>

              <label className="field">
                <span>结果数量</span>
                <input type="number" min="1" max="50" step="1" value={resultLimit} disabled={selectedEventType === "medley"} onChange={(event) => setResultLimit(Math.max(1, Math.min(50, Number(event.currentTarget.value))))} />
              </label>
            </div>

            <ActivityControls
              data={gameData}
              server={server}
              eventType={selectedEventType}
              liveType={liveType}
              state={eventControls}
              onChange={setEventControls}
            />

            <div className="search-actions">
              <button type="button" className="primary-button search-button" disabled={!canSearch} onClick={() => void startSearch()}>
                {searchState === "preparing" ? "准备数据…" : searchState === "searching" ? "搜索中…" : "搜索最优队伍"}
              </button>
              {(searchState === "preparing" || searchState === "searching") && (
                <button type="button" className="ghost-button" onClick={cancelSearch}>取消</button>
              )}
            </div>
            {searchMessage && <p className={`status-line ${searchState === "error" ? "status-error" : ""}`}>{searchMessage}</p>}
          </section>

          <CardPreferencesPanel
            data={gameData}
            server={server}
            eventId={eventId}
            preferences={cardPreferences}
            onChange={(next) => {
              setCardPreferences(next);
              setSearchResponse(null);
              setMedleyInput(null);
              setMedleyResponse(null);
            }}
          />
        </div>

        {searchResponse && (
          <aside className="side-panel">
            <div className="stats-panel">
              <span className="section-kicker">搜索统计</span>
              <div><span>候选卡</span><strong>{searchResponse.stats.candidateCardCount}</strong></div>
              <div><span>枚举队伍</span><strong>{searchResponse.stats.enumeratedTeamCount.toLocaleString()}</strong></div>
              <div><span>精评队伍</span><strong>{searchResponse.stats.evaluatedTeamCount.toLocaleString()}</strong></div>
              <div><span>剪枝</span><strong>{searchResponse.stats.prunedBranchCount.toLocaleString()}</strong></div>
              <div><span>模式</span><strong>{searchResponse.stats.isExhaustive ? "已穷尽" : "限时结果"}</strong></div>
            </div>
          </aside>
        )}
      </div>

      <section className="results-section">
        <div className="results-title-row">
          <div>
            <span className="section-kicker">结果</span>
            <h2>最优队伍</h2>
          </div>
          {selectedEventType === "medley"
            ? medleyResponse && <span className="result-count">{medleyResponse.hydration.candidates.length} 个候选</span>
            : searchResponse && <span className="result-count">{searchResponse.results.length} 个结果</span>}
        </div>

        {selectedEventType === "medley" ? (
          <>
            {!medleyResponse && <div className="empty-state">选择 Medley 活动与三首歌曲后，三队 Medley 搜索结果会显示在这里。</div>}
            {medleyResponse?.hydration.candidates.length === 0 && <div className="empty-state">没有找到满足条件的三队 Medley 合法解。</div>}
            <div className="result-list">
              {medleyResponse && medleyInput && medleyResponse.hydration.candidates.map((candidate, index) => (
                <MedleySearchResultCard
                  key={`${index}-${candidate.totalAverageScore}`}
                  candidate={candidate}
                  rank={index + 1}
                  input={medleyInput}
                  data={gameData}
                  profile={profile}
                  preferences={cardPreferences}
                  server={server}
                  highlightMaximum={medleyResponse.hydration.maximumScoreCandidateIndex === index}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            {!searchResponse && <div className="empty-state">完成档案导入并选择歌曲后，搜索结果会显示在这里。</div>}
            {searchResponse?.results.length === 0 && <div className="empty-state">没有找到满足条件的合法五人队伍。</div>}
            <div className="result-list">
              {searchResponse?.results.map((result) => (
                <TeamSearchResultCard
                  key={`${result.rank}-${result.leaderCardId}-${result.targetValue}`}
                  result={result}
                  data={gameData}
                  profile={profile}
                  server={server}
                  skillTriggerTimes={lastSkillTriggerTimes ?? undefined}
                  eventPointSelection={{
                    liveBoostCount: eventControls.liveBoostCount,
                    challengeCpCost: eventControls.challengeCpCost,
                    placement: eventControls.resultPlacement,
                    festivalResult: eventControls.resultFestivalResult,
                  }}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
