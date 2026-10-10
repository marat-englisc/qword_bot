import { CEFR_DIFFICULTY, fitVocabulary } from "./algorithms/vocabularyProfile";
import { recallStatistics } from "./algorithms/recallStatistics";
import {
  DAY,
  nowFrom,
  RECOMMENDATION_VERSION,
  type Clock,
  type Repositories,
} from "./common";
import { validateTimezone } from "./localDay";
import type { UserVocabularyAssessment } from "../db/recommendationTypes";
import type { UserFsrsReview } from "../db/types";

export function createProfileService(repos: Repositories, clock: Clock) {
  async function rebuild(userId: number, at?: Date) {
    const now = nowFrom(clock, at),
      to = new Date(+now + 1);
    const profile = await repos.users.ensureProfile(userId);
    validateTimezone(profile.timezone);
    const cefr =
      profile.selfReportedCefrLevelId === null
        ? undefined
        : await repos.catalog.cefrLevels.get({
            id: profile.selfReportedCefrLevelId,
          });
    const prior = cefr ? CEFR_DIFFICULTY[cefr.value] : -2;
    const assessments: UserVocabularyAssessment[] = [];
    let assessmentCursor: { assessedAt: Date; id: number } | undefined;
    while (true) {
      const page = await repos.recommendation.getAssessments(
        userId,
        new Date(0),
        to,
        { limit: 500, after: assessmentCursor },
      );
      if (!page.length) break;
      assessments.push(...page);
      const last = page[page.length - 1];
      assessmentCursor = { assessedAt: last.assessedAt, id: last.id };
    }
    const events: UserFsrsReview[] = [];
    let reviewCursor: { review: Date; id: number } | undefined;
    while (true) {
      const page = await repos.learning.getRecallObservations(
        userId,
        new Date(Math.max(0, +now - 90 * DAY)),
        to,
        { limit: 500, after: reviewCursor },
      );
      if (!page.length) break;
      events.push(...page);
      const last = page[page.length - 1];
      reviewCursor = { review: last.review, id: last.id };
    }
    const meaningIds = [...new Set(events.map((row) => row.wordMeaningId))];
    const topicWeights = new Map<number, { id: number; weight: number }[]>();
    for (let i = 0; i < meaningIds.length; i += 500) {
      for (const meaning of await repos.catalog.getMeaningDetails(
        meaningIds.slice(i, i + 500),
      )) {
        topicWeights.set(meaning.id, meaning.topics);
      }
    }
    const fit = fitVocabulary(assessments, prior, now),
      recall = recallStatistics(events, topicWeights, profile.timezone, now);
    const fitByTopic = new Map(fit.topics.map((row) => [row.topicId, row]));
    const recallByTopic = new Map(
      recall.topics.map((row) => [row.topicId, row]),
    );
    const ids = [...new Set([...fitByTopic.keys(), ...recallByTopic.keys()])],
      existing = new Set<number>();
    // Deleted topics remain in immutable assessment snapshots but have no cache row.
    for (let i = 0; i < ids.length; i += 500) {
      for (const topic of await repos.catalog.getTopicsByIds(
        ids.slice(i, i + 500),
      ))
        existing.add(topic.id);
    }
    const stats = ids
      .filter((id) => existing.has(id))
      .map((topicId) => ({
        topicId,
        vocabularyAbilityOffset:
          fitByTopic.get(topicId)?.vocabularyAbilityOffset ?? 0,
        assessmentWeight: fitByTopic.get(topicId)?.assessmentWeight ?? 0,
        recallResidualSum: recallByTopic.get(topicId)?.recallResidualSum ?? 0,
        recallWeight: recallByTopic.get(topicId)?.recallWeight ?? 0,
        distinctReviewedMeanings:
          recallByTopic.get(topicId)?.distinctReviewedMeanings ?? 0,
      }));
    await repos.recommendation.replaceStatistics(
      userId,
      { ...fit, algorithmVersion: RECOMMENDATION_VERSION },
      stats,
      now,
    );
    const updated = await repos.users.profiles.get({ userId });
    if (!updated) throw new Error("User profile disappeared");
    const topicProfiles = [];
    for (let offset = 0; ; offset += 500) {
      const page = await repos.users.topicProfiles.list(
        { userId },
        { limit: 500, offset },
      );
      topicProfiles.push(...page);
      if (page.length < 500) break;
    }
    return {
      profile: updated,
      prior,
      globalGap: recall.globalGap,
      weaknesses: new Map(
        recall.topics.map((row) => [row.topicId, row.weakness]),
      ),
      topicProfiles,
    };
  }
  return {
    rebuild,
    async configure(
      userId: number,
      patch: {
        selfReportedCefrLevelId?: number | null;
        timezone?: string;
        dailyNewMeaningLimit?: number;
        explorationRate?: number;
      },
      at?: Date,
    ) {
      if (patch.timezone !== undefined) validateTimezone(patch.timezone);
      if (
        patch.selfReportedCefrLevelId !== undefined &&
        patch.selfReportedCefrLevelId !== null &&
        !(await repos.catalog.cefrLevels.get({
          id: patch.selfReportedCefrLevelId,
        }))
      )
        throw new Error("CEFR level not found");
      await repos.users.ensureProfile(userId);
      await repos.users.profiles.update(
        { userId },
        {
          selfReportedCefrLevelId: patch.selfReportedCefrLevelId,
          timezone: patch.timezone,
          dailyNewMeaningLimit: patch.dailyNewMeaningLimit,
          explorationRate: patch.explorationRate,
        },
      );
      return rebuild(userId, at);
    },
    async assess(
      userId: number,
      wordMeaningId: number,
      answer: {
        knewBefore: boolean;
        source: UserVocabularyAssessment["source"];
        answerNotRevealed: true;
      },
      at?: Date,
    ) {
      if (answer.answerNotRevealed !== true)
        throw new TypeError("Assessment must precede revealing the answer");
      const now = nowFrom(clock, at);
      const assessment = await repos.recommendation.submitAssessment(
        userId,
        wordMeaningId,
        answer,
        now,
      );
      const estimates = await rebuild(userId, now);
      return { assessment, ...estimates };
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
