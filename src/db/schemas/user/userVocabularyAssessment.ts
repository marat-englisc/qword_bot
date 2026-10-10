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
import { finiteNumber, timestampMillis } from "../../schemaChecks";

export const vocabularyAssessmentSources = [
  "recognition_test",
  "self_report",
] as const;

export type AssessmentTopicWeight = { topicId: number; weight: number };

// One first-exposure observation per user/meaning, BEFORE teaching the answer.
export const userVocabularyAssessmentTable = sqliteTable(
  "user_vocabulary_assessment",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    userId: integer("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),

    wordMeaningId: integer("word_meaning_id")
      .notNull()
      .references(() => wordMeaningTable.id, { onDelete: "cascade" }),

    knewBefore: integer("knew_before", { mode: "boolean" }).notNull(),

    source: text("source", { enum: vocabularyAssessmentSources }).notNull(),

    // Freeze the item's difficulty and normalized topic weights for rebuilding.
    vocabularyDifficulty: real("vocabulary_difficulty").notNull(),

    topicWeights: text("topic_weights", { mode: "json" })
      .$type<AssessmentTopicWeight[]>()
      .notNull()
      .default(sql`'[]'`),

    assessedAt: integer("assessed_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("user_vocabulary_assessment_user_meaning_unique").on(
      table.userId,
      table.wordMeaningId,
    ),
    index("user_vocabulary_assessment_user_time_index").on(
      table.userId,
      table.assessedAt,
    ),
    index("user_vocabulary_assessment_meaning_index").on(table.wordMeaningId),
    check(
      "user_vocabulary_assessment_knew_check",
      sql`${table.knewBefore} IN (0, 1)`,
    ),
    check(
      "user_vocabulary_assessment_source_check",
      sql`${table.source} IN ('recognition_test', 'self_report')`,
    ),
    check(
      "user_vocabulary_assessment_topics_check",
      sql`json_valid(${table.topicWeights}) AND json_type(${table.topicWeights}) = 'array'`,
    ),
    check(
      "user_vocabulary_assessment_difficulty_check",
      finiteNumber(table.vocabularyDifficulty),
    ),
    check(
      "user_vocabulary_assessment_date_check",
      timestampMillis(table.assessedAt),
    ),
  ],
);
