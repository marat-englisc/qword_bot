import type * as schema from "./schema";
import type { CreateInput, UpdateInput } from "./repositories/core";

export type User = typeof schema.userTable.$inferSelect;
export type CreateUserInput = CreateInput<typeof schema.userTable>;
export type UpdateUserInput = UpdateInput<typeof schema.userTable, "id">;
export type Word = typeof schema.wordTable.$inferSelect;
export type CreateWordInput = CreateInput<typeof schema.wordTable>;
export type UpdateWordInput = UpdateInput<typeof schema.wordTable, "id">;
export type WordMeaning = typeof schema.wordMeaningTable.$inferSelect;
export type CreateWordMeaningInput = CreateInput<
  typeof schema.wordMeaningTable
>;
export type UpdateWordMeaningInput = UpdateInput<
  typeof schema.wordMeaningTable,
  "id"
>;
export type UserFsrsData = typeof schema.userFsrsDataTable.$inferSelect;
export type UserFsrsReview = typeof schema.userFsrsReviewTable.$inferSelect;
export type CreateUserFsrsDataInput = CreateInput<
  typeof schema.userFsrsDataTable
>;
export type CreateUserFsrsReviewInput = CreateInput<
  typeof schema.userFsrsReviewTable
>;
export type UpdateUserFsrsDataInput = UpdateInput<
  typeof schema.userFsrsDataTable,
  "userId" | "wordMeaningId"
>;
export type UpdateUserFsrsReviewInput = UpdateInput<
  typeof schema.userFsrsReviewTable,
  "userId" | "id"
>;
export type WordMeaningExample =
  typeof schema.wordMeaningExampleTable.$inferSelect;
export type CreateWordMeaningExampleInput = CreateInput<
  typeof schema.wordMeaningExampleTable
>;
export type UpdateWordMeaningExampleInput = UpdateInput<
  typeof schema.wordMeaningExampleTable,
  "id"
>;
export type CefrLevel = typeof schema.cefrLevelTable.$inferSelect;
export type CreateCefrLevelInput = CreateInput<typeof schema.cefrLevelTable>;
export type UpdateCefrLevelInput = UpdateInput<
  typeof schema.cefrLevelTable,
  "id"
>;
export type PartOfSpeech = typeof schema.partOfSpeechTable.$inferSelect;
export type CreatePartOfSpeechInput = CreateInput<
  typeof schema.partOfSpeechTable
>;
export type UpdatePartOfSpeechInput = UpdateInput<
  typeof schema.partOfSpeechTable,
  "id"
>;
export type UserSettings = typeof schema.userSettingsTable.$inferSelect;
export type CreateUserSettingsInput = CreateInput<
  typeof schema.userSettingsTable
>;
export type UpdateUserSettingsInput = UpdateInput<
  typeof schema.userSettingsTable,
  "userId" | "key"
>;
/** @deprecated Use Word and CreateWordInput/UpdateWordInput. */
export type Card = Word;
export type CreateCardInput = CreateWordInput;
export type UpdateCardInput = UpdateWordInput;
export type * from "./recommendationTypes";
