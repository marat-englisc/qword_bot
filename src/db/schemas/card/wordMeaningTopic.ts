import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
} from "drizzle-orm/sqlite-core";
import { wordMeaningTable } from "./wordMeaning";
import { topicTable } from "./topic";

export const wordMeaningTopicTable = sqliteTable(
  "word_meaning_topic",
  {
    wordMeaningId: integer("word_meaning_id")
      .notNull()
      .references(() => wordMeaningTable.id, { onDelete: "cascade" }),

    topicId: integer("topic_id")
      .notNull()
      .references(() => topicTable.id, { onDelete: "cascade" }),
    // Normalize these weights across a meaning's topics before scoring/updating.

    relevance: real("relevance").notNull().default(1),
  },
  (table) => [
    primaryKey({ columns: [table.wordMeaningId, table.topicId] }),
    index("word_meaning_topic_topic_index").on(
      table.topicId,
      table.wordMeaningId,
    ),
    check(
      "word_meaning_topic_relevance_check",
      sql`${table.relevance} > 0 AND ${table.relevance} <= 1`,
    ),
  ],
);
