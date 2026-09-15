import { useEffect, useMemo, useRef, useState } from "react";
import BestdoriCardThumb from "@/components/BestdoriCardThumb";
import SearchableSelect, { type SearchableSelectOption } from "@/components/SearchableSelect";
import {
  allowedLiveTypesForEvent,
  createBandoriSearchInput,
  eventTypeFromBestdori,
  loadCurrentGameData,
  syncBestdoriMasters,
  syncBestdoriMastersIfStale,
  type GameDataGeneration,
} from "@/data";
import { BANDORI_AREA_ITEM_IDS_BY_GROUP } from "@/lib/bandori-area-item-groups";
import type {
  BandoriTeamSearchDifficulty,
  BandoriTeamSearchEventPointOption,
  BandoriTeamSearchEventType,
  BandoriTeamSearchExternalSkill,
  BandoriTeamSearchLiveType,
  BandoriTeamSearchResponse,
  BandoriTeamSearchResult,
  BandoriTeamSearchTarget,
} from "@/lib/bandori/team-builder/core/types";
import { importProfileFile, type ImportedProfile } from "@/lib/profile-import";
import { runBandoriTeamSearch } from "@/search/run-team-search";

type SyncState = "starting" | "ready" | "syncing" | "error";
type SearchState = "idle" | "preparing" | "searching" | "error";

const DIFFICULTIES: BandoriTeamSearchDifficulty[] = [
  "easy",
  "normal",
  "hard",
  "expert",
  "special",
];

const DIFFICULTY_KEYS: Record<BandoriTeamSearchDifficulty, string> = {
  easy: "0",
  normal: "1",
  hard: "2",
  expert: "3",
  special: "4",
};

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

const DEFAULT_OTHER_PLAYER_SKILLS: BandoriTeamSearchExternalSkill[] = [
  { skillId: 69, skillLevel: 5 },
  { skillId: 69, skillLevel: 1 },
  { skillId: 66, skillLevel: 5 },
  { skillId: 66, skillLevel: 1 },
];

function liveTypeLabel(
  liveType: BandoriTeamSearchLiveType,
  eventType: BandoriTeamSearchEventType,
): string {
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
  const order = [preferredServer, 0, 1, 2, 3];
  for (const server of order) {
    const candidate = value[server];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

function buildSongOptions(data: GameDataGeneration | null, server: number): SearchableSelectOption[] {
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

function buildEventOptions(data: GameDataGeneration | null, server: number): SearchableSelectOption[] {
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

function getAvailableDifficulties(
  data: GameDataGeneration | null,
  songId: number | null,
): BandoriTeamSearchDifficulty[] {
  if (!data || songId === null) return DIFFICULTIES;
  const song = data.masters.songs[String(songId)];
  if (!isRecord(song) || !isRecord(song.difficulty)) return DIFFICULTIES;
  const available = DIFFICULTIES.filter((item) => DIFFICULTY_KEYS[item] in song.difficulty!);
  return available.length > 0 ? available : DIFFICULTIES;
}

function buildAreaItemLevelMap(profile: ImportedProfile | null): Map<number, number> {
  const result = new Map<number, number>();
  if (!profile) return result;
  for (const [groupKey, levels] of Object.entries(profile.profile.items)) {
    const itemIds = BANDORI_AREA_ITEM_IDS_BY_GROUP[groupKey] ?? [];
    levels.forEach((encodedLevel, index) => {
      const areaItemId = itemIds[index];
      if (!areaItemId || encodedLevel === null) return;
      result.set(areaItemId, Math.max(0, Math.trunc(encodedLevel) + 1));
    });
  }
  return result;
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

function formatPointBonusRate(value: number): string {
  const percent = value * 100;
  return `+${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1)}%`;
}

function eventPointOptionLabel(option: BandoriTeamSearchEventPointOption | null): string {
  if (!option) return "—";
  const parts: string[] = [];
  if (option.liveBoostCount !== undefined) parts.push(`${option.liveBoostCount} 火`);
  if (option.challengeCpCost !== undefined) parts.push(`${option.challengeCpCost} CP`);
  if (option.festivalResult !== undefined) parts.push(option.festivalResult === "win" ? "胜利" : "失败");
  if (option.placement !== undefined) parts.push(`#${option.placement}`);
  return parts.length > 0 ? parts.join(" · ") : `×${option.multiplier}`;
}

function cardDisplayName(data: GameDataGeneration | null, cardId: number, server: number): string {
  const master = data?.masters.cards[String(cardId)];
  return isRecord(master)
    ? regionalText(master.prefix, server, `#${cardId}`)
    : `#${cardId}`;
}

function TeamSlots({
  result,
  data,
  server,
}: {
  result: BandoriTeamSearchResult;
  data: GameDataGeneration | null;
  server: number;
}) {
  const fallbackIds = result.cards.map((card) => card.cardId);
  const ids = result.teamLayoutCardIds?.length === 5
    ? result.teamLayoutCardIds
    : fallbackIds;

  return (
    <div className="team-slots" aria-label="最优初始队伍站位">
      {ids.map((cardId, index) => {
        const resultCard = result.cards.find((card) => card.cardId === cardId);
        const master = data?.masters.cards[String(cardId)];
        const characterMaster = resultCard
          ? data?.masters.characters[String(resultCard.characterId)]
          : null;
        const skill = result.skills.find((item) => item.cardId === cardId)?.resolvedSkill;
        return (
          <div
            className={`team-slot ${index === 2 ? "team-slot-leader" : ""}`}
            key={`${cardId}-${index}`}
          >
            <span className="slot-position">{index === 2 ? "LEADER" : `SLOT ${index + 1}`}</span>
            <BestdoriCardThumb
              cardId={cardId}
              server={server}
              trained={resultCard?.isTrained ?? false}
              cardMaster={isRecord(master) ? master : null}
              characterMaster={isRecord(characterMaster) ? characterMaster : null}
              attribute={resultCard?.attribute}
              masterRank={resultCard?.masterRank ?? 0}
              resolvedSkill={skill}
              leader={cardId === result.leaderCardId}
            />
          </div>
        );
      })}
    </div>
  );
}

function SkillOrder({
  result,
  data,
  server,
}: {
  result: BandoriTeamSearchResult;
  data: GameDataGeneration | null;
  server: number;
}) {
  if (result.skillOrderCardIds.length === 0) return null;
  return (
    <div className="result-detail-block">
      <span className="result-detail-title">理论最高分技能顺序</span>
      <div className="skill-order-list">
        {result.skillOrderCardIds.map((cardId, index) => {
          const actor = result.skillOrderActors?.[index];
          const isEncore = index === result.skillOrderCardIds.length - 1;
          const label = cardId > 0
            ? cardDisplayName(data, cardId, server)
            : actor?.startsWith("other")
              ? `其他玩家 ${actor.replace("other", "")}`
              : "外部技能";
          return (
            <div className="skill-order-step" key={`${index}-${cardId}-${actor ?? "self"}`}>
              <span className="skill-order-index">{isEncore ? "ENCORE" : index + 1}</span>
              <strong>{cardId > 0 ? `#${cardId}` : actor ?? "—"}</strong>
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AreaItemConfiguration({
  result,
  data,
  server,
  areaItemLevels,
}: {
  result: BandoriTeamSearchResult;
  data: GameDataGeneration | null;
  server: number;
  areaItemLevels: Map<number, number>;
}) {
  const ids = result.areaItemConfiguration.selectedAreaItemIds;
  return (
    <div className="result-detail-block">
      <span className="result-detail-title">区域道具配置</span>
      <div className="area-config-summary">
        <span>{result.areaItemConfiguration.bandKey ?? "混合团"}</span>
        <span>{result.areaItemConfiguration.attribute ?? "混合属性"}</span>
        <span>{result.areaItemConfiguration.parameter ?? "通用参数"}</span>
      </div>
      <div className="area-item-list">
        {ids.length === 0 && <span className="muted">无区域道具</span>}
        {ids.map((areaItemId) => {
          const master = data?.masters.areaItems[String(areaItemId)];
          const name = isRecord(master)
            ? regionalText(master.areaItemName, server, `Area Item #${areaItemId}`)
            : `Area Item #${areaItemId}`;
          const level = areaItemLevels.get(areaItemId);
          return (
            <span className="area-item-chip" key={areaItemId}>
              {name}{level ? ` · Lv.${level}` : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function SearchResultCard({
  result,
  data,
  server,
  areaItemLevels,
}: {
  result: BandoriTeamSearchResult;
  data: GameDataGeneration | null;
  server: number;
  areaItemLevels: Map<number, number>;
}) {
  const defaultPointOption = result.eventPointOptions.options.find(
    (option) => option.key === result.eventPointOptions.defaultKey,
  ) ?? result.eventPointOptions.options[0] ?? null;

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

      <TeamSlots result={result} data={data} server={server} />

      <div className="metric-grid">
        <div><span>综合力</span><strong>{formatNumber(result.totalPower)}</strong></div>
        <div><span>理论最高</span><strong>{formatNumber(result.maxScore)}</strong></div>
        <div><span>理论最低</span><strong>{formatNumber(result.minScore)}</strong></div>
        <div><span>最高分概率</span><strong>{formatProbability(result.maxScoreOrderCount, result.maxScoreOrderTotal)}</strong></div>
        {result.eventPoint !== null && <div><span>活动 Pt</span><strong>{formatNumber(result.eventPoint)}</strong></div>}
        {result.eventType !== "none" && <div><span>活动加成</span><strong>{formatPointBonusRate(result.pointBonusRate)}</strong></div>}
        {defaultPointOption && <div><span>Pt 场景</span><strong>{eventPointOptionLabel(defaultPointOption)}</strong></div>}
        <div><span>活动 / Live</span><strong>{EVENT_TYPE_LABELS[result.eventType]} · {liveTypeLabel(result.liveType, result.eventType)}</strong></div>
        <div><span>队长卡</span><strong>#{result.leaderCardId}</strong></div>
      </div>

      <div className="result-details-grid">
        <SkillOrder result={result} data={data} server={server} />
        <AreaItemConfiguration
          result={result}
          data={data}
          server={server}
          areaItemLevels={areaItemLevels}
        />
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
  const [liveType, setLiveType] = useState<BandoriTeamSearchLiveType>("free");
  const [target, setTarget] = useState<BandoriTeamSearchTarget>("score");
  const [perfectRatePercent, setPerfectRatePercent] = useState(100);
  const [resultLimit, setResultLimit] = useState(10);
  const [liveBoostCount, setLiveBoostCount] = useState<0 | 1 | 2 | 3>(3);
  const [challengeCpCost, setChallengeCpCost] = useState<200 | 400 | 800 | 1600>(1600);
  const [otherPlayersAveragePower, setOtherPlayersAveragePower] = useState(380_000);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [searchResponse, setSearchResponse] = useState<BandoriTeamSearchResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const server = profile?.profile.server ?? 3;
  const songs = useMemo(() => buildSongOptions(gameData, server), [gameData, server]);
  const events = useMemo(() => buildEventOptions(gameData, server), [gameData, server]);
  const areaItemLevels = useMemo(() => buildAreaItemLevelMap(profile), [profile]);
  const availableDifficulties = useMemo(
    () => getAvailableDifficulties(gameData, songId),
    [gameData, songId],
  );
  const selectedEventType = useMemo<BandoriTeamSearchEventType>(() => {
    if (!gameData || eventId === null) return "none";
    const rawEvent = gameData.masters.events[String(eventId)];
    return eventTypeFromBestdori(isRecord(rawEvent) ? rawEvent.eventType : null);
  }, [eventId, gameData]);
  const allowedLiveTypes = useMemo(
    () => allowedLiveTypesForEvent(selectedEventType),
    [selectedEventType],
  );

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
      setDifficulty(availableDifficulties.includes("expert") ? "expert" : availableDifficulties[0] ?? "expert");
    }
  }, [availableDifficulties, difficulty]);

  useEffect(() => {
    if (!allowedLiveTypes.includes(liveType)) {
      setLiveType(allowedLiveTypes[0] ?? "free");
    }
  }, [allowedLiveTypes, liveType]);

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
        liveType,
        eventFormula: 2,
        liveBoostCount,
        challengeCpCost,
        useSpecialRoomBonus: true,
        otherPlayersAveragePower: liveType === "multi" ? otherPlayersAveragePower : undefined,
        otherPlayerSkills: liveType === "multi" ? DEFAULT_OTHER_PLAYER_SKILLS : undefined,
        encoreSkillSource: liveType === "multi" ? "self" : undefined,
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
                <span>歌曲 · 可按名称或 ID 搜索</span>
                <SearchableSelect
                  value={songId}
                  options={songs}
                  onChange={setSongId}
                  placeholder="输入歌曲名称或 ID…"
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
                <span>活动 · 可按名称或 ID 搜索</span>
                <SearchableSelect
                  value={eventId}
                  options={events}
                  onChange={setEventId}
                  placeholder="输入活动名称或 ID…"
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
                  {allowedLiveTypes.map((item) => (
                    <option key={item} value={item}>{liveTypeLabel(item, selectedEventType)}</option>
                  ))}
                </select>
              </label>

              {selectedEventType !== "none" && selectedEventType !== "medley" && liveType !== "challenge" && (
                <label className="field">
                  <span>Live Boost</span>
                  <select value={liveBoostCount} onChange={(event) => setLiveBoostCount(Number(event.currentTarget.value) as 0 | 1 | 2 | 3)}>
                    {[0, 1, 2, 3].map((value) => <option key={value} value={value}>{value} 火</option>)}
                  </select>
                </label>
              )}

              {selectedEventType === "challenge" && liveType === "challenge" && (
                <label className="field">
                  <span>Challenge CP</span>
                  <select value={challengeCpCost} onChange={(event) => setChallengeCpCost(Number(event.currentTarget.value) as 200 | 400 | 800 | 1600)}>
                    {[200, 400, 800, 1600].map((value) => <option key={value} value={value}>{value} CP</option>)}
                  </select>
                </label>
              )}

              {liveType === "multi" && (
                <label className="field">
                  <span>其他玩家平均综合力</span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={otherPlayersAveragePower}
                    onChange={(event) => setOtherPlayersAveragePower(Math.max(0, Number(event.currentTarget.value)))}
                  />
                </label>
              )}

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

            {selectedEventType !== "none" && selectedEventType !== "medley" && (
              <p className="status-line">活动 Pt 使用 HHWX 当前 V3 公式；星光练习加成读取 Bestdori limitBreaks。特殊房参数加成已启用。</p>
            )}
            {liveType === "multi" && (
              <p className="status-line">多人房其他四名玩家的技能暂按 HHWX 当前默认组（69 Lv.5 / 69 Lv.1 / 66 Lv.5 / 66 Lv.1），Encore 来源为自己；下一步会把这组参数也做成可编辑控件。</p>
            )}
            {selectedEventType === "medley" && (
              <p className="status-line status-error">Medley 活动需要 HHWX 的三曲 Medley 搜索器；当前客户端只接入了单曲 exact-search，因此暂时禁止用单曲结果冒充 Medley 最优解。</p>
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
          {searchResponse?.results.map((result) => (
            <SearchResultCard
              key={`${result.rank}-${result.leaderCardId}-${result.targetValue}`}
              result={result}
              data={gameData}
              server={server}
              areaItemLevels={areaItemLevels}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
