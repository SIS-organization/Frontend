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
  /**
   * Culoarul (1–4) la bazin, dacă serverul îl trimite (câmp opțional, nu e încă în contract).
   * Fără el, orarul împarte rezervările pe culoare în ordinea în care vin.
   */
  lane: number | null;
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
    lane: typeof raw.lane === "number" && Number.isInteger(raw.lane) && raw.lane >= 1 && raw.lane <= 4 ? raw.lane : null,
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

// ===========================================================================
// Incidente / blocări de mentenanță — /admin/incidents
// ===========================================================================

export type IncidentType = "urgent_cleaning" | "scheduled_cleaning" | "repair" | "equipment_failure" | "maintenance";
export const INCIDENT_TYPES: readonly IncidentType[] = [
  "urgent_cleaning",
  "scheduled_cleaning",
  "repair",
  "equipment_failure",
  "maintenance",
];
/** Etichetele din lista „Motivul blocării”. */
export const INCIDENT_TYPE_LABEL: Record<IncidentType, string> = {
  urgent_cleaning: "Mentenanță · igienizare urgentă",
  scheduled_cleaning: "Mentenanță · igienizare programată",
  repair: "Reparație",
  equipment_failure: "Defecțiune echipament",
  maintenance: "Mentenanță generală",
};

/** Canalele prin care sunt anunțate persoanele afectate. */
export type Channel = "sms" | "push" | "email" | "in_app";
const CHANNELS: readonly Channel[] = ["sms", "push", "email", "in_app"];
export const CHANNEL_LABEL: Record<Channel, string> = { sms: "SMS", push: "Push", email: "E-mail", in_app: "În aplicație" };

/** Corpul pentru previzualizare și creare (`IncidentCreate` din contract). */
export type IncidentInput = {
  facilityId: string;
  type: IncidentType;
  publicReason: string;
  startTime: string;
  endTime: string;
  notifyChannels: Channel[];
};

/** Un incident (`Incident` din contract), cu valorile verificate. */
export type Incident = {
  id: string;
  code: string;
  facilityId: string | null;
  facilityName: string | null;
  type: IncidentType | null;
  status: "active" | "reopened_early" | "closed";
  publicReason: string;
  startTime: string;
  endTime: string;
  reopenedAt: string | null;
  affectedBookings: number;
  quotasRefunded: number;
  notifiedUsers: number;
  pendingNotifications: number;
};

/** Impactul calculat de server înainte de confirmare (`IncidentPreview`). */
export type IncidentPreview = {
  affectedBookings: AffectedBooking[];
  affectedCount: number;
  quotaRefunds: number;
  waitlistInformed: number;
};

/** Număr întreg ≥ 0; orice altceva devine 0. */
const count = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0);

export function parseIncidentRecord(raw: unknown): Incident | null {
  if (!isObject(raw)) return null;
  const id = identifier(raw.id);
  const code = text(raw.code);
  const status = oneOf(raw.status, ["active", "reopened_early", "closed"] as const);
  const startTime = dateTime(raw.startTime);
  const endTime = dateTime(raw.endTime);
  if (!id || !code || !status || !validInterval(startTime, endTime)) return null;
  const facility = isObject(raw.facility) ? raw.facility : null;
  return {
    id,
    code,
    facilityId: facility ? identifier(facility.id) : null,
    facilityName: facility ? text(facility.name) : null,
    type: oneOf(raw.type, INCIDENT_TYPES),
    status,
    publicReason: text(raw.publicReason) ?? "",
    startTime: startTime!,
    endTime: endTime!,
    reopenedAt: dateTime(raw.reopenedAt),
    affectedBookings: count(raw.affectedBookings),
    quotasRefunded: count(raw.quotasRefunded),
    notifiedUsers: count(raw.notifiedUsers),
    pendingNotifications: count(raw.pendingNotifications),
  };
}

function parseIncidentPreview(raw: unknown): IncidentPreview {
  if (!isObject(raw)) throw new Error("Răspuns invalid la calculul impactului.");
  const affected = list(raw.affectedBookings)
    .map(parseAffected)
    .filter((b): b is AffectedBooking => b !== null);
  return {
    affectedBookings: affected,
    affectedCount: typeof raw.affectedCount === "number" ? count(raw.affectedCount) : affected.length,
    quotaRefunds: count(raw.quotaRefunds),
    waitlistInformed: count(raw.waitlistInformed),
  };
}

/** Păstrăm doar canalele cunoscute, fără dubluri. */
function cleanChannels(channels: Channel[]) {
  return CHANNELS.filter((c) => channels.includes(c));
}

/**
 * POST /admin/incidents/preview — „Ciornă”: calculează impactul blocării
 * (rezervări anulate, cote restituite) fără să modifice nimic.
 */
export async function previewIncident(input: IncidentInput, signal?: AbortSignal) {
  const body = { ...input, notifyChannels: cleanChannels(input.notifyChannels) };
  return parseIncidentPreview(await apiRequest<unknown>("/admin/incidents/preview", "POST", body, {}, { signal }));
}

/**
 * POST /admin/incidents — aplică blocarea. Serverul cere `confirmed: true`
 * (confirmarea explicită a administratorului) și reverifică impactul.
 */
export async function createIncident(input: IncidentInput) {
  const body = { ...input, notifyChannels: cleanChannels(input.notifyChannels), confirmed: true };
  const incident = parseIncidentRecord(await apiRequest<unknown>("/admin/incidents", "POST", body));
  if (!incident) throw new Error("Răspuns invalid la aplicarea blocării.");
  return incident;
}

/** GET /admin/incidents?status=active&from=&to= — incidentele active dintr-o zi. */
export async function getActiveIncidents(date: string, signal?: AbortSignal) {
  if (!isValidIsoDate(date)) throw new Error("Dată invalidă.");
  const query = new URLSearchParams({ status: "active", from: date, to: date, page: "1", pageSize: "20" });
  const raw = await apiRequest<unknown>(`/admin/incidents?${query.toString()}`, "GET", undefined, {}, { signal });
  if (!isObject(raw)) throw new Error("Răspuns invalid pentru incidente.");
  return list(raw.items)
    .map(parseIncidentRecord)
    .filter((i): i is Incident => i !== null);
}

/** O intrare din jurnalul incidentului (`AuditLogEntry`), cu valorile verificate. */
export type LogEntry = {
  id: string;
  occurredAt: string;
  title: string;
  description: string | null;
  actorName: string | null;
};

function parseLogEntry(raw: unknown): LogEntry | null {
  if (!isObject(raw)) return null;
  const occurredAt = dateTime(raw.occurredAt);
  const title = text(raw.title);
  if (!occurredAt || !title) return null;
  return {
    id: identifier(raw.id) ?? `${occurredAt}-${title}`,
    occurredAt,
    title,
    description: text(raw.description),
    actorName: isObject(raw.actor) ? text(raw.actor.name) : null,
  };
}

/** GET /admin/incidents/{incidentId} — detaliile unui incident. */
export async function getIncident(id: string, signal?: AbortSignal) {
  const incident = parseIncidentRecord(
    await apiRequest<unknown>(`/admin/incidents/${idPath(id)}`, "GET", undefined, {}, { signal }),
  );
  if (!incident) throw new Error("Răspuns invalid pentru incident.");
  return incident;
}

/** GET /admin/incidents/{incidentId}/log — jurnalul incidentului, în ordine cronologică. */
export async function getIncidentLog(id: string, signal?: AbortSignal) {
  const raw = await apiRequest<unknown>(`/admin/incidents/${idPath(id)}/log`, "GET", undefined, {}, { signal });
  return list(raw)
    .map(parseLogEntry)
    .filter((e): e is LogEntry => e !== null)
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
}

/**
 * POST /admin/incidents/{incidentId}/reopen — deblocare anticipată.
 * Se trimite doar după ce administratorul a confirmat siguranța (`safetyConfirmed: true`).
 * Rezervările anulate nu se reactivează; doar intervalele rămase redevin libere.
 */
export async function reopenIncident(id: string, reopenFrom: string) {
  const incident = parseIncidentRecord(
    await apiRequest<unknown>(`/admin/incidents/${idPath(id)}/reopen`, "POST", { reopenFrom, safetyConfirmed: true }),
  );
  if (!incident) throw new Error("Răspuns invalid la deblocare.");
  return incident;
}

// ===========================================================================
// Detaliile unei rezervări (vederea de administrator) — /admin/bookings/{id}
// ===========================================================================

/** Cine a anulat o rezervare (`CancelledBy` din contract). */
export type CancelledBy = "user" | "administrator" | "maintenance" | "university_activity" | "system";
const CANCELLED_BY: readonly CancelledBy[] = ["user", "administrator", "maintenance", "university_activity", "system"];

/** Cota lunară a utilizatorului (`Quota` din contract). */
export type UserQuota = {
  month: string;
  /** Rezervări incluse pe lună; null = nu se aplică (profesori, externi). */
  included: number | null;
  used: number;
  remaining: number | null;
  resetsOn: string | null;
  limitReached: boolean;
  appliesTo: "student" | "professor_unlimited" | "external_none" | null;
};

export type BookingDetails = AdminBooking & {
  userRole: string | null;
  usesIncludedQuota: boolean;
  cancelledBy: CancelledBy | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  quotaRefunded: boolean;
  createdAt: string | null;
  quota: UserQuota | null;
};

function parseQuota(raw: unknown): UserQuota | null {
  if (!isObject(raw)) return null;
  const month = typeof raw.month === "string" && /^\d{4}-\d{2}$/.test(raw.month) ? raw.month : null;
  if (!month) return null;
  const nullableCount = (value: unknown) => (value === null || value === undefined ? null : count(value));
  return {
    month,
    included: nullableCount(raw.included),
    used: count(raw.used),
    remaining: nullableCount(raw.remaining),
    resetsOn: isValidIsoDate(raw.resetsOn) ? raw.resetsOn : null,
    limitReached: raw.limitReached === true,
    appliesTo: oneOf(raw.appliesTo, ["student", "professor_unlimited", "external_none"] as const),
  };
}

/** GET /admin/bookings/{bookingId} — rezervarea și cota lunară a utilizatorului. */
export async function getAdminBooking(id: string, signal?: AbortSignal): Promise<BookingDetails> {
  const raw = await apiRequest<unknown>(`/admin/bookings/${idPath(id)}`, "GET", undefined, {}, { signal });
  const booking = parseBooking(raw);
  if (!booking || !isObject(raw)) throw new Error("Răspuns invalid pentru rezervare.");
  return {
    ...booking,
    userRole: isObject(raw.user) ? text(raw.user.role) : null,
    usesIncludedQuota: raw.usesIncludedQuota === true,
    cancelledBy: oneOf(raw.cancelledBy, CANCELLED_BY),
    cancelReason: text(raw.cancelReason),
    cancelledAt: dateTime(raw.cancelledAt),
    quotaRefunded: raw.quotaRefunded === true,
    createdAt: dateTime(raw.createdAt),
    quota: parseQuota(raw.userQuota),
  };
}

/** Limitele motivului de anulare (contract: 3–300 de caractere). */
export const CANCEL_REASON_MIN = 3;
export const CANCEL_REASON_MAX = 300;

/** Rezultatul anulării administrative (`CancelResult` din contract). */
export type CancelResult = {
  /** Cota a fost restituită (doar la studenți). */
  quotaRestored: boolean;
  /** Câte persoane de pe lista de așteptare au fost anunțate că s-a eliberat locul. */
  waitlistNotified: number;
};

/**
 * POST /admin/bookings/{bookingId}/cancel — anulare administrativă.
 * Motivul e obligatoriu și ajunge la persoana afectată în notificare; serverul
 * eliberează intervalul, restituie cota și înregistrează acțiunea în jurnal.
 * 409 = rezervarea nu mai este activă.
 */
export async function cancelAdminBooking(id: string, reason: string): Promise<CancelResult> {
  const trimmed = reason.trim();
  if (trimmed.length < CANCEL_REASON_MIN || trimmed.length > CANCEL_REASON_MAX) {
    throw new Error(`Motivul trebuie să aibă între ${CANCEL_REASON_MIN} și ${CANCEL_REASON_MAX} de caractere.`);
  }
  const raw = await apiRequest<unknown>(`/admin/bookings/${idPath(id)}/cancel`, "POST", { reason: trimmed });
  if (!isObject(raw)) throw new Error("Răspuns invalid la anularea rezervării.");
  return { quotaRestored: raw.quotaRestored === true, waitlistNotified: count(raw.waitlistNotified) };
}

