import { useEffect, useMemo, useRef, useState } from "react";
import {
  createBandoriSearchInput,
  loadCurrentGameData,
  syncBestdoriMasters,
  syncBestdoriMastersIfStale,
  type GameDataGeneration,
} from "@/data";
import type {
  BandoriTeamSearchDifficulty,
  BandoriTeamSearchResponse,
  BandoriTeamSearchResult,
  BandoriTeamSearchTarget,
} from "@/lib/bandori/team-builder/core/types";
import { importProfileFile, type ImportedProfile } from "@/lib/profile-import";
import { runBandoriTeamSearch } from "@/search/run-team-search";

type SyncState = "starting" | "ready" | "syncing" | "error";
type SearchState = "idle" | "preparing" | "searching" | "error";

type SelectOption = {
  id: number;
  label: string;
};

const DIFFICULTIES: BandoriTeamSearchDifficulty[] = [
  "easy",
  "normal",
  "hard",
  "expert",
  "special",
];

const DIFFICULTY_LABELS: Record<BandoriTeamSearchDifficulty, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
  expert: "Expert",
  special: "Special",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function regionalText(value: unknown, preferredServer: number, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!Array.isArray(value)) return fallback;
  const order = [preferredServer, 0, 1, 2, 3];
  for (const server of order) {
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

function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : Math.round(value).toLocaleString("zh-CN");
}

function formatProbability(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  const percent = numerator / denominator * 100;
  return `${numerator}/${denominator} · ${percent.toFixed(percent < 1 ? 2 : 1)}%`;
}

function TeamSlots({ result }: { result: BandoriTeamSearchResult }) {
  const fallbackIds = result.cards.map((card) => card.cardId);
  const ids = result.teamLayoutCardIds?.length === 5
    ? result.teamLayoutCardIds
    : fallbackIds;

  return (
    <div className="team-slots" aria-label="最优初始队伍站位">
      {ids.map((cardId, index) => (
        <div
          className={`team-slot ${index === 2 ? "team-slot-leader" : ""}`}
          key={`${cardId}-${index}`}
        >
          <span className="slot-position">{index === 2 ? "LEADER" : `SLOT ${index + 1}`}</span>
          <strong>#{cardId}</strong>
          {cardId === result.leaderCardId && <span className="leader-chip">队长</span>}
        </div>
      ))}
    </div>
  );
}

function SearchResultCard({ result }: { result: BandoriTeamSearchResult }) {
  return (
    <article className="search-result-card">
      <div className="result-heading">
        <div>
          <span className="result-rank">#{result.rank}</span>
          <strong>{formatNumber(result.averageScore)}</strong>
          <span className="result-unit">期望分</span>
        </div>
        <div className="result-target">
          <span>{result.target === "eventPoint" ? "活动 Pt" : "搜索目标"}</span>
          <strong>{formatNumber(result.targetValue)}</strong>
        </div>
      </div>

      <TeamSlots result={result} />

      <div className="metric-grid">
        <div><span>综合力</span><strong>{formatNumber(result.totalPower)}</strong></div>
        <div><span>理论最高</span><strong>{formatNumber(result.maxScore)}</strong></div>
        <div><span>理论最低</span><strong>{formatNumber(result.minScore)}</strong></div>
        <div><span>最高分概率</span><strong>{formatProbability(result.maxScoreOrderCount, result.maxScoreOrderTotal)}</strong></div>
        {result.eventPoint !== null && <div><span>活动 Pt</span><strong>{formatNumber(result.eventPoint)}</strong></div>}
        <div><span>队长卡</span><strong>#{result.leaderCardId}</strong></div>
      </div>
    </article>
  );
}

export default function App() {
  const [profile, setProfile] = useState<ImportedProfile | null>(null);
  const [profileError, setProfileError] = useState("");
  const [gameData, setGameData] = useState<GameDataGeneration | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("starting");
  const [syncMessage, setSyncMessage] = useState("正在读取本地游戏数据…");

  const [songId, setSongId] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<BandoriTeamSearchDifficulty>("expert");
  const [eventId, setEventId] = useState<number | null>(null);
  const [target, setTarget] = useState<BandoriTeamSearchTarget>("score");
  const [perfectRatePercent, setPerfectRatePercent] = useState(100);
  const [resultLimit, setResultLimit] = useState(10);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [searchResponse, setSearchResponse] = useState<BandoriTeamSearchResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const server = profile?.profile.server ?? 3;
  const songs = useMemo(() => buildSongOptions(gameData, server), [gameData, server]);
  const events = useMemo(() => buildEventOptions(gameData, server), [gameData, server]);

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
      setProfile(importProfileFile(parsed));
      setProfileError("");
      setSearchResponse(null);
    } catch (cause) {
      setProfile(null);
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
      const input = await createBandoriSearchInput(profile, gameData, {
        songId,
        difficulty,
        eventId,
        resultLimit,
        perfectRate: Math.max(0, Math.min(100, perfectRatePercent)) / 100,
        target,
        liveType: "free",
        maxSearchDurationMs: 15_000,
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

  const canSearch = Boolean(profile && gameData && songId !== null && searchState !== "preparing" && searchState !== "searching");

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Bandori team optimizer</p>
          <h1>Score Best Calculator</h1>
          <p className="header-copy">HHWX exact-search 基线 + 真实技能洗牌概率。档案只从本地导入，游戏数据由 Tauri 客户端直接同步 Bestdori。</p>
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
              <button
                type="button"
                className="ghost-button"
                disabled={syncState === "syncing"}
                onClick={() => void refreshGameData()}
              >
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
                <span>Server {profile.profile.server} · {profile.profile.cards.length} 张卡</span>
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
                <select value={songId ?? ""} onChange={(event) => setSongId(Number(event.currentTarget.value))} disabled={!gameData}>
                  {songs.map((song) => <option key={song.id} value={song.id}>{song.label}</option>)}
                </select>
              </label>

              <label className="field">
                <span>难度</span>
                <select value={difficulty} onChange={(event) => setDifficulty(event.currentTarget.value as BandoriTeamSearchDifficulty)}>
                  {DIFFICULTIES.map((item) => <option key={item} value={item}>{DIFFICULTY_LABELS[item]}</option>)}
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
                <select value={eventId ?? ""} onChange={(event) => setEventId(event.currentTarget.value ? Number(event.currentTarget.value) : null)} disabled={!gameData}>
                  <option value="">不使用活动加成</option>
                  {events.map((event) => <option key={event.id} value={event.id}>{event.label}</option>)}
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
        </div>

        <aside className="side-panel">
          <div className="side-callout">
            <span className="section-kicker">MODEL</span>
            <strong>真实技能洗牌</strong>
            <p>前 5 次技能由 1024 条等概率 RNG 路径产生 96 个非等概率可达顺序。搜索同时优化队长和初始五人站位。</p>
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
          {searchResponse?.results.map((result) => <SearchResultCard key={`${result.rank}-${result.leaderCardId}-${result.targetValue}`} result={result} />)}
        </div>
      </section>
    </main>
  );
}
