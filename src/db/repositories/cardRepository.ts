import { eq, inArray } from "drizzle-orm";
import { db } from "../../config/connection";
import { cardTable } from "../schemas/card/word";
import { deckTable } from "../schemas/card/deck";
import {
  Card,
  CreateCardInput,
  CreateDeckInput,
  Deck,
  UpdateCardInput,
  UpdateDeckInput,
} from "../types";
import { cardMeaningTable } from "../schemas/card/wordMeaning";
import { cardExampleTable } from "../schemas/card/wordMeaningExample";
import { cardMeaningAttributeTable } from "../schemas/card/wordMeaningAttribute";
import { attributeTable } from "../schemas/card/attribute";

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

export async function getCardById(cardId: number) {
  const [card] = await db
    .select()
    .from(cardTable)
    .where(eq(cardTable.id, cardId))
    .limit(1);

  return card;
}

//
// Получение всё информации слова для словаря
//
export async function getFullWordInfo(cardId: number) {
  const [card] = await db
    .select()
    .from(cardTable)
    .where(eq(cardTable.id, cardId))
    .limit(1);

  if (!card) {
    return null;
  }

  const meanings = await db
    .select()
    .from(cardMeaningTable)
    .where(eq(cardMeaningTable.cardId, cardId));

  const meaningIds = meanings.map((meaning) => meaning.id);

  const attributes =
    meaningIds.length > 0
      ? await db
          .select()
          .from(cardMeaningAttributeTable)
          .where(inArray(cardMeaningAttributeTable.cardMeaningId, meaningIds))
      : [];

  const attributeIds = [
    ...new Set(attributes.map((attribute) => attribute.attributeId)),
  ];

  const attributeDefinitions =
    attributeIds.length > 0
      ? await db
          .select()
          .from(attributeTable)
          .where(inArray(attributeTable.id, attributeIds))
      : [];

  const examples =
    meaningIds.length > 0
      ? await db
          .select()
          .from(cardExampleTable)
          .where(inArray(cardExampleTable.cardMeaningId, meaningIds))
      : [];

  return {
    id: card.id,
    card_title: card.title,
    transcription: card.transcription,
    audio_url: card.audioUrl,

    meanings: meanings.map((meaning) => ({
      id: meaning.id,
      hint: meaning.hint,
      meaning: meaning.meaning,
      meaning_translation: meaning.meaningTranslation,

      attributes: attributes
        .filter((attribute) => attribute.cardMeaningId === meaning.id)
        .map((attribute) => ({
          id: attribute.id,
          attribute: attributeDefinitions.find(
            (item) => item.id === attribute.attributeId,
          )?.name,
          value: attribute.value,
        })),

      examples: examples
        .filter((example) => example.cardMeaningId === meaning.id)
        .map((example) => {
          return {
            id: example.id,
            example: example.example,
            example_translation: example.exampleTranslation,
          };
        }),
    })),
  };
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
