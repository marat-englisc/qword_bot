import type { UserVocabularyAssessment } from "../../db/recommendationTypes";
import { DAY, sigmoid, softplus } from "../common";

export const CEFR_DIFFICULTY = { A1: -2, A2: -1, B1: 0, B2: 1, C1: 2, C2: 3 } as const;
export type Cefr = keyof typeof CEFR_DIFFICULTY;
type Observation = Pick<UserVocabularyAssessment, "knewBefore" | "source" | "vocabularyDifficulty" | "topicWeights" | "assessedAt">;
export function validateTopicWeights(topics: Observation["topicWeights"]) {
  if (!Array.isArray(topics) || new Set(topics.map(topic => topic.topicId)).size !== topics.length ||
      topics.some(topic => !Number.isSafeInteger(topic.topicId) || topic.topicId < 1 ||
        !Number.isFinite(topic.weight) || topic.weight <= 0 || topic.weight > 1) ||
      (topics.length && Math.abs(topics.reduce((sum, topic) => sum + topic.weight, 0) - 1) > 1e-6)) {
    throw new TypeError("Assessment topic weights must be unique and normalized");
  }
}
const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);

/** Convex weighted Rasch model, with Newton steps solved by preconditioned CG. */
export function fitVocabulary(observations: Observation[], prior: number, now: Date) {
  if (!Number.isFinite(prior)) throw new TypeError("Invalid vocabulary prior");
  observations.forEach(row => validateTopicWeights(row.topicWeights));
  const topicIds = [...new Set(observations.flatMap(row => row.topicWeights.map(topic => topic.topicId)))].sort((a, b) => a - b);
  const indices = new Map(topicIds.map((id, i) => [id, i + 1]));
  const rows = observations.filter(row => row.assessedAt <= now).map(row => {
    if (!Number.isFinite(row.vocabularyDifficulty)) throw new TypeError("Invalid vocabulary difficulty");
    return { y: row.knewBefore, b: row.vocabularyDifficulty,
      w: (row.source === "recognition_test" ? 1 : .25) * 2 ** (-(+now - +row.assessedAt) / DAY / 90),
      features: [[0, 1], ...row.topicWeights.map(topic => [indices.get(topic.topicId)!, topic.weight])] as [number, number][] };
  });
  const n = topicIds.length + 1, lambda = [2, ...topicIds.map(() => 10)];
  let values = [prior, ...topicIds.map(() => 0)];
  const logit = (row: typeof rows[number], x: number[]) => row.features.reduce((sum, [i, a]) => sum + a * x[i], -row.b);
  const loss = (x: number[]) => rows.reduce((sum, row) => {
    const z = logit(row, x);
    return sum + row.w * softplus(row.y ? -z : z);
  }, .5 * lambda.reduce((sum, l, i) => sum + l * (x[i] - (i ? 0 : prior)) ** 2, 0));
  let iterations = 0;
  for (; iterations < 40; iterations++) {
    const gradient = values.map((x, i) => lambda[i] * (x - (i ? 0 : prior)));
    const diagonal = [...lambda];
    const curvature = rows.map(row => {
      const p = sigmoid(logit(row, values)), h = row.w * p * (1 - p);
      for (const [i, a] of row.features) {
        gradient[i] += row.w * (p - Number(row.y)) * a;
        diagonal[i] += h * a * a;
      }
      return h;
    });
    const norm = Math.max(...gradient.map(Math.abs));
    if (norm < 1e-8) break;
    function multiply(v: number[]) {
      const out = v.map((x, i) => lambda[i] * x);
      rows.forEach((row, j) => {
        const hv = curvature[j] * row.features.reduce((sum, [i, a]) => sum + a * v[i], 0);
        for (const [i, a] of row.features) out[i] += a * hv;
      });
      return out;
    }
    const direction = Array(n).fill(0) as number[];
    let residual = [...gradient], z = residual.map((r, i) => r / diagonal[i]), p = [...z], rz = dot(residual, z);
    for (let j = 0; j < Math.min(200, 2 * n); j++) {
      const hp = multiply(p), alpha = rz / dot(p, hp);
      for (let i = 0; i < n; i++) { direction[i] += alpha * p[i]; residual[i] -= alpha * hp[i]; }
      if (Math.max(...residual.map(Math.abs)) < Math.max(1e-10, norm * 1e-6)) break;
      z = residual.map((r, i) => r / diagonal[i]);
      const next = dot(residual, z), beta = next / rz;
      p = z.map((v, i) => v + beta * p[i]); rz = next;
    }
    let step = 1;
    const oldLoss = loss(values), slope = dot(gradient, direction);
    let candidate = values.map((x, i) => x - step * direction[i]);
    while (loss(candidate) > oldLoss - 1e-4 * step * slope && step > 1e-9) {
      step /= 2; candidate = values.map((x, i) => x - step * direction[i]);
    }
    values = candidate;
  }
  const weights = new Map(topicIds.map(id => [id, 0]));
  let total = 0;
  for (const row of rows) {
    total += row.w;
    for (const [i, a] of row.features) if (i) weights.set(topicIds[i - 1], weights.get(topicIds[i - 1])! + row.w * a);
  }
  return { vocabularyAbility: values[0], assessmentWeight: total, iterations,
    topics: topicIds.map((topicId, i) => ({ topicId, vocabularyAbilityOffset: values[i + 1], assessmentWeight: weights.get(topicId)! })) };
}
