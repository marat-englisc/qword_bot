import { InlineKeyboard } from "grammy";
import type { loadMeaningDetails } from "../db/repositories/catalogRepository";
import type { Session } from "./session";
import { callback } from "./session";

export type View = { text: string; keyboard: InlineKeyboard };
export type Button = [string, string, (string | number)?];
export type MeaningDetails = Awaited<ReturnType<typeof loadMeaningDetails>>[number];
export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export function short(value: string, length = 150) {
  // Telegram lengths are bounded conservatively in UTF-16 code units; keep emoji pairs intact.
  if (value.length <= length) return value;
  const end = /[\uD800-\uDBFF]/.test(value[length - 1] ?? "") ? length - 1 : length;
  return `${value.slice(0, end)}…`;
}
export const html = (value: string, length?: number) => escapeHtml(short(value, length));
export function keyboard(session: Session, rows: Button[][]) {
  const keys = new InlineKeyboard();
  for (const row of rows) {
    if (!row.length) continue;
    for (const [label, action, arg] of row) keys.text(label, callback(session, action, arg));
    keys.row();
  }
  return keys;
}
export function menuKeyboard(session: Session) {
  return keyboard(session, [
    [["📚 Заниматься", "study"], ["✨ Новые слова", "new"]],
    [["📊 Прогресс", "stats"], ["⚙️ Настройки", "settings"]],
    [["🎯 Темы", "topics"], ["❓ Помощь", "help"]],
  ]);
}
export function wordTitle(meaning: MeaningDetails) {
  return `<b>${html(meaning.word.title, 100)}</b>` +
    (meaning.word.transcription ? ` ${html(meaning.word.transcription, 100)}` : "") +
    `\n${html(meaning.partOfSpeech, 60)} · ${html(meaning.cefrLevel, 10)}`;
}
export function answerText(meaning: MeaningDetails) {
  const examples = meaning.examples.slice(0, 2).map(row =>
    `${html(row.example, 300)}\n${html(row.exampleTranslation, 300)}`);
  return `${wordTitle(meaning)}\n\n<b>${html(meaning.meaningTranslation, 500)}</b>\n` +
    html(meaning.meaning, 500) +
    (meaning.hint ? `\n\nПодсказка: ${html(meaning.hint, 200)}` : "") +
    (examples.length ? `\n\n${examples.join("\n\n")}` : "");
}
export function interval(due: Date, now: Date) {
  const minutes = Math.max(1, Math.ceil((+due - +now) / 60_000));
  if (minutes < 60) return `${minutes} мин`;
  if (minutes < 1440) return `${Math.ceil(minutes / 60)} ч`;
  return `${Math.ceil(minutes / 1440)} дн`;
}
export function dateText(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(date);
}
export function doneView(session: Session, text: string, next: "study" | "new"): View {
  return { text, keyboard: keyboard(session, [
    [["Далее →", next], ["Меню", "menu"]],
  ]) };
}
