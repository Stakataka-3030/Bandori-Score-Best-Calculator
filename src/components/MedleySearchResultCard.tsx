import BestdoriCardThumb from "@/components/BestdoriCardThumb";
import { BANDORI_AREA_ITEM_IDS_BY_GROUP } from "@/lib/bandori-area-item-groups";
import type { BandoriSkillLabelMaster } from "@/lib/bandori-skill-label";
import type { MedleySearchInputV1 } from "@/lib/bandori/medley-foundation";
import {
  applyOwnedCardParameterPreferences,
  type TeamBuilderCardPreferences,
} from "@/lib/card-preferences";
import type { ImportedProfile } from "@/lib/profile-import";
import type { GameDataGeneration } from "@/data";
import type { HydratedMedleySearchSolution } from "@/search/run-medley-search";

type Props = {
  candidate: HydratedMedleySearchSolution;
  rank: number;
  input: MedleySearchInputV1;
  data: GameDataGeneration | null;
  profile: ImportedProfile | null;
  preferences: TeamBuilderCardPreferences;
  server: number;
  highlightMaximum?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function regionalText(value: unknown, server: number, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const index of [server, 0, 1, 2, 3]) {
      const candidate = value[index];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
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
  return regionalText(master.areaItemName ?? master.itemName ?? master.name, server, `道具 #${id}`);
}

function effectiveCardState(
  cardId: number,
  profile: ImportedProfile | null,
  data: GameDataGeneration | null,
  preferences: TeamBuilderCardPreferences,
) {
  const temporary = preferences.temporaryCards.find((card) => card.cardId === cardId);
  if (temporary) return temporary;
  const owned = profile?.profile.cards.find((card) => card.cardId === cardId);
  if (!owned) return null;
  return applyOwnedCardParameterPreferences(
    owned,
    data?.masters.cards[String(cardId)] as never,
    preferences.ownedCardParameters,
    profile?.profile.server ?? 3,
  );
}

function MedleyCardTile({
  instanceId,
  input,
  data,
  profile,
  preferences,
  server,
  leader = false,
}: {
  instanceId: number;
  input: MedleySearchInputV1;
  data: GameDataGeneration | null;
  profile: ImportedProfile | null;
  preferences: TeamBuilderCardPreferences;
  server: number;
  leader?: boolean;
}) {
  const inputCard = input.cards[instanceId];
  if (!inputCard || inputCard.instanceId !== instanceId) {
    return <div className="card-missing">instance #{instanceId}</div>;
  }
  const cardId = inputCard.masterCardId;
  const master = data?.masters.cards[String(cardId)];
  const character = data?.masters.characters[String(inputCard.characterId)];
  const skillId = inputCard.skillContexts.mixed.masterSkillId;
  const skillMaster = data?.masters.skills[String(skillId)];
  const state = effectiveCardState(cardId, profile, data, preferences);
  return (
    <BestdoriCardThumb
      cardId={cardId}
      server={server}
      trained={state?.isTrained ?? false}
      cardMaster={isRecord(master) ? master : null}
      characterMaster={isRecord(character) ? character : null}
      skillMaster={isRecord(skillMaster) ? skillMaster as BandoriSkillLabelMaster : null}
      skillLevel={inputCard.skillContexts.mixed.skillLevel}
      attribute={inputCard.attribute}
      masterRank={state?.masterRank ?? 0}
      leader={leader}
    />
  );
}

export default function MedleySearchResultCard({
  candidate,
  rank,
  input,
  data,
  profile,
  preferences,
  server,
  highlightMaximum = false,
}: Props) {
  const areaLevels = profileAreaItemLevelMap(profile);

  return (
    <article className={`search-result-card medley-result-card ${highlightMaximum ? "medley-maximum-card" : ""}`}>
      <div className="result-heading">
        <div>
          <span className="result-rank">#{rank}</span>
          <strong>{formatNumber(candidate.totalAverageScore)}</strong>
          <span className="result-unit">三曲期望总分</span>
        </div>
        <div className="result-target">
          <span>{highlightMaximum ? "最高上界候选" : "搜索目标"}</span>
          <strong>{formatNumber(candidate.totalMaximumScore)}</strong>
        </div>
      </div>

      <div className="metric-grid medley-total-metrics">
        <div><span>理论最低</span><strong>{formatNumber(candidate.totalMinimumScore)}</strong></div>
        <div><span>理论最高</span><strong>{formatNumber(candidate.totalMaximumScore)}</strong></div>
        <div><span>共享道具数</span><strong>{candidate.selectedAreaItemIds.length}</strong></div>
      </div>

      {candidate.teams.map((team, slot) => {
        const song = input.songs[slot];
        const songMaster = song ? data?.masters.songs[String(song.songId)] : null;
        const songName = song
          ? regionalText(isRecord(songMaster) ? songMaster.musicTitle ?? songMaster.title : null, server, `Song ${song.songId}`)
          : `Song ${slot + 1}`;
        return (
          <section className="medley-song-result" key={team.slot}>
            <div className="medley-song-heading">
              <div>
                <span className="section-kicker">SONG {slot + 1}</span>
                <strong>{songName}</strong>
                {song && <span>{song.difficulty.toUpperCase()} · Lv.{song.playLevel}</span>}
              </div>
              <div className="medley-song-score">
                <span>期望</span>
                <strong>{formatNumber(team.averageScore)}</strong>
              </div>
            </div>

            <div className="team-slots" aria-label={`Medley 第 ${slot + 1} 曲初始队伍站位`}>
              {team.memberInstanceIds.map((instanceId, index) => (
                <div
                  className={`team-slot ${index === 2 ? "team-slot-leader" : ""}`}
                  key={`${instanceId}-${index}`}
                >
                  <span className="slot-position">{index === 2 ? "LEADER" : `SLOT ${index + 1}`}</span>
                  <MedleyCardTile
                    instanceId={instanceId}
                    input={input}
                    data={data}
                    profile={profile}
                    preferences={preferences}
                    server={server}
                    leader={index === 2}
                  />
                </div>
              ))}
            </div>

            <div className="result-detail-block">
              <span className="detail-title">该曲最高分技能序列</span>
              <div className="skill-order-row">
                {team.bestSkillOrderMemberInstanceIds.map((instanceId, index) => (
                  <div className="skill-order-step" key={`${instanceId}-${index}`}>
                    <span>{index === 5 ? "ENCORE" : `SKILL ${index + 1}`}</span>
                    <MedleyCardTile
                      instanceId={instanceId}
                      input={input}
                      data={data}
                      profile={profile}
                      preferences={preferences}
                      server={server}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="metric-grid">
              <div><span>综合力</span><strong>{formatNumber(team.parameters.deckTotalParameter)}</strong></div>
              <div><span>最低</span><strong>{formatNumber(team.minimumScore)}</strong></div>
              <div><span>最高</span><strong>{formatNumber(team.maximumScore)}</strong></div>
              <div><span>最高分概率</span><strong>{formatProbability(team.maximumScoreOrderCount, team.scoreOrderCount)}</strong></div>
            </div>
          </section>
        );
      })}

      <div className="result-detail-block">
        <span className="detail-title">三队共享区域道具配置</span>
        <div className="area-item-chips">
          {candidate.selectedAreaItemIds.length > 0 ? candidate.selectedAreaItemIds.map((id) => (
            <span className="area-item-chip" key={id}>
              {areaItemName(data?.masters.areaItems[String(id)], id, server)} · Lv.{areaLevels.get(id) ?? "?"}
            </span>
          )) : <span className="muted">未选择区域道具</span>}
        </div>
      </div>
    </article>
  );
}
