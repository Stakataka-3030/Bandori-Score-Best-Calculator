import BestdoriCardThumb from "@/components/BestdoriCardThumb";
import { BANDORI_AREA_ITEM_IDS_BY_GROUP } from "@/lib/bandori-area-item-groups";
import type { BandoriSkillLabelMaster } from "@/lib/bandori-skill-label";
import type {
  BandoriTeamSearchEventType,
  BandoriTeamSearchLiveType,
  BandoriTeamSearchResult,
} from "@/lib/bandori/team-builder/core/types";
import type { ImportedProfile } from "@/lib/profile-import";
import type { GameDataGeneration } from "@/data";

type EventPointDisplaySelection = {
  liveBoostCount: 0 | 1 | 2 | 3;
  challengeCpCost: 200 | 400 | 800 | 1600;
  placement: 1 | 2 | 3 | 4 | 5;
  festivalResult: "win" | "lose";
};

type Props = {
  result: BandoriTeamSearchResult;
  data: GameDataGeneration | null;
  profile: ImportedProfile | null;
  server: number;
  eventPointSelection: EventPointDisplaySelection;
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
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function regionalText(value: unknown, server: number): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!Array.isArray(value)) return null;
  for (const index of [server, 0, 1, 2, 3]) {
    const candidate = value[index];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function liveTypeLabel(liveType: BandoriTeamSearchLiveType, eventType: BandoriTeamSearchEventType): string {
  if (eventType === "medley") return "组曲演出";
  if (liveType === "free") return "单人演出";
  if (liveType === "multi") return "协力演出";
  if (liveType === "challenge") return "挑战演出";
  return eventType === "festival" ? "团队演出" : "对战演出";
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

function chooseEventPoint(result: BandoriTeamSearchResult, selection: EventPointDisplaySelection) {
  const options = result.eventPointOptions.options;
  const selected = options.find((option) => {
    switch (result.eventPointOptions.mode) {
      case "liveBoost":
        return option.liveBoostCount === selection.liveBoostCount;
      case "challengeCp":
        return option.challengeCpCost === selection.challengeCpCost;
      case "versus":
        return option.liveBoostCount === selection.liveBoostCount
          && option.placement === selection.placement;
      case "festival":
        return option.liveBoostCount === selection.liveBoostCount
          && option.placement === selection.placement
          && option.festivalResult === selection.festivalResult;
      default:
        return false;
    }
  });
  return selected ?? options.find((option) => option.key === result.eventPointOptions.defaultKey) ?? options[0] ?? null;
}

function profileAreaItemLevelMap(profile: ImportedProfile | null): Map<number, number> {
  const result = new Map<number, number>();
  if (!profile) return result;
  for (const [groupKey, levels] of Object.entries(profile.profile.items)) {
    const ids = BANDORI_AREA_ITEM_IDS_BY_GROUP[groupKey] ?? [];
    levels.forEach((level, index) => {
      const id = ids[index];
      if (!id || level === null) return;
      result.set(id, Math.max(0, Math.trunc(level) + 1));
    });
  }
  return result;
}

function areaItemName(master: unknown, id: number, server: number): string {
  if (!isRecord(master)) return `道具 #${id}`;
  return regionalText(master.areaItemName ?? master.itemName ?? master.name, server) ?? `道具 #${id}`;
}

function CardTile({
  result,
  cardId,
  data,
  server,
  leader,
}: {
  result: BandoriTeamSearchResult;
  cardId: number;
  data: GameDataGeneration | null;
  server: number;
  leader?: boolean;
}) {
  const resultCard = result.cards.find((card) => card.cardId === cardId);
  if (!resultCard) return <div className="card-missing">#{cardId}</div>;
  const master = data?.masters.cards[String(cardId)];
  const character = data?.masters.characters[String(resultCard.characterId)];
  const skillMaster = data?.masters.skills[String(resultCard.skillId)];
  const resolvedSkill = result.skills.find((skill) => skill.cardId === cardId)?.resolvedSkill;
  return (
    <BestdoriCardThumb
      cardId={cardId}
      server={server}
      trained={resultCard.isTrained}
      cardMaster={isRecord(master) ? master : null}
      characterMaster={isRecord(character) ? character : null}
      skillMaster={isRecord(skillMaster) ? skillMaster as BandoriSkillLabelMaster : null}
      skillLevel={resultCard.skillLevel}
      attribute={resultCard.attribute}
      masterRank={resultCard.masterRank}
      resolvedSkill={resolvedSkill}
      leader={leader ?? cardId === result.leaderCardId}
    />
  );
}

export default function TeamSearchResultCard({
  result,
  data,
  profile,
  server,
  eventPointSelection,
}: Props) {
  const fallbackIds = result.cards.map((card) => card.cardId);
  const teamIds = result.teamLayoutCardIds?.length === 5 ? result.teamLayoutCardIds : fallbackIds;
  const selectedPt = chooseEventPoint(result, eventPointSelection);
  const displayedEventPoint = selectedPt?.eventPoint ?? result.eventPoint;
  const displayedTarget = result.target === "eventPoint"
    ? displayedEventPoint ?? result.targetValue
    : result.targetValue;
  const areaLevels = profileAreaItemLevelMap(profile);

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
          <strong>{formatNumber(displayedTarget)}</strong>
        </div>
      </div>

      <div className="team-slots" aria-label="最优初始队伍站位">
        {teamIds.map((cardId, index) => (
          <div
            className={`team-slot ${index === 2 ? "team-slot-leader" : ""}`}
            key={`${cardId}-${index}`}
          >
            <span className="slot-position">{index === 2 ? "队长" : `位置 ${index + 1}`}</span>
            <CardTile result={result} cardId={cardId} data={data} server={server} leader={index === 2} />
          </div>
        ))}
      </div>

      {result.skillOrderCardIds.length > 0 && (
        <div className="result-detail-block">
          <span className="detail-title">最佳技能顺序</span>
          <div className="skill-order-row">
            {result.skillOrderCardIds.map((cardId, index) => {
              const actor = result.skillOrderActors?.[index];
              const external = actor && actor !== "self";
              return (
                <div className="skill-order-step" key={`${index}-${cardId}-${actor ?? "self"}`}>
                  <span>{index === 5 ? "返场" : `技能 ${index + 1}`}</span>
                  {external || !cardId ? (
                    <div className="external-skill-chip">{actor?.toUpperCase() ?? "OTHER"}</div>
                  ) : (
                    <CardTile result={result} cardId={cardId} data={data} server={server} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="result-detail-block">
        <span className="detail-title">区域道具配置</span>
        <div className="area-config-summary">
          <span>乐队：{result.areaItemConfiguration.bandKey ?? "无"}</span>
          <span>属性：{result.areaItemConfiguration.attribute ? ATTRIBUTE_LABELS[result.areaItemConfiguration.attribute] : "无"}</span>
          <span>参数：{result.areaItemConfiguration.parameter ? (PARAMETER_LABELS[result.areaItemConfiguration.parameter] ?? result.areaItemConfiguration.parameter) : "无"}</span>
        </div>
        <div className="area-item-chips">
          {result.areaItemConfiguration.selectedAreaItemIds.length > 0 ? result.areaItemConfiguration.selectedAreaItemIds.map((id) => (
            <span className="area-item-chip" key={id}>
              {areaItemName(data?.masters.areaItems[String(id)], id, server)} · Lv.{areaLevels.get(id) ?? "?"}
            </span>
          )) : <span className="muted">未选择区域道具</span>}
        </div>
      </div>

      <div className="metric-grid">
        <div><span>综合力</span><strong>{formatNumber(result.totalPower)}</strong></div>
        <div><span>理论最高</span><strong>{formatNumber(result.maxScore)}</strong></div>
        <div><span>理论最低</span><strong>{formatNumber(result.minScore)}</strong></div>
        <div><span>最高分概率</span><strong>{formatProbability(result.maxScoreOrderCount, result.maxScoreOrderTotal)}</strong></div>
        {displayedEventPoint !== null && (
          <div title={`Pt 计算：期望分 ${formatNumber(result.averageScore)} · 活动加成 ${(result.pointBonusRate * 100).toFixed(0)}% · 倍率 ×${result.eventPointMultiplier}`}>
            <span>活动 Pt</span><strong>{formatNumber(displayedEventPoint)}</strong>
          </div>
        )}
        <div><span>活动 / Live</span><strong>{EVENT_TYPE_LABELS[result.eventType]} · {liveTypeLabel(result.liveType, result.eventType)}</strong></div>
        <div><span>队长卡</span><strong>#{result.leaderCardId}</strong></div>
      </div>
    </article>
  );
}
