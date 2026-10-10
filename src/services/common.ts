import { dateMillis } from "../db/repositories/core";
import type { createRepositories } from "../db/repositories";
export type Repositories = ReturnType<typeof createRepositories>;
export type Clock = () => Date;
export const DAY = 86_400_000;
export const RECOMMENDATION_VERSION = "content-v1";

export function nowFrom(clock: Clock, at?: Date) {
  const now = new Date((at ?? clock()).getTime());
  dateMillis(now);
  return now;
}

export function countLimit(count: number, max = 500) {
  if (!Number.isInteger(count) || count < 1 || count > max)
    throw new RangeError("Invalid count");
  return count;
}

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function sigmoid(x: number) {
  return x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
}

export function softplus(x: number) {
  return Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x)));
}

export function createUserLock() {
  const tails = new Map<number, Promise<unknown>>();
  return async function withUserLock<T>(
    userId: number,
    task: () => Promise<T>,
  ): Promise<T> {
    const next = (tails.get(userId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(task);
    tails.set(userId, next);
    try {
      return await next;
    } finally {
      if (tails.get(userId) === next) tails.delete(userId);
    }
  };
}

export type UserLock = ReturnType<typeof createUserLock>;
