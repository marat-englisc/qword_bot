import { eq } from "drizzle-orm";
import * as s from "../schema";
import {
  createCrudRepository,
  type Database,
  type Executor,
  type Page,
} from "./core";
import type { CreateUserInput, UpdateUserInput } from "../types";

export function userCrud(db: Executor) {
  return {
    users: createCrudRepository(db, s.userTable, ["id"], []),
    settings: createCrudRepository(
      db,
      s.userSettingsTable,
      ["userId", "key"],
      ["userId"],
    ),
    profiles: createCrudRepository(
      db,
      s.userRecommendationProfileTable,
      ["userId"],
      ["userId"],
    ),
    topicProfiles: createCrudRepository(
      db,
      s.userTopicProfileTable,
      ["userId", "topicId"],
      ["userId"],
    ),
  };
}

export function createUserRepository(db: Database) {
  return {
    ...userCrud(db),
    async getByTelegramId(telegramId: number) {
      const [row] = await db
        .select()
        .from(s.userTable)
        .where(eq(s.userTable.telegramId, telegramId));
      return row;
    },
    async ensureProfile(userId: number) {
      await db
        .insert(s.userRecommendationProfileTable)
        .values({ userId })
        .onConflictDoNothing();
      const [profile] = await db
        .select()
        .from(s.userRecommendationProfileTable)
        .where(eq(s.userRecommendationProfileTable.userId, userId));
      return profile;
    },
    async setSetting(userId: number, key: string, value: string) {
      const [row] = await db
        .insert(s.userSettingsTable)
        .values({ userId, key, value })
        .onConflictDoUpdate({
          target: [s.userSettingsTable.userId, s.userSettingsTable.key],
          set: { value },
        })
        .returning();
      return row;
    },
    async setTopicPreference(
      userId: number,
      topicId: number,
      preference: { interestWeight?: number; isBlocked?: boolean },
    ) {
      const set = {
        interestWeight: preference.interestWeight,
        isBlocked: preference.isBlocked,
      };
      // Never overwrite learned statistics when explicit preferences change.
      return db.transaction(async (tx) => {
        await tx
          .insert(s.userTopicProfileTable)
          .values({ userId, topicId })
          .onConflictDoNothing();
        return userCrud(tx).topicProfiles.update({ userId, topicId }, set);
      });
    },
  };
}

// Lazy imports keep factory-based tests/tools independent of .env and the live DB.
async function defaultRepository() {
  const { db } = await import("../../config/connection.js");
  return createUserRepository(db);
}
export async function createUser(data: CreateUserInput) {
  return (await defaultRepository()).users.create(data);
}
export async function getAllUsers(page?: Page) {
  return (await defaultRepository()).users.list({}, page);
}
export async function getUserById(userId: number) {
  return (await defaultRepository()).users.get({ id: userId });
}
export async function getUserByTelegramId(telegramId: number) {
  return (await defaultRepository()).getByTelegramId(telegramId);
}
export async function updateUserById(userId: number, data: UpdateUserInput) {
  return (await defaultRepository()).users.update({ id: userId }, data);
}
export async function deleteUserById(userId: number) {
  return (await defaultRepository()).users.delete({ id: userId });
}
