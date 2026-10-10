import { checkParameters, default_w, fsrs, generatorParameters, Rating, State, type FSRSParameters, type Grade } from "ts-fsrs";
import { RepositoryConflictError } from "../db/repositories";
import type { UserFsrsData } from "../db/types";
import { nowFrom, type Clock, type Repositories } from "./common";

const SETTINGS_KEY = "fsrs.parameters.v1";
const GRADES = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const;
export function normalizeFsrsParameters(input: Partial<FSRSParameters>): FSRSParameters {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("FSRS parameters must be an object");
  const allowed = new Set(["request_retention", "maximum_interval", "w", "enable_fuzz", "enable_short_term", "learning_steps", "relearning_steps"]);
  if (Object.keys(input).some(key => !allowed.has(key))) throw new TypeError("Unknown FSRS parameter");
  if (input.request_retention !== undefined && (!Number.isFinite(input.request_retention) || input.request_retention <= 0 || input.request_retention >= 1)) {
    throw new RangeError("request_retention must be between 0 and 1");
  }
  if (input.maximum_interval !== undefined && (!Number.isInteger(input.maximum_interval) || input.maximum_interval < 1 || input.maximum_interval > 36500)) {
    throw new RangeError("maximum_interval must be 1..36500 days");
  }
  for (const key of ["enable_fuzz", "enable_short_term"] as const) {
    if (input[key] !== undefined && typeof input[key] !== "boolean") throw new TypeError("Invalid FSRS boolean");
  }
  for (const key of ["learning_steps", "relearning_steps"] as const) {
    if (input[key] !== undefined && (!Array.isArray(input[key]) ||
        input[key]!.some(step => typeof step !== "string" || !/^(?:\d+(?:\.\d+)?)[mhd]$/.test(step) ||
          !Number.isFinite(Number(step.slice(0, -1))) || Number(step.slice(0, -1)) <= 0))) throw new TypeError("Invalid FSRS learning steps");
  }
  if (input.w !== undefined && (!Array.isArray(input.w) || input.w.length !== 21)) throw new TypeError("FSRS 6 requires 21 weights");
  checkParameters(input.w ?? default_w);
  // generatorParameters applies the library's supported parameter bounds.
  const result = generatorParameters(input);
  return { ...result, w: [...result.w], learning_steps: [...result.learning_steps], relearning_steps: [...result.relearning_steps] };
}
export function createFsrsService(repos: Repositories, clock: Clock, defaults: Partial<FSRSParameters> = {}) {
  const base = normalizeFsrsParameters(defaults);
  async function getParameters(userId: number) {
    const setting = await repos.users.settings.get({ userId, key: SETTINGS_KEY });
    return setting ? normalizeFsrsParameters(JSON.parse(setting.value)) : normalizeFsrsParameters(base);
  }
  async function scheduler(userId: number) { return fsrs(await getParameters(userId)); }
  function validateCardTime(row: UserFsrsData, now: Date) {
    if (row.lastReview && now < row.lastReview) throw new RangeError("Review precedes the previous answer");
  }
  return {
    getParameters,
    addMeaning: (userId: number, wordMeaningId: number, at?: Date) =>
      repos.learning.startLearning(userId, wordMeaningId, nowFrom(clock, at)),
    async configure(userId: number, patch: Partial<FSRSParameters>) {
      // Explicit undefined values do not reset an existing setting.
      const values = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
      const parameters = normalizeFsrsParameters({ ...await getParameters(userId), ...values });
      await repos.users.setSetting(userId, SETTINGS_KEY, JSON.stringify(parameters));
      return parameters;
    },
    async preview(userId: number, wordMeaningId: number, at?: Date) {
      const now = nowFrom(clock, at), row = await repos.learning.cards.get({ userId, wordMeaningId });
      if (!row) return undefined;
      validateCardTime(row, now);
      const engine = await scheduler(userId), card = repos.learning.toFsrsCard(row), preview = engine.repeat(card, now);
      return { card: row, retrievability: row.state === State.New ? null : engine.get_retrievability(card, now, false),
        options: GRADES.map(rating => ({ rating, due: preview[rating].card.due,
          scheduledDays: preview[rating].card.scheduled_days, state: preview[rating].card.state })) };
    },
    async answer(userId: number, wordMeaningId: number, rating: Grade, expected: UserFsrsData, at?: Date) {
      if (!GRADES.includes(rating)) throw new TypeError("Choose Again, Hard, Good or Easy");
      if (expected.userId !== userId || expected.wordMeaningId !== wordMeaningId) throw new RepositoryConflictError("Card belongs to another user or meaning");
      const now = nowFrom(clock, at);
      validateCardTime(expected, now);
      if (expected.due > now) throw new RepositoryConflictError("Card is not due yet");
      const engine = await scheduler(userId), card = repos.learning.toFsrsCard(expected);
      const R = expected.state === State.New ? null : engine.get_retrievability(card, now, false);
      const result = engine.next(card, now, rating);
      return repos.learning.saveReview(userId, wordMeaningId, expected, result, R);
    },
  };
}
export type FsrsService = ReturnType<typeof createFsrsService>;
