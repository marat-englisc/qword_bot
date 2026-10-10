import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { nonNegativeInteger } from "../../schemaChecks";

export const userTable = sqliteTable(
  "user",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    telegramId: integer("telegram_id").notNull().unique(),

    username: text("username"),

    firstName: text("first_name"),

    lastName: text("last_name"),

    isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),

    updatedAt: text("updated_at").$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    check(
      "user_telegram_id_check",
      sql`${nonNegativeInteger(table.telegramId)} AND ${table.telegramId} BETWEEN 1 AND 9007199254740991`,
    ),
    check("user_is_admin_check", sql`${table.isAdmin} IN (0, 1)`),
  ],
);
