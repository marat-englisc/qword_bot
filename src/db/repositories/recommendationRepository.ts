import {
  and,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  notExists,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import * as s from "../schema";
import type { WordRecommendation } from "../recommendationTypes";
import {
  createCrudRepository,
  dateMillis,
  pagination,
  RepositoryConflictError,
  timeRange,
  type Database,
  type Executor,
  type Page,
} from "./core";
import { loadMeaningDetails, meaningDifficulty } from "./catalogRepository";
import { introduceMeaning, workload } from "./learningRepository";

const DAY = 86_400_000;
type Feedback = NonNullable<WordRecommendation["feedback"]>;
export type CandidateOptions = {
  now: Date;
  limit?: number;
  afterMeaningId?: number;
  excludeMeaningIds?: number[];
  excludeWordIds?: number[];
  minDifficulty?: number;
  maxDifficulty?: number;
};
type EligibilityOptions = Pick<
  CandidateOptions,
  "excludeMeaningIds" | "excludeWordIds"
> & {
  ignoreRecommendationId?: number;
};

export function recommendationCrud(db: Executor) {
  return {
    assessments: createCrudRepository(
      db,
      s.userVocabularyAssessmentTable,
      ["userId", "wordMeaningId"],
      ["userId"],
    ),
    preferences: createCrudRepository(
      db,
      s.userWordPreferenceTable,
      ["userId", "wordMeaningId"],
      ["userId"],
    ),
    recommendations: createCrudRepository(
      db,
      s.wordRecommendationTable,
      ["userId", "id"],
      ["userId"],
    ),
  };
}

function validIds(ids: number[] = []) {
  if (
    ids.length > 500 ||
    ids.some((id) => !Number.isSafeInteger(id) || id < 1)
  ) {
    throw new RangeError("Expected at most 500 positive safe integer IDs");
  }
  return ids;
}

/** This predicate is shared by retrieval and the transactional show/accept paths. */
export function candidateConditions(
  db: Executor,
  userId: number,
  now: Date,
  options: EligibilityOptions = {},
): SQL {
  const nowMs = dateMillis(now);
  const since = new Date(Math.max(0, nowMs - 7 * DAY));
  const m = s.wordMeaningTable,
    c = s.userFsrsDataTable,
    p = s.userWordPreferenceTable;
  const r = s.wordRecommendationTable,
    links = s.wordMeaningTopicTable,
    topics = s.userTopicProfileTable;
  const learned = alias(s.wordMeaningTable, "learned_meaning");
  const meaningIds = validIds(options.excludeMeaningIds),
    wordIds = validIds(options.excludeWordIds);
  return and(
    eq(m.isRecommendable, true),
    notExists(
      db
        .select({ id: c.id })
        .from(c)
        .where(and(eq(c.userId, userId), eq(c.wordMeaningId, m.id))),
    ),
    notExists(
      db
        .select({ userId: p.userId })
        .from(p)
        .where(
          and(
            eq(p.userId, userId),
            eq(p.wordMeaningId, m.id),
            or(
              inArray(p.status, ["known", "ignored"]),
              and(eq(p.status, "snoozed"), gt(p.snoozedUntil, now)),
            ),
          ),
        ),
    ),
    notExists(
      db
        .select({ topicId: links.topicId })
        .from(links)
        .innerJoin(
          topics,
          and(
            eq(topics.topicId, links.topicId),
            eq(topics.userId, userId),
            eq(topics.isBlocked, true),
          ),
        )
        .where(eq(links.wordMeaningId, m.id)),
    ),
    notExists(
      db
        .select({ id: r.id })
        .from(r)
        .where(
          and(
            eq(r.userId, userId),
            eq(r.wordMeaningId, m.id),
            gte(r.shownAt, since),
            sql`${r.shownAt} <= ${nowMs}`,
            options.ignoreRecommendationId === undefined
              ? undefined
              : sql`${r.id} <> ${options.ignoreRecommendationId}`,
          ),
        ),
    ),
    notExists(
      db
        .select({ id: c.id })
        .from(c)
        .innerJoin(learned, eq(c.wordMeaningId, learned.id))
        .where(
          and(
            eq(c.userId, userId),
            eq(learned.wordId, m.wordId),
            gte(c.introducedAt, since),
            sql`${c.introducedAt} <= ${nowMs}`,
          ),
        ),
    ),
    meaningIds.length ? notInArray(m.id, meaningIds) : undefined,
    wordIds.length ? notInArray(m.wordId, wordIds) : undefined,
  )!;
}

async function isEligible(
  db: Executor,
  userId: number,
  wordMeaningId: number,
  now: Date,
  ignoreRecommendationId?: number,
) {
  const [row] = await db
    .select({ id: s.wordMeaningTable.id })
    .from(s.wordMeaningTable)
    .where(
      and(
        eq(s.wordMeaningTable.id, wordMeaningId),
        candidateConditions(db, userId, now, { ignoreRecommendationId }),
      ),
    );
  return Boolean(row);
}

type AssessmentAnswer = {
  knewBefore: boolean;
  source: (typeof s.userVocabularyAssessmentTable.$inferSelect)["source"];
};

async function recordAssessment(
  db: Executor,
  userId: number,
  wordMeaningId: number,
  answer: AssessmentAnswer,
  at: Date,
) {
  dateMillis(at);
  const existing = await recommendationCrud(db).assessments.get({
    userId,
    wordMeaningId,
  });
  if (existing) return existing; // Preserve the first observation, including its metadata.
  const [card] = await db
    .select({ id: s.userFsrsDataTable.id })
    .from(s.userFsrsDataTable)
    .where(
      and(
        eq(s.userFsrsDataTable.userId, userId),
        eq(s.userFsrsDataTable.wordMeaningId, wordMeaningId),
      ),
    );
  const [review] = await db
    .select({ id: s.userFsrsReviewTable.id })
    .from(s.userFsrsReviewTable)
    .where(
      and(
        eq(s.userFsrsReviewTable.userId, userId),
        eq(s.userFsrsReviewTable.wordMeaningId, wordMeaningId),
      ),
    )
    .limit(1);
  if (card || review)
    throw new RepositoryConflictError(
      "Assessment is allowed only before learning",
    );
  const [meaning] = await loadMeaningDetails(db, [wordMeaningId]);
  if (!meaning) throw new Error("Meaning not found");
  const [saved] = await db
    .insert(s.userVocabularyAssessmentTable)
    .values({
      userId,
      wordMeaningId,
      knewBefore: answer.knewBefore,
      source: answer.source,
      vocabularyDifficulty: meaning.effectiveDifficulty,
      topicWeights: meaning.topics.map((topic) => ({
        topicId: topic.id,
        weight: topic.weight,
      })),
      assessedAt: at,
    })
    .returning();
  return saved;
}

async function setPreference(
  db: Executor,
  userId: number,
  wordMeaningId: number,
  status: (typeof s.userWordPreferenceTable.$inferSelect)["status"],
  now: Date,
  snoozedUntil: Date | null = null,
) {
  dateMillis(now);
  const [row] = await db
    .insert(s.userWordPreferenceTable)
    .values({
      userId,
      wordMeaningId,
      status,
      snoozedUntil,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        s.userWordPreferenceTable.userId,
        s.userWordPreferenceTable.wordMeaningId,
      ],
      set: { status, snoozedUntil, updatedAt: now },
    })
    .returning();
  return row;
}

type BatchItem = Pick<
  WordRecommendation,
  | "wordMeaningId"
  | "reason"
  | "predictedKnownProbability"
  | "score"
  | "scoreComponents"
  | "selectionProbability"
>;
type GlobalStatistics = Pick<
  typeof s.userRecommendationProfileTable.$inferSelect,
  "vocabularyAbility" | "assessmentWeight"
> & { algorithmVersion?: string };
type TopicStatistics = Pick<
  typeof s.userTopicProfileTable.$inferSelect,
  | "topicId"
  | "vocabularyAbilityOffset"
  | "assessmentWeight"
  | "recallResidualSum"
  | "recallWeight"
  | "distinctReviewedMeanings"
>;

export function createRecommendationRepository(db: Database) {
  const r = s.wordRecommendationTable;
  return {
    ...recommendationCrud(db),
    async getReadyUnshown(userId: number, now: Date, limit = 100, after?: { createdAt: Date; id: number }) {
      pagination({ limit });
      dateMillis(now);
      if (after) dateMillis(after.createdAt);
      return db.select(getTableColumns(r)).from(r)
        .innerJoin(s.wordMeaningTable, eq(r.wordMeaningId, s.wordMeaningTable.id))
        .where(and(eq(r.userId, userId), isNull(r.shownAt), isNull(r.feedback),
          sql`${r.createdAt} <= ${now.getTime()}`, sql`${r.expiresAt} >= ${now.getTime()}`,
          candidateConditions(db, userId, now),
          after ? or(gt(r.createdAt, after.createdAt), and(eq(r.createdAt, after.createdAt), gt(r.id, after.id))) : undefined))
        .orderBy(r.createdAt, r.id).limit(limit);
    },
    async getUserContext(
      userId: number,
      now: Date,
      dayStart: Date,
      dayEnd: Date,
    ) {
      return db.transaction(async (tx) => {
        const [profile] = await tx
          .select()
          .from(s.userRecommendationProfileTable)
          .where(eq(s.userRecommendationProfileTable.userId, userId));
        const topicProfiles = await tx
          .select()
          .from(s.userTopicProfileTable)
          .where(eq(s.userTopicProfileTable.userId, userId))
          .orderBy(s.userTopicProfileTable.topicId);
        return {
          profile,
          topicProfiles,
          ...(await workload(tx, userId, now, dayStart, dayEnd)),
        };
      });
    },
    async getCandidates(userId: number, options: CandidateOptions) {
      const { limit } = pagination(options);
      if (options.afterMeaningId !== undefined)
        validIds([options.afterMeaningId]);
      for (const bound of [options.minDifficulty, options.maxDifficulty]) {
        if (bound !== undefined && !Number.isFinite(bound))
          throw new TypeError("Difficulty must be finite");
      }
      if (
        options.minDifficulty !== undefined &&
        options.maxDifficulty !== undefined &&
        options.minDifficulty > options.maxDifficulty
      )
        throw new RangeError("Invalid difficulty range");
      return db.transaction(async (tx) => {
        const ids = await tx
          .select({ id: s.wordMeaningTable.id })
          .from(s.wordMeaningTable)
          .innerJoin(
            s.cefrLevelTable,
            eq(s.wordMeaningTable.cefrLevelId, s.cefrLevelTable.id),
          )
          .where(
            and(
              candidateConditions(tx, userId, options.now, options),
              options.afterMeaningId === undefined
                ? undefined
                : gt(s.wordMeaningTable.id, options.afterMeaningId),
              options.minDifficulty === undefined
                ? undefined
                : sql`${meaningDifficulty} >= ${options.minDifficulty}`,
              options.maxDifficulty === undefined
                ? undefined
                : sql`${meaningDifficulty} <= ${options.maxDifficulty}`,
            ),
          )
          .orderBy(s.wordMeaningTable.id)
          .limit(limit);
        return loadMeaningDetails(
          tx,
          ids.map((row) => row.id),
        );
      });
    },
    async getAssessments(
      userId: number,
      from: Date,
      to: Date,
      options: {
        limit?: number;
        after?: { assessedAt: Date; id: number };
      } = {},
    ) {
      timeRange(from, to);
      const { limit } = pagination(options);
      const a = s.userVocabularyAssessmentTable;
      if (options.after) dateMillis(options.after.assessedAt);
      return db
        .select()
        .from(a)
        .where(
          and(
            eq(a.userId, userId),
            gte(a.assessedAt, from),
            lt(a.assessedAt, to),
            options.after
              ? or(
                  gt(a.assessedAt, options.after.assessedAt),
                  and(
                    eq(a.assessedAt, options.after.assessedAt),
                    gt(a.id, options.after.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(a.assessedAt, a.id)
        .limit(limit);
    },
    // Caller must ask BEFORE revealing the answer; the database can only detect learning records.
    async submitAssessment(userId: number, wordMeaningId: number, answer: AssessmentAnswer, at = new Date()) {
      return db.transaction(async tx => {
        const existing = await recommendationCrud(tx).assessments.get({ userId, wordMeaningId });
        if (existing) return existing;
        const row = await recordAssessment(tx, userId, wordMeaningId, answer, at);
        if (row.knewBefore) await setPreference(tx, userId, wordMeaningId, "known", at);
        return row;
      });
    },
    recordAssessment: (
      userId: number,
      wordMeaningId: number,
      answer: AssessmentAnswer,
      at = new Date(),
    ) =>
      db.transaction((tx) =>
        recordAssessment(tx, userId, wordMeaningId, answer, at),
      ),
    setPreference: (
      userId: number,
      wordMeaningId: number,
      status: (typeof s.userWordPreferenceTable.$inferSelect)["status"],
      now = new Date(),
      snoozedUntil: Date | null = null,
    ) => setPreference(db, userId, wordMeaningId, status, now, snoozedUntil),
    async replaceStatistics(
      userId: number,
      global: GlobalStatistics,
      topics: TopicStatistics[],
      at: Date,
    ) {
      dateMillis(at);
      if (new Set(topics.map((topic) => topic.topicId)).size !== topics.length)
        throw new TypeError("Duplicate topic statistics");
      return db.transaction(async (tx) => {
        const [old] = await tx
          .select()
          .from(s.userRecommendationProfileTable)
          .where(eq(s.userRecommendationProfileTable.userId, userId));
        if (old?.statsUpdatedAt && old.statsUpdatedAt > at)
          throw new RepositoryConflictError("Statistics snapshot is stale");
        const globalStats = {
          vocabularyAbility: global.vocabularyAbility,
          assessmentWeight: global.assessmentWeight,
          statsUpdatedAt: at,
          algorithmVersion: global.algorithmVersion,
        };
        await tx
          .insert(s.userRecommendationProfileTable)
          .values({ userId, ...globalStats })
          .onConflictDoUpdate({
            target: s.userRecommendationProfileTable.userId,
            set: globalStats,
          });
        // Clear previous learned estimates, keeping explicit interests and blocks.
        await tx
          .update(s.userTopicProfileTable)
          .set({
            vocabularyAbilityOffset: 0,
            assessmentWeight: 0,
            recallResidualSum: 0,
            recallWeight: 0,
            distinctReviewedMeanings: 0,
            statsUpdatedAt: at,
          })
          .where(eq(s.userTopicProfileTable.userId, userId));
        for (const topic of topics) {
          const { topicId } = topic;
          const stats = {
            vocabularyAbilityOffset: topic.vocabularyAbilityOffset,
            assessmentWeight: topic.assessmentWeight,
            recallResidualSum: topic.recallResidualSum,
            recallWeight: topic.recallWeight,
            distinctReviewedMeanings: topic.distinctReviewedMeanings,
          };
          await tx
            .insert(s.userTopicProfileTable)
            .values({ userId, topicId, ...stats, statsUpdatedAt: at })
            .onConflictDoUpdate({
              target: [
                s.userTopicProfileTable.userId,
                s.userTopicProfileTable.topicId,
              ],
              set: { ...stats, statsUpdatedAt: at },
            });
        }
      });
    },
    async saveBatch(
      userId: number,
      batchId: string,
      algorithmVersion: string,
      items: BatchItem[],
      now: Date,
      expiresAt: Date,
    ) {
      timeRange(now, expiresAt);
      if (!items.length || items.length > 500)
        throw new RangeError("Batch must contain 1..500 items");
      if (
        new Set(items.map((item) => item.wordMeaningId)).size !== items.length
      )
        throw new TypeError("Duplicate meaning");
      return db.transaction(async (tx) => {
        const words = new Set<number>();
        for (const item of items) {
          if (!(await isEligible(tx, userId, item.wordMeaningId, now)))
            throw new RepositoryConflictError(
              "Candidate is no longer eligible",
            );
          const [meaning] = await tx
            .select()
            .from(s.wordMeaningTable)
            .where(eq(s.wordMeaningTable.id, item.wordMeaningId));
          if (words.has(meaning.wordId))
            throw new TypeError("Only one meaning per word in a batch");
          words.add(meaning.wordId);
        }
        return tx
          .insert(r)
          .values(
            items.map((item, index) => ({
              wordMeaningId: item.wordMeaningId,
              reason: item.reason,
              predictedKnownProbability: item.predictedKnownProbability,
              score: item.score,
              scoreComponents: item.scoreComponents,
              selectionProbability: item.selectionProbability,
              userId,
              batchId,
              algorithmVersion,
              position: index + 1,
              createdAt: now,
              expiresAt,
              shownAt: null,
              feedback: null,
              feedbackAt: null,
            })),
          )
          .returning();
      });
    },
    async getPendingBatch(
      userId: number,
      batchId: string,
      now: Date,
      page: Page = {},
    ) {
      dateMillis(now);
      const { limit, offset } = pagination(page);
      return db
        .select()
        .from(r)
        .where(
          and(
            eq(r.userId, userId),
            eq(r.batchId, batchId),
            isNull(r.feedback),
            sql`${r.expiresAt} >= ${now.getTime()}`,
            sql`${r.createdAt} <= ${now.getTime()}`,
          ),
        )
        .orderBy(r.position)
        .limit(limit)
        .offset(offset);
    },
    async markShown(userId: number, id: number, now = new Date()) {
      dateMillis(now);
      return db.transaction(async (tx) => {
        const row = await recommendationCrud(tx).recommendations.get({
          userId,
          id,
        });
        if (!row) return undefined;
        if (row.shownAt) return row;
        if (
          row.feedback ||
          now < row.createdAt ||
          now > row.expiresAt ||
          !(await isEligible(tx, userId, row.wordMeaningId, now))
        )
          return undefined;
        const [saved] = await tx
          .update(r)
          .set({ shownAt: now })
          .where(
            and(
              eq(r.userId, userId),
              eq(r.id, id),
              isNull(r.shownAt),
              isNull(r.feedback),
            ),
          )
          .returning();
        return saved;
      });
    },
    async respond(
      userId: number,
      id: number,
      feedback: Feedback,
      now = new Date(),
      options: {
        dayStart?: Date;
        dayEnd?: Date;
        assessKnownBeforeReveal?: boolean;
      } = {},
    ) {
      dateMillis(now);
      if (
        ![
          "accepted",
          "already_known",
          "skipped",
          "too_difficult",
          "not_interested",
        ].includes(feedback)
      ) {
        throw new TypeError("Invalid feedback");
      }
      return db.transaction(async (tx) => {
        const row = await recommendationCrud(tx).recommendations.get({
          userId,
          id,
        });
        if (!row) return undefined;
        if (row.feedback) {
          if (row.feedback !== feedback)
            throw new RepositoryConflictError(
              "Recommendation already answered",
            );
          return row; // An idempotent retry must not postpone snoozes or duplicate events.
        }
        if (!row.shownAt || now < row.shownAt)
          throw new RepositoryConflictError(
            "Recommendation has not been shown",
          );
        if (feedback === "accepted") {
          if (!options.dayStart || !options.dayEnd)
            throw new TypeError(
              "Local day boundaries are required for acceptance",
            );
          if (
            now > row.expiresAt ||
            !(await isEligible(tx, userId, row.wordMeaningId, now, row.id))
          ) {
            throw new RepositoryConflictError(
              "Recommendation is no longer eligible",
            );
          }
          const [profile] = await tx
            .select()
            .from(s.userRecommendationProfileTable)
            .where(eq(s.userRecommendationProfileTable.userId, userId));
          const limit = profile?.dailyNewMeaningLimit ?? 10;
          const load = await workload(
            tx,
            userId,
            now,
            options.dayStart,
            options.dayEnd,
          );
          if (
            load.introducedCount >= limit ||
            load.dueCount > Math.max(20, 2 * limit)
          ) {
            throw new RepositoryConflictError(
              "New-word budget exhausted or reviews are overloaded",
            );
          }
          await introduceMeaning(tx, userId, row.wordMeaningId, now);
          await tx
            .delete(s.userWordPreferenceTable)
            .where(
              and(
                eq(s.userWordPreferenceTable.userId, userId),
                eq(s.userWordPreferenceTable.wordMeaningId, row.wordMeaningId),
              ),
            );
        } else if (feedback === "already_known") {
          const [active] = await tx.select({ id: s.userFsrsDataTable.id }).from(s.userFsrsDataTable)
            .where(and(eq(s.userFsrsDataTable.userId, userId), eq(s.userFsrsDataTable.wordMeaningId, row.wordMeaningId)));
          if (active) throw new RepositoryConflictError("Known preference is allowed only before learning");
          if (options.assessKnownBeforeReveal)
            await recordAssessment(
              tx,
              userId,
              row.wordMeaningId,
              { knewBefore: true, source: "self_report" },
              now,
            );
          await setPreference(tx, userId, row.wordMeaningId, "known", now);
        } else if (feedback === "not_interested") {
          await setPreference(tx, userId, row.wordMeaningId, "ignored", now);
        } else {
          await setPreference(
            tx,
            userId,
            row.wordMeaningId,
            "snoozed",
            now,
            new Date(now.getTime() + (feedback === "skipped" ? 7 : 30) * DAY),
          );
        }
        const [saved] = await tx
          .update(r)
          .set({ feedback, feedbackAt: now })
          .where(and(eq(r.userId, userId), eq(r.id, id), isNull(r.feedback)))
          .returning();
        if (!saved)
          throw new RepositoryConflictError("Recommendation already answered");
        return saved;
      });
    },
  };
}
