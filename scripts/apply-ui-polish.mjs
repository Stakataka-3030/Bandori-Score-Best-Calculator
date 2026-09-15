import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Patch anchor not found: ${label}`);
  }
  return source.replace(before, after);
}

function patchApp() {
  const path = "src/App.tsx";
  let source = read(path);

  source = replaceExact(source, `const EVENT_TYPE_LABELS: Record<BandoriTeamSearchEventType, string> = {
  none: "无活动",
  story: "通常活动 / Story",
  challenge: "Challenge Live",
  versus: "VS Live",
  live_try: "Live Goals / Live Try",
  mission_live: "Mission Live",
  festival: "Team Live Festival",
  medley: "Medley Live",
};`, `const EVENT_TYPE_LABELS: Record<BandoriTeamSearchEventType, string> = {
  none: "无活动",
  story: "普通活动",
  challenge: "挑战活动",
  versus: "对战活动",
  live_try: "演出目标活动",
  mission_live: "任务演出活动",
  festival: "团队演出祭典",
  medley: "组曲演出活动",
};`, "Chinese event type labels");

  source = replaceExact(source, `function liveTypeLabel(liveType: BandoriTeamSearchLiveType, eventType: BandoriTeamSearchEventType): string {
  if (eventType === "medley") return "Medley Live";
  if (liveType === "free") return "Free Live";
  if (liveType === "multi") return "Multi Live";
  if (liveType === "challenge") return "Challenge Live";
  return eventType === "festival" ? "Team Live" : "VS Live";
}`, `function liveTypeLabel(liveType: BandoriTeamSearchLiveType, eventType: BandoriTeamSearchEventType): string {
  if (eventType === "medley") return "组曲演出";
  if (liveType === "free") return "单人演出";
  if (liveType === "multi") return "协力演出";
  if (liveType === "challenge") return "挑战演出";
  return eventType === "festival" ? "团队演出" : "对战演出";
}`, "Chinese live type labels");

  source = source.replaceAll("maxDurationMs: 30_000", "maxDurationMs: 60_000");
  source = source.replaceAll("maxSearchDurationMs: 30_000", "maxSearchDurationMs: 60_000");
  source = source.replace("正在用原生 Rust 搜索三队 Medley 最优解…", "正在搜索三队 Medley 最优解…");
  source = source.replace("原生 Rust 搜索结果会显示在这里。", "三队 Medley 搜索结果会显示在这里。");

  source = replaceExact(source, `          <p className="header-copy">HHWX exact-search 基线 + 真实技能洗牌概率。档案只从本地导入，游戏 Master 与谱面由 Tauri 客户端直接同步 Bestdori。</p>
        </div>
        <div className="brand-mark">SB</div>`, `          <p className="header-copy">根据本地档案与最新游戏数据搜索最优队伍；游戏 Master 与谱面由客户端自动同步。</p>
        </div>`, "remove header badge and technical copy");

  source = replaceExact(source, `<div className="workspace-grid">`, `<div className={\`workspace-grid \${searchResponse ? "" : "workspace-grid-single"}\`}>`, "single-column workspace before stats");

  source = replaceExact(source, `            {selectedEventType === "medley" && (
              <p className="status-line">Medley 使用桌面端原生 Rust 三队搜索器：三首歌共享卡池与区域道具，并按真实 1024 RNG 路径优化每队初始五人站位。</p>
            )}

`, ``, "remove Medley implementation note");

  source = replaceExact(source, `          <CardPreferencesPanel
            data={gameData}
            server={server}`, `          <CardPreferencesPanel
            data={gameData}
            server={server}
            eventId={eventId}`, "pass selected event to card preferences");

  source = replaceExact(source, `        <aside className="side-panel">
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
        </aside>`, `        {searchResponse && (
          <aside className="side-panel">
            <div className="stats-panel">
              <span className="section-kicker">SEARCH STATS</span>
              <div><span>候选卡</span><strong>{searchResponse.stats.candidateCardCount}</strong></div>
              <div><span>枚举队伍</span><strong>{searchResponse.stats.enumeratedTeamCount.toLocaleString()}</strong></div>
              <div><span>精评队伍</span><strong>{searchResponse.stats.evaluatedTeamCount.toLocaleString()}</strong></div>
              <div><span>剪枝</span><strong>{searchResponse.stats.prunedBranchCount.toLocaleString()}</strong></div>
              <div><span>模式</span><strong>{searchResponse.stats.isExhaustive ? "Exact" : "Bounded"}</strong></div>
            </div>
          </aside>
        )}`, "remove model/event callouts");

  write(path, source);
}

function patchActivityControls() {
  const path = "src/components/ActivityControls.tsx";
  let source = read(path);
  source = replaceExact(source, `          <strong>活动 / Live 参数</strong>
          <p className="muted">这里使用 HHWX 同一套活动 Pt 和多人 Live 输入口径。</p>`, `          <strong>活动 / Live 参数</strong>`, "remove HHWX activity explanation");
  source = source.replace("<option value={2}>V3（HHWX 当前默认）</option>", "<option value={2}>V3（默认）</option>");
  source = source.replace("<span><strong>特殊房间参数加成</strong><small>与 HHWX 当前 Multi Live 输入一致。</small></span>", "<span><strong>特殊房间参数加成</strong><small>启用多人演出的特殊房间参数加成。</small></span>");
  write(path, source);
}

function patchCardThumb() {
  const path = "src/components/BestdoriCardThumb.tsx";
  let source = read(path);
  source = replaceExact(source, `  const characterName = regionalText(
    characterMaster?.characterName ?? characterMaster?.nickname ?? characterMaster?.firstName,
    server,
  ) ?? \`Character \${String(cardMaster?.characterId ?? "?")}\`;
  const [imageState, setImageState]`, `  const characterName = regionalText(
    characterMaster?.characterName ?? characterMaster?.nickname ?? characterMaster?.firstName,
    server,
  ) ?? \`Character \${String(cardMaster?.characterId ?? "?")}\`;
  const rawRarity = Number(cardMaster?.rarity);
  const rarity = Number.isFinite(rawRarity) ? Math.max(1, Math.min(5, Math.trunc(rawRarity))) : 0;
  const cardMetaLine = [
    attribute ? ATTRIBUTE_LABELS[attribute] : null,
    rarity > 0 ? \`\${rarity}★\` : null,
    \`星光练习 MR \${masterRank}\`,
    \`技能 Lv.\${skillLevel}\`,
  ].filter(Boolean).join(" · ");
  const [imageState, setImageState]`, "derive card rarity and metadata");

  source = replaceExact(source, `      {masterRank > 0 && <span className="card-master-rank-badge">★{masterRank}</span>}
      <span className="card-skill-level-badge">SLv.{Math.max(1, Math.trunc(skillLevel))}</span>`, `      {rarity > 0 && <span className="card-rarity-badge">{rarity}★</span>}
      {masterRank > 0 && <span className="card-master-rank-badge">MR {masterRank}</span>}
      <span className="card-skill-level-badge">SLv.{Math.max(1, Math.trunc(skillLevel))}</span>`, "rarity and master-rank badges");

  source = replaceExact(source, `        {attribute && <span>{ATTRIBUTE_LABELS[attribute]} · 星光练习 {masterRank} · 技能 Lv.{skillLevel}</span>}`, `        <span>{cardMetaLine}</span>`, "card hover metadata");
  write(path, source);
}

function patchCardThumbCss() {
  const path = "src/components/card-thumb.css";
  let source = read(path);
  source = replaceExact(source, `.card-attribute-badge,
.card-master-rank-badge,
.card-skill-level-badge,`, `.card-attribute-badge,
.card-rarity-badge,
.card-master-rank-badge,
.card-skill-level-badge,`, "include rarity badge in shared badge styles");

  source = replaceExact(source, `.card-master-rank-badge {
  top: 5px;
  right: 5px;
  padding: 4px 5px;
  border-radius: 6px;
  background: rgba(28, 30, 46, 0.84);
}`, `.card-rarity-badge {
  top: 5px;
  right: 5px;
  padding: 4px 6px;
  border-radius: 6px;
  color: #2e2500;
  background: rgba(255, 220, 74, 0.94);
  border-color: rgba(255, 246, 190, 0.95);
}

.card-master-rank-badge {
  top: 29px;
  right: 5px;
  padding: 4px 6px;
  border-radius: 999px;
  background: rgba(98, 103, 232, 0.93);
}`, "move and restyle master rank badge");
  write(path, source);
}

function patchCardPreferences() {
  const path = "src/components/CardPreferencesPanel.tsx";
  let source = read(path);
  source = replaceExact(source, `type Props = {
  data: GameDataGeneration | null;
  server: number;
  preferences: TeamBuilderCardPreferences;`, `type Props = {
  data: GameDataGeneration | null;
  server: number;
  eventId: number | null;
  preferences: TeamBuilderCardPreferences;`, "card preferences eventId prop");

  source = replaceExact(source, `function buildCardOptions(data: GameDataGeneration | null, server: number): SearchableSelectOption[] {`, `function currentEventCardIds(data: GameDataGeneration | null, eventId: number | null): number[] {
  if (!data || eventId === null) return [];
  const event = data.masters.events[String(eventId)];
  if (!isRecord(event) || !Array.isArray(event.members)) return [];
  const result = new Set<number>();
  for (const member of event.members) {
    if (!isRecord(member)) continue;
    const cardId = Number(member.situationId ?? member.id);
    if (Number.isSafeInteger(cardId) && cardId > 0) result.add(cardId);
  }
  return [...result];
}

function buildCardOptions(data: GameDataGeneration | null, server: number): SearchableSelectOption[] {`, "extract current-event card IDs");

  source = replaceExact(source, `export default function CardPreferencesPanel({ data, server, preferences, onChange }: Props) {`, `export default function CardPreferencesPanel({ data, server, eventId, preferences, onChange }: Props) {`, "receive eventId");

  source = replaceExact(source, `  const cardOptions = useMemo(() => buildCardOptions(data, server), [data, server]);
  const owned = preferences.ownedCardParameters;`, `  const cardOptions = useMemo(() => buildCardOptions(data, server), [data, server]);
  const eventCardIds = useMemo(() => currentEventCardIds(data, eventId), [data, eventId]);
  const owned = preferences.ownedCardParameters;`, "memoize current-event cards");

  source = replaceExact(source, `  function removeTemporary(instanceId: string) {`, `  function addCurrentEventTemporaryCards() {
    if (!data || eventId === null || eventCardIds.length === 0) {
      setNotice("当前活动没有可加入的活动卡。");
      return;
    }
    const existing = new Set(preferences.temporaryCards.map((card) => card.cardId));
    const additions = eventCardIds.flatMap((cardId) => {
      if (existing.has(cardId)) return [];
      const master = data.masters.cards[String(cardId)];
      const card = createTemporaryCard(cardId, isRecord(master) ? master : undefined, server);
      if (!card) return [];
      existing.add(cardId);
      return [card];
    });
    if (additions.length === 0) {
      setNotice("当期活动卡都已经在临时卡列表中。");
      return;
    }
    onChange({ ...preferences, temporaryCards: [...preferences.temporaryCards, ...additions] });
    setNotice(\`已一键加入 \${additions.length} 张当期活动临时卡。\`);
  }

  function removeTemporary(instanceId: string) {`, "add current-event temporary cards action");

  source = replaceExact(source, `          {preferences.temporaryCards.length > 0 && (
            <button type="button" className="ghost-button danger-button" onClick={() => onChange({ ...preferences, temporaryCards: [] })}>
              全部删除
            </button>
          )}`, `          <div className="temporary-card-actions">
            <button
              type="button"
              className="ghost-button"
              disabled={eventCardIds.length === 0}
              onClick={addCurrentEventTemporaryCards}
            >
              一键添加当期临时卡
            </button>
            <button
              type="button"
              className="ghost-button danger-button"
              disabled={preferences.temporaryCards.length === 0}
              onClick={() => {
                onChange({ ...preferences, temporaryCards: [] });
                setNotice("已移除所有临时卡。");
              }}
            >
              移除所有临时卡
            </button>
          </div>`, "bulk temporary card controls");

  write(path, source);
}

function patchStyles() {
  const path = "src/styles.css";
  let source = read(path);
  source = replaceExact(source, `.workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 18px;
  align-items: start;
}`, `.workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 18px;
  align-items: start;
}
.workspace-grid-single { grid-template-columns: minmax(0, 1fr); }
.temporary-card-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }`, "workspace and temporary-card action styles");
  write(path, source);
}

function patchMedleyRunner() {
  const path = "src/search/run-medley-search.ts";
  let source = read(path);
  source = replaceExact(source, `Math.trunc(options.maxDurationMs ?? 30_000)`, `Math.trunc(options.maxDurationMs ?? 60_000)`, "Medley fallback timeout");
  write(path, source);
}

patchApp();
patchActivityControls();
patchCardThumb();
patchCardThumbCss();
patchCardPreferences();
patchStyles();
patchMedleyRunner();
console.log("Applied requested UI polish, Chinese labels, 60s timeout, rarity/MR badges, and event temporary-card actions.");
