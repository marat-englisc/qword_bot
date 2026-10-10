import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { userTable } from "./user";
import { wordMeaningTable } from "../card/wordMeaning";
import {
  finiteNumber,
  nonBlankText,
  nonNegativeInteger,
  timestampMillis,
} from "../../schemaChecks";

export const recommendationReasons = [
  "level_match",
  "interest",
  "weak_topic",
  "exploration",
] as const;
export const recommendationFeedbacks = [
  "accepted",
  "already_known",
  "skipped",
  "too_difficult",
  "not_interested",
] as const;

export type RecommendationScoreComponents = {
  levelFit: number;
  frequency: number;
  interest: number;
  weakTopic: number;
  overloadPenalty: number;
};

// A generated suggestion is an impression only after shownAt has been set.
export const wordRecommendationTable = sqliteTable(
  "word_recommendation",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    userId: integer("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),

    wordMeaningId: integer("word_meaning_id")
      .notNull()
      .references(() => wordMeaningTable.id, { onDelete: "cascade" }),

    batchId: text("batch_id").notNull(),

    position: integer("position").notNull(),

    algorithmVersion: text("algorithm_version").notNull(),

    reason: text("reason", { enum: recommendationReasons }).notNull(),

    predictedKnownProbability: real("predicted_known_probability").notNull(),

    score: real("score").notNull(),

    scoreComponents: text("score_components", { mode: "json" })
      .$type<RecommendationScoreComponents>()
      .notNull(),
    // Conditional probability of this item at this position under the policy.

    selectionProbability: real("selection_probability").notNull(),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),

    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),

    shownAt: integer("shown_at", { mode: "timestamp_ms" }),

    feedback: text("feedback", { enum: recommendationFeedbacks }),

    feedbackAt: integer("feedback_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("word_recommendation_batch_position_unique").on(
      table.userId,
      table.batchId,
      table.position,
    ),
    uniqueIndex("word_recommendation_batch_meaning_unique").on(
      table.userId,
      table.batchId,
      table.wordMeaningId,
    ),
    index("word_recommendation_user_meaning_shown_index").on(
      table.userId,
      table.wordMeaningId,
      table.shownAt,
    ),
    index("word_recommendation_user_shown_index").on(
      table.userId,
      table.shownAt,
    ),
    index("word_recommendation_meaning_index").on(table.wordMeaningId),
    check(
      "word_recommendation_position_check",
      sql`${nonNegativeInteger(table.position)} AND ${table.position} >= 1`,
    ),
    check(
      "word_recommendation_probability_check",
      sql`${table.predictedKnownProbability} BETWEEN 0 AND 1 AND ${table.selectionProbability} > 0 AND ${table.selectionProbability} <= 1`,
    ),
    check(
      "word_recommendation_reason_check",
      sql`${table.reason} IN ('level_match', 'interest', 'weak_topic', 'exploration')`,
    ),
    check(
      "word_recommendation_feedback_check",
      sql`${table.feedback} IS NULL OR ${table.feedback} IN ('accepted', 'already_known', 'skipped', 'too_difficult', 'not_interested')`,
    ),
    check(
      "word_recommendation_feedback_time_check",
      sql`(${table.feedback} IS NULL AND ${table.feedbackAt} IS NULL) OR (${table.feedback} IS NOT NULL AND ${table.feedbackAt} IS NOT NULL AND ${table.shownAt} IS NOT NULL AND ${table.feedbackAt} >= ${table.shownAt})`,
    ),
    check(
      "word_recommendation_lifetime_check",
      sql`${table.expiresAt} > ${table.createdAt} AND (${table.shownAt} IS NULL OR (${table.shownAt} >= ${table.createdAt} AND ${table.shownAt} <= ${table.expiresAt}))`,
    ),
    check(
      "word_recommendation_components_check",
      sql`json_valid(${table.scoreComponents}) AND json_type(${table.scoreComponents}) = 'object'`,
    ),
    check("word_recommendation_score_check", finiteNumber(table.score)),
    check("word_recommendation_batch_check", nonBlankText(table.batchId)),
    check(
      "word_recommendation_version_check",
      nonBlankText(table.algorithmVersion),
    ),
    check(
      "word_recommendation_dates_check",
      sql`${timestampMillis(table.createdAt)} AND ${timestampMillis(table.expiresAt)} AND (${table.shownAt} IS NULL OR ${timestampMillis(table.shownAt)}) AND (${table.feedbackAt} IS NULL OR ${timestampMillis(table.feedbackAt)})`,
    ),
  ],
);
