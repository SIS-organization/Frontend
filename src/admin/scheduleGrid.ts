// Calculul grilei orare (fără React), ca să poată fi testat separat.

import type { AdminBooking, BlockType, ScheduleEntry } from "./api";
import { DAY_END_HOUR, DAY_START_HOUR, gridSpan } from "./time";

export const HOUR_COUNT = DAY_END_HOUR - DAY_START_HOUR; // 13 intervale de 60 de minute
export const POOL_LANES = 4; // regula bazinului: 4 culoare, câte o rezervare pe culoar și oră

/** `index` / `of`: poziția blocului printre blocurile suprapuse (ca să stea unul lângă altul). */
export type EntryBlock = { entry: ScheduleEntry; from: number; to: number; index: number; of: number };
export type BookingBlock = { booking: AdminBooking; from: number; to: number; index: number; of: number };

/** Ordinea în care stau blocurile suprapuse: întâi blocările (mentenanță, reparații). */
const BLOCK_ORDER: Record<BlockType, number> = { repair: 0, maintenance: 1, course: 2, event: 3 };

/**
 * Blocările USV ale unei facilități (cursuri, evenimente, mentenanță).
 * Cele care se suprapun stau una lângă alta, ca niciuna să nu o acopere pe alta.
 */
export function entryBlocks(entries: ScheduleEntry[], facilityId: string, day: string): EntryBlock[] {
  const placed = entries
    .flatMap((entry) => {
      if (entry.facilityId !== facilityId) return [];
      const span = gridSpan(entry.startTime, entry.endTime, day);
      return span ? [{ entry, ...span }] : [];
    })
    .sort((a, b) => BLOCK_ORDER[a.entry.blockType] - BLOCK_ORDER[b.entry.blockType] || a.from - b.from);

  return placed.map((block) => {
    const overlapping = placed.filter((other) => other.from < block.to && block.from < other.to);
    return { ...block, index: overlapping.indexOf(block), of: overlapping.length };
  });
}

/** Rezervările unei facilități; cele din același interval stau una lângă alta. */
export function bookingBlocks(bookings: AdminBooking[], facilityId: string, day: string): BookingBlock[] {
  const placed = bookings
    .filter((b) => b.facilityId === facilityId)
    .flatMap((booking) => {
      const span = gridSpan(booking.startTime, booking.endTime, day);
      return span ? [{ booking, ...span }] : [];
    })
    .sort((a, b) => a.from - b.from || a.booking.code.localeCompare(b.booking.code));

  return placed.map((block) => {
    const overlapping = placed.filter((other) => other.from < block.to && block.from < other.to);
    return { ...block, index: overlapping.indexOf(block), of: overlapping.length };
  });
}

/** Pentru bazin: câte culoare sunt libere în fiecare oră (null = ora e blocată). */
export function freeLanesByHour(
  bookings: AdminBooking[],
  blocks: EntryBlock[],
  facilityId: string,
  day: string,
): Array<number | null> {
  const mine = bookings
    .filter((b) => b.facilityId === facilityId)
    .flatMap((b) => {
      const span = gridSpan(b.startTime, b.endTime, day);
      return span ? [span] : [];
    });

  return Array.from({ length: HOUR_COUNT }, (_, hour) => {
    if (blocks.some((block) => block.from < hour + 1 && hour < block.to)) return null;
    const used = mine.filter((span) => span.from < hour + 1 && hour < span.to).length;
    return Math.max(0, POOL_LANES - used);
  });
}

export const BLOCK_STYLES: Record<BlockType, { box: string; label: string }> = {
  course: { box: "bg-[#e9edf5] text-[#4a5879]", label: "Curs USV" },
  event: { box: "bg-[#e9edf5] text-[#4a5879]", label: "Eveniment USV" },
  maintenance: { box: "bg-[#fff3dc] text-[#926018]", label: "Întreținere" },
  repair: { box: "bg-[#fcedea] text-[#ac443c]", label: "indisponibil" },
};
