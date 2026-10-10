import { createTelegramBot } from "../telegram";
import { TELEGRAM_API } from "./constants";
import { db } from "./connection";

if (!TELEGRAM_API) throw new Error("Missing environment variable: TELEGRAM_API");
export const bot = createTelegramBot(TELEGRAM_API, db);
