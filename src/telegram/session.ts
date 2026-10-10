import { randomBytes } from "node:crypto";
import type { UserFsrsData } from "../db/types";
import type { Repositories } from "../services/common";

export const SESSION_KEY = "telegram.session.v1";
export const ONBOARDING_KEY = "telegram.onboarding.v1";
type Base = { nonce: string; messageId: number | null };

export type Session = Base &
  (
    | { screen: "menu" | "settings" | "stats" | "help" }
    | { screen: "level" | "timezone"; onboarding: boolean }
    | { screen: "input"; field: "timezone" | "limit"; onboarding: boolean }
    | { screen: "retention" }
    | { screen: "topics"; page: number; onboarding: boolean }
    | { screen: "recommendation"; recommendationId: number; meaningId: number }
    | { screen: "card"; expected: UserFsrsData; revealed: boolean }
    | { screen: "done"; text: string; next: "study" | "new" }
  );

export type Screen = Session extends infer S
  ? S extends Session
    ? Omit<S, keyof Base>
    : never
  : never;

export function newSession(screen: Screen): Session {
  return {
    ...screen,
    nonce: randomBytes(9).toString("base64url"),
    messageId: null,
  };
}
export function callback(
  session: Session,
  action: string,
  arg?: string | number,
) {
  const data = `q:${session.nonce}:${action}${arg === undefined ? "" : `:${arg}`}`;
  if (Buffer.byteLength(data) > 64)
    throw new RangeError("Callback exceeds Telegram limit");
  return data;
}

export function parseCallback(data: string) {
  const match = /^q:([A-Za-z0-9_-]{12}):([a-z]+)(?::([A-Za-z0-9_/-]+))?$/.exec(
    data,
  );
  return match
    ? { nonce: match[1], action: match[2], arg: match[3] }
    : undefined;
}

export function createSessionStore(repos: Repositories) {
  return {
    async get(userId: number): Promise<Session | undefined> {
      const row = await repos.users.settings.get({ userId, key: SESSION_KEY });
      if (!row) return undefined;
      try {
        const state = JSON.parse(row.value);
        if (
          !state ||
          !/^[A-Za-z0-9_-]{12}$/.test(state.nonce) ||
          !(
            state.messageId === null ||
            (Number.isSafeInteger(state.messageId) && state.messageId > 0)
          )
        )
          return undefined;
        if (
          ![
            "menu",
            "settings",
            "stats",
            "help",
            "level",
            "timezone",
            "input",
            "retention",
            "topics",
            "recommendation",
            "card",
            "done",
          ].includes(state.screen)
        )
          return undefined;
        if (state.screen === "card") {
          const card = state.expected;
          if (
            !card ||
            card.userId !== userId ||
            !Number.isSafeInteger(card.wordMeaningId) ||
            typeof state.revealed !== "boolean"
          )
            return undefined;
          for (const key of ["due", "lastReview", "introducedAt"] as const) {
            if (card[key] === null && key !== "due") continue;
            if (typeof card[key] !== "string") return undefined;
            card[key] = new Date(card[key]);
            if (!Number.isSafeInteger(+card[key]) || +card[key] < 0)
              return undefined;
          }
          for (const key of [
            "id",
            "stability",
            "difficulty",
            "elapsedDays",
            "scheduledDays",
            "learningSteps",
            "reps",
            "lapses",
            "state",
          ])
            if (!Number.isFinite(card[key])) return undefined;
        }
        if (
          state.screen === "recommendation" &&
          (!Number.isSafeInteger(state.recommendationId) ||
            !Number.isSafeInteger(state.meaningId))
        )
          return undefined;
        if (
          state.screen === "topics" &&
          (!Number.isSafeInteger(state.page) || state.page < 0)
        )
          return undefined;
        if (
          state.screen === "input" &&
          !["timezone", "limit"].includes(state.field)
        )
          return undefined;
        if (
          ["level", "timezone", "input", "topics"].includes(state.screen) &&
          typeof state.onboarding !== "boolean"
        )
          return undefined;
        if (
          state.screen === "done" &&
          (typeof state.text !== "string" ||
            !["study", "new"].includes(state.next))
        )
          return undefined;
        return state as Session;
      } catch {
        return undefined;
      }
    },
    async save(userId: number, session: Session) {
      await repos.users.setSetting(
        userId,
        SESSION_KEY,
        JSON.stringify(session),
      );
    },
    async clear(userId: number) {
      await repos.users.settings.delete({ userId, key: SESSION_KEY });
    },
  };
}
