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

/** O rezervare de la bazin, așezată pe un culoar (1–4). */
export type LaneBooking = { booking: AdminBooking; from: number; to: number; lane: number };

/**
 * Împarte rezervările bazinului pe cele 4 culoare: pe fiecare culoar, cel mult
 * o rezervare în același interval (regula din Figma: „câte o rezervare pe oră”).
 *   - dacă serverul trimite culoarul (`lane`) și e liber, îl păstrăm;
 *   - altfel rezervarea primește primul culoar liber pe toată durata ei.
 * Ce nu încape (peste 4 rezervări simultane) ajunge în `overflow`, ca să fie semnalat.
 */
export function poolLanes(
  bookings: AdminBooking[],
  facilityId: string,
  day: string,
): { placed: LaneBooking[]; overflow: AdminBooking[] } {
  const items = bookings
    .flatMap((booking) => {
      if (booking.facilityId !== facilityId) return [];
      const span = gridSpan(booking.startTime, booking.endTime, day);
      return span ? [{ booking, ...span }] : [];
    })
    // Întâi cele cu culoar primit de la server, apoi în ordinea orei (stabil după id).
    .sort((a, b) => Number(b.booking.lane !== null) - Number(a.booking.lane !== null) || a.from - b.from || a.booking.id.localeCompare(b.booking.id));

  // busy[culoar][oră] = ocupat
  const busy = Array.from({ length: POOL_LANES }, () => new Array<boolean>(HOUR_COUNT).fill(false));
  const isFree = (lane: number, from: number, to: number) => busy[lane - 1].slice(from, to).every((taken) => !taken);

  const placed: LaneBooking[] = [];
  const overflow: AdminBooking[] = [];
  for (const item of items) {
    const preferred = item.booking.lane;
    const lane =
      preferred !== null && isFree(preferred, item.from, item.to)
        ? preferred
        : Array.from({ length: POOL_LANES }, (_, i) => i + 1).find((l) => isFree(l, item.from, item.to));
    if (lane === undefined) {
      overflow.push(item.booking);
      continue;
    }
    for (let h = item.from; h < item.to; h++) busy[lane - 1][h] = true;
    placed.push({ ...item, lane });
  }
  return { placed, overflow };
}

