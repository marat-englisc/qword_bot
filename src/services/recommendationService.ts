import { randomUUID } from "node:crypto";
import { RepositoryConflictError } from "../db/repositories/core";
import {
  chooseRecommendations,
  safeLearningRange,
  scoreCandidates,
  type MeaningDetails,
} from "./algorithms/recommendationRanking";
import {
  countLimit,
  DAY,
  nowFrom,
  RECOMMENDATION_VERSION,
  type Clock,
  type Repositories,
  type UserLock,
} from "./common";
import { localDayBounds } from "./localDay";
import type { ProfileService } from "./profileService";
import type { WordRecommendation } from "../db/recommendationTypes";

export { RECOMMENDATION_VERSION } from "./common";
export function createRecommendationService(
  repos: Repositories,
  profiles: ProfileService,
  options: {
    clock: Clock;
    random: () => number;
    lock: UserLock;
    frequencySource?: string;
  },
) {
  async function prepare(userId: number, now: Date) {
    const estimates = await profiles.rebuild(userId, now);
    const day = localDayBounds(now, estimates.profile.timezone);
    const load = await repos.recommendation.getUserContext(
      userId,
      now,
      day.dayStart,
      day.dayEnd,
    );
    const remaining = Math.max(
      0,
      estimates.profile.dailyNewMeaningLimit - load.introducedCount,
    );
    const paused = !remaining
      ? ("daily_limit" as const)
      : load.dueCount > Math.max(20, 2 * estimates.profile.dailyNewMeaningLimit)
        ? ("reviews_overloaded" as const)
        : undefined;
    const candidates: MeaningDetails[] = [];
    if (!paused) {
      let afterMeaningId: number | undefined;
      while (true) {
        const page = await repos.recommendation.getCandidates(userId, {
          now,
          limit: 500,
          afterMeaningId,
        });
        if (!page.length) break;
        candidates.push(...page);
        afterMeaningId = page[page.length - 1].id;
      }
    }
    const due = paused ? [] : await repos.learning.getTopicDueLoad(userId, now);
    const context = {
      ...estimates.profile,
      prior: estimates.prior,
      topicProfiles: load.topicProfiles,
      weaknesses: estimates.weaknesses,
      dueWeights: new Map(due.map((row) => [row.topicId, row.dueWeight])),
      frequencySource: options.frequencySource,
    };
    const pool = safeLearningRange(
      scoreCandidates(candidates, context),
      context,
    );
    return { estimates, remaining, pool, paused };
  }
  type Prepared = Awaited<ReturnType<typeof prepare>>;
  async function generate(
    userId: number,
    count: number,
    batchId: string,
    now: Date,
    ready?: Prepared,
  ) {
    // A client-supplied batch id is idempotent, including an answered/expired batch.
    const previous = await repos.recommendation.recommendations.list(
      { userId },
      { filter: { batchId }, limit: 500 },
    );
    if (previous.length)
      return {
        batchId,
        status: "existing" as const,
        recommendations: await repos.recommendation.getPendingBatch(
          userId,
          batchId,
          now,
          { limit: 500 },
        ),
      };
    for (let attempt = 0; attempt < 2; attempt++) {
      const prepared = !attempt && ready ? ready : await prepare(userId, now);
      if (prepared.paused)
        return { batchId, status: prepared.paused, recommendations: [] };
      const chosen = chooseRecommendations(
        prepared.pool,
        Math.min(count, prepared.remaining),
        prepared.estimates.profile.explorationRate,
        options.random,
      );
      if (!chosen.length)
        return {
          batchId,
          status: "no_candidates" as const,
          recommendations: [],
        };
      try {
        const recommendations = await repos.recommendation.saveBatch(
          userId,
          batchId,
          RECOMMENDATION_VERSION,
          chosen.map(({ candidate, reason, selectionProbability }) => ({
            wordMeaningId: candidate.meaning.id,
            reason,
            selectionProbability,
            score: candidate.score,
            scoreComponents: candidate.scoreComponents,
            predictedKnownProbability: candidate.predictedKnownProbability,
          })),
          now,
          new Date(+now + DAY),
        );
        return { batchId, status: "generated" as const, recommendations };
      } catch (error) {
        if (!(error instanceof RepositoryConflictError) || attempt) throw error;
        // Eligibility changed in another process; rebuild the pool once.
      }
    }
    throw new RepositoryConflictError("Recommendation pool changed");
  }
  return {
    generate(
      userId: number,
      input: { count?: number; batchId?: string; at?: Date } = {},
    ) {
      const count = countLimit(input.count ?? 10),
        now = nowFrom(options.clock, input.at);
      return options.lock(userId, () =>
        generate(userId, count, input.batchId ?? randomUUID(), now),
      );
    },
    async next(userId: number, at?: Date) {
      const now = nowFrom(options.clock, at);
      return options.lock(userId, async () => {
        const prepared = await prepare(userId, now);
        if (prepared.paused)
          return { status: prepared.paused, recommendation: undefined };
        const allowed = new Set(prepared.pool.map((row) => row.meaning.id));
        let after: { createdAt: Date; id: number } | undefined;
        while (allowed.size) {
          const pending = await repos.recommendation.getReadyUnshown(
            userId,
            now,
            500,
            after,
          );
          const row = pending.find((row) => allowed.has(row.wordMeaningId));
          if (row) return { status: "existing" as const, recommendation: row };
          if (pending.length < 500) break;
          const last = pending[pending.length - 1];
          after = { createdAt: last.createdAt, id: last.id };
        }
        const batch = await generate(userId, 10, randomUUID(), now, prepared);
        return {
          status: batch.status,
          recommendation: batch.recommendations[0],
        };
      });
    },
    async markShown(userId: number, id: number, at?: Date) {
      const now = nowFrom(options.clock, at);
      return options.lock(userId, async () => {
        const row = await repos.recommendation.recommendations.get({
          userId,
          id,
        });
        if (!row || row.shownAt) return row;
        const prepared = await prepare(userId, now);
        if (
          prepared.paused ||
          !prepared.pool.some(
            (candidate) => candidate.meaning.id === row.wordMeaningId,
          )
        )
          return undefined;
        return repos.recommendation.markShown(userId, id, now);
      });
    },
    async respond(
      userId: number,
      id: number,
      feedback: NonNullable<WordRecommendation["feedback"]>,
      input: { at?: Date; answerNotRevealed?: boolean } = {},
    ) {
      const now = nowFrom(options.clock, input.at);
      return options.lock(userId, async () => {
        const profile = await repos.users.ensureProfile(userId),
          day = localDayBounds(now, profile.timezone);
        return repos.recommendation.respond(userId, id, feedback, now, {
          ...day,
          assessKnownBeforeReveal: input.answerNotRevealed === true,
        });
      });
    },
  };
}

export type RecommendationService = ReturnType<
  typeof createRecommendationService
>;
