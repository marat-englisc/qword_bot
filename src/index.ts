import { bot } from "./config/bot";

bot.command("start", (ctx) => ctx.reply("Welcome! Up and running."));

bot.on("message", (ctx) => ctx.reply("Got another message!"));

bot.start();
