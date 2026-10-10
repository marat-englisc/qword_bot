import type { loadMeaningDetails } from "../../db/repositories/catalogRepository";
import type { UserTopicProfile } from "../../db/recommendationTypes";
import type { RecommendationScoreComponents } from "../../db/schemas/user/wordRecommendation";
import { clamp, sigmoid } from "../common";

export type MeaningDetails = Awaited<ReturnType<typeof loadMeaningDetails>>[number];
export type RankingContext = {
  vocabularyAbility: number; assessmentWeight: number; prior: number; dailyNewMeaningLimit: number;
  topicProfiles: UserTopicProfile[]; weaknesses: Map<number, number>; dueWeights: Map<number, number>;
  frequencySource?: string;
};
export type ScoredMeaning = { meaning: MeaningDetails; predictedKnownProbability: number;
  effectiveAbility: number; score: number; scoreComponents: RecommendationScoreComponents; primaryTopicId: number | null };
export function scoreCandidates(candidates: MeaningDetails[], context: RankingContext): ScoredMeaning[] {
  const profiles = new Map(context.topicProfiles.map(row => [row.topicId, row]));
  const sources = new Set(candidates.filter(row => row.word.frequencyRank !== null).map(row => row.word.frequencySource).filter((source): source is string => source !== null));
  const corpus = context.frequencySource ?? (sources.size === 1 ? [...sources][0] : undefined);
  return candidates.map(meaning => {
    let ability = context.vocabularyAbility, interest = meaning.topics.length ? 0 : .5, weakTopic = 0, overloadPenalty = 0;
    for (const topic of meaning.topics) {
      const profile = profiles.get(topic.id);
      ability += topic.weight * ((profile?.assessmentWeight ?? 0) >= 5 ? profile!.vocabularyAbilityOffset : 0);
      interest += topic.weight * ((profile?.interestWeight ?? 0) + 1) / 2;
      weakTopic += topic.weight * (context.weaknesses.get(topic.id) ?? 0);
      overloadPenalty += topic.weight * clamp((context.dueWeights.get(topic.id) ?? 0) / Math.max(1, context.dailyNewMeaningLimit));
    }
    const p = sigmoid(ability - meaning.effectiveDifficulty);
    const components = { levelFit: Math.exp(-((p - .35) ** 2) / (2 * .25 ** 2)),
      frequency: meaning.word.frequencyRank && corpus && meaning.word.frequencySource === corpus ?
        clamp(1 - Math.log(meaning.word.frequencyRank) / Math.log(100000)) : .5,
      interest, weakTopic, overloadPenalty };
    const score = .45 * components.levelFit + .25 * components.frequency + .2 * interest + .1 * weakTopic - .3 * overloadPenalty;
    const primary = [...meaning.topics].sort((a, b) => b.relevance - a.relevance || a.id - b.id)[0]?.id ?? null;
    return { meaning, predictedKnownProbability: p, effectiveAbility: ability, score, scoreComponents: components, primaryTopicId: primary };
  });
}

export function safeLearningRange(scored: ScoredMeaning[], context: Pick<RankingContext, "assessmentWeight" | "prior">) {
  const ceiling = scored.filter(row => context.assessmentWeight >= 10 || row.meaning.effectiveDifficulty <= context.prior);
  const safe = ceiling.filter(row => Math.abs(row.meaning.effectiveDifficulty - row.effectiveAbility) <= 1);
  if (safe.length) return safe;
  const easier = ceiling.filter(row => row.meaning.effectiveDifficulty < row.effectiveAbility - 1);
  const fallback = easier.length ? easier : ceiling.filter(row => row.meaning.cefrLevel === "A1" && row.meaning.effectiveDifficulty > row.effectiveAbility + 1);
  if (!fallback.length) return [];
  const distance = (row: ScoredMeaning) => Math.abs(row.meaning.effectiveDifficulty - row.effectiveAbility);
  const closest = Math.min(...fallback.map(distance));
  return fallback.filter(row => distance(row) <= closest + 1e-9);
}

export function chooseRecommendations(pool: ScoredMeaning[], requested: number, epsilon: number, random: () => number) {
  if (!Number.isFinite(epsilon) || epsilon < 0 || epsilon > 1) throw new RangeError("Invalid exploration rate");
  const draw = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError("Random source must return [0,1)");
    return value;
  };
  const target = Math.min(requested, new Set(pool.map(row => row.meaning.wordId)).size);
  const quota = target >= 5 ? Math.max(1, Math.ceil(.4 * target)) : Infinity;
  const selected: { candidate: ScoredMeaning; reason: "exploration" | "weak_topic" | "interest" | "level_match"; selectionProbability: number }[] = [];
  const words = new Set<number>(), topicCounts = new Map<number, number>();
  for (let i = 0; i < target; i++) {
    const remaining = pool.filter(row => !words.has(row.meaning.wordId));
    let allowed = remaining.filter(row => row.primaryTopicId === null || (topicCounts.get(row.primaryTopicId) ?? 0) < quota);
    if (!allowed.length) allowed = remaining; // Relax only the diversity quota.
    allowed.sort((a, b) => b.score - a.score || a.meaning.id - b.meaning.id);
    const explore = epsilon > 0 && draw() < epsilon;
    const candidate = explore ? allowed[Math.floor(draw() * allowed.length)] : allowed[0];
    const probability = epsilon / allowed.length + (candidate === allowed[0] ? 1 - epsilon : 0);
    const c = candidate.scoreComponents;
    const reason = explore ? "exploration" : c.weakTopic >= .25 && .1 * c.weakTopic >= .2 * Math.max(0, c.interest - .5) ?
      "weak_topic" : c.interest > .6 ? "interest" : "level_match";
    selected.push({ candidate, reason, selectionProbability: probability });
    words.add(candidate.meaning.wordId);
    if (candidate.primaryTopicId !== null) topicCounts.set(candidate.primaryTopicId, (topicCounts.get(candidate.primaryTopicId) ?? 0) + 1);
  }
  return selected;
}
