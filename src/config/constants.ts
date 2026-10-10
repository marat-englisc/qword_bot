import "dotenv/config";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}
export const DB_URL = required("DB_FILE_NAME");
// DB-only tools (for example drizzle-kit) do not need a Telegram credential.
export const TELEGRAM_API = process.env.TELEGRAM_API?.trim() ?? "";
