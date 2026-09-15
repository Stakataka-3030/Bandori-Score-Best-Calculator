import { useMemo, useState } from "react";
import BestdoriCardThumb from "@/components/BestdoriCardThumb";
import SearchableSelect, { type SearchableSelectOption } from "@/components/SearchableSelect";
import type { BandoriCardAttribute } from "@/lib/bandori-team-calculator";
import type { BandoriSkillLabelMaster } from "@/lib/bandori-skill-label";
import {
  CARD_PARAMETER_RARITY_THRESHOLD_OPTIONS,
  createTemporaryCard,
  normalizeRarityThreshold,
  type TeamBuilderCardPreferences,
} from "@/lib/card-preferences";
import type { GameDataGeneration } from "@/data";

type Props = {
  data: GameDataGeneration | null;
  server: number;
  eventId: number | null;
  preferences: TeamBuilderCardPreferences;
  onChange: (next: TeamBuilderCardPreferences) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function regionalText(value: unknown, preferredServer: number): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!Array.isArray(value)) return null;
  for (const server of [preferredServer, 0, 1, 2, 3]) {
    const candidate = value[server];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function normalizeAttribute(value: unknown): BandoriCardAttribute | undefined {
  return value === "powerful" || value === "cool" || value === "happy" || value === "pure"
    ? value
    : undefined;
}

function currentEventCardIds(data: GameDataGeneration | null, eventId: number | null): number[] {
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

function buildCardOptions(data: GameDataGeneration | null, server: number): SearchableSelectOption[] {
  if (!data) return [];
  return Object.entries(data.masters.cards)
    .flatMap(([key, raw]) => {
      const id = Number(key);
      if (!Number.isSafeInteger(id) || id <= 0 || !isRecord(raw)) return [];
      const characterId = Number(raw.characterId);
      const character = Number.isFinite(characterId) ? data.masters.characters[String(characterId)] : null;
      const cardName = regionalText(raw.prefix, server) ?? `Card ${id}`;
      const characterName = isRecord(character)
        ? regionalText(character.characterName ?? character.nickname ?? character.firstName, server)
        : null;
      return [{
        id,
        label: `${characterName ? `${characterName} · ` : ""}${cardName} · #${id}`,
      }];
    })
    .sort((left, right) => right.id - left.id);
}

export default function CardPreferencesPanel({ data, server, eventId, preferences, onChange }: Props) {
  const [candidateCardId, setCandidateCardId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const cardOptions = useMemo(() => buildCardOptions(data, server), [data, server]);
  const eventCardIds = useMemo(() => currentEventCardIds(data, eventId), [data, eventId]);
  const owned = preferences.ownedCardParameters;

  function patchOwned(patch: Partial<TeamBuilderCardPreferences["ownedCardParameters"]>) {
    onChange({
      ...preferences,
      ownedCardParameters: { ...owned, ...patch },
    });
  }

  function addTemporary() {
    if (!data || candidateCardId === null) return;
    if (preferences.temporaryCards.some((card) => card.cardId === candidateCardId)) {
      setNotice("这张卡已经作为临时卡加入。HHWX 语义下同一 master 卡只保留一个临时实例。");
      return;
    }
    const master = data.masters.cards[String(candidateCardId)];
    const card = createTemporaryCard(
      candidateCardId,
      isRecord(master) ? master : undefined,
      server,
    );
    if (!card) {
      setNotice("无法从当前 Master 数据建立临时卡。");
      return;
    }
    onChange({ ...preferences, temporaryCards: [...preferences.temporaryCards, card] });
    setCandidateCardId(null);
    setNotice("已按 HHWX 规则以最高可选参数加入临时卡；若档案中已有同 ID 卡，搜索时临时卡会替代它。");
  }

  function addCurrentEventTemporaryCards() {
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
    setNotice(`已一键加入 ${additions.length} 张当期活动临时卡。`);
  }

  function removeTemporary(instanceId: string) {
    onChange({
      ...preferences,
      temporaryCards: preferences.temporaryCards.filter((card) => card.instanceId !== instanceId),
    });
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">CARDS</span>
          <h2>卡牌参数与临时卡</h2>
        </div>
      </div>

      <div className="preference-block">
        <strong>持有卡标准化</strong>
        <p className="muted">与 HHWX 的三个选项保持同一语义，只在本次搜索输入上覆盖，不修改导入档案。</p>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={owned.maxLevelEpisodeTraining}
            onChange={(event) => patchOwned({ maxLevelEpisodeTraining: event.currentTarget.checked })}
          />
          <span><strong>等级 / 剧情 / 特训最大化</strong><small>把持有卡提升到该卡可用的最高等级、剧情数并完成特训。</small></span>
        </label>

        <label className="toggle-row toggle-row-with-select">
          <input
            type="checkbox"
            checked={owned.maxMasterRank}
            onChange={(event) => patchOwned({ maxMasterRank: event.currentTarget.checked })}
          />
          <span><strong>星光练习最大化</strong><small>仅对指定稀有度阈值内的卡设为星光练习 4。</small></span>
          <select
            value={owned.maxMasterRankRarityThreshold}
            disabled={!owned.maxMasterRank}
            onChange={(event) => patchOwned({
              maxMasterRankRarityThreshold: normalizeRarityThreshold(event.currentTarget.value, 4),
            })}
          >
            {CARD_PARAMETER_RARITY_THRESHOLD_OPTIONS.map((rarity) => (
              <option key={rarity} value={rarity}>{rarity}★及以下</option>
            ))}
          </select>
        </label>

        <label className="toggle-row toggle-row-with-select">
          <input
            type="checkbox"
            checked={owned.maxSkillLevel}
            onChange={(event) => patchOwned({ maxSkillLevel: event.currentTarget.checked })}
          />
          <span><strong>技能等级最大化</strong><small>仅对指定稀有度阈值内的卡设为技能等级 5。</small></span>
          <select
            value={owned.maxSkillLevelRarityThreshold}
            disabled={!owned.maxSkillLevel}
            onChange={(event) => patchOwned({
              maxSkillLevelRarityThreshold: normalizeRarityThreshold(event.currentTarget.value, 3),
            })}
          >
            {CARD_PARAMETER_RARITY_THRESHOLD_OPTIONS.map((rarity) => (
              <option key={rarity} value={rarity}>{rarity}★及以下</option>
            ))}
          </select>
        </label>
      </div>

      <div className="preference-block">
        <div className="preference-heading-row">
          <div>
            <strong>临时卡</strong>
            <p className="muted">用于“假如我有这张卡”的最优队伍搜索；新增卡默认按最高可选参数创建。</p>
          </div>
          <div className="temporary-card-actions">
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
          </div>
        </div>

        <div className="temporary-card-add-row">
          <SearchableSelect
            value={candidateCardId}
            options={cardOptions}
            onChange={setCandidateCardId}
            placeholder="搜索卡名、角色或卡 ID…"
            disabled={!data}
          />
          <button type="button" className="primary-button" disabled={candidateCardId === null} onClick={addTemporary}>
            添加临时卡
          </button>
        </div>
        {notice && <p className="status-line">{notice}</p>}

        {preferences.temporaryCards.length > 0 ? (
          <div className="temporary-card-grid">
            {preferences.temporaryCards.map((card) => {
              const master = data?.masters.cards[String(card.cardId)];
              const characterId = isRecord(master) ? Number(master.characterId) : 0;
              const character = data?.masters.characters[String(characterId)];
              const skillId = isRecord(master) ? Number(master.skillId) : 0;
              const skill = data?.masters.skills[String(skillId)];
              return (
                <div className="temporary-card-item" key={card.instanceId}>
                  <BestdoriCardThumb
                    cardId={card.cardId}
                    server={server}
                    trained={card.isTrained}
                    cardMaster={isRecord(master) ? master : null}
                    characterMaster={isRecord(character) ? character : null}
                    skillMaster={isRecord(skill) ? skill as BandoriSkillLabelMaster : null}
                    skillLevel={card.skillLevel}
                    attribute={isRecord(master) ? normalizeAttribute(master.attribute) : undefined}
                    masterRank={card.masterRank}
                  />
                  <button type="button" className="remove-card-button" onClick={() => removeTemporary(card.instanceId)}>
                    删除
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted empty-inline">没有临时卡。</p>
        )}
      </div>
    </section>
  );
}
