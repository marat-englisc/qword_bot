import {
  check,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { userTable } from "./user";
import { nonBlankText } from "../../schemaChecks";

export const userSettingsTable = sqliteTable(
  "user_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    userId: integer("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
      }),

    key: text("key").notNull(),

    value: text("value").notNull(),
  },
  (table) => [
    uniqueIndex("user_settings_user_key_unique").on(table.userId, table.key),
    check("user_settings_key_check", nonBlankText(table.key)),
  ],
);
