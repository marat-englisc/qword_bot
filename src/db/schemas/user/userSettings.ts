import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { userTable } from "./user";

export const appSettingsTable = sqliteTable("app_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  userId: integer("user_id")
    .notNull()
    .references(() => userTable.id, {
      onDelete: "cascade",
    }),

  value: text("value").notNull(),
});
