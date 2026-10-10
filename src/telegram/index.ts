import { Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { createRepositories, RepositoryConflictError, type Database } from "../db/repositories";
import { createLearningServices } from "../services";
import { createUserLock } from "../services/common";
import { createSessionStore } from "./session";
import { registerHandlers, type BotContext } from "./handlers";

export const BOT_COMMANDS = [
  { command: "start", description: "Начало и настройка" },
  { command: "menu", description: "Главное меню" },
  { command: "study", description: "Повторения и новые слова" },
  { command: "new", description: "Подобрать новые слова" },
  { command: "stats", description: "Прогресс" },
  { command: "settings", description: "Настройки обучения" },
  { command: "topics", description: "Интересующие темы" },
  { command: "help", description: "Как заниматься" },
  { command: "cancel", description: "Выйти из текущего шага" },
];

export function createTelegramBot(token: string, db: Database, options: {
  botInfo?: UserFromGetMe;
  clock?: () => Date;
  random?: () => number;
  onError?: (error: unknown) => void;
} = {}) {
  const bot = new Bot<BotContext>(token, { botInfo: options.botInfo });
  const repos = createRepositories(db), clock = options.clock ?? (() => new Date());
  const services = createLearningServices(db, { clock, random: options.random });
  const sessions = createSessionStore(repos), lock = createUserLock();
  // Avoid logging request URLs or payloads, which can contain a token or private user data.
  const report = options.onError ?? ((error: unknown) => console.error("[telegram]", error instanceof Error ? error.name : "UnknownError"));
  bot.use(async (ctx, next) => {
    if (!ctx.from || ctx.from.is_bot) return;
    if (ctx.chat?.type !== "private") {
      if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: "Занятия доступны в личном чате с ботом." });
      else if (ctx.message?.text?.startsWith("/")) await ctx.reply("Для занятий откройте личный чат с ботом и отправьте /start.");
      return;
    }
    await lock(ctx.from.id, async () => {
      try {
        ctx.appUser = await repos.users.upsertTelegramUser({
          telegramId: ctx.from!.id, username: ctx.from!.username ?? null,
          firstName: ctx.from!.first_name, lastName: ctx.from!.last_name ?? null,
        });
        await repos.users.ensureProfile(ctx.appUser.id);
        ctx.ui = await sessions.get(ctx.appUser.id);
        await next();
      } catch (error) {
        report(error);
        if (error instanceof RepositoryConflictError && ctx.appUser) await sessions.clear(ctx.appUser.id);
        // A review is already committed if delivery of its confirmation failed.
        // Its old card snapshot cannot pass the repository's optimistic concurrency guard again.
        try {
          await ctx.reply(error instanceof RepositoryConflictError ?
            "Данные уже изменились или рекомендация истекла. Обновите занятие: /study. Настройки: /settings." :
            "Не удалось завершить действие. Попробуйте /study или /menu. Если ответ уже был сохранён, повторно он не запишется.");
        } catch (deliveryError) { report(deliveryError); }
      }
    });
  });
  registerHandlers(bot, repos, services, clock);
  bot.catch(error => report(error.error));
  return bot;
}

export type { BotContext } from "./handlers";
