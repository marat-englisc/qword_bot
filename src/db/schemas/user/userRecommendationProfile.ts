import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { userTable } from "./user";
import { cefrLevelTable } from "../card/cefrLevel";
import {
  finiteNumber,
  nonBlankText,
  nonNegativeInteger,
  timestampMillis,
} from "../../schemaChecks";

export const userRecommendationProfileTable = sqliteTable(
  "user_recommendation_profile",
  {
    userId: integer("user_id")
      .primaryKey()
      .references(() => userTable.id, { onDelete: "cascade" }),

    selfReportedCefrLevelId: integer("self_reported_cefr_level_id").references(
      () => cefrLevelTable.id,
      { onDelete: "set null" },
    ),

    // Rebuildable estimates from pre-learning assessments, on the same logit scale.
    vocabularyAbility: real("vocabulary_ability").notNull().default(-2),

    assessmentWeight: real("assessment_weight").notNull().default(0),

    dailyNewMeaningLimit: integer("daily_new_meaning_limit")
      .notNull()
      .default(10),

    // IANA time zone; validate with Intl.DateTimeFormat in the application.
    timezone: text("timezone").notNull().default("UTC"),

    explorationRate: real("exploration_rate").notNull().default(0.1),

    algorithmVersion: text("algorithm_version").notNull().default("content-v1"),

    statsUpdatedAt: integer("stats_updated_at", { mode: "timestamp_ms" }),

    updatedAt: text("updated_at").$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index("user_recommendation_profile_cefr_index").on(
      table.selfReportedCefrLevelId,
    ),
    check(
      "user_recommendation_profile_assessment_weight_check",
      sql`${table.assessmentWeight} >= 0 AND ${finiteNumber(table.assessmentWeight)}`,
    ),
    check(
      "user_recommendation_profile_daily_limit_check",
      nonNegativeInteger(table.dailyNewMeaningLimit),
    ),
    check(
      "user_recommendation_profile_exploration_check",
      sql`${table.explorationRate} BETWEEN 0 AND 1`,
    ),
    check(
      "user_recommendation_profile_ability_check",
      finiteNumber(table.vocabularyAbility),
    ),
    check(
      "user_recommendation_profile_timezone_check",
      nonBlankText(table.timezone),
    ),
    check(
      "user_recommendation_profile_version_check",
      nonBlankText(table.algorithmVersion),
    ),
    check(
      "user_recommendation_profile_stats_date_check",
      sql`${table.statsUpdatedAt} IS NULL OR ${timestampMillis(table.statsUpdatedAt)}`,
    ),
  ],
);
