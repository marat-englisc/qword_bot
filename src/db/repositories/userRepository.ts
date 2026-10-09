import { eq } from "drizzle-orm";
import { db } from "../../config/connection";
import { userTable } from "../schemas/user/user";
import { CreateUserInput, UpdateUserInput, User } from "../types";

export async function createUser(data: CreateUserInput): Promise<User> {
  const [user] = await db.insert(userTable).values(data).returning();

  return user;
}

export async function getAllUsers(): Promise<User[]> {
  return db.select().from(userTable).orderBy(userTable.id);
}

export async function getUserById(userId: number): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  return user;
}

export async function getUserByTelegramId(
  telegramId: number,
): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.telegramId, telegramId))
    .limit(1);

  return user;
}

export async function updateUserById(
  userId: number,
  data: UpdateUserInput,
): Promise<User | undefined> {
  if (Object.values(data).every((value) => value === undefined)) {
    return getUserById(userId);
  }

  const [user] = await db
    .update(userTable)
    .set(data)
    .where(eq(userTable.id, userId))
    .returning();

  return user;
}

export async function deleteUserById(
  userId: number,
): Promise<User | undefined> {
  const [user] = await db
    .delete(userTable)
    .where(eq(userTable.id, userId))
    .returning();

  return user;
}
