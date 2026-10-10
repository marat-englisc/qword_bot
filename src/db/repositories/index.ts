import type { Database } from "./core";
import { createCatalogRepository } from "./catalogRepository";
import { createUserRepository } from "./userRepository";
import { createLearningRepository } from "./learningRepository";
import { createRecommendationRepository } from "./recommendationRepository";

export function createRepositories(db: Database) {
  return {
    catalog: createCatalogRepository(db),
    users: createUserRepository(db),
    learning: createLearningRepository(db),
    recommendation: createRecommendationRepository(db),
  };
}
export {
  createCatalogRepository,
  createUserRepository,
  createLearningRepository,
  createRecommendationRepository,
};
export { RepositoryConflictError } from "./core";
export type {
  Database,
  Executor,
  CreateInput,
  UpdateInput,
  Page,
} from "./core";
export { toFsrsCard } from "./learningRepository";
export type { CandidateOptions } from "./recommendationRepository";
