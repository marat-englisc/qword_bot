import type { Bot, Context } from "grammy";
import { State, type Grade } from "ts-fsrs";
import type { User } from "../db/types";
import type { Repositories } from "../services/common";
import { createLearningServices, localDayBounds, validateTimezone } from "../services";
import { cefrLevels } from "../db/schemas/card/cefrLevel";
import { createSessionStore, newSession, parseCallback, ONBOARDING_KEY, type Screen, type Session } from "./session";
import { answerText, dateText, doneView, html, interval, keyboard, menuKeyboard, short, wordTitle,
  type Button, type MeaningDetails, type View } from "./views";

export type BotContext = Context & { appUser: User; ui?: Session };
type Services = ReturnType<typeof createLearningServices>;
const TOPIC_PAGE_SIZE = 8;
const GRADE_LABELS = ["", "Не помню", "Трудно", "Помню", "Легко"];
const TIMEZONES = [
  ["Москва (UTC+3)", "Europe/Moscow"], ["Лондон", "Europe/London"],
  ["Берлин", "Europe/Berlin"], ["Нью-Йорк", "America/New_York"], ["UTC", "UTC"],
] as const;

export function registerHandlers(bot: Bot<BotContext>, repos: Repositories, services: Services, clock: () => Date) {
  const sessions = createSessionStore(repos);
  const userId = (ctx: BotContext) => ctx.appUser.id;

  async function show(ctx: BotContext, screen: Screen, build: (state: Session) => View | Promise<View>) {
    const state = newSession(screen), view = await build(state);
    // Invalidate the previous keyboard before any external API call. Never restore it on failure.
    await sessions.save(userId(ctx), state);
    ctx.ui = state;
    const options = { parse_mode: "HTML" as const, reply_markup: view.keyboard,
      link_preview_options: { is_disabled: true } };
    if (ctx.callbackQuery?.message) {
      await ctx.editMessageText(view.text, options);
      state.messageId = ctx.callbackQuery.message.message_id;
    } else {
      const sent = await ctx.reply(view.text, options);
      state.messageId = sent.message_id;
    }
    await sessions.save(userId(ctx), state);
    return state;
  }
  async function menu(ctx: BotContext) {
    return show(ctx, { screen: "menu" }, state => ({
      text: "<b>Английские слова</b>\n\nЗанятие начинается с повторений, затем я предложу новые слова.\n" +
        "В любой момент можно вернуться сюда командой /menu.", keyboard: menuKeyboard(state),
    }));
  }
  async function done(ctx: BotContext, text: string, next: "study" | "new" = "study") {
    return show(ctx, { screen: "done", text, next }, state => doneView(state, text, next));
  }
  async function level(ctx: BotContext, onboarding = false) {
    return show(ctx, { screen: "level", onboarding }, state => ({
      text: "<b>Какой у вас уровень английского?</b>\n\nЭто начальная подсказка для подбора слов. Позже уровень можно изменить.\n" +
        "A1 — начинающий, A2 — базовый, B1–B2 — средний, C1–C2 — продвинутый.",
      keyboard: keyboard(state, [
        ...[["A1", "A2"], ["B1", "B2"], ["C1", "C2"]].map(row =>
          row.map(value => [value, "level", value] as [string, string, string])),
        [["Не знаю / начинаю", "level", "A1"]],
        ...(onboarding ? [] : [[["Назад", "settings"] as Button]]),
      ]),
    }));
  }
  async function timezone(ctx: BotContext, onboarding = false) {
    return show(ctx, { screen: "timezone", onboarding }, state => ({
      text: "<b>Ваш часовой пояс</b>\n\nПо нему я считаю дневной лимит новых слов и показываю время повторений.\n" +
        "Часовой пояс нельзя надёжно определить из профиля Telegram.",
      keyboard: keyboard(state, [
        ...TIMEZONES.map(([label], index) => [[label, "zone", index] as [string, string, number]]),
        [["Другой часовой пояс", "zoneinput"]],
        ...(onboarding ? [] : [[["Назад", "settings"] as Button]]),
      ]),
    }));
  }
  async function input(ctx: BotContext, field: "timezone" | "limit", onboarding = false) {
    return show(ctx, { screen: "input", field, onboarding }, state => ({
      text: field === "timezone" ? "Отправьте часовой пояс в формате IANA, например <code>Asia/Almaty</code>.\n/cancel — отмена." :
        "Сколько новых значений добавлять в день? Отправьте целое число от 0 до 100.\n0 — только повторения.\n/cancel — отмена.",
      keyboard: keyboard(state, [[["Отмена", "menu"]]]),
    }));
  }
  async function topics(ctx: BotContext, page = 0, onboarding = false) {
    const rows = await repos.catalog.topics.list({}, { limit: TOPIC_PAGE_SIZE + 1, offset: page * TOPIC_PAGE_SIZE });
    const preferences = await Promise.all(rows.slice(0, TOPIC_PAGE_SIZE).map(row =>
      repos.users.topicProfiles.get({ userId: userId(ctx), topicId: row.id })));
    return show(ctx, { screen: "topics", page, onboarding }, state => ({
      text: "<b>Темы для новых слов</b>\n\nНажатие меняет предпочтение:\n◻️ без предпочтения → ❤️ интересна → 🚫 исключить → ◻️.\n" +
        "Повторения уже добавленных слов сохраняются." + (rows.length ? `\n\nСтраница ${page + 1}` : "\n\nВ словаре пока нет тем."),
      keyboard: keyboard(state, [
        ...rows.slice(0, TOPIC_PAGE_SIZE).map((row, i) => [[
          `${preferences[i]?.isBlocked ? "🚫" : (preferences[i]?.interestWeight ?? 0) > 0 ? "❤️" : "◻️"} ${short(row.name, 40)}`,
          "topic", row.id,
        ] as [string, string, number]]),
        [...(page > 0 ? [["←", "page", page - 1] as [string, string, number]] : []),
          ...(rows.length > TOPIC_PAGE_SIZE ? [["→", "page", page + 1] as [string, string, number]] : [])],
        [[onboarding ? "Готово →" : "Готово", "topicsdone"]],
      ]),
    }));
  }
  async function settings(ctx: BotContext) {
    const profile = await repos.users.ensureProfile(userId(ctx)), params = await services.fsrs.getParameters(userId(ctx));
    const cefr = profile.selfReportedCefrLevelId === null ? undefined :
      await repos.catalog.cefrLevels.get({ id: profile.selfReportedCefrLevelId });
    return show(ctx, { screen: "settings" }, state => ({
      text: `<b>Настройки</b>\n\nУказанный уровень: ${cefr?.value ?? "не выбран"}` +
        `\nНовых значений в день: ${profile.dailyNewMeaningLimit}\nЧасовой пояс: ${html(profile.timezone, 100)}` +
        `\nЦель запоминания: ${Math.round(params.request_retention * 100)}%`,
      keyboard: keyboard(state, [
        [["Уровень", "editlevel"], ["Дневной лимит", "limit"]],
        [["Часовой пояс", "timezone"], ["Цель запоминания", "retention"]],
        [["Темы", "topics"], ["Меню", "menu"]],
      ]),
    }));
  }
  async function retention(ctx: BotContext) {
    return show(ctx, { screen: "retention" }, state => ({
      text: "<b>Цель запоминания</b>\n\nБолее высокая цель обычно означает более частые повторения. " +
        "Для начала подойдёт 90%. Настройка применяется при следующих ответах.",
      keyboard: keyboard(state, [
        [["85%", "retain", 85], ["90%", "retain", 90], ["95%", "retain", 95]], [["Назад", "settings"]],
      ]),
    }));
  }
  async function stats(ctx: BotContext) {
    const now = clock(), id = userId(ctx), profile = await repos.users.ensureProfile(id);
    const day = localDayBounds(now, profile.timezone);
    // getWorkload opens a transaction; embedded libSQL clients may have only one connection.
    const summary = await repos.learning.getSummary(id);
    const load = await repos.learning.getWorkload(id, now, day.dayStart, day.dayEnd);
    const counts = new Map(summary.map(row => [row.state, row.count]));
    return show(ctx, { screen: "stats" }, state => ({
      text: "<b>Ваш прогресс</b>\n\n" +
        `Всего значений в обучении: ${summary.reduce((sum, row) => sum + row.count, 0)}` +
        `\nВпервые изучаете: ${counts.get(State.New) ?? 0}` +
        `\nИзучение и переучивание: ${(counts.get(State.Learning) ?? 0) + (counts.get(State.Relearning) ?? 0)}` +
        `\nРегулярные повторения: ${counts.get(State.Review) ?? 0}` +
        `\nПора повторить: ${load.dueCount}\nНовых сегодня: ${load.introducedCount} / ${profile.dailyNewMeaningLimit}` +
        `\n\nДень считается по ${html(profile.timezone, 100)}. Это статистика обучения, а не оценка CEFR.`,
      keyboard: keyboard(state, [[["Заниматься", "study"], ["Меню", "menu"]]]),
    }));
  }
  async function help(ctx: BotContext) {
    return show(ctx, { screen: "help" }, state => ({
      text: "<b>Как заниматься</b>\n\nСначала вспомните значение слова, затем откройте ответ и оцените себя:" +
        "\n• Не помню — забыли или ответили неверно." +
        "\n• Трудно — вспомнили с большим усилием." +
        "\n• Помню — правильный ответ с обычным усилием." +
        "\n• Легко — вспомнили сразу, без усилий." +
        "\n\nКнопка «Трудно» подходит только для правильного ответа. Интервалы на кнопках приблизительные." +
        "\n\nУ новых слов можно выбрать: учить, уже знаю, пропустить на 7 дней, отложить сложное на 30 дней или больше не предлагать." +
        "\n\n/start — начало\n/menu — меню\n/study — занятие\n/new — новые слова" +
        "\n/stats — прогресс\n/settings — настройки\n/topics — темы\n/cancel — выйти из текущего шага",
      keyboard: menuKeyboard(state),
    }));
  }
  async function idle(ctx: BotContext, reason: string, nextDueAt: Date | null = null, next: "study" | "new" = "study") {
    const messages: Record<string, string> = {
      daily_limit: "Дневной лимит новых слов достигнут. Можно продолжить повторения или изменить лимит в настройках.",
      reviews_overloaded: "Накопились повторения. Сначала повторите добавленные слова — новые появятся, когда очередь уменьшится.",
      no_candidates: "Подходящих новых слов пока нет. Можно изменить уровень и темы в настройках или вернуться позже.",
    };
    let text = messages[reason] ?? "На сейчас всё готово.";
    if (nextDueAt) {
      const profile = await repos.users.ensureProfile(userId(ctx));
      text += `\n\nБлижайшее повторение: ${dateText(nextDueAt, profile.timezone)} (${html(profile.timezone, 100)}).`;
    }
    return done(ctx, text, next);
  }
  async function cardView(ctx: BotContext, expected: import("../db/types").UserFsrsData, revealed: boolean) {
    const [meaning] = await repos.catalog.getMeaningDetails([expected.wordMeaningId]);
    if (!meaning) return done(ctx, "Это значение удалено из словаря. Перейдите к следующему слову.");
    const now = clock();
    const preview = revealed ? await services.fsrs.preview(userId(ctx), expected.wordMeaningId, now) : undefined;
    if (revealed && !preview) return done(ctx, "Эта карточка больше не находится в обучении.");
    return show(ctx, { screen: "card", expected, revealed }, state => ({
      text: revealed ? `${answerText(meaning)}\n\n${expected.state === State.New ? "Прочитайте значение и примеры. Оцените, насколько легко запомнили слово." : "Удалось вспомнить до открытия ответа?"}` :
        `${wordTitle(meaning)}\n\n${meaning.examples[0] ? `${html(meaning.examples[0].example, 300)}\n\n` : ""}` +
        "Вспомните значение, затем откройте ответ.",
      keyboard: revealed ? keyboard(state, [
        ...[preview!.options.slice(0, 2), preview!.options.slice(2)].map(row => row.map(option =>
          [`${GRADE_LABELS[option.rating]} · ~${interval(option.due, now)}`, "rate", option.rating] as [string, string, number])),
        [["Меню", "menu"]],
      ]) : keyboard(state, [[["Показать ответ", "reveal"]], [["Меню", "menu"]]]),
    }));
  }
  async function recommendation(ctx: BotContext, row: { id: number; wordMeaningId: number }, meaning: MeaningDetails) {
    await show(ctx, { screen: "recommendation", recommendationId: row.id, meaningId: row.wordMeaningId }, state => ({
      text: `<b>Новое значение</b>\n\n${answerText(meaning)}\n\nХотите добавить его в обучение?`,
      keyboard: keyboard(state, [
        [["✅ Учить", "accept"], ["Уже знаю", "known"]],
        [["Пропустить на 7 дней", "skip"], ["Слишком сложно", "hard"]],
        [["Не предлагать", "ignore"], ["Меню", "menu"]],
      ]),
    }));
    // Count an impression only after Telegram confirmed delivery. A failed send leaves an unshown candidate.
    if (!await services.recommendations.markShown(userId(ctx), row.id, clock())) {
      await sessions.clear(userId(ctx));
      await ctx.api.editMessageReplyMarkup(ctx.chat!.id, ctx.ui!.messageId!, { reply_markup: { inline_keyboard: [] } });
      await ctx.reply("Рекомендация уже недоступна. Продолжить: /study.");
    }
  }
  async function study(ctx: BotContext) {
    const step = await services.study.next(userId(ctx), clock());
    if (step.kind === "idle") return idle(ctx, step.reason, step.nextDueAt);
    if (step.kind === "recommendation") return recommendation(ctx, step.recommendation, step.meaning);
    return cardView(ctx, step.card, false);
  }
  async function newWords(ctx: BotContext) {
    const next = await services.recommendations.next(userId(ctx), clock());
    if (!next.recommendation) return idle(ctx, next.status, null, "new");
    const [meaning] = await repos.catalog.getMeaningDetails([next.recommendation.wordMeaningId]);
    if (!meaning) return done(ctx, "Значение удалено из словаря. Попробуйте следующее.", "new");
    return recommendation(ctx, next.recommendation, meaning);
  }
  async function start(ctx: BotContext) {
    const completed = await repos.users.settings.get({ userId: userId(ctx), key: ONBOARDING_KEY });
    return completed ? menu(ctx) : level(ctx, true);
  }
  const navigation = { menu, study, new: newWords, stats, settings, topics: (ctx: BotContext) => topics(ctx), help };
  bot.command("start", start);
  for (const [command, handler] of Object.entries(navigation)) bot.command(command, handler);
  bot.command("cancel", menu);

  bot.on("callback_query:data", async ctx => {
    const request = parseCallback(ctx.callbackQuery.data), state = ctx.ui;
    if (!request || !state || request.nonce !== state.nonce || state.messageId !== ctx.callbackQuery.message?.message_id) {
      await ctx.answerCallbackQuery({ text: "Эта кнопка устарела. Откройте /menu или /study." });
      return;
    }
    await ctx.answerCallbackQuery();
    const { action, arg } = request;
    if (Object.hasOwn(navigation, action)) return navigation[action as keyof typeof navigation](ctx);
    if (state.screen === "level" && action === "level" && cefrLevels.includes(arg as typeof cefrLevels[number])) {
      const selected = await repos.catalog.ensureCefrLevel(arg as typeof cefrLevels[number]);
      await services.profiles.configure(userId(ctx), { selfReportedCefrLevelId: selected.id }, clock());
      return state.onboarding ? timezone(ctx, true) : settings(ctx);
    }
    if (state.screen === "timezone") {
      if (action === "zoneinput") return input(ctx, "timezone", state.onboarding);
      if (action === "zone" && arg !== undefined && /^\d$/.test(arg) && TIMEZONES[Number(arg)]) {
        await services.profiles.configure(userId(ctx), { timezone: TIMEZONES[Number(arg)][1] }, clock());
        return state.onboarding ? topics(ctx, 0, true) : settings(ctx);
      }
    }
    if (state.screen === "topics") {
      if (action === "topic" && arg && /^\d+$/.test(arg)) {
        const topicId = Number(arg);
        // Only the currently visible page may mutate preferences.
        const visible = await repos.catalog.topics.list({}, { limit: TOPIC_PAGE_SIZE, offset: state.page * TOPIC_PAGE_SIZE });
        if (visible.some(row => row.id === topicId)) {
          const preference = await repos.users.topicProfiles.get({ userId: userId(ctx), topicId });
          await repos.users.setTopicPreference(userId(ctx), topicId, preference?.isBlocked ?
            { interestWeight: 0, isBlocked: false } : (preference?.interestWeight ?? 0) > 0 ?
              { interestWeight: 0, isBlocked: true } : { interestWeight: 1, isBlocked: false });
          return topics(ctx, state.page, state.onboarding);
        }
      }
      if (action === "page" && arg && /^\d+$/.test(arg) && Math.abs(Number(arg) - state.page) === 1) {
        return topics(ctx, Number(arg), state.onboarding);
      }
      if (action === "topicsdone") {
        if (state.onboarding) await repos.users.setSetting(userId(ctx), ONBOARDING_KEY, "done");
        return menu(ctx);
      }
    }
    if (state.screen === "settings") {
      if (action === "editlevel") return level(ctx);
      if (action === "timezone") return timezone(ctx);
      if (action === "limit") return input(ctx, "limit");
      if (action === "retention") return retention(ctx);
    }
    if (state.screen === "retention" && action === "retain" && ["85", "90", "95"].includes(arg ?? "")) {
      await services.fsrs.configure(userId(ctx), { request_retention: Number(arg) / 100 });
      return settings(ctx);
    }
    if (state.screen === "card") {
      if (action === "reveal" && !state.revealed) return cardView(ctx, state.expected, true);
      if (action === "rate" && state.revealed && arg && /^[1-4]$/.test(arg)) {
        const saved = await services.fsrs.answer(userId(ctx), state.expected.wordMeaningId, Number(arg) as Grade, state.expected, clock());
        const profile = await repos.users.ensureProfile(userId(ctx));
        return done(ctx, `Ответ сохранён. Следующее повторение: ${dateText(saved.card.due, profile.timezone)} (${html(profile.timezone, 100)}).`);
      }
    }
    if (state.screen === "recommendation") {
      const feedback = { accept: "accepted", known: "already_known", skip: "skipped", hard: "too_difficult", ignore: "not_interested" } as const;
      if (Object.hasOwn(feedback, action)) {
        // The definition and translation were already shown: never turn this into a vocabulary assessment.
        await services.recommendations.respond(userId(ctx), state.recommendationId, feedback[action as keyof typeof feedback], { at: clock() });
        if (action === "accept") {
          const card = await repos.learning.cards.get({ userId: userId(ctx), wordMeaningId: state.meaningId });
          if (card && card.due <= clock()) return cardView(ctx, card, false);
          return done(ctx, "Значение уже добавлено в обучение. Продолжим занятие.");
        }
        const text = { known: "Отмечено как знакомое. Это значение больше не будет предлагаться.",
          skip: "Значение отложено на 7 дней.", hard: "Значение отложено на 30 дней.", ignore: "Больше не буду предлагать это значение." };
        return done(ctx, text[action as keyof typeof text], "new");
      }
    }
    await ctx.reply("Эта кнопка не подходит для текущего шага. Откройте /menu.");
  });

  bot.on("message:text", async ctx => {
    const state = ctx.ui, value = ctx.message.text.trim();
    if (value.startsWith("/")) { await ctx.reply("Неизвестная команда. Список команд: /help."); return; }
    if (state?.screen === "input") {
      if (state.field === "limit") {
        if (!/^\d{1,3}$/.test(value) || Number(value) > 100) {
          await ctx.reply("Нужно целое число от 0 до 100. Попробуйте ещё раз или отправьте /cancel."); return;
        }
        await services.profiles.configure(userId(ctx), { dailyNewMeaningLimit: Number(value) }, clock());
        return settings(ctx);
      }
      try { validateTimezone(value); } catch {
        await ctx.reply("Не распознал часовой пояс. Пример: Asia/Almaty или Europe/Moscow. /cancel — отмена."); return;
      }
      await services.profiles.configure(userId(ctx), { timezone: value }, clock());
      return state.onboarding ? topics(ctx, 0, true) : settings(ctx);
    }
    await ctx.reply("Выберите действие кнопкой или отправьте /menu. Для занятия: /study.");
  });
  bot.on("message", ctx => ctx.reply("Пока я работаю с кнопками и текстом. Откройте /menu или /study."));
  bot.on("callback_query", ctx => ctx.answerCallbackQuery({ text: "Откройте /menu, чтобы продолжить." }));
}
