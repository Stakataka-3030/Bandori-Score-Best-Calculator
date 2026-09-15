import { useEffect, useMemo, useState } from "react";
import type { BandoriCardAttribute, ResolvedBandoriSkill } from "@/lib/bandori-team-calculator";
import { normalizeBandoriServer, type BandoriServer } from "@/lib/bandori-server";
import { normalizeBandoriSkillLabel, type BandoriSkillLabelMaster } from "@/lib/bandori-skill-label";
import "./card-thumb.css";

const SERVER_CODES = ["jp", "en", "tw", "cn"] as const;

const ATTRIBUTE_LABELS: Record<BandoriCardAttribute, string> = {
  powerful: "红色",
  cool: "蓝色",
  happy: "橙色",
  pure: "绿色",
};

type BestdoriCardThumbProps = {
  cardId: number;
  server: number;
  trained: boolean;
  cardMaster: Record<string, unknown> | null;
  characterMaster?: Record<string, unknown> | null;
  skillMaster?: BandoriSkillLabelMaster | null;
  skillLevel?: number;
  attribute?: BandoriCardAttribute;
  masterRank?: number;
  resolvedSkill?: ResolvedBandoriSkill | null;
  leader?: boolean;
};

function regionalText(value: unknown, preferredServer: number): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!Array.isArray(value)) return null;
  for (const server of [preferredServer, 0, 1, 2, 3]) {
    const candidate = value[server];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function buildThumbUrl(
  cardId: number,
  serverCode: string,
  resourceSetName: string,
  type: "normal" | "after_training",
): string {
  const bundleIndex = Math.floor(Math.max(0, Math.trunc(cardId)) / 50)
    .toString()
    .padStart(5, "0");
  return `https://bestdori.com/assets/${serverCode}/thumb/chara/card${bundleIndex}_rip/${resourceSetName}_${type}.png`;
}

function skillEffectLabel(type: string, valuePercent: number, condition: string): string {
  const conditionSuffix = condition !== "none" ? ` · ${condition.toUpperCase()}` : "";
  switch (type) {
    case "score_continued_note_judge":
      return `判定维持：得分 +${valuePercent}%${conditionSuffix}`;
    case "score_under_great_half":
      return `判定条件：得分 +${valuePercent}%${conditionSuffix}`;
    case "score_only_perfect":
      return `PERFECT：得分 +${valuePercent}%`;
    case "score_over_life":
    case "score_under_life":
      return `生命条件：得分 +${valuePercent}%${conditionSuffix}`;
    default:
      return `得分 +${valuePercent}%${conditionSuffix}`;
  }
}

function skillSummary(skill: ResolvedBandoriSkill | null | undefined): string[] {
  if (!skill) return [];
  const lines = skill.scoreEffects
    .filter((effect) => effect.type !== "score_rate_up_with_perfect")
    .map((effect) => skillEffectLabel(effect.type, effect.valuePercent, effect.condition));
  if (skill.hasRateUpWithPerfect) lines.push("PERFECT 数量可继续提高得分倍率");
  return [`持续 ${skill.durationSeconds}s`, ...lines];
}

export default function BestdoriCardThumb({
  cardId,
  server,
  trained,
  cardMaster,
  characterMaster = null,
  skillMaster = null,
  skillLevel = 1,
  attribute,
  masterRank = 0,
  resolvedSkill,
  leader = false,
}: BestdoriCardThumbProps) {
  const resourceSetName = typeof cardMaster?.resourceSetName === "string"
    ? cardMaster.resourceSetName
    : null;
  const cardName = regionalText(cardMaster?.prefix, server) ?? `卡牌 ${cardId}`;
  const characterName = regionalText(
    characterMaster?.characterName ?? characterMaster?.nickname ?? characterMaster?.firstName,
    server,
  ) ?? `角色 ${String(cardMaster?.characterId ?? "?")}`;
  const rawRarity = Number(cardMaster?.rarity);
  const rarity = Number.isFinite(rawRarity) ? Math.max(1, Math.min(5, Math.trunc(rawRarity))) : 0;
  const cardMetaLine = [
    attribute ? ATTRIBUTE_LABELS[attribute] : null,
    rarity > 0 ? `${rarity}★` : null,
    `星光练习 ${masterRank}`,
    `技能等级 ${skillLevel}`,
  ].filter(Boolean).join(" · ");

  const imageCandidates = useMemo(() => {
    if (!resourceSetName) return [];
    const preferredServerCode = SERVER_CODES[server as 0 | 1 | 2 | 3] ?? "jp";
    const serverCodes = preferredServerCode === "jp" ? ["jp"] : ["jp", preferredServerCode];
    const imageTypes: Array<"normal" | "after_training"> = trained
      ? ["after_training", "normal"]
      : ["normal"];
    return Array.from(new Set(
      serverCodes.flatMap((serverCode) => imageTypes.map((type) => (
        buildThumbUrl(cardId, serverCode, resourceSetName, type)
      ))),
    ));
  }, [cardId, resourceSetName, server, trained]);
  const [imageCandidateIndex, setImageCandidateIndex] = useState(0);

  useEffect(() => {
    setImageCandidateIndex(0);
  }, [cardId, resourceSetName, server, trained]);

  const src = imageCandidates[imageCandidateIndex] ?? null;
  const computedSkillLines = useMemo(() => skillSummary(resolvedSkill), [resolvedSkill]);
  const localizedSkillLabel = useMemo(() => {
    const normalizedServer = normalizeBandoriServer(server) ?? 3;
    return normalizeBandoriSkillLabel(
      skillMaster ?? undefined,
      skillLevel,
      1,
      normalizedServer as BandoriServer,
      normalizedServer as BandoriServer,
      "",
    );
  }, [server, skillLevel, skillMaster]);

  return (
    <div
      className={`card-thumb ${leader ? "card-thumb-leader" : ""} ${attribute ? `card-attribute-${attribute}` : ""}`}
      title={`${cardName} · ${characterName}`}
    >
      {src ? (
        <img
          src={src}
          alt={cardName}
          loading="lazy"
          decoding="async"
          onError={() => setImageCandidateIndex((index) => index + 1)}
        />
      ) : (
        <div className="card-thumb-placeholder">#{cardId}</div>
      )}

      {attribute && (
        <span className={`card-attribute-badge card-attribute-badge-${attribute}`}>
          {ATTRIBUTE_LABELS[attribute]}
        </span>
      )}
      {rarity > 0 && <span className="card-rarity-badge">{rarity}★</span>}
      {masterRank > 0 && <span className="card-master-rank-badge">星光{masterRank}</span>}
      <span className="card-skill-level-badge">技能{Math.max(1, Math.trunc(skillLevel))}</span>
      {leader && <span className="card-leader-badge">队</span>}

      <div className="card-thumb-caption">
        <strong>#{cardId}</strong>
        <span>{cardName}</span>
      </div>

      <div className="card-hover-panel" role="tooltip">
        <strong>{cardName}</strong>
        <span>{characterName}</span>
        <span>{cardMetaLine}</span>
        <div className="card-hover-skill">
          {localizedSkillLabel && <strong>{localizedSkillLabel}</strong>}
          {computedSkillLines.length > 0
            ? computedSkillLines.map((line) => <span key={line}>{line}</span>)
            : !localizedSkillLabel && <span>技能数据不可用</span>}
        </div>
      </div>
    </div>
  );
}
