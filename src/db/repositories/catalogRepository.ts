import { eq, getTableColumns, inArray, sql } from "drizzle-orm";
import * as s from "../schema";
import { createCrudRepository, type Database, type Executor } from "./core";

export function catalogCrud(db: Executor) {
  return {
    words: createCrudRepository(db, s.wordTable, ["id"], []),
    meanings: createCrudRepository(db, s.wordMeaningTable, ["id"], []),
    examples: createCrudRepository(db, s.wordMeaningExampleTable, ["id"], []),
    cefrLevels: createCrudRepository(db, s.cefrLevelTable, ["id"], []),
    partsOfSpeech: createCrudRepository(db, s.partOfSpeechTable, ["id"], []),
    topics: createCrudRepository(db, s.topicTable, ["id"], []),
    meaningTopics: createCrudRepository(
      db,
      s.wordMeaningTopicTable,
      ["wordMeaningId", "topicId"],
      [],
    ),
  };
}

export const meaningDifficulty = sql<number>`coalesce(${s.wordMeaningTable.vocabularyDifficulty},
  CASE ${s.cefrLevelTable.value}
    WHEN 'A1' THEN -2 WHEN 'A2' THEN -1 WHEN 'B1' THEN 0
    WHEN 'B2' THEN 1 WHEN 'C1' THEN 2 WHEN 'C2' THEN 3 END)`;

/** Batched queries avoid Cartesian products of examples and topics. */
export async function loadMeaningDetails(db: Executor, ids: number[]) {
  if (!ids.length) return [];
  if (ids.length > 500)
    throw new RangeError("At most 500 meanings per request");
  const rows = await db
    .select({
      ...getTableColumns(s.wordMeaningTable),
      word: getTableColumns(s.wordTable),
      cefrLevel: s.cefrLevelTable.value,
      partOfSpeech: s.partOfSpeechTable.value,
      effectiveDifficulty: meaningDifficulty,
    })
    .from(s.wordMeaningTable)
    .innerJoin(s.wordTable, eq(s.wordMeaningTable.wordId, s.wordTable.id))
    .innerJoin(
      s.cefrLevelTable,
      eq(s.wordMeaningTable.cefrLevelId, s.cefrLevelTable.id),
    )
    .innerJoin(
      s.partOfSpeechTable,
      eq(s.wordMeaningTable.partOfSpeechId, s.partOfSpeechTable.id),
    )
    .where(inArray(s.wordMeaningTable.id, ids))
    .orderBy(s.wordMeaningTable.id);
  const examples = await db
    .select()
    .from(s.wordMeaningExampleTable)
    .where(inArray(s.wordMeaningExampleTable.wordMeaningId, ids))
    .orderBy(s.wordMeaningExampleTable.id);
  const links = await db
    .select({
      wordMeaningId: s.wordMeaningTopicTable.wordMeaningId,
      relevance: s.wordMeaningTopicTable.relevance,
      topic: getTableColumns(s.topicTable),
    })
    .from(s.wordMeaningTopicTable)
    .innerJoin(
      s.topicTable,
      eq(s.wordMeaningTopicTable.topicId, s.topicTable.id),
    )
    .where(inArray(s.wordMeaningTopicTable.wordMeaningId, ids))
    .orderBy(s.wordMeaningTopicTable.topicId);
  return rows.map((row) => {
    const topics = links.filter((link) => link.wordMeaningId === row.id);
    const total = topics.reduce((sum, link) => sum + link.relevance, 0);
    return {
      ...row,
      examples: examples.filter((example) => example.wordMeaningId === row.id),
      topics: topics.map((link) => ({
        ...link.topic,
        relevance: link.relevance,
        weight: link.relevance / total,
      })),
    };
  });
}

export function createCatalogRepository(db: Database) {
  const crud = catalogCrud(db);
  return {
    ...crud,
    async getTopicsByIds(ids: number[]) {
      if (!ids.length) return [];
      if (ids.length > 500) throw new RangeError("At most 500 topics per request");
      return db.select().from(s.topicTable).where(inArray(s.topicTable.id, ids)).orderBy(s.topicTable.id);
    },
    getMeaningDetails: (ids: number[]) =>
      db.transaction((tx) => loadMeaningDetails(tx, ids)),
    async getFullWordInfo(wordId: number) {
      return db.transaction(async (tx) => {
        const word = await catalogCrud(tx).words.get({ id: wordId });
        if (!word) return undefined;
        const meanings = await tx
          .select({ id: s.wordMeaningTable.id })
          .from(s.wordMeaningTable)
          .where(eq(s.wordMeaningTable.wordId, wordId))
          .orderBy(s.wordMeaningTable.id);
        // A word can have more than 500 meanings in imported dictionaries.
        const details: Awaited<ReturnType<typeof loadMeaningDetails>> = [];
        for (let offset = 0; offset < meanings.length; offset += 500) {
          details.push(
            ...(await loadMeaningDetails(
              tx,
              meanings.slice(offset, offset + 500).map((row) => row.id),
            )),
          );
        }
        return { ...word, meanings: details };
      });
    },
    async replaceMeaningTopics(
      wordMeaningId: number,
      topics: { topicId: number; relevance?: number }[],
    ) {
      if (
        new Set(topics.map((topic) => topic.topicId)).size !== topics.length
      ) {
        throw new TypeError("Duplicate topic");
      }
      return db.transaction(async (tx) => {
        const [meaning] = await tx
          .select()
          .from(s.wordMeaningTable)
          .where(eq(s.wordMeaningTable.id, wordMeaningId));
        if (!meaning) throw new Error("Meaning not found");
        await tx
          .delete(s.wordMeaningTopicTable)
          .where(eq(s.wordMeaningTopicTable.wordMeaningId, wordMeaningId));
        for (const topic of topics)
          await tx
            .insert(s.wordMeaningTopicTable)
            .values({ wordMeaningId, ...topic });
        return tx
          .select()
          .from(s.wordMeaningTopicTable)
          .where(eq(s.wordMeaningTopicTable.wordMeaningId, wordMeaningId))
          .orderBy(s.wordMeaningTopicTable.topicId);
      });
    },
  };
}
