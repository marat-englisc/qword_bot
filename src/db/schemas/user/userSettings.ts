import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { userTable } from "./user";

export const userSettingsTable = sqliteTable(
  "user_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    userId: integer("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
      }),

    value: text("value").notNull(),
  },
  (table) => [index("user_settings_user_id_index").on(table.userId)],
);
