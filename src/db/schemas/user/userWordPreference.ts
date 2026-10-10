import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { userTable } from "./user";
import { wordMeaningTable } from "../card/wordMeaning";
import { timestampMillis } from "../../schemaChecks";

export const wordPreferenceStatuses = ["known", "ignored", "snoozed"] as const;

// User decisions about a meaning that need no artificial FSRS card.
export const userWordPreferenceTable = sqliteTable(
  "user_word_preference",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),

    wordMeaningId: integer("word_meaning_id")
      .notNull()
      .references(() => wordMeaningTable.id, { onDelete: "cascade" }),

    status: text("status", { enum: wordPreferenceStatuses }).notNull(),

    snoozedUntil: integer("snoozed_until", { mode: "timestamp_ms" }),

    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),

    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.wordMeaningId] }),
    index("user_word_preference_meaning_index").on(table.wordMeaningId),
    check(
      "user_word_preference_status_check",
      sql`${table.status} IN ('known', 'ignored', 'snoozed')`,
    ),
    check(
      "user_word_preference_snooze_check",
      sql`(${table.status} = 'snoozed' AND ${table.snoozedUntil} IS NOT NULL) OR (${table.status} <> 'snoozed' AND ${table.snoozedUntil} IS NULL)`,
    ),
    check(
      "user_word_preference_dates_check",
      sql`${timestampMillis(table.createdAt)} AND ${timestampMillis(table.updatedAt)} AND ${table.updatedAt} >= ${table.createdAt} AND (${table.snoozedUntil} IS NULL OR (${timestampMillis(table.snoozedUntil)} AND ${table.snoozedUntil} > ${table.createdAt}))`,
    ),
  ],
);
