export const HOURS = Array.from({ length: 13 }, (_, i) => 8 + i); // 08:00–20:00 (ultimul slot se termină la 21:00)

export const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

export const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function weekDays(offset: number): Date[] {
  const now = new Date();
  const start = now.getDate() - ((now.getDay() + 6) % 7) + offset * 7; // luni
  return Array.from({ length: 7 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), start + i));
}

export const formatDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" });
