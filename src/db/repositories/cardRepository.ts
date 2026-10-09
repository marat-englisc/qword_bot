import { db } from "../../config/connection";
import { deckTable } from "../schemas/card/deck";
import { eq } from "drizzle-orm";
import { userDeckTable } from "../schemas/user/userDeck";

export async function getAllDecks() {
  return db.select().from(deckTable).orderBy(deckTable.id);
}

export async function getDeckById(deckId: number) {
  const [deck] = await db
    .select()
    .from(deckTable)
    .where(eq(deckTable.id, deckId))
    .limit(1);

  return deck;
}

export async function changeDeck() {}

export async function deleteDeckById(deckId: number) {
  return db.delete(userDeckTable).where(eq(userDeckTable.deckId, deckId));
}

export async function getDeckCards(deckId: number) {}
