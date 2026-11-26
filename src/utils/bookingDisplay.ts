import { toISO } from "./dates";

// Formatări folosite de „Programările mele”, după textele din designul Figma.

const TIMEZONE = "Europe/Bucharest";

/** Data (YYYY-MM-DD) și ora de început, în ora campusului, dintr-un ISO cu offset. */
export function slotFromIso(iso: string): { date: string; hour: number } {
  const value = new Date(iso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(value)
      .map(({ type, value: part }) => [type, part]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

const offsetDay = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISO(d);
};

const asDate = (iso: string) => new Date(`${iso}T00:00:00`);

/** „astăzi” / „mâine” / „joi, 28 noiembrie”. */
export function relativeDayLabel(iso: string): string {
  if (iso === offsetDay(0)) return "astăzi";
  if (iso === offsetDay(1)) return "mâine";
  return asDate(iso).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" });
}

/** Eticheta din banda cardului mare: „ASTĂZI · 20 OCTOMBRIE”. */
export function cardBandLabel(iso: string): string {
  const dayMonth = asDate(iso).toLocaleDateString("ro-RO", { day: "numeric", month: "long" });
  const prefix =
    iso === offsetDay(0)
      ? "Astăzi"
      : iso === offsetDay(1)
        ? "Mâine"
        : asDate(iso).toLocaleDateString("ro-RO", { weekday: "long" });
  return `${prefix} · ${dayMonth}`.toUpperCase();
}

/** „MARȚI, 20 OCTOMBRIE 2026”. */
export const fullDateUpper = (iso: string) =>
  asDate(iso)
    .toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    .toUpperCase();

/** „Miercuri” */
export const weekdayName = (iso: string) => {
  const name = asDate(iso).toLocaleDateString("ro-RO", { weekday: "long" });
  return name.charAt(0).toUpperCase() + name.slice(1);
};

/** Ziua și luna scurtă pentru plăcuța de dată: { day: "21", month: "NOI" }. */
export function dateTile(iso: string): { day: string; month: string } {
  const d = asDate(iso);
  const month = d.toLocaleDateString("ro-RO", { month: "short" }).replace(".", "").slice(0, 3).toUpperCase();
  return { day: String(d.getDate()), month };
}

/** „13 octombrie 2026” */
export const dayMonthYearLabel = (iso: string) =>
  asDate(iso).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });

/** „Octombrie 2026” */
export function monthYearLabel(d: Date): string {
  const text = d.toLocaleDateString("ro-RO", { month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** HH:MM */
export const clockLabel = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Tipul facilității după nume, pentru iconița din cardurile din design. */
export function facilityKind(name: string): "fitness" | "pool" | "field" | "hall" {
  const lower = name.toLowerCase();
  if (lower.includes("fitness")) return "fitness";
  if (lower.includes("bazin") || lower.includes("înot")) return "pool";
  if (lower.includes("teren") || lower.includes("fotbal")) return "field";
  return "hall";
}
