import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { userTable } from "./user";
import { topicTable } from "../card/topic";
import {
  finiteNumber,
  nonNegativeInteger,
  timestampMillis,
} from "../../schemaChecks";

export const userTopicProfileTable = sqliteTable(
  "user_topic_profile",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),

    topicId: integer("topic_id")
      .notNull()
      .references(() => topicTable.id, { onDelete: "cascade" }),

    // Explicit preference. Recall errors must never change interestWeight.
    interestWeight: real("interest_weight").notNull().default(0),

    isBlocked: integer("is_blocked", { mode: "boolean" })
      .notNull()
      .default(false),

    // Regularized offset to global vocabularyAbility, fitted from assessments.
    vocabularyAbilityOffset: real("vocabulary_ability_offset")
      .notNull()
      .default(0),

    assessmentWeight: real("assessment_weight").notNull().default(0),

    // Decayed sum of weight * (actualRecall - retrievabilityBefore).
    recallResidualSum: real("recall_residual_sum").notNull().default(0),

    recallWeight: real("recall_weight").notNull().default(0),

    distinctReviewedMeanings: integer("distinct_reviewed_meanings")
      .notNull()
      .default(0),

    statsUpdatedAt: integer("stats_updated_at", { mode: "timestamp_ms" }),

    updatedAt: text("updated_at").$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.topicId] }),
    index("user_topic_profile_topic_index").on(table.topicId),
    check(
      "user_topic_profile_interest_check",
      sql`${table.interestWeight} BETWEEN -1 AND 1`,
    ),
    check(
      "user_topic_profile_blocked_check",
      sql`${table.isBlocked} IN (0, 1)`,
    ),
    check(
      "user_topic_profile_evidence_check",
      sql`${table.assessmentWeight} >= 0 AND ${finiteNumber(table.assessmentWeight)} AND ${table.recallWeight} >= 0 AND ${finiteNumber(table.recallWeight)} AND ${nonNegativeInteger(table.distinctReviewedMeanings)}`,
    ),
    check(
      "user_topic_profile_residual_check",
      sql`abs(${table.recallResidualSum}) <= ${table.recallWeight} + 0.000001`,
    ),
    check(
      "user_topic_profile_ability_check",
      finiteNumber(table.vocabularyAbilityOffset),
    ),
    check(
      "user_topic_profile_stats_date_check",
      sql`${table.statsUpdatedAt} IS NULL OR ${timestampMillis(table.statsUpdatedAt)}`,
    ),
  ],
);
