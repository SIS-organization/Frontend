// Date și ore pentru zona de administrare. Toate orele se afișează în ora
// României, indiferent de fusul orar al calculatorului administratorului.

export const TIMEZONE = "Europe/Bucharest";
export const DAY_START_HOUR = 8; // 08:00
export const DAY_END_HOUR = 21; // 21:00

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Acceptă doar o dată reală, scrisă exact YYYY-MM-DD (ex. respinge 2026-02-30). */
export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function todayInBucharest(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const v = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${v.year}-${v.month}-${v.day}`;
}

/** Adaugă `days` zile la o dată YYYY-MM-DD. */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Ziua și ora (în România) ale unui moment ISO cu fus orar. */
export function bucharestParts(iso: string): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const v = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { date: `${v.year}-${v.month}-${v.day}`, hour: Number(v.hour), minute: Number(v.minute) };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatClock(iso: string): string {
  const { hour, minute } = bucharestParts(iso);
  return `${pad(hour)}:${pad(minute)}`;
}

export function formatTimeRange(startIso: string, endIso: string): string {
  return `${formatClock(startIso)}–${formatClock(endIso)}`;
}

export const hourLabel = (hour: number) => `${pad(hour)}:00`;

/** Orele de start posibile într-o zi de program: 08, 09, …, 20. */
export const START_HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);
/** Orele de sfârșit posibile: 09, 10, …, 21. */
export const END_HOURS = START_HOURS.map((hour) => hour + 1);

/**
 * Momentul „data, ora:00” în ora României, ca text ISO cu fus orar
 * (ex. „2026-10-20T19:00:00+03:00”), cum cere contractul (`date-time`).
 * Fusul se calculează pentru ziua respectivă (vară +03:00, iarnă +02:00).
 */
export function bucharestIso(date: string, hour: number): string {
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, timeZoneName: "longOffset" })
      .formatToParts(new Date(`${date}T12:00:00Z`))
      .find((part) => part.type === "timeZoneName")
      ?.value.replace("GMT", "") || "+00:00";
  return `${date}T${pad(hour)}:00:00${offset}`;
}

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase("ro-RO") + text.slice(1);

function asDate(date: string) {
  return new Date(`${date}T12:00:00.000Z`);
}

/** „Marți, 20 octombrie 2026” */
export function formatLongDate(date: string): string {
  return capitalize(
    asDate(date).toLocaleDateString("ro-RO", {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  );
}

/** „20 octombrie 2026” */
export function formatDayMonthYear(date: string): string {
  return asDate(date).toLocaleDateString("ro-RO", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
}

/** „20 octombrie” */
export function formatDayMonth(date: string): string {
  return asDate(date).toLocaleDateString("ro-RO", { timeZone: "UTC", day: "numeric", month: "long" });
}

/** „Marți” */
export function formatWeekday(date: string): string {
  return capitalize(asDate(date).toLocaleDateString("ro-RO", { timeZone: "UTC", weekday: "long" }));
}

/**
 * Poziția unui interval în grila zilei, în ore față de 08:00, tăiată la
 * programul 08:00–21:00. `null` dacă intervalul nu cade în ziua afișată.
 */
export function gridSpan(startIso: string, endIso: string, day: string): { from: number; to: number } | null {
  const start = bucharestParts(startIso);
  const end = bucharestParts(endIso);
  const startHours = start.date < day ? DAY_START_HOUR : start.date > day ? Infinity : start.hour + start.minute / 60;
  const endHours = end.date > day ? DAY_END_HOUR : end.date < day ? -Infinity : end.hour + end.minute / 60;
  const from = Math.max(startHours, DAY_START_HOUR);
  const to = Math.min(endHours, DAY_END_HOUR);
  if (!(to > from)) return null;
  return { from: from - DAY_START_HOUR, to: to - DAY_START_HOUR };
}
