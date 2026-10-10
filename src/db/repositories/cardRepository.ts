/** @deprecated Use createCatalogRepository from catalogRepository. */
import { createCatalogRepository } from "./catalogRepository";
import type { CreateWordInput, UpdateWordInput } from "../types";
import type { Page } from "./core";
export { createCatalogRepository } from "./catalogRepository";

async function repository() {
  const { db } = await import("../../config/connection.js");
  return createCatalogRepository(db);
}

export async function createWord(data: CreateWordInput) {
  return (await repository()).words.create(data);
}

export async function getAllWords(page?: Page) {
  return (await repository()).words.list({}, page);
}

export async function getWordById(id: number) {
  return (await repository()).words.get({ id });
}

export async function updateWordById(id: number, data: UpdateWordInput) {
  return (await repository()).words.update({ id }, data);
}

export async function deleteWordById(id: number) {
  return (await repository()).words.delete({ id });
}

export async function getFullWordInfo(id: number) {
  return (await repository()).getFullWordInfo(id);
}

export const createCard = createWord;
export const getAllCards = getAllWords;
export const getCardById = getWordById;
export const updateCardById = updateWordById;
export const deleteCardById = deleteWordById;
