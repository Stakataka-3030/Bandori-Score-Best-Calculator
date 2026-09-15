import { useEffect, useMemo, useRef, useState } from "react";
import ActivityControls, {
  DEFAULT_EVENT_CONTROL_STATE,
  materializeExternalSkills,
  type EventControlState,
} from "@/components/ActivityControls";
import CardPreferencesPanel from "@/components/CardPreferencesPanel";
import SearchableSelect from "@/components/SearchableSelect";
import TeamSearchResultCard from "@/components/TeamSearchResultCard";
import {
  allowedLiveTypesForEvent,
  createBandoriSearchInput,
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
import { importProfileFile, type ImportedProfile } from "@/lib/profile-import";
import { runBandoriTeamSearch } from "@/search/run-team-search";

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
  story: "通常活动 / Story",
  challenge: "Challenge Live",
  versus: "VS Live",
  live_try: "Live Goals / Live Try",
  mission_live: "Mission Live",
  festival: "Team Live Festival",
  medley: "Medley Live",
};

function liveTypeLabel(liveType: BandoriTeamSearchLiveType, eventType: BandoriTeamSearchEventType): string {
  if (eventType === "medley") return "Medley Live";
  if (liveType === "free") return "Free Live";
  if (liveType === "multi") return "Multi Live";
  if (liveType === "challenge") return "Challenge Live";
  return eventType === "festival" ? "Team Live" : "VS Live";
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
  const abortRef = useRef<AbortController | null>(null);

  const server = profile?.profile.server ?? 3;
  const songs = useMemo(() => buildSongOptions(gameData, server), [gameData, server]);
  const events = useMemo(() => buildEventOptions(gameData, server), [gameData, server]);
  const availableDifficulties = useMemo(() => getAvailableDifficulties(gameData, songId), [gameData, songId]);
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
  }, [songId, songs]);

  useEffect(() => {
    if (!availableDifficulties.includes(difficulty)) {
      setDifficulty(availableDifficulties.includes("expert") ? "expert" : availableDifficulties[availableDifficulties.length - 1] ?? "expert");
    }
  }, [availableDifficulties, difficulty]);

  useEffect(() => {
    if (!allowedLiveTypes.includes(liveType)) {
      setLiveType(allowedLiveTypes.includes("multi") ? "multi" : allowedLiveTypes[0] ?? "free");
    }
  }, [allowedLiveTypes, liveType]);

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

  async function importProfile(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      const imported = importProfileFile(parsed);
      setProfile(imported);
      setCardPreferences(readCardPreferences(profilePreferenceKey(imported)));
      setProfileError("");
      setSearchResponse(null);
    } catch (cause) {
      setProfile(null);
      setCardPreferences(createDefaultCardPreferences());
      setProfileError(cause instanceof Error ? cause.message : "无法读取档案");
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

    try {
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
        maxSearchDurationMs: 30_000,
      });
      if (controller.signal.aborted) return;
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
    && selectedEventType !== "medley"
    && searchState !== "preparing"
    && searchState !== "searching"
  );

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Bandori team optimizer</p>
          <h1>Score Best Calculator</h1>
          <p className="header-copy">HHWX exact-search 基线 + 真实技能洗牌概率。档案只从本地导入，游戏 Master 与谱面由 Tauri 客户端直接同步 Bestdori。</p>
        </div>
        <div className="brand-mark">SB</div>
      </header>

      <div className="workspace-grid">
        <div className="control-stack">
          <section className="panel compact-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">DATA</span>
                <h2>游戏数据</h2>
              </div>
              <button type="button" className="ghost-button" disabled={syncState === "syncing"} onClick={() => void refreshGameData()}>
                {syncState === "syncing" ? "同步中…" : "检查更新"}
              </button>
            </div>
            <p className={`status-line status-${syncState}`}>{syncMessage}</p>
            {gameData && (
              <div className="summary-row">
                <span>Cards {gameData.manifest.datasets.cards.recordCount}</span>
                <span>Events {gameData.manifest.datasets.events.recordCount}</span>
                <span>{new Date(gameData.manifest.fetchedAt).toLocaleString()}</span>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">PROFILE</span>
                <h2>玩家档案</h2>
              </div>
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
            {profile ? (
              <div className="profile-summary">
                <strong>{profile.profile.name}</strong>
                <span>Server {profile.profile.server} · {profile.profile.cards.length} 张持有卡 · {cardPreferences.temporaryCards.length} 张临时卡</span>
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
                <span className="section-kicker">SEARCH</span>
                <h2>搜索条件</h2>
              </div>
            </div>

            <div className="form-grid">
              <label className="field field-wide">
                <span>歌曲</span>
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

              <label className="field">
                <span>目标</span>
                <select value={target} onChange={(event) => setTarget(event.currentTarget.value as BandoriTeamSearchTarget)}>
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
                <input type="number" min="1" max="50" step="1" value={resultLimit} onChange={(event) => setResultLimit(Math.max(1, Math.min(50, Number(event.currentTarget.value))))} />
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

            {selectedEventType === "medley" && (
              <p className="status-line status-error">Medley 是 HHWX 的独立三曲 Rust/WASM 搜索器，不是单曲活动公式的一个开关。当前客户端暂不允许用单曲结果冒充 Medley 最优解；它会作为下一块独立迁移。</p>
            )}

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
            preferences={cardPreferences}
            onChange={(next) => {
              setCardPreferences(next);
              setSearchResponse(null);
            }}
          />
        </div>

        <aside className="side-panel">
          <div className="side-callout">
            <span className="section-kicker">MODEL</span>
            <strong>真实技能洗牌</strong>
            <p>前 5 次技能由 1024 条等概率 RNG 路径产生 96 个非等概率可达顺序。搜索同时优化队长和初始五人站位。</p>
          </div>
          <div className="side-callout">
            <span className="section-kicker">EVENT PT</span>
            <strong>HHWX 当前口径</strong>
            <p>默认 V3、3 火、Challenge 1600 CP；星光练习对应 Bestdori limitBreaks，已进入活动加成计算。</p>
          </div>
          {searchResponse && (
            <div className="stats-panel">
              <span className="section-kicker">SEARCH STATS</span>
              <div><span>候选卡</span><strong>{searchResponse.stats.candidateCardCount}</strong></div>
              <div><span>枚举队伍</span><strong>{searchResponse.stats.enumeratedTeamCount.toLocaleString()}</strong></div>
              <div><span>精评队伍</span><strong>{searchResponse.stats.evaluatedTeamCount.toLocaleString()}</strong></div>
              <div><span>剪枝</span><strong>{searchResponse.stats.prunedBranchCount.toLocaleString()}</strong></div>
              <div><span>模式</span><strong>{searchResponse.stats.isExhaustive ? "Exact" : "Bounded"}</strong></div>
            </div>
          )}
        </aside>
      </div>

      <section className="results-section">
        <div className="results-title-row">
          <div>
            <span className="section-kicker">RESULTS</span>
            <h2>最优队伍</h2>
          </div>
          {searchResponse && <span className="result-count">{searchResponse.results.length} results</span>}
        </div>

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
              eventPointSelection={{
                liveBoostCount: eventControls.liveBoostCount,
                challengeCpCost: eventControls.challengeCpCost,
                placement: eventControls.resultPlacement,
                festivalResult: eventControls.resultFestivalResult,
              }}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
