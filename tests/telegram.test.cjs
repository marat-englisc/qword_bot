const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createClient } = require("@libsql/client");
const { drizzle } = require("drizzle-orm/libsql");
const { migrate } = require("drizzle-orm/libsql/migrator");
const { createTelegramBot } = require("../src/telegram/index.ts");
const { createRepositories } = require("../src/db/repositories/index.ts");
const { createLearningServices } = require("../src/services/index.ts");
const { SESSION_KEY, createSessionStore } = require("../src/telegram/session.ts");
const { answerText } = require("../src/telegram/views.ts");
const BOT_INFO = { id: 999, is_bot: true, first_name: "Qword", username: "qword_test_bot",
  can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
  can_connect_to_business: false, has_main_web_app: false };

async function fixture(t, { seed = true, count = 4 } = {}) {
  const client = createClient({ url: "file::memory:" });
  t.after(() => client.close());
  const db = drizzle({ client });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../drizzle") });
  await client.execute("PRAGMA foreign_keys = ON");
  const repos = createRepositories(db);
  let now = new Date("2026-10-10T10:00:00.000Z");
  const errors = [], calls = [], messages = new Map();
  let messageId = 100, updateId = 1, failNext;
  const bot = createTelegramBot("999:TEST_TOKEN", db, { botInfo: BOT_INFO, clock: () => new Date(now),
    random: () => 0.5, onError: error => errors.push(error) });
  // Every API call is intercepted. No test can fall through to the Telegram network.
  bot.api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload: structuredClone(payload) });
    if (method === failNext) { failNext = undefined; throw new Error("Simulated delivery failure"); }
    if (method === "answerCallbackQuery") return { ok: true, result: true };
    if (method === "sendMessage") {
      const message = { message_id: ++messageId, date: Math.floor(+now / 1000),
        chat: { id: payload.chat_id, type: "private" }, from: BOT_INFO,
        text: payload.text, reply_markup: payload.reply_markup };
      messages.set(`${payload.chat_id}:${message.message_id}`, message);
      return { ok: true, result: message };
    }
    if (method === "editMessageText" || method === "editMessageReplyMarkup") {
      const key = `${payload.chat_id}:${payload.message_id}`;
      const previous = messages.get(key);
      assert.ok(previous, `No mocked message ${key}`);
      const message = { ...previous, text: payload.text ?? previous.text, reply_markup: payload.reply_markup };
      messages.set(key, message);
      return { ok: true, result: message };
    }
    throw new Error(`Unexpected Bot API call: ${method}`);
  });
  const from = id => ({ id, is_bot: false, first_name: "Марат", username: "marat" });
  const send = (text, id = 10, chatType = "private", sender = from(id)) => bot.handleUpdate({ update_id: updateId++,
    message: { message_id: updateId + 1000, date: Math.floor(+now / 1000), from: sender,
      chat: { id: chatType === "private" ? id : -100, type: chatType }, text,
      ...(text.startsWith("/") ? { entities: [{ offset: 0, length: text.split(" ")[0].length, type: "bot_command" }] } : {}) } });
  const last = (id = 10) => [...messages.values()].filter(message => message.chat.id === id).at(-1);
  const find = (action, id = 10) => {
    const button = last(id)?.reply_markup?.inline_keyboard.flat().find(button => button.callback_data?.split(":")[2] === action);
    assert.ok(button, `Missing ${action} in ${last(id)?.text}`);
    return button.callback_data;
  };
  const clickRaw = (data, message = last(), id = 10) => bot.handleUpdate({ update_id: updateId++,
    callback_query: { id: `callback-${updateId}`, chat_instance: "test", from: from(id), data,
      message: { ...message, chat: { id, type: "private" } } } });
  const click = (action, id = 10) => clickRaw(find(action, id), last(id), id);
  const user = (id = 10) => repos.users.getByTelegramId(id);
  const state = async (id = 10) => createSessionStore(repos).get((await user(id)).id);
  const services = createLearningServices(db, { clock: () => new Date(now), random: () => 0.5 });
  const meanings = [];
  if (seed) {
    const cefr = await repos.catalog.ensureCefrLevel("A1");
    const pos = await repos.catalog.partsOfSpeech.create({ value: "noun" });
    const topic = await repos.catalog.topics.create({ slug: "everyday", name: "Повседневное" });
    for (let i = 0; i < count; i++) {
      const word = await repos.catalog.words.create({ title: `word${i}`, transcription: "/wɜːd/" });
      const meaning = await repos.catalog.meanings.create({ wordId: word.id, partOfSpeechId: pos.id,
        cefrLevelId: cefr.id, meaning: `English definition ${i}`, meaningTranslation: `Перевод ${i}` });
      await repos.catalog.meaningTopics.create({ wordMeaningId: meaning.id, topicId: topic.id });
      await repos.catalog.examples.create({ wordMeaningId: meaning.id, example: `This is word${i}.`, exampleTranslation: `Это перевод ${i}.` });
      meanings.push(meaning);
    }
  }
  return { db, repos, bot, calls, messages, errors, send, last, find, click, clickRaw, user, state, services, meanings,
    setTime(value) { now = new Date(value); }, fail(method) { failNext = method; } };
}

test("onboarding creates one user, saves level/timezone/topics and survives /start", async t => {
  const f = await fixture(t);
  await f.send("/start");
  assert.equal((await f.state()).screen, "level");
  await f.click("level");
  assert.equal((await f.state()).screen, "timezone");
  await f.click("zone");
  await f.click("topic");
  const u = await f.user();
  const preferences = await f.repos.users.topicProfiles.list({ userId: u.id });
  assert.equal(preferences[0].interestWeight, 1);
  await f.click("topicsdone");
  await f.send("/start");
  assert.equal((await f.state()).screen, "menu");
  assert.equal((await f.repos.users.users.list({})).length, 1);
  const profile = await f.repos.users.profiles.get({ userId: u.id });
  assert.equal(profile.timezone, "Europe/Moscow");
  assert.equal((await f.repos.catalog.cefrLevels.get({ id: profile.selfReportedCefrLevelId })).value, "A1");
  assert.deepEqual(f.errors, []);
});

test("recommendation -> acceptance -> answer reveal -> grade; duplicate grade writes once", async t => {
  const f = await fixture(t);
  await f.send("/new");
  const suggestion = await f.state(), u = await f.user();
  assert.equal(suggestion.screen, "recommendation");
  assert.ok((await f.repos.recommendation.recommendations.get({ userId: u.id, id: suggestion.recommendationId })).shownAt);
  await f.click("accept");
  assert.equal((await f.state()).screen, "card");
  assert.equal((await f.state()).revealed, false);
  assert.doesNotMatch(f.last().text, /Перевод|English definition|Это перевод/);
  await f.click("reveal");
  assert.match(f.last().text, /Перевод/);
  const data = f.find("rate"), message = f.last();
  await Promise.all([f.clickRaw(data, message), f.clickRaw(data, message)]);
  const reviews = await f.repos.learning.reviews.list({ userId: u.id });
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].rating, 1);
  assert.equal((await f.state()).screen, "done");
  assert.deepEqual(f.errors, []);
});

test("known feedback after revealing the definition never becomes an assessment", async t => {
  const f = await fixture(t);
  await f.send("/new");
  const suggestion = await f.state(), u = await f.user();
  await f.click("known");
  const pref = await f.repos.recommendation.preferences.get({ userId: u.id, wordMeaningId: suggestion.meaningId });
  assert.equal(pref.status, "known");
  assert.equal((await f.repos.recommendation.assessments.list({ userId: u.id })).length, 0);
  assert.equal((await f.repos.learning.cards.list({ userId: u.id })).length, 0);
});

test("all recommendation feedback buttons persist the intended exclusion", async t => {
  for (const [action, status, days] of [["skip", "snoozed", 7], ["hard", "snoozed", 30], ["ignore", "ignored", null]]) {
    await t.test(action, async t => {
      const f = await fixture(t);
      await f.send("/new");
      const s = await f.state(), u = await f.user();
      await f.click(action);
      const pref = await f.repos.recommendation.preferences.get({ userId: u.id, wordMeaningId: s.meaningId });
      assert.equal(pref.status, status);
      if (days) assert.equal(+pref.snoozedUntil, +new Date("2026-10-10T10:00:00Z") + days * 86400000);
      assert.equal((await f.repos.learning.cards.list({ userId: u.id })).length, 0);
      assert.deepEqual(f.errors, []);
    });
  }
});

test("stale, foreign and forged callbacks cannot mutate another question", async t => {
  const f = await fixture(t);
  await f.send("/new");
  const data = f.find("accept"), original = f.last(), s = await f.state(), u = await f.user();
  await f.send("/menu", 20);
  await f.clickRaw(data, original, 20);
  await f.clickRaw(data.replace(":accept", ":rate:4"), original);
  assert.equal((await f.repos.learning.cards.list({ userId: u.id })).length, 0);
  await f.send("/menu");
  await f.clickRaw(data, original);
  assert.equal((await f.repos.learning.cards.list({ userId: u.id })).length, 0);
  assert.equal((await f.repos.recommendation.recommendations.get({ userId: u.id, id: s.recommendationId })).feedback, null);
  assert.ok(f.calls.some(call => call.method === "answerCallbackQuery" && /устарела/.test(call.payload.text)));
});

test("settings validate text input, save zero quota and cancel input mode", async t => {
  const f = await fixture(t);
  await f.send("/settings");
  await f.click("limit");
  for (const text of ["-1", "3.5", "101", "три"]) await f.send(text);
  assert.equal((await f.state()).screen, "input");
  await f.send("0");
  const u = await f.user();
  assert.equal((await f.repos.users.profiles.get({ userId: u.id })).dailyNewMeaningLimit, 0);
  await f.click("timezone");
  await f.click("zoneinput");
  await f.send("Mars/Olympus");
  assert.equal((await f.state()).screen, "input");
  await f.send("Asia/Almaty");
  assert.equal((await f.repos.users.profiles.get({ userId: u.id })).timezone, "Asia/Almaty");
  await f.click("retention");
  await f.click("retain");
  assert.equal((await f.services.fsrs.getParameters(u.id)).request_retention, .85);
  await f.click("limit");
  await f.send("/cancel");
  await f.send("99");
  assert.equal((await f.repos.users.profiles.get({ userId: u.id })).dailyNewMeaningLimit, 0);
  await f.send("/new");
  assert.match(f.last().text, /лимит/);
  assert.deepEqual(f.errors, []);
});

test("study prioritizes due reviews over new recommendations and statistics include every card", async t => {
  const f = await fixture(t);
  await f.send("/menu");
  const u = await f.user();
  const first = await f.services.fsrs.addMeaning(u.id, f.meanings[0].id);
  await f.services.fsrs.answer(u.id, first.wordMeaningId, 3, first);
  f.setTime("2026-10-12T10:00:00Z");
  await f.send("/study");
  assert.equal((await f.state()).screen, "card");
  assert.equal((await f.state()).expected.wordMeaningId, first.wordMeaningId);
  assert.equal((await f.repos.recommendation.recommendations.list({ userId: u.id })).length, 0);
  await f.send("/stats");
  assert.deepEqual(f.errors, []);
  assert.match(f.last().text, /Всего значений в обучении: 1/);
  assert.match(f.last().text, /Пора повторить: 1/);
});

test("persisted card snapshot survives a new bot instance and rejects an externally answered card", async t => {
  const f = await fixture(t);
  await f.send("/new");
  await f.click("accept");
  await f.click("reveal");
  const u = await f.user(), state = await f.state();
  assert.ok(state.expected.due instanceof Date);
  const data = f.find("rate"), message = f.last();
  await f.services.fsrs.answer(u.id, state.expected.wordMeaningId, 3, state.expected);
  const restarted = createTelegramBot("999:TEST", f.db, { botInfo: BOT_INFO, clock: () => new Date("2026-10-10T10:00:00Z"), onError: e => f.errors.push(e) });
  restarted.api.config.use(...f.bot.api.config.installedTransformers());
  await restarted.handleUpdate({ update_id: 9000, callback_query: {
    id: "restart", chat_instance: "test", from: { id: 10, is_bot: false, first_name: "Марат" }, data, message } });
  assert.equal((await f.repos.learning.reviews.list({ userId: u.id })).length, 1);
  assert.ok(f.errors.some(error => error.name === "RepositoryConflictError"));
});

test("failed recommendation delivery is not logged as an impression", async t => {
  const f = await fixture(t);
  f.fail("sendMessage");
  await f.send("/new");
  const u = await f.user();
  const recommendations = await f.repos.recommendation.recommendations.list({ userId: u.id });
  assert.ok(recommendations.length);
  assert.ok(recommendations.every(row => row.shownAt === null));
  await f.send("/new");
  assert.equal((await f.state()).screen, "recommendation");
  assert.ok((await f.repos.recommendation.recommendations.list({ userId: u.id })).some(row => row.shownAt));
});

test("a delivery failure after committing an answer cannot duplicate that answer", async t => {
  const f = await fixture(t);
  await f.send("/new");
  await f.click("accept");
  await f.click("reveal");
  const data = f.find("rate"), message = f.last(), u = await f.user();
  f.fail("editMessageText");
  await f.clickRaw(data, message);
  await f.clickRaw(data, message);
  assert.equal((await f.repos.learning.reviews.list({ userId: u.id })).length, 1);
  assert.equal((await f.state()).screen, "done");
});

test("groups create no user, Telegram profile updates preserve admin rights, corrupt state is discarded", async t => {
  const f = await fixture(t, { seed: false });
  await f.send("/start", 10, "group");
  assert.equal((await f.repos.users.users.list({})).length, 0);
  await f.send("/menu");
  const u = await f.user();
  await f.repos.users.users.update({ id: u.id }, { isAdmin: true });
  await f.repos.users.setSetting(u.id, SESSION_KEY, "not json");
  await f.send("/menu", 10, "private", { id: 10, is_bot: false, first_name: "Новое имя" });
  assert.equal((await f.user()).isAdmin, true);
  assert.equal((await f.user()).username, null);
  assert.equal((await f.user()).firstName, "Новое имя");
  assert.equal((await f.state()).screen, "menu");
  await f.send("/new");
  assert.match(f.last().text, /Подходящих новых слов пока нет/);
  assert.deepEqual(f.errors, []);
});

test("dictionary HTML is escaped and long content stays within Telegram's parsed text limit", async t => {
  const f = await fixture(t);
  const [meaning] = await f.repos.catalog.getMeaningDetails([f.meanings[0].id]);
  const rendered = answerText({ ...meaning, word: { ...meaning.word, title: "<b>&word</b>" },
    meaningTranslation: "😀".repeat(5000), meaning: "<script>".repeat(5000), hint: "<&".repeat(2000),
    examples: Array.from({ length: 10 }, () => ({ example: "😀".repeat(5000), exampleTranslation: "😀".repeat(5000) })) });
  assert.match(rendered, /&lt;b&gt;&amp;word&lt;\/b&gt;/);
  assert.doesNotMatch(rendered, /<script>/);
  const parsed = rendered.replace(/<[^>]*>/g, "").replace(/&(?:amp|lt|gt);/g, "x");
  assert.ok(parsed.length + 150 < 4096, `Parsed text too long: ${parsed.length}`);
});

test("each FSRS grade is available only after reveal and schedules a persisted review", async t => {
  for (const rating of [1, 2, 3, 4]) await t.test(`rating ${rating}`, async t => {
    const f = await fixture(t, { count: 1 });
    await f.send("/new");
    await f.click("accept");
    const u = await f.user();
    const question = f.last(), revealData = f.find("reveal");
    await f.clickRaw(revealData.replace(":reveal", `:rate:${rating}`), question);
    assert.equal((await f.repos.learning.reviews.list({ userId: u.id })).length, 0);
    assert.equal((await f.state()).revealed, false);
    await f.clickRaw(revealData, question);
    const message = f.messages.get(`10:${question.message_id}`);
    const data = message.reply_markup.inline_keyboard.flat().find(button => button.callback_data.endsWith(`:rate:${rating}`)).callback_data;
    await f.clickRaw(data.replace(/:rate:\d$/, ":rate:5"), message);
    assert.equal((await f.repos.learning.reviews.list({ userId: u.id })).length, 0);
    await f.clickRaw(data, message);
    const [review] = await f.repos.learning.reviews.list({ userId: u.id });
    assert.equal(review.rating, rating);
    assert.equal((await f.repos.learning.cards.list({ userId: u.id }))[0].reps, 1);
    assert.deepEqual(f.errors, []);
  });
});

test("topic pages cycle interest/block/neutral while preserving learned statistics", async t => {
  const f = await fixture(t);
  for (let i = 0; i < 10; i++) await f.repos.catalog.topics.create({ slug: `topic-${i}`, name: `Тема ${i}` });
  await f.send("/topics");
  const topicId = Number(f.find("topic").split(":").at(-1)), u = await f.user();
  await f.repos.users.setTopicPreference(u.id, topicId, { interestWeight: 0 });
  await f.repos.users.topicProfiles.update({ userId: u.id, topicId }, { assessmentWeight: 10, vocabularyAbilityOffset: .5 });
  for (const expected of [{ interest: 1, blocked: false }, { interest: 0, blocked: true }, { interest: 0, blocked: false }]) {
    await f.click("topic");
    const preference = await f.repos.users.topicProfiles.get({ userId: u.id, topicId });
    assert.equal(preference.interestWeight, expected.interest);
    assert.equal(preference.isBlocked, expected.blocked);
    assert.equal(preference.assessmentWeight, 10);
    assert.equal(preference.vocabularyAbilityOffset, .5);
  }
  await f.click("page");
  assert.equal((await f.state()).page, 1);
  assert.equal(f.last().reply_markup.inline_keyboard.flat().filter(button => button.callback_data.includes(":topic:")).length, 3);
  await f.click("page");
  assert.equal((await f.state()).page, 0);
  assert.deepEqual(f.errors, []);
});

test("an overdue card remains available with quota zero and idle displays its next due time", async t => {
  const f = await fixture(t);
  await f.send("/menu");
  const u = await f.user();
  const card = await f.services.fsrs.addMeaning(u.id, f.meanings[0].id);
  await f.services.profiles.configure(u.id, { dailyNewMeaningLimit: 0, timezone: "Europe/Moscow" });
  await f.send("/study");
  assert.equal((await f.state()).expected.wordMeaningId, card.wordMeaningId);
  await f.click("reveal");
  await f.click("rate");
  await f.send("/study");
  assert.match(f.last().text, /Ближайшее повторение:/);
  assert.match(f.last().text, /Europe\/Moscow/);
  assert.deepEqual(f.errors, []);
});

test("a persisted unanswered card is gradable after a restart with all callbacks under 64 bytes", async t => {
  const f = await fixture(t);
  await f.send("/new");
  await f.click("accept");
  await f.click("reveal");
  const data = f.find("rate"), message = f.last(), u = await f.user();
  const restarted = createTelegramBot("999:TEST", f.db, { botInfo: BOT_INFO, clock: () => new Date("2026-10-10T10:00:05Z"), onError: e => f.errors.push(e) });
  restarted.api.config.use(...f.bot.api.config.installedTransformers());
  await restarted.handleUpdate({ update_id: 9001, callback_query: {
    id: "restart-valid", chat_instance: "test", from: { id: 10, is_bot: false, first_name: "Марат" }, data, message } });
  assert.equal((await f.repos.learning.reviews.list({ userId: u.id })).length, 1);
  for (const call of f.calls) for (const button of call.payload.reply_markup?.inline_keyboard.flat() ?? []) {
    if (button.callback_data) assert.ok(Buffer.byteLength(button.callback_data) <= 64);
  }
  assert.deepEqual(f.errors, []);
});

test("acceptance respects quota changes made after the recommendation was shown", async t => {
  const f = await fixture(t);
  await f.send("/new");
  const u = await f.user();
  await f.services.profiles.configure(u.id, { dailyNewMeaningLimit: 0 });
  await f.click("accept");
  assert.equal((await f.repos.learning.cards.list({ userId: u.id })).length, 0);
  assert.match(f.last().text, /Обновите занятие/);
  assert.ok(f.errors.some(error => error.name === "RepositoryConflictError"));
});

test("explicitly accepted meaning opens immediately even when another card is due", async t => {
  const f = await fixture(t);
  await f.send("/menu");
  const u = await f.user();
  const previous = await f.services.fsrs.addMeaning(u.id, f.meanings[0].id);
  await f.services.fsrs.answer(u.id, previous.wordMeaningId, 1, previous);
  f.setTime("2026-10-11T10:00:00Z");
  await f.send("/new");
  const suggested = await f.state();
  await f.click("accept");
  assert.equal((await f.state()).expected.wordMeaningId, suggested.meaningId);
  assert.notEqual((await f.state()).expected.wordMeaningId, previous.wordMeaningId);
  assert.deepEqual(f.errors, []);
});

test("Telegram identity creation discards unsolicited application permission fields", async t => {
  const f = await fixture(t, { seed: false });
  const user = await f.repos.users.upsertTelegramUser({ telegramId: 30, firstName: "User",
    lastName: null, username: null, isAdmin: true });
  assert.equal(user.isAdmin, false);
});
