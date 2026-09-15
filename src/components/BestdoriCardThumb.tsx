import { useMemo, useState } from "react";

const SERVER_CODES = ["jp", "en", "tw", "cn"] as const;

type BestdoriCardThumbProps = {
  cardId: number;
  server: number;
  trained: boolean;
  cardMaster: Record<string, unknown> | null;
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
  return `https://bestdori.com/assets/${serverCode}/thumb/chara/card${String(cardId).padStart(5, "0")}_rip/${resourceSetName}_${type}.png`;
}

export default function BestdoriCardThumb({
  cardId,
  server,
  trained,
  cardMaster,
  leader = false,
}: BestdoriCardThumbProps) {
  const resourceSetName = typeof cardMaster?.resourceSetName === "string"
    ? cardMaster.resourceSetName
    : null;
  const cardName = regionalText(cardMaster?.prefix, server) ?? `Card ${cardId}`;
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

  return (
    <div className={`card-thumb ${leader ? "card-thumb-leader" : ""}`} title={`${cardName} (#${cardId})`}>
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
      <div className="card-thumb-caption">
        <strong>#{cardId}</strong>
        <span>{cardName}</span>
      </div>
      {leader && <span className="card-leader-badge">L</span>}
    </div>
  );
}
