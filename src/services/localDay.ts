import { dateMillis } from "../db/repositories/core";
import { DAY } from "./common";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string) {
  let result = formatters.get(timezone);
  if (!result) {
    result = new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timezone, result);
  }
  return result;
}

export function validateTimezone(timezone: string) {
  formatter(timezone);
  return timezone;
}

function parts(at: Date, timezone: string) {
  const result = formatter(timezone).formatToParts(at);
  return ["year", "month", "day"].map((type) =>
    Number(result.find((part) => part.type === type)!.value),
  );
}

export function localDayKey(at: Date, timezone: string) {
  const [year, month, day] = parts(at, timezone);
  return (
    String(year).padStart(4, "0") +
    "-" +
    String(month).padStart(2, "0") +
    "-" +
    String(day).padStart(2, "0")
  );
}

/** Search calendar boundaries rather than adding 24 hours to a local midnight. */
export function localDayBounds(now: Date, timezone: string) {
  const ms = dateMillis(now);
  const [year, month, day] = parts(now, timezone);
  const key = year * 10000 + month * 100 + day;
  const numberAt = (time: number) => {
    const [y, m, d] = parts(new Date(time), timezone);
    return y * 10000 + m * 100 + d;
  };
  const lower = Math.max(0, ms - 2 * DAY),
    upper = Math.min(8.64e15, ms + 2 * DAY);
  function boundary(after: boolean) {
    let lo = lower,
      hi = upper;
    while (lo < hi) {
      const mid = lo + Math.floor((hi - lo) / 2);
      if (after ? numberAt(mid) > key : numberAt(mid) >= key) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }
  const start = boundary(false),
    end = boundary(true);
  if (start > ms || end <= ms)
    throw new RangeError("Local day is outside supported date range");
  return { dayStart: new Date(start), dayEnd: new Date(end) };
}
