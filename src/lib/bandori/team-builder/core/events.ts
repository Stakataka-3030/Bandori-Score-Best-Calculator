/*
 * Event, live-type, and target-value helpers shared by team search modes.
 *
 * Search code keeps score as the primary physical calculation, then uses this module to map
 * that score into event points, room score, fever behavior, and final target comparisons.
 */
import { resolveBandoriSkill, type BandoriCardAttribute, type BandoriTeamContext, type BestdoriSkillMaster, type ResolvedBandoriSkill } from "@/lib/bandori-team-calculator";
import { SCORE_FLOOR_EPSILON } from "./constants";
import { clamp, toFiniteNumber } from "./utils";
import type { BandoriTeamSearchEventMode, BandoriTeamSearchEventPointOptions, BandoriTeamSearchEventType, BandoriTeamSearchInput, BandoriTeamSearchLiveType, BandoriTeamSearchTarget, ScoreCalculationCache, SearchCard } from "./types";
export function normalizeSearchTarget(value: BandoriTeamSearchTarget | undefined): BandoriTeamSearchTarget { return value === "eventPoint" ? value : "score"; }
export function normalizeSearchLiveType(value: BandoriTeamSearchLiveType | undefined): BandoriTeamSearchLiveType { return value === "multi" || value === "challenge" || value === "versus" ? value : "free"; }
export function normalizeSearchEventType(value: BandoriTeamSearchEventType | undefined): BandoriTeamSearchEventType {
  return value === "story" || value === "challenge" || value === "versus" || value === "live_try" || value === "mission_live" || value === "festival" || value === "medley" ? value : "none";
}
export function resolveBandoriTeamSearchEventMode(eventTypeValue: BandoriTeamSearchEventType | undefined, liveTypeValue: BandoriTeamSearchLiveType | undefined): BandoriTeamSearchEventMode {
  const eventType = normalizeSearchEventType(eventTypeValue); const liveType = normalizeSearchLiveType(liveTypeValue);
  if (eventType === "none") return "none";
  if (eventType === "challenge") return liveType === "challenge" ? "parameterPower" : "pointBonus";
  if (eventType === "versus" || eventType === "festival" || eventType === "medley") return "parameterPower";
  return "pointBonus";
}
export function resolveBandoriTeamSearchUseFever(input: Pick<BandoriTeamSearchInput, "eventType" | "liveType" | "useFever">): boolean {
  if (input.eventType === undefined && input.liveType === undefined) return input.useFever === true;
  const eventType = normalizeSearchEventType(input.eventType); const liveType = normalizeSearchLiveType(input.liveType);
  return eventType === "festival" || (liveType === "multi" && eventType !== "versus");
}
export function getSearchCardsTeamContext(cards: SearchCard[]): BandoriTeamContext {
  let sameBandId: number | null | undefined; let sameAttribute: BandoriCardAttribute | null | undefined;
  for (const card of cards) { if (card.bandId === null) { sameBandId = null; break; } if (sameBandId === undefined) sameBandId = card.bandId; else if (sameBandId !== card.bandId) { sameBandId = null; break; } }
  for (const card of cards) { if (sameAttribute === undefined) sameAttribute = card.attribute; else if (sameAttribute !== card.attribute) { sameAttribute = null; break; } }
  return { sameBandId: sameBandId ?? null, sameAttribute: sameAttribute ?? null };
}
function getTeamContextCacheKey(context: BandoriTeamContext): string { return `${context.sameBandId ?? "mixed"}:${context.sameAttribute ?? "mixed"}`; }
export function resolveCachedBandoriSkill(skillId: number, skill: BestdoriSkillMaster | undefined, skillLevel: number, context: BandoriTeamContext, server: number, cache?: ScoreCalculationCache): ResolvedBandoriSkill | null {
  if (!skill) return null; const key = [server, skillId, skillLevel, getTeamContextCacheKey(context)].join(":");
  if (cache?.resolvedSkills?.has(key)) return cache.resolvedSkills.get(key) ?? null;
  const resolved = resolveBandoriSkill(skillId, skill, skillLevel, context, server); cache?.resolvedSkills?.set(key, resolved); return resolved;
}
export function resolveEncoreSkill(input: BandoriTeamSearchInput, context: BandoriTeamContext, server: number, cache?: ScoreCalculationCache): ResolvedBandoriSkill | undefined {
  if (normalizeSearchLiveType(input.liveType) !== "multi" || !input.encoreSkillSource || input.encoreSkillSource === "self") return undefined;
  const externalIndex = Number(input.encoreSkillSource.replace("other", "")) - 1; const externalSkill = input.otherPlayerSkills?.[externalIndex]; if (!externalSkill) return undefined;
  return resolveCachedBandoriSkill(externalSkill.skillId, input.skillsById[String(externalSkill.skillId)], externalSkill.skillLevel, context, server, cache) ?? undefined;
}
export function resolveOtherPlayerSkills(input: BandoriTeamSearchInput, context: BandoriTeamContext, server: number, cache?: ScoreCalculationCache): Array<ResolvedBandoriSkill | null> {
  if (normalizeSearchLiveType(input.liveType) !== "multi") return [];
  return (input.otherPlayerSkills ?? []).slice(0, 4).map((externalSkill) => resolveCachedBandoriSkill(externalSkill.skillId, input.skillsById[String(externalSkill.skillId)], externalSkill.skillLevel, context, server, cache));
}
export function calculateRoomScore(score: number, totalPower: number, input: BandoriTeamSearchInput, roomScoreRatePerPower?: number): number | null {
  if (normalizeSearchLiveType(input.liveType) !== "multi") return null; const otherPlayersPower = getOtherPlayersPower(input);
  if (otherPlayersPower <= 0 || totalPower <= 0) return Math.floor(score + SCORE_FLOOR_EPSILON);
  if (roomScoreRatePerPower !== undefined && Number.isFinite(roomScoreRatePerPower)) return Math.floor(score + roomScoreRatePerPower * otherPlayersPower + SCORE_FLOOR_EPSILON);
  return Math.floor(score + (score / totalPower) * otherPlayersPower + SCORE_FLOOR_EPSILON);
}
function getOtherPlayersPower(input: BandoriTeamSearchInput): number {
  if (normalizeSearchLiveType(input.liveType) !== "multi") return 0;
  const average = Math.max(0, Math.trunc(toFiniteNumber(input.otherPlayersAveragePower, 0))); if (average > 0) return average * 4;
  const alias = Math.max(0, Math.trunc(toFiniteNumber(input.roomPower, 0))); return alias > 0 ? alias * 4 : 0;
}
export function estimateTotalRoomScoreUpperBound(scoreUpperBound: number, input: BandoriTeamSearchInput, scoreRateUpper?: number): number | null {
  if (normalizeSearchLiveType(input.liveType) !== "multi") return null;
  if (!Number.isFinite(scoreUpperBound) || !Number.isFinite(scoreRateUpper ?? Number.NaN)) return Number.POSITIVE_INFINITY;
  return Math.ceil(scoreUpperBound + Math.max(0, scoreRateUpper ?? 0) * getOtherPlayersPower(input));
}
function calculateWithSoftCap(value: number, divisor: number, caps: readonly number[]): number { let remaining = Math.max(0, value); let scaled = 0; for (let index=0; index<caps.length; index+=1) { const cap=caps[index]; if (remaining<=cap) { scaled += Math.floor((remaining/divisor/(index+1))*100); break; } remaining -= cap; scaled += Math.floor((cap/divisor/(index+1))*100); } return Math.floor(scaled/100); }
const LIVE_BOOST_COUNTS=[0,1,2,3] as const; const CHALLENGE_CP_COSTS=[200,400,800,1600] as const; const EVENT_PLACEMENTS=[1,2,3,4,5] as const;
function normalizeLiveBoostCount(value:number|undefined):0|1|2|3 { return clamp(Math.trunc(toFiniteNumber(value,3)),0,3) as 0|1|2|3; }
function getLiveBoostMultiplier(value:number|undefined):number { return [1,5,10,15][normalizeLiveBoostCount(value)] ?? 15; }
function normalizeChallengeCpCost(value:number|undefined):200|400|800|1600 { switch(Math.trunc(toFiniteNumber(value,1600))){case 200:return 200;case 400:return 400;case 800:return 800;default:return 1600;} }
function getChallengeCpMultiplier(value:number|undefined):number { return {200:1,400:2,800:4,1600:8}[normalizeChallengeCpCost(value)]; }
export function getEventPointMultiplier(input:BandoriTeamSearchInput):number { return isChallengeLiveEventPointInput(input)?getChallengeCpMultiplier(input.challengeCpCost):getLiveBoostMultiplier(input.liveBoostCount); }
export function isChallengeLiveEventPointInput(input:Pick<BandoriTeamSearchInput,"eventType"|"liveType">):boolean { return normalizeSearchEventType(input.eventType)==="challenge" && normalizeSearchLiveType(input.liveType)==="challenge"; }
export function calculateChallengeLiveEventPointBase(score:number,input:BandoriTeamSearchInput):number { return input.eventFormula===2?3250+Math.floor(score/450):1000+calculateWithSoftCap(score,300,[2_100_000,150_000,250_000,Number.POSITIVE_INFINITY]); }
export function calculateChallengeLiveEventPoint(score:number,input:BandoriTeamSearchInput):number { return calculateChallengeLiveEventPointBase(score,input)*getChallengeCpMultiplier(input.challengeCpCost); }
function calculateVersusLiveEventPointBase(score:number,eventFormula:number,placement:1|2|3|4|5):number { const i=placement-1; return eventFormula===2?Math.floor(score/6500)+([200,173,146,123,100][i]??100):calculateWithSoftCap(score,5500,[2_100_000,150_000,250_000,Number.POSITIVE_INFINITY])+([60,52,44,37,30][i]??30); }
function calculateFestivalEventPointBase(score:number,eventFormula:number,result:"win"|"lose",placement:1|2|3|4|5):number { const i=placement-1; if(eventFormula===2)return Math.floor(score/6500)+50+(result==="win"?125:0)+([125,117,110,105,100][i]??100); return calculateWithSoftCap(score,5500,[2_625_000,187_500,312_500,Number.POSITIVE_INFINITY])+20+(result==="win"?50:0)+([50,47,44,42,40][i]??40); }
function getEventPointBaseConfig(input:BandoriTeamSearchInput):{base:number;divisor:number}|null { const eventType=normalizeSearchEventType(input.eventType); const formula=input.eventFormula??0; switch(eventType){case"story":return{base:50,divisor:10_000};case"challenge":return formula===2?{base:70,divisor:50_000}:{base:20,divisor:25_000};case"live_try":return formula===2?{base:130,divisor:26_000}:{base:40,divisor:13_000};case"mission_live":return formula===2?{base:120,divisor:15_000}:{base:40,divisor:10_000};default:return null;} }
export function calculateEventPointBase(score:number,roomScore:number|null,input:BandoriTeamSearchInput):number|null { const eventType=normalizeSearchEventType(input.eventType); if(eventType==="none")return null; const config=getEventPointBaseConfig(input); const total=roomScore??score; const own=Math.min(1_500_000,score); const room=Math.min(7_500_000,total); const other=Math.max(0,room-own); const formula=input.eventFormula??0; if(eventType==="versus"||!config)return null; if(formula===1)return config.base+calculateWithSoftCap(score,config.divisor,[1_600_000,150_000,250_000,400_000,Number.POSITIVE_INFINITY])+calculateWithSoftCap(Math.max(0,total-score),config.divisor*10,[6_400_000,600_000,1_000_000,1_600_000,Number.POSITIVE_INFINITY]); if(formula===2)return config.base+Math.floor(score/config.divisor)+Math.floor(Math.max(0,total-score)/config.divisor/10); return config.base+Math.floor(own/config.divisor)+Math.floor(other/config.divisor/10); }
export function calculateEventPointBeforeMultiplier(score:number,roomScore:number|null,pointBonusRate:number,input:BandoriTeamSearchInput,supportBandPower=0):number|null { const base=calculateEventPointBase(score,roomScore,input); return base===null?null:Math.floor(base*(1+pointBonusRate))+Math.floor(Math.max(0,supportBandPower)/3000); }
export function calculateEventPoint(score:number,roomScore:number|null,pointBonusRate:number,input:BandoriTeamSearchInput,supportBandPower=0):number|null { const before=calculateEventPointBeforeMultiplier(score,roomScore,pointBonusRate,input,supportBandPower); return before===null?null:Math.floor(before*getEventPointMultiplier(input)); }
export function createEventPointOptions(score:number,eventPointBase:number|null,input:BandoriTeamSearchInput):BandoriTeamSearchEventPointOptions {
  const eventType=normalizeSearchEventType(input.eventType), formula=input.eventFormula??0;
  if(isChallengeLiveEventPointInput(input)){const base=calculateChallengeLiveEventPointBase(score,input),def=normalizeChallengeCpCost(input.challengeCpCost);return{mode:"challengeCp",defaultKey:`cp-${def}`,options:CHALLENGE_CP_COSTS.map(challengeCpCost=>{const multiplier=getChallengeCpMultiplier(challengeCpCost);return{key:`cp-${challengeCpCost}`,challengeCpCost,eventPointBase:base,multiplier,eventPoint:base*multiplier};})};}
  if(eventType==="versus"){const def=normalizeLiveBoostCount(input.liveBoostCount);return{mode:"versus",defaultKey:`liveBoost-${def}-rank-1`,options:LIVE_BOOST_COUNTS.flatMap(liveBoostCount=>EVENT_PLACEMENTS.map(placement=>{const base=calculateVersusLiveEventPointBase(score,formula,placement),multiplier=getLiveBoostMultiplier(liveBoostCount);return{key:`liveBoost-${liveBoostCount}-rank-${placement}`,liveBoostCount,placement,eventPointBase:base,multiplier,eventPoint:base*multiplier};}))};}
  if(eventType==="festival"){const def=normalizeLiveBoostCount(input.liveBoostCount);return{mode:"festival",defaultKey:`liveBoost-${def}-win-rank-1`,options:LIVE_BOOST_COUNTS.flatMap(liveBoostCount=>(["win","lose"] as const).flatMap(festivalResult=>EVENT_PLACEMENTS.map(placement=>{const base=calculateFestivalEventPointBase(score,formula,festivalResult,placement),multiplier=getLiveBoostMultiplier(liveBoostCount);return{key:`liveBoost-${liveBoostCount}-${festivalResult}-rank-${placement}`,liveBoostCount,festivalResult,placement,eventPointBase:base,multiplier,eventPoint:base*multiplier};})))};}
  if(eventPointBase!==null){const def=normalizeLiveBoostCount(input.liveBoostCount);return{mode:"liveBoost",defaultKey:`liveBoost-${def}`,options:LIVE_BOOST_COUNTS.map(liveBoostCount=>{const multiplier=getLiveBoostMultiplier(liveBoostCount);return{key:`liveBoost-${liveBoostCount}`,liveBoostCount,eventPointBase,multiplier,eventPoint:Math.floor(eventPointBase*multiplier)};})};}
  return{mode:"none",defaultKey:null,options:[]};
}
export function getTargetValue(result:{totalPower:number;averageScore:number;eventPoint:number|null;eventMode:BandoriTeamSearchEventMode},target:BandoriTeamSearchTarget):number { return target==="eventPoint"?(result.eventPoint??(result.eventMode==="pointBonus"?Number.NEGATIVE_INFINITY:result.averageScore)):result.averageScore; }
export function estimateTargetUpperBoundFromScore(scoreUpperBound:number,pointBonusRateUpper:number,input:BandoriTeamSearchInput,target:BandoriTeamSearchTarget,eventMode:BandoriTeamSearchEventMode,supportBandPointUpperBound=0,scoreRateUpper?:number):number { if(!Number.isFinite(scoreUpperBound))return scoreUpperBound; if(target==="eventPoint"&&isChallengeLiveEventPointInput(input))return calculateChallengeLiveEventPointBase(Math.ceil(scoreUpperBound),input); if(target!=="eventPoint"||eventMode!=="pointBonus")return scoreUpperBound; const base=calculateEventPointBase(Math.ceil(scoreUpperBound),estimateTotalRoomScoreUpperBound(Math.ceil(scoreUpperBound),input,scoreRateUpper),input); return base===null?scoreUpperBound:Math.floor(base*(1+Math.max(0,pointBonusRateUpper)))+supportBandPointUpperBound; }
