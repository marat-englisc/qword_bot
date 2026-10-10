import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const cefrLevels = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

export const cefrLevelTable = sqliteTable(
  "cefr_level",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    value: text("value", { enum: cefrLevels }).notNull().unique(),
  },
  (table) => [
    check(
      "cefr_level_value_check",
      sql`${table.value} IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')`,
    ),
  ],
);
