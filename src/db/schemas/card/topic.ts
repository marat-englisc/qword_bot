import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nonBlankText } from "../../schemaChecks";

export const topicTable = sqliteTable(
  "topic",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    slug: text("slug").notNull().unique(),

    name: text("name").notNull(),

    description: text("description"),
  },
  (table) => [
    check("topic_name_check", nonBlankText(table.name)),
    check(
      "topic_slug_check",
      sql`length(${table.slug}) > 0 AND ${table.slug} NOT GLOB '*[^a-z0-9-]*' AND ${table.slug} NOT LIKE '-%' AND ${table.slug} NOT LIKE '%-'`,
    ),
  ],
);
