import { eq } from "drizzle-orm";
import { db } from "../../config/connection";
import { cardTable } from "../schemas/card/card";
import { deckTable } from "../schemas/card/deck";
import {
  Card,
  CreateCardInput,
  CreateDeckInput,
  Deck,
  UpdateCardInput,
  UpdateDeckInput,
} from "../types";

export async function createDeck(data: CreateDeckInput): Promise<Deck> {
  const [deck] = await db.insert(deckTable).values(data).returning();

  return deck;
}

export async function getAllDecks(): Promise<Deck[]> {
  return db.select().from(deckTable).orderBy(deckTable.id);
}

export async function getDeckById(deckId: number): Promise<Deck | undefined> {
  const [deck] = await db
    .select()
    .from(deckTable)
    .where(eq(deckTable.id, deckId))
    .limit(1);

  return deck;
}

export async function updateDeckById(
  deckId: number,
  data: UpdateDeckInput,
): Promise<Deck | undefined> {
  if (Object.values(data).every((value) => value === undefined)) {
    return getDeckById(deckId);
  }

  const [deck] = await db
    .update(deckTable)
    .set(data)
    .where(eq(deckTable.id, deckId))
    .returning();

  return deck;
}

export const changeDeck = updateDeckById;

export async function deleteDeckById(
  deckId: number,
): Promise<Deck | undefined> {
  const [deck] = await db
    .delete(deckTable)
    .where(eq(deckTable.id, deckId))
    .returning();

  return deck;
}

export async function createCard(data: CreateCardInput): Promise<Card> {
  const [card] = await db.insert(cardTable).values(data).returning();

  return card;
}

export async function getAllCards(): Promise<Card[]> {
  return db.select().from(cardTable).orderBy(cardTable.id);
}

export async function getCardById(cardId: number): Promise<Card | undefined> {
  const [card] = await db
    .select()
    .from(cardTable)
    .where(eq(cardTable.id, cardId))
    .limit(1);

  return card;
}

export async function getDeckCards(deckId: number): Promise<Card[]> {
  return db
    .select()
    .from(cardTable)
    .where(eq(cardTable.deckId, deckId))
    .orderBy(cardTable.id);
}

export async function updateCardById(
  cardId: number,
  data: UpdateCardInput,
): Promise<Card | undefined> {
  if (Object.values(data).every((value) => value === undefined)) {
    return getCardById(cardId);
  }

  const [card] = await db
    .update(cardTable)
    .set(data)
    .where(eq(cardTable.id, cardId))
    .returning();

  return card;
}

export async function deleteCardById(
  cardId: number,
): Promise<Card | undefined> {
  const [card] = await db
    .delete(cardTable)
    .where(eq(cardTable.id, cardId))
    .returning();

  return card;
}
