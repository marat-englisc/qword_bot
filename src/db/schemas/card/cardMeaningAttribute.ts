import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  uniqueIndex,
  text,
} from "drizzle-orm/sqlite-core";
import { attributeTable } from "./attribute";
import { cardMeaningTable } from "./cardMeaning";

export const cardMeaningAttributeTable = sqliteTable(
  "card_meaning_attribute",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    cardMeaningId: integer("card_meaning_id")
      .notNull()
      .references(() => cardMeaningTable.id, {
        onDelete: "cascade",
      }),

    attributeId: integer("attribute_id")
      .notNull()
      .references(() => attributeTable.id, {
        onDelete: "cascade",
      }),

    value: text("value").notNull(),

    createdAt: text("created_at")
      .default(sql`(CURRENT_TIMESTAMP)`)
      .notNull(),

    updatedAt: text("updated_at").$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    uniqueIndex("card_meaning_attribute_unique").on(
      table.cardMeaningId,
      table.attributeId,
      table.value,
    ),
    index("card_meaning_attributes_attribute_index").on(table.attributeId),
  ],
);
