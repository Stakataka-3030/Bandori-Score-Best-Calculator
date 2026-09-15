import BestdoriCardThumb from "@/components/BestdoriCardThumb";
import type { GameDataGeneration } from "@/data";
import type {
  BandoriTeamSearchEventPointOption,
  BandoriTeamSearchEventType,
  BandoriTeamSearchLiveType,
  BandoriTeamSearchResult,
} from "@/lib/bandori/team-builder/core/types";

export type ResultEventSelections = {
  liveBoostCount: 0 | 1 | 2 | 3;
  challengeCpCost: 200 | 400 | 800 | 1600;
  placement: 1 | 2 | 3 | 4 | 5;
  festivalResult: "win" | "lose";
};

type Props = {
  result: BandoriTeamSearchResult;
  data: GameDataGeneration | null;
  server: number;
  areaItemLevels: Map<number, number>;
  eventSelections: ResultEventSelections;
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

const ATTRIBUTE_LABELS = {
  powerful: "Powerful",
  cool: "Cool",
  happy: "Happy",
  pure: "Pure",
} as const;

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function regionalText(value: unknown, preferredServer: number, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!Array.isArray(value)) return fallback;
  for (const index of [preferredServer, 0, 1, 2, 3]) {
    const candidate = value[index];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return fallback;
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

function liveTypeLabel(liveType: BandoriTeamSearchLiveType, eventType: BandoriTeamSearchEventType): string {
  if (eventType === "medley") return "Medley Live";
  if (liveType === "free") return "Free Live";
  if (liveType === "multi") return "Multi Live";
  if (liveType === "challenge") return "Challenge Live";
  return eventType === "festival" ? "Team Live" : "VS Live";
}

function cardDisplayName(data: GameDataGeneration | null, cardId: number, server: number): string {
  const master = data?.masters.cards[String(cardId)];
  return isRecord(master)
    ? regionalText(master.prefix, server, `#${cardId}`)
    : `#${cardId}`;
}

function selectEventPointOption(
  result: BandoriTeamSearchResult,
  selections: ResultEventSelections,
): BandoriTeamSearchEventPointOption | null {
  const matching = result.eventPointOptions.options.find((option) => {
    switch (result.eventPointOptions.mode) {
      case "challengeCp":
        return option.challengeCpCost === selections.challengeCpCost;
      case "versus":
        return option.liveBoostCount === selections.liveBoostCount
          && option.placement === selections.placement;
      case "festival":
        return option.liveBoostCount === selections.liveBoostCount
          && option.placement === selections.placement
          && option.festivalResult === selections.festivalResult;
      case "liveBoost":
        return option.liveBoostCount === selections.liveBoostCount;
      default:
        return false;
    }
  });
  if (matching) return matching;
  return result.eventPointOptions.options.find(
    (option) => option.key === result.eventPointOptions.defaultKey,
  ) ?? result.eventPointOptions.options[0] ?? null;
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

function TeamSlots({ result, data, server }: Pick<Props, "result" | "data" | "server">) {
  const fallbackIds = result.cards.map((card) => card.cardId);
  const ids = result.teamLayoutCardIds?.length === 5 ? result.teamLayoutCardIds : fallbackIds;
  return (
    <div className="team-slots" aria-label="最优初始队伍站位">
      {ids.map((cardId, index) => {
        const resultCard = result.cards.find((card) => card.cardId === cardId);
        const master = data?.masters.cards[String(cardId)];
        const characterMaster = resultCard ? data?.masters.characters[String(resultCard.characterId)] : null;
        const skill = result.skills.find((item) => item.cardId === cardId)?.resolvedSkill;
        return (
          <div className={`team-slot ${index === 2 ? "team-slot-leader" : ""}`} key={`${cardId}-${index}`}>
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

function SkillOrder({ result, data, server }: Pick<Props, "result" | "data" | "server">) {
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

function AreaItemConfiguration({ result, data, server, areaItemLevels }: Pick<Props, "result" | "data" | "server" | "areaItemLevels">) {
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
          return <span className="area-item-chip" key={areaItemId}>{name}{level ? ` · Lv.${level}` : ""}</span>;
        })}
      </div>
    </div>
  );
}

export default function SearchResultCard({ result, data, server, areaItemLevels, eventSelections }: Props) {
  const selectedPointOption = selectEventPointOption(result, eventSelections);
  const displayedEventPoint = selectedPointOption?.eventPoint ?? result.eventPoint;
  const headlineValue = result.target === "eventPoint" ? displayedEventPoint : result.targetValue;

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
          <strong>{formatNumber(headlineValue)}</strong>
        </div>
      </div>

      <TeamSlots result={result} data={data} server={server} />

      <div className="metric-grid">
        <div><span>综合力</span><strong>{formatNumber(result.totalPower)}</strong></div>
        <div><span>理论最高</span><strong>{formatNumber(result.maxScore)}</strong></div>
        <div><span>理论最低</span><strong>{formatNumber(result.minScore)}</strong></div>
        <div><span>最高分概率</span><strong>{formatProbability(result.maxScoreOrderCount, result.maxScoreOrderTotal)}</strong></div>
        {displayedEventPoint !== null && <div><span>活动 Pt</span><strong>{formatNumber(displayedEventPoint)}</strong></div>}
        {result.eventType !== "none" && <div><span>活动加成</span><strong>{formatPointBonusRate(result.pointBonusRate)}</strong></div>}
        {selectedPointOption && <div><span>Pt 场景</span><strong>{eventPointOptionLabel(selectedPointOption)}</strong></div>}
        <div><span>活动 / Live</span><strong>{EVENT_TYPE_LABELS[result.eventType]} · {liveTypeLabel(result.liveType, result.eventType)}</strong></div>
        <div><span>队长卡</span><strong>#{result.leaderCardId}</strong></div>
      </div>

      <div className="result-details-grid">
        <SkillOrder result={result} data={data} server={server} />
        <AreaItemConfiguration result={result} data={data} server={server} areaItemLevels={areaItemLevels} />
      </div>
    </article>
  );
}
