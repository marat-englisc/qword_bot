import { bot } from "./config/bot";
import { client } from "./config/connection";
import { BOT_COMMANDS } from "./telegram";

async function main() {
  await bot.api.setMyCommands(BOT_COMMANDS, { scope: { type: "all_private_chats" } });
  const stop = () => {
    if (bot.isRunning()) void bot.stop().catch(error => {
      console.error("Bot shutdown failed:", error instanceof Error ? error.name : "UnknownError");
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await bot.start({ allowed_updates: ["message", "callback_query"] });
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    client.close();
  }
}

void main().catch(error => {
  // Do not log Bot API request URLs, tokens or message contents.
  console.error("Bot startup failed:", error instanceof Error ? error.name : "UnknownError");
  client.close();
  process.exitCode = 1;
});
