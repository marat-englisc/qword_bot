import "dotenv/config";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { DB_URL } from "./constants";

const client = createClient({ url: DB_URL });
export const db = drizzle({ client });
