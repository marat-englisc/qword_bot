/// <reference types="node" />

import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { DB_URL } from "./src/config/constants";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schemas/**/*.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: DB_URL,
  },
});
