import type { FSRSParameters } from "ts-fsrs";
import { createRepositories, type Database } from "../db/repositories";
import { createUserLock, type Clock } from "./common";
import { createProfileService } from "./profileService";
import { createRecommendationService } from "./recommendationService";
import { createFsrsService } from "./fsrsService";
import { createStudyService } from "./studyService";

export function createLearningServices(db: Database, options: {
  clock?: Clock; random?: () => number; frequencySource?: string; fsrsParameters?: Partial<FSRSParameters>;
} = {}) {
  const repos = createRepositories(db), clock = options.clock ?? (() => new Date());
  const lock = createUserLock(), profileCore = createProfileService(repos, clock);
  const profiles: typeof profileCore = {
    rebuild: (...args) => lock(args[0], () => profileCore.rebuild(...args)),
    configure: (...args) => lock(args[0], () => profileCore.configure(...args)),
    assess: (...args) => lock(args[0], () => profileCore.assess(...args)),
  };
  const recommendations = createRecommendationService(repos, profileCore, {
    clock, random: options.random ?? Math.random, lock, frequencySource: options.frequencySource,
  });
  const fsrsCore = createFsrsService(repos, clock, options.fsrsParameters);
  const fsrs: typeof fsrsCore = {
    ...fsrsCore,
    configure: (...args) => lock(args[0], () => fsrsCore.configure(...args)),
    addMeaning: (...args) => lock(args[0], () => fsrsCore.addMeaning(...args)),
    answer: (...args) => lock(args[0], () => fsrsCore.answer(...args)),
  };
  return { profiles, recommendations, fsrs, study: createStudyService(repos, recommendations, fsrs, clock) };
}
export { createProfileService, createRecommendationService, createFsrsService, createStudyService };
export { localDayBounds, localDayKey, validateTimezone } from "./localDay";
export type { ProfileService } from "./profileService";
export type { RecommendationService } from "./recommendationService";
export type { FsrsService } from "./fsrsService";
