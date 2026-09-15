import { useMemo } from "react";
import SearchableSelect, { type SearchableSelectOption } from "@/components/SearchableSelect";
import { normalizeBandoriServer, type BandoriServer } from "@/lib/bandori-server";
import { normalizeBandoriSkillLabel, type BandoriSkillLabelMaster } from "@/lib/bandori-skill-label";
import type {
  BandoriTeamSearchEventType,
  BandoriTeamSearchExternalSkill,
  BandoriTeamSearchLiveType,
} from "@/lib/bandori/team-builder/core/types";
import type { GameDataGeneration } from "@/data";

export type ExternalSkillDraft = {
  skillId: number | null;
  skillLevel: number;
};

export type EventControlState = {
  eventFormula: 0 | 1 | 2;
  liveBoostCount: 0 | 1 | 2 | 3;
  challengeCpCost: 200 | 400 | 800 | 1600;
  otherPlayersAveragePower: number;
  externalSkills: ExternalSkillDraft[];
  encoreSkillSource: "self" | "other1" | "other2" | "other3" | "other4";
  useSpecialRoomBonus: boolean;
  resultPlacement: 1 | 2 | 3 | 4 | 5;
  resultFestivalResult: "win" | "lose";
};

type Props = {
  data: GameDataGeneration | null;
  server: number;
  eventType: BandoriTeamSearchEventType;
  liveType: BandoriTeamSearchLiveType;
  state: EventControlState;
  onChange: (next: EventControlState) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildSkillOptions(data: GameDataGeneration | null, server: number): SearchableSelectOption[] {
  if (!data) return [];
  const normalizedServer = (normalizeBandoriServer(server) ?? 3) as BandoriServer;
  return Object.entries(data.masters.skills)
    .flatMap(([key, raw]) => {
      const id = Number(key);
      if (!Number.isSafeInteger(id) || id <= 0 || !isRecord(raw)) return [];
      const label = normalizeBandoriSkillLabel(
        raw as BandoriSkillLabelMaster,
        5,
        1,
        normalizedServer,
        normalizedServer,
        `Skill #${id}`,
      );
      return [{ id, label: `${label} · #${id}` }];
    })
    .sort((left, right) => left.id - right.id);
}

export function materializeExternalSkills(drafts: readonly ExternalSkillDraft[]): BandoriTeamSearchExternalSkill[] {
  const lastSpecified = drafts.reduce((last, draft, index) => (
    draft.skillId && draft.skillId > 0 ? index : last
  ), -1);
  if (lastSpecified < 0) return [];
  // Keep positional meaning when a middle slot is intentionally empty. Skill ID 0 resolves
  // to a neutral/null skill in the HHWX core, so OTHER 3 never shifts into OTHER 2.
  return drafts.slice(0, lastSpecified + 1).map((draft) => ({
    skillId: draft.skillId && draft.skillId > 0 ? draft.skillId : 0,
    skillLevel: Math.min(5, Math.max(1, Math.trunc(draft.skillLevel))),
  }));
}

export const DEFAULT_EVENT_CONTROL_STATE: EventControlState = {
  // These match the current HHWX Team Builder defaults.
  eventFormula: 2,
  liveBoostCount: 3,
  challengeCpCost: 1600,
  otherPlayersAveragePower: 380_000,
  externalSkills: [
    { skillId: 69, skillLevel: 5 },
    { skillId: 69, skillLevel: 1 },
    { skillId: 66, skillLevel: 5 },
    { skillId: 66, skillLevel: 1 },
  ],
  encoreSkillSource: "self",
  useSpecialRoomBonus: true,
  resultPlacement: 1,
  resultFestivalResult: "win",
};

export default function ActivityControls({ data, server, eventType, liveType, state, onChange }: Props) {
  const skillOptions = useMemo(() => buildSkillOptions(data, server), [data, server]);
  const isChallengeLive = eventType === "challenge" && liveType === "challenge";
  const usesLiveBoost = eventType !== "none" && !isChallengeLive;
  const isMulti = liveType === "multi";
  const usesPlacement = eventType === "versus" || eventType === "festival";

  function patch(patchValue: Partial<EventControlState>) {
    onChange({ ...state, ...patchValue });
  }

  function patchExternalSkill(index: number, patchValue: Partial<ExternalSkillDraft>) {
    patch({
      externalSkills: state.externalSkills.map((skill, skillIndex) => (
        skillIndex === index ? { ...skill, ...patchValue } : skill
      )),
    });
  }

  if (eventType === "none" && !isMulti) return null;

  return (
    <div className="advanced-live-panel">
      <div className="advanced-live-heading">
        <div>
          <strong>活动 / Live 参数</strong>
          <p className="muted">这里使用 HHWX 同一套活动 Pt 和多人 Live 输入口径。</p>
        </div>
        {eventType !== "none" && <span className="formula-chip">公式 V{state.eventFormula + 1}</span>}
      </div>

      <div className="form-grid compact-form-grid">
        {eventType !== "none" && (
          <label className="field">
            <span>活动 Pt 公式</span>
            <select value={state.eventFormula} onChange={(event) => patch({ eventFormula: Number(event.currentTarget.value) as 0 | 1 | 2 })}>
              <option value={0}>V1</option>
              <option value={1}>V2</option>
              <option value={2}>V3（HHWX 当前默认）</option>
            </select>
          </label>
        )}

        {usesLiveBoost && (
          <label className="field">
            <span>Live Boost / 火罐</span>
            <select value={state.liveBoostCount} onChange={(event) => patch({ liveBoostCount: Number(event.currentTarget.value) as 0 | 1 | 2 | 3 })}>
              <option value={0}>0（×1）</option>
              <option value={1}>1（×5）</option>
              <option value={2}>2（×10）</option>
              <option value={3}>3（×15）</option>
            </select>
          </label>
        )}

        {isChallengeLive && (
          <label className="field">
            <span>Challenge CP</span>
            <select value={state.challengeCpCost} onChange={(event) => patch({ challengeCpCost: Number(event.currentTarget.value) as 200 | 400 | 800 | 1600 })}>
              <option value={200}>200 CP（×1）</option>
              <option value={400}>400 CP（×2）</option>
              <option value={800}>800 CP（×4）</option>
              <option value={1600}>1600 CP（×8）</option>
            </select>
          </label>
        )}

        {usesPlacement && (
          <label className="field">
            <span>结果名次</span>
            <select value={state.resultPlacement} onChange={(event) => patch({ resultPlacement: Number(event.currentTarget.value) as 1 | 2 | 3 | 4 | 5 })}>
              {[1, 2, 3, 4, 5].map((placement) => <option key={placement} value={placement}>第 {placement} 名</option>)}
            </select>
          </label>
        )}

        {eventType === "festival" && (
          <label className="field">
            <span>Team Live 结果</span>
            <select value={state.resultFestivalResult} onChange={(event) => patch({ resultFestivalResult: event.currentTarget.value as "win" | "lose" })}>
              <option value="win">胜利</option>
              <option value="lose">失败</option>
            </select>
          </label>
        )}
      </div>

      {isMulti && (
        <div className="multi-live-controls">
          <div className="form-grid compact-form-grid">
            <label className="field">
              <span>其他玩家平均综合力</span>
              <input
                type="number"
                min="0"
                step="1000"
                value={state.otherPlayersAveragePower}
                onChange={(event) => patch({ otherPlayersAveragePower: Math.max(0, Number(event.currentTarget.value)) })}
              />
            </label>
            <label className="toggle-row inline-toggle-row">
              <input
                type="checkbox"
                checked={state.useSpecialRoomBonus}
                onChange={(event) => patch({ useSpecialRoomBonus: event.currentTarget.checked })}
              />
              <span><strong>特殊房间参数加成</strong><small>与 HHWX 当前 Multi Live 输入一致。</small></span>
            </label>
          </div>

          <div className="external-skill-grid">
            {state.externalSkills.map((skill, index) => (
              <div className="external-skill-editor" key={index}>
                <span>OTHER {index + 1}</span>
                <SearchableSelect
                  value={skill.skillId}
                  options={skillOptions}
                  onChange={(skillId) => patchExternalSkill(index, { skillId })}
                  placeholder="搜索技能描述或 ID…"
                  emptyLabel="不指定技能"
                  disabled={!data}
                />
                <select
                  value={skill.skillLevel}
                  onChange={(event) => patchExternalSkill(index, { skillLevel: Number(event.currentTarget.value) })}
                >
                  {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>Lv.{level}</option>)}
                </select>
              </div>
            ))}
          </div>

          <label className="field encore-source-field">
            <span>第 6 次 Encore 技能来源</span>
            <select value={state.encoreSkillSource} onChange={(event) => patch({ encoreSkillSource: event.currentTarget.value as EventControlState["encoreSkillSource"] })}>
              <option value="self">自己队长</option>
              <option value="other1">OTHER 1</option>
              <option value="other2">OTHER 2</option>
              <option value="other3">OTHER 3</option>
              <option value="other4">OTHER 4</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
