import { Rating } from "ts-fsrs";
import { clamp, DAY } from "../common";
import { localDayKey } from "../localDay";
type RecallEvent = {
  id: number;
  wordMeaningId: number;
  review: Date;
  rating: number;
  retrievabilityBefore: number | null;
};
type TopicWeight = { id: number; weight: number };

export function recallStatistics(
  events: RecallEvent[],
  topicsByMeaning: Map<number, TopicWeight[]>,
  timezone: string,
  now: Date,
) {
  const seen = new Set<string>();
  const groups = new Map<number, { d: number; residual: number }[]>();
  for (const event of [...events].sort(
    (a, b) => +a.review - +b.review || a.id - b.id,
  )) {
    if (
      ![Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].includes(
        event.rating,
      ) ||
      event.retrievabilityBefore === null ||
      event.review > now ||
      +event.review < +now - 90 * DAY
    )
      continue;
    const key = event.wordMeaningId + ":" + localDayKey(event.review, timezone);
    if (seen.has(key)) continue;
    seen.add(key);
    const rows = groups.get(event.wordMeaningId) ?? [];
    rows.push({
      d: 2 ** (-(+now - +event.review) / DAY / 30),
      residual:
        (event.rating === Rating.Again ? 0 : 1) - event.retrievabilityBefore,
    });
    groups.set(event.wordMeaningId, rows);
  }
  let residualSum = 0,
    recallWeight = 0;
  const topics = new Map<
    number,
    { recallResidualSum: number; recallWeight: number; meanings: Set<number> }
  >();
  for (const [meaningId, events] of groups) {
    const scale = Math.min(
      1,
      3 / events.reduce((sum, event) => sum + event.d, 0),
    );
    for (const event of events) {
      const w = event.d * scale;
      residualSum += w * event.residual;
      recallWeight += w;
      for (const topic of topicsByMeaning.get(meaningId) ?? []) {
        const stat = topics.get(topic.id) ?? {
          recallResidualSum: 0,
          recallWeight: 0,
          meanings: new Set<number>(),
        };
        stat.recallResidualSum += w * topic.weight * event.residual;
        stat.recallWeight += w * topic.weight;
        stat.meanings.add(meaningId);
        topics.set(topic.id, stat);
      }
    }
  }
  const globalGap = residualSum / (20 + recallWeight);
  return {
    globalGap,
    recallResidualSum: residualSum,
    recallWeight,
    topics: [...topics].map(([topicId, stat]) => {
      const gap =
        (stat.recallResidualSum - stat.recallWeight * globalGap) /
        (20 + stat.recallWeight);
      return {
        topicId,
        recallResidualSum: stat.recallResidualSum,
        recallWeight: stat.recallWeight,
        distinctReviewedMeanings: stat.meanings.size,
        weakness:
          stat.meanings.size >= 5 && stat.recallWeight >= 10
            ? clamp(-gap / 0.15)
            : 0,
      };
    }),
  };
}
