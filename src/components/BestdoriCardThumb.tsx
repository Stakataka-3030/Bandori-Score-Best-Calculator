import { useMemo, useState } from "react";
import type { BandoriCardAttribute, ResolvedBandoriSkill } from "@/lib/bandori-team-calculator";
import "./card-thumb.css";

const SERVER_CODES = ["jp", "en", "tw", "cn"] as const;

const ATTRIBUTE_LABELS: Record<BandoriCardAttribute, string> = {
  powerful: "Powerful",
  cool: "Cool",
  happy: "Happy",
  pure: "Pure",
};

type BestdoriCardThumbProps = {
  cardId: number;
  server: number;
  trained: boolean;
  cardMaster: Record<string, unknown> | null;
  characterMaster?: Record<string, unknown> | null;
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
  server: number,
  resourceSetName: string,
  type: "normal" | "after_training",
): string {
  const serverCode = SERVER_CODES[server as 0 | 1 | 2 | 3] ?? "jp";
  // Bestdori groups card thumbnails into bundles of 50 card IDs. For example,
  // card 1234 lives under card00024_rip rather than card01234_rip.
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
  if (!skill) return ["技能数据不可用"];
  const lines = skill.scoreEffects
    .filter((effect) => effect.type !== "score_rate_up_with_perfect")
    .map((effect) => skillEffectLabel(effect.type, effect.valuePercent, effect.condition));
  if (skill.hasRateUpWithPerfect) lines.push("PERFECT 数量可继续提高得分倍率");
  if (lines.length === 0) lines.push("无直接得分加成");
  return [`持续 ${skill.durationSeconds}s`, ...lines];
}

export default function BestdoriCardThumb({
  cardId,
  server,
  trained,
  cardMaster,
  characterMaster = null,
  attribute,
  masterRank = 0,
  resolvedSkill,
  leader = false,
}: BestdoriCardThumbProps) {
  const resourceSetName = typeof cardMaster?.resourceSetName === "string"
    ? cardMaster.resourceSetName
    : null;
  const cardName = regionalText(cardMaster?.prefix, server) ?? `Card ${cardId}`;
  const characterName = regionalText(
    characterMaster?.characterName ?? characterMaster?.nickname ?? characterMaster?.firstName,
    server,
  ) ?? `Character ${String(cardMaster?.characterId ?? "?")}`;
  const [imageState, setImageState] = useState<"trained" | "normal" | "failed">(
    trained ? "trained" : "normal",
  );

  const src = useMemo(() => {
    if (!resourceSetName || imageState === "failed") return null;
    return buildThumbUrl(
      cardId,
      server,
      resourceSetName,
      imageState === "trained" ? "after_training" : "normal",
    );
  }, [cardId, imageState, resourceSetName, server]);
  const skillLines = useMemo(() => skillSummary(resolvedSkill), [resolvedSkill]);

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
          onError={() => {
            if (imageState === "trained") setImageState("normal");
            else setImageState("failed");
          }}
        />
      ) : (
        <div className="card-thumb-placeholder">#{cardId}</div>
      )}

      {attribute && (
        <span className={`card-attribute-badge card-attribute-badge-${attribute}`}>
          {ATTRIBUTE_LABELS[attribute]}
        </span>
      )}
      {masterRank > 0 && <span className="card-master-rank-badge">★{masterRank}</span>}
      {leader && <span className="card-leader-badge">L</span>}

      <div className="card-thumb-caption">
        <strong>#{cardId}</strong>
        <span>{cardName}</span>
      </div>

      <div className="card-hover-panel" role="tooltip">
        <strong>{cardName}</strong>
        <span>{characterName}</span>
        {attribute && <span>{ATTRIBUTE_LABELS[attribute]} · 星光练习 {masterRank}</span>}
        <div className="card-hover-skill">
          {skillLines.map((line) => <span key={line}>{line}</span>)}
        </div>
      </div>
    </div>
  );
}
