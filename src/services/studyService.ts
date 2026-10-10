import type { RecommendationService } from "./recommendationService";
import type { FsrsService } from "./fsrsService";
import type { WordRecommendation } from "../db/recommendationTypes";
import { nowFrom, type Clock, type Repositories } from "./common";
import { State } from "ts-fsrs";

export function createStudyService(
  repos: Repositories,
  recommendations: RecommendationService,
  fsrs: FsrsService,
  clock: Clock,
) {
  async function suggestion(row: WordRecommendation) {
    const [meaning] = await repos.catalog.getMeaningDetails([
      row.wordMeaningId,
    ]);
    if (!meaning) throw new Error("Meaning disappeared");
    return { kind: "recommendation" as const, recommendation: row, meaning };
  }
  return {
    async next(userId: number, at?: Date) {
      const now = nowFrom(clock, at);
      const [due] = await repos.learning.getDueCards(userId, now, { limit: 1 });
      const [fresh] = due
        ? []
        : await repos.learning.getNewCards(userId, { limit: 1 });
      const card = due ?? (fresh && fresh.due <= now ? fresh : undefined);
      if (card) {
        const [meaning] = await repos.catalog.getMeaningDetails([
          card.wordMeaningId,
        ]);
        return {
          kind:
            card.state === State.New ? ("new" as const) : ("review" as const),
          card,
          meaning,
          preview: await fsrs.preview(userId, card.wordMeaningId, now),
        };
      }
      const next = await recommendations.next(userId, now);
      if (next.recommendation) return suggestion(next.recommendation);
      const [scheduled] = await repos.learning.getDueCards(
        userId,
        new Date(8.64e15),
        { limit: 1 },
      );
      const times = [scheduled?.due, fresh?.due].filter(
        (date): date is Date => date !== undefined,
      );
      return {
        kind: "idle" as const,
        reason: next.status,
        nextDueAt: times.length
          ? new Date(Math.min(...times.map(Number)))
          : null,
      };
    },
  };
}
