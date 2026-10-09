import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const userTable = sqliteTable("user", {
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
});
