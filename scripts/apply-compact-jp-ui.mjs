import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const write = (p, s) => fs.writeFileSync(p, s);
function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Patch anchor missing: ${label}`);
  return source.replace(before, after);
}

function patchCardThumb() {
  const path = "src/components/BestdoriCardThumb.tsx";
  let s = read(path);
  s = s.replace('const SERVER_CODES = ["jp", "en", "tw", "cn"] as const;\n\n', '');
  s = replaceExact(s,
`const ATTRIBUTE_LABELS: Record<BandoriCardAttribute, string> = {
  powerful: "Powerful",
  cool: "Cool",
  happy: "Happy",
  pure: "Pure",
};`,
`const ATTRIBUTE_LABELS: Record<BandoriCardAttribute, string> = {
  powerful: "红色",
  cool: "蓝色",
  happy: "橙色",
  pure: "绿色",
};`, "attribute labels");
  s = replaceExact(s,
`  const serverCode = SERVER_CODES[server as 0 | 1 | 2 | 3] ?? "jp";
  const bundleIndex`,
`  // Card artwork always comes from JP assets so unreleased cards/events on other servers still render.
  const serverCode = "jp";
  const bundleIndex`, "force JP artwork");
  s = s.replace('    `星光练习 MR ${masterRank}`,', '    `星光练习 ${masterRank}`,');
  s = s.replace('{masterRank > 0 && <span className="card-master-rank-badge">MR {masterRank}</span>}', '{masterRank > 0 && <span className="card-master-rank-badge">星光 {masterRank}</span>}');
  write(path, s);
}

function patchCardPreferences() {
  const path = "src/components/CardPreferencesPanel.tsx";
  let s = read(path);
  s = s.replace('把持有卡提升到该卡可用的最高等级、Episode 数并完成特训。', '把持有卡提升到该卡可用的最高等级、剧情数并完成特训。');
  s = s.replace('仅对指定稀有度阈值内的卡设为 Master Rank 4。', '仅对指定稀有度阈值内的卡设为星光练习 4。');
  s = s.replace('仅对指定稀有度阈值内的卡设为技能 Lv.5。', '仅对指定稀有度阈值内的卡设为技能等级 5。');
  write(path, s);
}

function patchTeamResult() {
  const path = "src/components/TeamSearchResultCard.tsx";
  let s = read(path);
  s = replaceExact(s,
`const EVENT_TYPE_LABELS: Record<BandoriTeamSearchEventType, string> = {
  none: "无活动",
  story: "通常活动",
  challenge: "Challenge Live",
  versus: "VS Live",
  live_try: "Live Goals",
  mission_live: "Mission Live",
  festival: "Team Live Festival",
  medley: "Medley Live",
};

const ATTRIBUTE_LABELS = {
  powerful: "Powerful",
  cool: "Cool",
  happy: "Happy",
  pure: "Pure",
} as const;`,
`const EVENT_TYPE_LABELS: Record<BandoriTeamSearchEventType, string> = {
  none: "无活动",
  story: "普通活动",
  challenge: "挑战活动",
  versus: "对战活动",
  live_try: "演出目标活动",
  mission_live: "任务演出活动",
  festival: "团队演出祭典",
  medley: "组曲演出活动",
};

const ATTRIBUTE_LABELS = {
  powerful: "红色",
  cool: "蓝色",
  happy: "橙色",
  pure: "绿色",
} as const;

const PARAMETER_LABELS: Record<string, string> = {
  performance: "演出",
  technique: "技巧",
  visual: "形象",
};`, "team result labels");
  s = replaceExact(s,
`  if (eventType === "medley") return "Medley Live";
  if (liveType === "free") return "Free Live";
  if (liveType === "multi") return "Multi Live";
  if (liveType === "challenge") return "Challenge Live";
  return eventType === "festival" ? "Team Live" : "VS Live";`,
`  if (eventType === "medley") return "组曲演出";
  if (liveType === "free") return "单人演出";
  if (liveType === "multi") return "协力演出";
  if (liveType === "challenge") return "挑战演出";
  return eventType === "festival" ? "团队演出" : "对战演出";`, "live labels");
  s = s.replace('{index === 2 ? "LEADER" : `SLOT ${index + 1}`}', '{index === 2 ? "队长" : `位置 ${index + 1}`}');
  s = s.replace('{index === 5 ? "ENCORE" : `SKILL ${index + 1}`}', '{index === 5 ? "返场" : `技能 ${index + 1}`}');
  s = s.replace('参数：{result.areaItemConfiguration.parameter ?? "无"}', '参数：{result.areaItemConfiguration.parameter ? (PARAMETER_LABELS[result.areaItemConfiguration.parameter] ?? result.areaItemConfiguration.parameter) : "无"}');
  s = replaceExact(s,
`        {displayedEventPoint !== null && <div><span>活动 Pt</span><strong>{formatNumber(displayedEventPoint)}</strong></div>}`,
`        {displayedEventPoint !== null && (
          <div title={\`Pt 计算：期望分 ${formatNumber(result.averageScore)} · 活动加成 ${(result.pointBonusRate * 100).toFixed(0)}% · 倍率 ×${result.eventPointMultiplier}\`}>
            <span>活动 Pt</span><strong>{formatNumber(displayedEventPoint)}</strong>
          </div>
        )}`, "pt diagnostic tooltip");
  write(path, s);
}

function patchMedleyResult() {
  const path = "src/components/MedleySearchResultCard.tsx";
  let s = read(path);
  s = s.replace('`Song ${song.songId}`', '`歌曲 ${song.songId}`');
  s = s.replace('`Song ${slot + 1}`', '`歌曲 ${slot + 1}`');
  s = s.replace('>SONG {slot + 1}<', '>第 {slot + 1} 曲<');
  s = s.replace('{index === 2 ? "LEADER" : `SLOT ${index + 1}`}', '{index === 2 ? "队长" : `位置 ${index + 1}`}');
  s = s.replace('{index === 5 ? "ENCORE" : `SKILL ${index + 1}`}', '{index === 5 ? "返场" : `技能 ${index + 1}`}');
  write(path, s);
}

function patchActivityControls() {
  const path = "src/components/ActivityControls.tsx";
  let s = read(path);
  s = s.replace('<span>Live Boost / 火罐</span>', '<span>火罐</span>');
  s = s.replace('<span>Challenge CP</span>', '<span>挑战点数（CP）</span>');
  s = s.replace('<span>Team Live 结果</span>', '<span>团队演出结果</span>');
  s = s.replace('<span>第 6 次 Encore 技能来源</span>', '<span>第 6 次返场技能来源</span>');
  s = s.replaceAll('OTHER {index + 1}', '其他玩家 {index + 1}');
  s = s.replace('<option value="other1">OTHER 1</option>', '<option value="other1">其他玩家 1</option>');
  s = s.replace('<option value="other2">OTHER 2</option>', '<option value="other2">其他玩家 2</option>');
  s = s.replace('<option value="other3">OTHER 3</option>', '<option value="other3">其他玩家 3</option>');
  s = s.replace('<option value="other4">OTHER 4</option>', '<option value="other4">其他玩家 4</option>');
  write(path, s);
}

function patchApp() {
  const path = "src/App.tsx";
  let s = read(path);
  s = s.replace('<span className="section-kicker">DATA</span>', '<span className="section-kicker">数据</span>');
  s = s.replace('<span className="section-kicker">PROFILE</span>', '<span className="section-kicker">档案</span>');
  s = s.replace('<span className="section-kicker">SEARCH</span>', '<span className="section-kicker">搜索</span>');
  s = s.replace('<span className="section-kicker">SEARCH STATS</span>', '<span className="section-kicker">搜索统计</span>');
  s = s.replace('<span className="section-kicker">RESULTS</span>', '<span className="section-kicker">结果</span>');
  s = s.replace('Server {profile.profile.server}', '服务器 {profile.profile.server}');
  s = s.replace('Cards {gameData.manifest.datasets.cards.recordCount}', '卡牌 {gameData.manifest.datasets.cards.recordCount}');
  s = s.replace('Events {gameData.manifest.datasets.events.recordCount}', '活动 {gameData.manifest.datasets.events.recordCount}');
  s = s.replace('{searchResponse.stats.isExhaustive ? "Exact" : "Bounded"}', '{searchResponse.stats.isExhaustive ? "已穷尽" : "限时结果"}');
  s = s.replace('{medleyResponse.hydration.candidates.length} candidates', '{medleyResponse.hydration.candidates.length} 个候选');
  s = s.replace('{searchResponse.results.length} results', '{searchResponse.results.length} 个结果');
  write(path, s);
}

function patchStyles() {
  const path = "src/styles.css";
  let s = read(path);
  s = replaceExact(s,
`.team-slots {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin: 15px 0;
}
.team-slot {
  position: relative;
  display: grid;
  min-height: 84px;
  align-content: center;
  justify-items: center;
  gap: 5px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: #fafaff;
}`,
`.team-slots {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 7px;
  margin: 12px 0;
}
.team-slot {
  position: relative;
  display: grid;
  width: 90px;
  min-height: 0;
  align-content: start;
  justify-items: center;
  gap: 4px;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: #fafaff;
}
.team-slot .card-thumb { width: 76px; }
.team-slot .card-thumb-caption { display: none; }`, "compact team slots");
  s = s.replace('  .team-slots { gap: 5px; }\n  .team-slot { min-height: 72px; border-radius: 10px; }', '  .team-slots { gap: 5px; }\n  .team-slot { width: 82px; border-radius: 10px; }\n  .team-slot .card-thumb { width: 68px; }');
  write(path, s);
}

function patchParityCss() {
  const path = "src/parity-controls.css";
  let s = read(path);
  s = replaceExact(s,
`.skill-order-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 7px;
}

.skill-order-row .skill-order-step {
  display: grid;
  min-width: 0;
  max-width: none;
  gap: 5px;
  padding: 6px;`,
`.skill-order-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 6px;
}

.skill-order-row .skill-order-step {
  display: grid;
  width: 68px;
  min-width: 68px;
  max-width: 68px;
  gap: 4px;
  padding: 5px;`, "compact skill order");
  s = s.replace(`.external-skill-chip,
.card-missing {
  display: grid;
  min-height: 62px;`, `.skill-order-row .card-thumb { width: 56px; margin-inline: auto; }
.skill-order-row .card-thumb-caption,
.skill-order-row .card-attribute-badge,
.skill-order-row .card-rarity-badge,
.skill-order-row .card-master-rank-badge,
.skill-order-row .card-skill-level-badge,
.skill-order-row .card-leader-badge { display: none; }

.external-skill-chip,
.card-missing {
  display: grid;
  min-height: 56px;`);
  s = s.replace('  .skill-order-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }\n', '');
  s = s.replace('  .skill-order-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n', '');
  s += `\n.temporary-card-actions { display: flex; flex-wrap: wrap; gap: 7px; justify-content: flex-end; }\n`;
  write(path, s);
}

patchCardThumb();
patchCardPreferences();
patchTeamResult();
patchMedleyResult();
patchActivityControls();
patchApp();
patchStyles();
patchParityCss();

// Trigger the tested apply workflow after it exists on main.
