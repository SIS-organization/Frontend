// Apelurile zonei de administrare, exact după contractul din Swagger
// (campus_sports_api_final.json). Toate rutele sunt sub /admin și sunt
// protejate de backend: fără token → 401, fără rolul `administrator` → 403.
//
// Fiecare răspuns este verificat la sosire: păstrăm doar câmpurile din contract,
// cu tipurile și valorile permise. Datele incomplete sau neașteptate sunt
// ignorate, ca un răspuns greșit (sau modificat) să nu poată strica interfața.

import { apiRequest } from "../api/client";
import { isValidIsoDate } from "./time";

export type FacilityStatus = "operational" | "under_maintenance" | "university_activity" | "closed";
export type BlockType = "course" | "event" | "maintenance" | "repair";
export type BookingStatus =
  | "in_verification"
  | "confirmed"
  | "rejected"
  | "cancelled"
  | "awaiting_transfer"
  | "completed";

export type ScheduleFacility = {
  facilityId: string;
  name: string;
  status: FacilityStatus;
  statusLabel: string | null;
  note: string | null;
};

export type ScheduleEntry = {
  startTime: string;
  endTime: string;
  title: string;
  facilityId: string;
  facilityName: string | null;
  source: string | null;
  blockType: BlockType;
  activityId: string | null;
  incidentId: string | null;
};

export type ActiveIncident = {
  id: string;
  code: string;
  facilityId: string | null;
  startTime: string | null;
  endTime: string | null;
};

export type AdminSchedule = {
  date: string;
  facilities: ScheduleFacility[];
  entries: ScheduleEntry[];
  activeIncident: ActiveIncident | null;
};

export type AdminBooking = {
  id: string;
  code: string;
  facilityId: string;
  facilityName: string;
  userName: string | null;
  startTime: string;
  endTime: string;
  status: BookingStatus;
};

export type FacilityKind = {
  id: string;
  /** Numele afișat (ex. „Sală de sport”), folosit în formularele de administrare. */
  name: string;
  /** Bazinul: fiecare culoar se rezervă separat. */
  hasLanes: boolean;
};

const FACILITY_STATUSES: readonly FacilityStatus[] = ["operational", "under_maintenance", "university_activity", "closed"];
const BLOCK_TYPES: readonly BlockType[] = ["course", "event", "maintenance", "repair"];
const BOOKING_STATUSES: readonly BookingStatus[] = [
  "in_verification",
  "confirmed",
  "rejected",
  "cancelled",
  "awaiting_transfer",
  "completed",
];

// Limite de siguranță: nu afișăm texte sau liste nerezonabil de mari.
const MAX_TEXT = 200;
const MAX_ITEMS = 1000;
const MAX_PAGES = 20;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, MAX_TEXT);
}

/** Id-urile sunt UUID în contract; acceptăm și numere (baza de date actuală). */
function identifier(value: unknown): string | null {
  const id = typeof value === "number" && Number.isInteger(value) ? String(value) : value;
  return typeof id === "string" && ID_PATTERN.test(id) ? id : null;
}

function dateTime(value: unknown): string | null {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value)) ? value : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, MAX_ITEMS) : [];
}

function validInterval(start: string | null, end: string | null): boolean {
  return start !== null && end !== null && Date.parse(end) > Date.parse(start);
}

function parseScheduleFacility(raw: unknown): ScheduleFacility | null {
  if (!isObject(raw)) return null;
  const facilityId = identifier(raw.facilityId);
  const name = text(raw.name);
  const status = oneOf(raw.status, FACILITY_STATUSES);
  if (!facilityId || !name || !status) return null;
  return { facilityId, name, status, statusLabel: text(raw.statusLabel), note: text(raw.note) };
}

function parseEntry(raw: unknown): ScheduleEntry | null {
  if (!isObject(raw)) return null;
  const startTime = dateTime(raw.startTime);
  const endTime = dateTime(raw.endTime);
  const facilityId = identifier(raw.facilityId);
  const title = text(raw.title);
  const blockType = oneOf(raw.blockType, BLOCK_TYPES);
  if (!validInterval(startTime, endTime) || !facilityId || !title || !blockType) return null;
  return {
    startTime: startTime!,
    endTime: endTime!,
    title,
    facilityId,
    facilityName: text(raw.facilityName),
    source: text(raw.source),
    blockType,
    activityId: identifier(raw.activityId),
    incidentId: identifier(raw.incidentId),
  };
}

function parseIncident(raw: unknown): ActiveIncident | null {
  if (!isObject(raw)) return null;
  const id = identifier(raw.id);
  const code = text(raw.code);
  if (!id || !code) return null;
  return {
    id,
    code,
    facilityId: isObject(raw.facility) ? identifier(raw.facility.id) : null,
    startTime: dateTime(raw.startTime),
    endTime: dateTime(raw.endTime),
  };
}

export function parseAdminSchedule(raw: unknown, requestedDate: string): AdminSchedule {
  if (!isObject(raw)) throw new Error("Răspuns invalid pentru orar.");
  const facilities = list(raw.facilities)
    .map(parseScheduleFacility)
    .filter((f): f is ScheduleFacility => f !== null);
  // Un id de facilitate apare o singură dată (prima apariție câștigă).
  const unique = facilities.filter((f, i) => facilities.findIndex((g) => g.facilityId === f.facilityId) === i);
  return {
    date: isValidIsoDate(raw.date) ? raw.date : requestedDate,
    facilities: unique,
    entries: list(raw.entries)
      .map(parseEntry)
      .filter((e): e is ScheduleEntry => e !== null),
    activeIncident: parseIncident(raw.activeIncident),
  };
}

function parseBooking(raw: unknown): AdminBooking | null {
  if (!isObject(raw) || !isObject(raw.facility)) return null;
  const id = identifier(raw.id);
  const code = text(raw.code);
  const facilityId = identifier(raw.facility.id);
  const facilityName = text(raw.facility.name);
  const startTime = dateTime(raw.startTime);
  const endTime = dateTime(raw.endTime);
  const status = oneOf(raw.status, BOOKING_STATUSES);
  if (!id || !code || !facilityId || !facilityName || !status || !validInterval(startTime, endTime)) return null;
  return {
    id,
    code,
    facilityId,
    facilityName,
    userName: isObject(raw.user) ? text(raw.user.name) : null,
    startTime: startTime!,
    endTime: endTime!,
    status,
  };
}

function requireDate(date: string) {
  // Nu trimitem niciodată la server o valoare nevalidată.
  if (!isValidIsoDate(date)) throw new Error("Dată invalidă.");
}

/** GET /admin/schedule — cardurile de stare și blocările zilei (cursuri, evenimente, mentenanță). */
export async function getAdminSchedule(date: string, facilityId: string | null, signal?: AbortSignal) {
  requireDate(date);
  const query = new URLSearchParams({ date });
  if (facilityId) query.set("facilityId", facilityId);
  const raw = await apiRequest<unknown>(`/admin/schedule?${query.toString()}`, "GET", undefined, {}, { signal });
  return parseAdminSchedule(raw, date);
}

/**
 * GET /admin/bookings — rezervările unei zile (viitoare + istoric).
 * Anulările nu apar în orar. Paginile se citesc până la MAX_PAGES.
 */
export async function getAdminBookingsForDay(date: string, facilityId: string | null, signal?: AbortSignal) {
  requireDate(date);
  const result = new Map<string, AdminBooking>();

  for (const tab of ["upcoming", "history"] as const) {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const query = new URLSearchParams({ tab, from: date, to: date, page: String(page), pageSize: "100" });
      if (facilityId) query.set("facilityId", facilityId);
      const raw = await apiRequest<unknown>(`/admin/bookings?${query.toString()}`, "GET", undefined, {}, { signal });
      if (!isObject(raw)) throw new Error("Răspuns invalid pentru rezervări.");

      for (const item of list(raw.items)) {
        const booking = parseBooking(item);
        if (booking && booking.status !== "cancelled" && booking.status !== "rejected") {
          result.set(booking.id, booking);
        }
      }
      const totalPages = typeof raw.totalPages === "number" ? raw.totalPages : 1;
      if (page >= totalPages) break;
    }
  }
  return [...result.values()];
}

/** GET /facilities — lista facilităților și care dintre ele are culoare (bazinul). */
export async function getFacilityKinds(signal?: AbortSignal): Promise<FacilityKind[]> {
  const raw = await apiRequest<unknown>("/facilities?page=1&pageSize=100", "GET", undefined, {}, { signal });
  if (!isObject(raw)) return [];
  return list(raw.items).flatMap((item) => {
    if (!isObject(item)) return [];
    const id = identifier(item.id);
    if (!id) return [];
    const codes = [...list(item.sports), ...list(item.amenities)]
      .map((entry) => (isObject(entry) ? entry.code : null))
      .filter((code): code is string => typeof code === "string");
    const name = text(item.name) ?? "Facilitate";
    return [{ id, name, hasLanes: codes.includes("swimming") || codes.includes("swim_lanes") }];
  });
}

// ===========================================================================
// Activități USV (cursuri și evenimente) — /admin/activities
// ===========================================================================

export type ActivityType = "course" | "event";
const ACTIVITY_TYPES: readonly ActivityType[] = ["course", "event"];

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  course: "Curs universitar",
  event: "Eveniment USV",
};

/** Corpul pentru creare / editare / previzualizare (`ActivityCreate` din contract). */
export type ActivityInput = {
  name: string;
  type: ActivityType;
  facilityId: string;
  organizer: string;
  startTime: string;
  endTime: string;
  recurrence: { frequency: "none" | "weekly"; until: string | null };
  calendarMessage: string;
  resolveConflicts?: boolean;
};

export type Activity = {
  id: string;
  code: string | null;
  name: string;
  type: ActivityType;
  facilityId: string;
  organizer: string;
  startTime: string;
  endTime: string;
  recurrence: { frequency: "none" | "weekly"; until: string | null };
  calendarMessage: string;
  status: "published" | "cancelled";
};

export type AffectedBooking = {
  id: string;
  code: string;
  userName: string | null;
  userRole: string | null;
  startTime: string;
  endTime: string;
  quotaWillBeRefunded: boolean;
};

export type ActivityPreview = {
  available: boolean;
  affectedBookings: AffectedBooking[];
  overlappingActivities: Activity[];
  message: string | null;
};

function parseRecurrence(raw: unknown): Activity["recurrence"] {
  if (!isObject(raw)) return { frequency: "none", until: null };
  const frequency = oneOf(raw.frequency, ["none", "weekly"] as const) ?? "none";
  return { frequency, until: isValidIsoDate(raw.until) ? raw.until : null };
}

export function parseActivity(raw: unknown): Activity | null {
  if (!isObject(raw)) return null;
  const id = identifier(raw.id);
  const name = text(raw.name);
  const type = oneOf(raw.type, ACTIVITY_TYPES);
  const facilityId = identifier(raw.facilityId);
  const startTime = dateTime(raw.startTime);
  const endTime = dateTime(raw.endTime);
  if (!id || !name || !type || !facilityId || !validInterval(startTime, endTime)) return null;
  return {
    id,
    code: text(raw.code),
    name,
    type,
    facilityId,
    organizer: text(raw.organizer) ?? "",
    startTime: startTime!,
    endTime: endTime!,
    recurrence: parseRecurrence(raw.recurrence),
    calendarMessage: text(raw.calendarMessage) ?? "",
    status: oneOf(raw.status, ["published", "cancelled"] as const) ?? "published",
  };
}

/** Rezervare afectată: din `Booking` (activități) sau din lista de impact a incidentelor. */
function parseAffected(raw: unknown): AffectedBooking | null {
  if (!isObject(raw)) return null;
  const id = identifier(raw.bookingId ?? raw.id);
  const code = text(raw.code);
  const startTime = dateTime(raw.startTime);
  const endTime = dateTime(raw.endTime);
  if (!id || !code || !validInterval(startTime, endTime)) return null;
  const user = isObject(raw.user) ? raw.user : null;
  return {
    id,
    code,
    userName: text(raw.userName) ?? (user ? text(user.name) : null),
    userRole: text(raw.userRole) ?? (user ? text(user.role) : null),
    startTime: startTime!,
    endTime: endTime!,
    quotaWillBeRefunded: raw.quotaWillBeRefunded === true,
  };
}

function parseActivityPreview(raw: unknown): ActivityPreview {
  if (!isObject(raw)) throw new Error("Răspuns invalid la verificarea intervalului.");
  return {
    available: raw.available === true,
    affectedBookings: list(raw.affectedBookings).map(parseAffected).filter((b): b is AffectedBooking => b !== null),
    overlappingActivities: list(raw.overlappingActivities).map(parseActivity).filter((a): a is Activity => a !== null),
    message: text(raw.message),
  };
}

/** POST /admin/activities/preview — verifică intervalul fără să salveze nimic. */
export async function previewActivity(input: ActivityInput, signal?: AbortSignal) {
  return parseActivityPreview(
    await apiRequest<unknown>("/admin/activities/preview", "POST", input, {}, { signal }),
  );
}

/** POST /admin/activities — publică activitatea (201). */
export async function createActivity(input: ActivityInput) {
  const activity = parseActivity(await apiRequest<unknown>("/admin/activities", "POST", input));
  if (!activity) throw new Error("Răspuns invalid la publicarea activității.");
  return activity;
}

/** Id-ul ajunge în adresa cererii: îl verificăm și îl codificăm (fără „../” sau „?”). */
function idPath(id: string): string {
  if (!identifier(id)) throw new Error("Identificator invalid.");
  return encodeURIComponent(id);
}

/** GET /admin/activities/{activityId} — detaliile unei activități. */
export async function getActivity(id: string, signal?: AbortSignal) {
  const activity = parseActivity(
    await apiRequest<unknown>(`/admin/activities/${idPath(id)}`, "GET", undefined, {}, { signal }),
  );
  if (!activity) throw new Error("Răspuns invalid pentru activitate.");
  return activity;
}

/**
 * PUT /admin/activities/{activityId} — salvează modificările.
 * Serverul reverifică intervalul: 409 dacă se suprapune cu rezervări (se poate
 * retrimite cu `resolveConflicts: true`) sau cu alte activități.
 */
export async function updateActivity(id: string, input: ActivityInput) {
  const activity = parseActivity(await apiRequest<unknown>(`/admin/activities/${idPath(id)}`, "PUT", input));
  if (!activity) throw new Error("Răspuns invalid la salvarea activității.");
  return activity;
}

/** Ce anulăm la o activitate: o singură apariție sau toată seria săptămânală. */
export type CancelScope = "this_occurrence" | "series";

/**
 * DELETE /admin/activities/{activityId}?scope=… — anulează activitatea (204).
 * Serverul eliberează numai intervalele viitoare și informează organizatorul.
 */
export async function cancelActivity(id: string, scope: CancelScope) {
  await apiRequest<unknown>(`/admin/activities/${idPath(id)}?scope=${scope}`, "DELETE");
}
