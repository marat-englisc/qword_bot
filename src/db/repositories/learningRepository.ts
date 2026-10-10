import {
  and,
  count,
  eq,
  getTableColumns,
  gte,
  inArray,
  lt,
  lte,
  or,
  sql,
  gt,
} from "drizzle-orm";
import {
  createEmptyCard,
  Rating,
  State,
  type Card,
  type RecordLogItem,
} from "ts-fsrs";
import * as s from "../schema";
import type { UserFsrsData } from "../types";
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

export function learningCrud(db: Executor) {
  return {
    cards: createCrudRepository(
      db,
      s.userFsrsDataTable,
      ["userId", "wordMeaningId"],
      ["userId"],
    ),
    reviews: createCrudRepository(
      db,
      s.userFsrsReviewTable,
      ["userId", "id"],
      ["userId"],
    ),
  };
}

export function toFsrsCard(row: UserFsrsData): Card {
  return {
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    learning_steps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.lastReview ?? undefined,
  };
}

export function fsrsCardValues(card: Card) {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ?? null,
  };
}

export async function introduceMeaning(
  db: Executor,
  userId: number,
  wordMeaningId: number,
  now: Date,
) {
  dateMillis(now);
  const [created] = await db
    .insert(s.userFsrsDataTable)
    .values({
      userId,
      wordMeaningId,
      ...fsrsCardValues(createEmptyCard(now)),
      introducedAt: now,
    })
    .onConflictDoNothing({
      target: [s.userFsrsDataTable.userId, s.userFsrsDataTable.wordMeaningId],
    })
    .returning();
  return created ?? learningCrud(db).cards.get({ userId, wordMeaningId });
}

export async function workload(
  db: Executor,
  userId: number,
  now: Date,
  dayStart: Date,
  dayEnd: Date,
) {
  timeRange(dayStart, dayEnd);
  dateMillis(now);
  if (now < dayStart || now >= dayEnd)
    throw new RangeError("now must be inside the local day");
  const [due] = await db
    .select({ count: count() })
    .from(s.userFsrsDataTable)
    .where(
      and(
        eq(s.userFsrsDataTable.userId, userId),
        inArray(s.userFsrsDataTable.state, [
          State.Learning,
          State.Review,
          State.Relearning,
        ]),
        lte(s.userFsrsDataTable.due, now),
      ),
    );
  const [introduced] = await db
    .select({ count: count() })
    .from(s.userFsrsDataTable)
    .where(
      and(
        eq(s.userFsrsDataTable.userId, userId),
        gte(s.userFsrsDataTable.introducedAt, dayStart),
        lt(s.userFsrsDataTable.introducedAt, dayEnd),
      ),
    );
  return { dueCount: due.count, introducedCount: introduced.count };
}

export function createLearningRepository(db: Database) {
  const cards = s.userFsrsDataTable;
  const reviews = s.userFsrsReviewTable;
  return {
    ...learningCrud(db),
    async startLearning(userId: number, wordMeaningId: number, now = new Date()) {
      return db.transaction(async tx => {
        const card = await introduceMeaning(tx, userId, wordMeaningId, now);
        await tx.delete(s.userWordPreferenceTable).where(and(
          eq(s.userWordPreferenceTable.userId, userId),
          eq(s.userWordPreferenceTable.wordMeaningId, wordMeaningId),
        ));
        return card;
      });
    },
    introduceMeaning: (
      userId: number,
      wordMeaningId: number,
      now = new Date(),
    ) => introduceMeaning(db, userId, wordMeaningId, now),
    toFsrsCard,
    async getDueCards(userId: number, now: Date, page: Page = {}) {
      dateMillis(now);
      const { limit, offset } = pagination(page);
      return db
        .select()
        .from(cards)
        .where(
          and(
            eq(cards.userId, userId),
            inArray(cards.state, [
              State.Learning,
              State.Review,
              State.Relearning,
            ]),
            sql`${cards.due} <= ${now.getTime()}`,
          ),
        )
        .orderBy(cards.due, cards.id)
        .limit(limit)
        .offset(offset);
    },
    async getNewCards(userId: number, page: Page = {}) {
      const { limit, offset } = pagination(page);
      return db
        .select()
        .from(cards)
        .where(and(eq(cards.userId, userId), eq(cards.state, State.New)))
        .orderBy(cards.due, cards.id)
        .limit(limit)
        .offset(offset);
    },
    getWorkload: (userId: number, now: Date, dayStart: Date, dayEnd: Date) =>
      db.transaction((tx) => workload(tx, userId, now, dayStart, dayEnd)),
    async getReviewHistory(
      userId: number,
      from: Date,
      to: Date,
      page: Page = {},
    ) {
      timeRange(from, to);
      const { limit, offset } = pagination(page);
      return db
        .select()
        .from(reviews)
        .where(
          and(
            eq(reviews.userId, userId),
            gte(reviews.review, from),
            lt(reviews.review, to),
          ),
        )
        .orderBy(reviews.review, reviews.id)
        .limit(limit)
        .offset(offset);
    },
    async getRecallObservations(
      userId: number,
      from: Date,
      to: Date,
      options: { limit?: number; after?: { review: Date; id: number } } = {},
    ) {
      timeRange(from, to);
      const { limit } = pagination(options);
      if (options.after) dateMillis(options.after.review);
      // LAG must run BEFORE the time/cursor/state filters. Previous events may
      // lie outside the requested window or have another state/rating.
      const history = db
        .select({
          ...getTableColumns(reviews),
          previousReviewMillis: sql<number | null>`lag(${reviews.review}) OVER (
          PARTITION BY ${reviews.userId}, ${reviews.wordMeaningId}
          ORDER BY ${reviews.review}, ${reviews.id})`.as("previous_review_ms"),
        })
        .from(reviews)
        .where(and(eq(reviews.userId, userId), lt(reviews.review, to)))
        .as("history");
      return db
        .select()
        .from(history)
        .where(
          and(
            gte(history.review, from),
            eq(history.state, State.Review),
            inArray(history.rating, [
              Rating.Again,
              Rating.Hard,
              Rating.Good,
              Rating.Easy,
            ]),
            sql`${history.retrievabilityBefore} IS NOT NULL`,
            sql`${history.review} - ${history.previousReviewMillis} >= 86400000`,
            options.after
              ? or(
                  gt(history.review, options.after.review),
                  and(
                    eq(history.review, options.after.review),
                    gt(history.id, options.after.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(history.review, history.id)
        .limit(limit);
    },
    async getTopicDueLoad(userId: number, now: Date) {
      dateMillis(now);
      const links = s.wordMeaningTopicTable;
      const weights = db
        .select({
          wordMeaningId: links.wordMeaningId,
          topicId: links.topicId,
          weight:
            sql<number>`${links.relevance} / sum(${links.relevance}) OVER (PARTITION BY ${links.wordMeaningId})`.as(
              "weight",
            ),
        })
        .from(links)
        .as("weights");
      return db
        .select({
          topicId: weights.topicId,
          dueWeight: sql<number>`sum(${weights.weight})`,
          distinctMeanings: sql<number>`count(DISTINCT ${cards.wordMeaningId})`,
        })
        .from(cards)
        .innerJoin(weights, eq(cards.wordMeaningId, weights.wordMeaningId))
        .where(
          and(
            eq(cards.userId, userId),
            inArray(cards.state, [
              State.Learning,
              State.Review,
              State.Relearning,
            ]),
            sql`${cards.due} <= ${now.getTime()}`,
          ),
        )
        .groupBy(weights.topicId)
        .orderBy(weights.topicId);
    },
    async saveReview(
      userId: number,
      wordMeaningId: number,
      expected: UserFsrsData,
      result: RecordLogItem,
      retrievabilityBefore: number | null = null,
    ) {
      dateMillis(result.log.review);
      return db.transaction(async (tx) => {
        const current = await learningCrud(tx).cards.get({
          userId,
          wordMeaningId,
        });
        const fields = [
          "reps",
          "lapses",
          "state",
          "stability",
          "difficulty",
          "elapsedDays",
          "scheduledDays",
          "learningSteps",
        ] as const;
        if (
          !current ||
          current.id !== expected.id ||
          expected.userId !== userId ||
          expected.wordMeaningId !== wordMeaningId ||
          fields.some((key) => current[key] !== expected[key]) ||
          current.due.getTime() !== expected.due.getTime() ||
          current.lastReview?.getTime() !== expected.lastReview?.getTime()
        ) {
          throw new RepositoryConflictError(
            "FSRS card changed; recompute the review",
          );
        }
        const { card, log } = result;
        if (
          log.rating === Rating.Manual ||
          log.state !== current.state ||
          log.stability !== current.stability ||
          log.difficulty !== current.difficulty ||
          card.reps !== current.reps + 1 ||
          card.last_review?.getTime() !== log.review.getTime() ||
          (current.lastReview && log.review < current.lastReview)
        ) {
          throw new TypeError("Result does not match the current FSRS card");
        }
        const [saved] = await tx
          .update(cards)
          .set(fsrsCardValues(card))
          .where(
            and(
              eq(cards.userId, userId),
              eq(cards.wordMeaningId, wordMeaningId),
              eq(cards.reps, expected.reps),
            ),
          )
          .returning();
        if (!saved) throw new RepositoryConflictError("FSRS card changed");
        const [review] = await tx
          .insert(reviews)
          .values({
            userId,
            wordMeaningId,
            rating: log.rating,
            state: log.state,
            due: log.due,
            stability: log.stability,
            difficulty: log.difficulty,
            scheduledDays: log.scheduled_days,
            elapsedDays: log.elapsed_days,
            lastElapsedDays: log.last_elapsed_days,
            learningSteps: log.learning_steps,
            review: log.review,
            retrievabilityBefore:
              current.state === State.New ? null : retrievabilityBefore,
          })
          .returning();
        return { card: saved, review };
      });
    },
  };
}
