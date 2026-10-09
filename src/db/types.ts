import { cardTable } from "./schemas/card/card";
import { deckTable } from "./schemas/card/deck";
import { userTable } from "./schemas/user/user";

export type Deck = typeof deckTable.$inferSelect;

export type CreateDeckInput = Pick<typeof deckTable.$inferInsert, "name">;

export type UpdateDeckInput = Partial<CreateDeckInput>;

export type Card = typeof cardTable.$inferSelect;

export type CreateCardInput = Pick<
  typeof cardTable.$inferInsert,
  "deckId" | "title" | "transcription" | "audioUrl"
>;
export type UpdateCardInput = Partial<CreateCardInput>;

export type User = typeof userTable.$inferSelect;

export type CreateUserInput = Pick<
  typeof userTable.$inferInsert,
  "telegramId" | "username" | "firstName" | "lastName" | "isAdmin"
>;

export type UpdateUserInput = Partial<CreateUserInput>;
