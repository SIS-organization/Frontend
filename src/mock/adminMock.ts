// Mock pentru rutele /admin/* din contract:
//   GET  /admin/schedule, GET /admin/bookings, GET /admin/bookings/{bookingId}
//   POST /admin/bookings/{bookingId}/cancel
//   GET  /admin/waitlist, GET /admin/bookings/export (CSV)
//   GET  /admin/users, GET /admin/users/export (CSV)
//   GET  /admin/users/{userId}, GET /admin/users/{userId}/bookings
//   GET  /admin/audit-log (construit din rezervări: confirmări, anulări, cote restituite)
//   POST /admin/activities/preview, POST /admin/activities
//   GET / PUT / DELETE /admin/activities/{activityId}
//   GET /admin/incidents, POST /admin/incidents/preview, POST /admin/incidents
//   GET /admin/incidents/{id}, GET /admin/incidents/{id}/log, POST /admin/incidents/{id}/reopen
// Se comportă ca backend-ul: fără token → 401, alt rol decât administrator → 403,
// date invalide → 400 / 422, suprapuneri → 409. Răspunsurile au forma din Swagger.
//
// Ține minte ce se schimbă (activități, blocări, rezervări anulate) cât timp
// pagina e deschisă, ca fluxurile să poată fi testate cap-coadă fără backend.
// La reîncărcarea paginii, totul revine la datele inițiale.

import { ApiError, type HttpMethod } from "../api/client";
import { mockRoleForToken } from "./authMock";
import { facilityIds } from "./apiMock";
import { facilities } from "./data";


const TIMEZONE = "Europe/Bucharest";
const TEREN = facilityIds[1];
const FITNESS = facilityIds[2];
const BAZIN = facilityIds[3];
const SALA = facilityIds[4];

function fail(status: number, code: string, detail: string): never {
  throw new ApiError(detail, status, code);
}

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

/** „2026-10-20T18:00:00+03:00” — ora României, cu fusul orar al zilei respective. */
function at(date: string, hour: number) {
  const noon = new Date(`${date}T12:00:00Z`);
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, timeZoneName: "longOffset" })
    .formatToParts(noon)
    .find((part) => part.type === "timeZoneName")
    ?.value.replace("GMT", "") || "+00:00";
  return `${date}T${String(hour).padStart(2, "0")}:00:00${offset}`;
}

const facilityName = (id: string) =>
  facilities.find((f) => facilityIds[f.id] === id)?.name ?? "Facilitate";

type MockEntry = {
  facilityId: string;
  from: number;
  to: number;
  title: string;
  source: string;
  blockType: "course" | "event" | "maintenance" | "repair";
  incidentId?: string;
  activityId?: string;
};

/** Blocările inițiale ale unei zile (șablon fix, diferit doar sâmbăta și duminica). */
function templateFor(date: string): MockEntry[] {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = duminică
  if (weekday === 0) return [];
  if (weekday === 6) {
    return [{ facilityId: TEREN, from: 10, to: 12, title: "Turneu interfacultăți", source: "Eveniment USV", blockType: "event" }];
  }
  return [
    { facilityId: SALA, from: 8, to: 10, title: "Educație fizică · anul I", source: "Curs universitar · FEFS", blockType: "course" },
    { facilityId: FITNESS, from: 10, to: 13, title: "Pregătire fizică · FEFS", source: "Curs universitar · FEFS", blockType: "course" },
    { facilityId: TEREN, from: 12, to: 14, title: "Selecție echipă universitară", source: "Eveniment USV", blockType: "event" },
    { facilityId: FITNESS, from: 13, to: 14, title: "Igienizare programată", source: "Întreținere", blockType: "maintenance" },
    { facilityId: TEREN, from: 14, to: 16, title: "Reparație instalație nocturnă", source: "Echipa tehnică", blockType: "repair" },
  ];
}

// ---------------------------------------------------------------------------
// „Baza de date” a mock-ului: se completează la prima cerere pentru o zi.
// ---------------------------------------------------------------------------

type MockActivity = {
  id: string;
  code: string;
  name: string;
  type: "course" | "event";
  facilityId: string;
  organizer: string;
  /** Prima apariție (ora României). */
  date: string;
  from: number;
  to: number;
  recurrence: { frequency: "none" | "weekly"; until: string | null };
  calendarMessage: string;
  status: "published" | "cancelled";
  createdAt: string;
};

type IncidentType = "urgent_cleaning" | "scheduled_cleaning" | "repair" | "equipment_failure" | "maintenance";
const INCIDENT_TYPES: IncidentType[] = ["urgent_cleaning", "scheduled_cleaning", "repair", "equipment_failure", "maintenance"];
/** Titlul blocării în orar, după tipul incidentului. */
const INCIDENT_TITLE: Record<IncidentType, string> = {
  urgent_cleaning: "Igienizare urgentă",
  scheduled_cleaning: "Igienizare programată",
  repair: "Reparație",
  equipment_failure: "Defecțiune echipament",
  maintenance: "Mentenanță",
};
const CHANNELS = ["push", "email", "sms", "in_app"];

type MockIncident = {
  id: string;
  code: string;
  facilityId: string;
  type: IncidentType;
  title: string;
  publicReason: string;
  internalNote: string;
  /** Începutul și sfârșitul planificat (ISO, ora României). */
  start: string;
  end: string;
  status: "active" | "reopened_early" | "closed";
  reopenedAt: string | null;
  affectedBookings: number;
  quotasRefunded: number;
  notifiedUsers: number;
  channels: string[];
  createdAt: string;
  /** Jurnalul incidentului (AuditLogEntry; `type` = AuditEventType din contract). */
  log: { id: string; occurredAt: string; type: string; title: string; description: string }[];
};

const activities = new Map<string, MockActivity>();
const incidents = new Map<string, MockIncident>();
const bookings = new Map<string, MockBooking>();

/** O înscriere pe lista de așteptare (WaitlistEntry din contract). */
type MockWaitlistEntry = {
  id: string;
  facilityId: string;
  user: { id: string; name: string };
  startTime: string;
  endTime: string;
  position: number;
  status: "active" | "offered" | "fulfilled" | "declined" | "expired" | "cancelled";
  /** Mutare: rezervarea care ar fi înlocuită dacă oferta e acceptată. */
  replaceBookingId: string | null;
  offerExpiresAt: string | null;
  createdAt: string;
};
const waitlist = new Map<string, MockWaitlistEntry>();
const seededDays = new Set<string>();
let activityCounter = 120;
let incidentCounter = 300;

/** Prima dată când se cere o zi, îi creăm rezervările și activitățile din șablon. */
function ensureDay(date: string) {
  if (seededDays.has(date)) return;
  seededDays.add(date);
  for (const booking of seedBookings(date)) bookings.set(booking.id, booking);
  for (const entry of seedWaitlist(date)) waitlist.set(entry.id, entry);
  templateFor(date)
    .filter((e) => e.blockType === "maintenance" || e.blockType === "repair")
    .forEach((e, index) => {
      const id = `inc-${date.replaceAll("-", "")}-${index + 1}`;
      const end = at(date, e.to);
      // Blocarea a fost creată în ziua dinainte la 16:00, dar niciodată „în viitor”
      // (altfel, în jurnal, acțiunile de azi ar apărea înaintea creării ei).
      const createdAt = new Date(Math.min(Date.parse(at(addDays(date, -1), 16)), Date.now() - 3_600_000)).toISOString();
      const repair = e.blockType === "repair";
      incidents.set(id, {
        id,
        code: `INC-${date.slice(5, 7)}${date.slice(8, 10)}${index + 1}`,
        facilityId: e.facilityId,
        type: repair ? "repair" : "scheduled_cleaning",
        title: e.title,
        publicReason: repair
          ? "Reparație și verificare de siguranță. Blocare aplicată de echipa tehnică."
          : "Igienizarea programată a sălii și a echipamentelor.",
        internalNote: "",
        start: at(date, e.from),
        end,
        // Blocările din trecut sunt deja închise; restul sunt active.
        status: Date.parse(end) <= Date.now() ? "closed" : "active",
        reopenedAt: null,
        affectedBookings: repair ? 2 : 0,
        quotasRefunded: repair ? 2 : 0,
        notifiedUsers: repair ? 2 : 0,
        channels: ["push", "email"],
        createdAt,
        log: [
          {
            id: `${id}-log-1`,
            occurredAt: createdAt,
            type: "maintenance_closure",
            title: repair ? "Blocare aplicată de echipa tehnică" : "Igienizare programată",
            description: `${facilityName(e.facilityId)} · ${String(e.from).padStart(2, "0")}:00–${String(e.to).padStart(2, "0")}:00`,
          },
          ...(repair
            ? [{
                id: `${id}-log-2`,
                occurredAt: createdAt,
                type: "notification_sent",
                title: "2 persoane notificate",
                description: "Alerte trimise prin push și e-mail; cotele au fost restituite.",
              }]
            : []),
        ],
      });
    });
  templateFor(date)
    .filter((e) => e.blockType === "course" || e.blockType === "event")
    .forEach((e, index) => {
      const id = `act-${date.replaceAll("-", "")}-${index + 1}`;
      activities.set(id, {
        id,
        code: `ACT-${date.slice(5, 7)}${date.slice(8, 10)}${index + 1}`,
        name: e.title,
        type: e.blockType as "course" | "event",
        facilityId: e.facilityId,
        organizer: e.blockType === "course" ? "FEFS · Catedra de educație fizică" : "Clubul Sportiv Universitar",
        date,
        from: e.from,
        to: e.to,
        recurrence: { frequency: "none", until: null },
        calendarMessage: e.blockType === "course" ? "Sală rezervată pentru curs universitar." : "Facilitate rezervată pentru eveniment USV.",
        status: "published",
        createdAt: at(date, 7),
      });
    });
}

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Zilele în care apare o activitate (o dată sau săptămânal, până la `until`). */
function occurrences(a: Pick<MockActivity, "date" | "recurrence">): string[] {
  if (a.recurrence.frequency !== "weekly" || !a.recurrence.until) return [a.date];
  const days: string[] = [];
  for (let d = a.date; d <= a.recurrence.until; d = addDays(d, 7)) days.push(d);
  return days;
}

/** Activitățile publicate care au loc într-o zi. */
function activitiesOn(date: string) {
  ensureDay(date);
  return [...activities.values()].filter((a) => a.status === "published" && occurrences(a).includes(date));
}

/** Sfârșitul efectiv al unui incident: ora deblocării anticipate, dacă a existat. */
const effectiveEnd = (i: MockIncident) => i.reopenedAt ?? i.end;

/**
 * Incidentele care blochează ceva într-o zi, tăiate la programul zilei (08–21).
 * Un incident de mai multe zile apare în fiecare zi pe care o acoperă.
 */
function incidentEntriesOn(date: string): MockEntry[] {
  ensureDay(date);
  const dayStart = Date.parse(at(date, 8));
  const dayEnd = Date.parse(at(date, 21));
  return [...incidents.values()]
    .filter((i) => i.status !== "closed" || Date.parse(effectiveEnd(i)) > Date.parse(i.start))
    .filter((i) => Date.parse(i.start) < dayEnd && Date.parse(effectiveEnd(i)) > dayStart)
    .map((i) => {
      const from = Date.parse(i.start) <= dayStart ? 8 : (localSlot(i.start)?.hour ?? 8);
      const to = Date.parse(effectiveEnd(i)) >= dayEnd ? 21 : (localSlot(effectiveEnd(i))?.hour ?? 21);
      return {
        facilityId: i.facilityId,
        from,
        to,
        title: i.title,
        source: `Incident ${i.code}`,
        blockType: i.type === "repair" || i.type === "equipment_failure" ? ("repair" as const) : ("maintenance" as const),
        incidentId: i.id,
      };
    })
    .filter((e) => e.to > e.from);
}

/** Toate blocările unei zile: incidentele (mentenanță, reparații) + activitățile publicate. */
function entriesFor(date: string): MockEntry[] {
  const fixed = incidentEntriesOn(date);
  const published = activitiesOn(date).map((a) => ({
    facilityId: a.facilityId,
    from: a.from,
    to: a.to,
    title: a.name,
    source: a.type === "course" ? `Curs universitar · ${a.organizer}` : `Eveniment USV · ${a.organizer}`,
    blockType: a.type,
    activityId: a.id,
  }));
  return [...fixed, ...published].sort((x, y) => x.from - y.from);
}

function bookingsOn(date: string) {
  ensureDay(date);
  return [...bookings.values()].filter((b) => b.startTime.startsWith(date));
}

function activityJson(a: MockActivity) {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    facilityId: a.facilityId,
    organizer: a.organizer,
    startTime: at(a.date, a.from),
    endTime: at(a.date, a.to),
    recurrence: a.recurrence,
    calendarMessage: a.calendarMessage,
    status: a.status,
    createdBy: "4",
    createdAt: a.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Validarea unei activități (ActivityCreate) și calculul suprapunerilor
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** Data și ora (în România) ale unui moment ISO; null dacă nu e o oră fixă. */
function localSlot(iso: unknown): { date: string; hour: number } | null {
  if (typeof iso !== "string") return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(time));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  if (get("minute") !== "00") return null;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

function textField(body: Json, key: string, min: number, max: number, label: string) {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    fail(400, "VALIDATION_ERROR", `${label}: între ${min} și ${max} caractere.`);
  }
  return value.trim();
}

/**
 * Verifică un corp ActivityCreate. `existing` = activitatea editată (PUT): dacă
 * a început deja, ziua, ora de început și facilitatea ei pot rămâne în trecut,
 * dar nu pot fi schimbate.
 */
function parseActivityBody(raw: unknown, existing?: MockActivity) {
  if (!isObject(raw)) fail(400, "VALIDATION_ERROR", "Corpul cererii lipsește.");
  const name = textField(raw, "name", 3, 150, "Denumirea");
  const organizer = textField(raw, "organizer", 1, 150, "Organizatorul");
  const calendarMessage = raw.calendarMessage === undefined ? "" : textField(raw, "calendarMessage", 0, 200, "Mesajul");
  if (raw.type !== "course" && raw.type !== "event") fail(400, "VALIDATION_ERROR", "Tip de activitate necunoscut.");
  const facilityId = raw.facilityId;
  if (typeof facilityId !== "string" || !Object.values(facilityIds).includes(facilityId)) {
    fail(400, "VALIDATION_ERROR", "Facilitate necunoscută.");
  }
  const start = localSlot(raw.startTime);
  const end = localSlot(raw.endTime);
  if (!start || !end || start.date !== end.date || end.hour <= start.hour || start.hour < 8 || end.hour > 21) {
    fail(422, "INVALID_TIME_RANGE", "Intervalul trebuie să fie în aceeași zi, la ore fixe, între 08:00 și 21:00.");
  }
  const alreadyStarted = existing !== undefined && Date.parse(at(existing.date, existing.from)) <= Date.now();
  if (alreadyStarted) {
    // Activitate în desfășurare: se pot schimba detaliile și ora de sfârșit, nu și începutul.
    const sameStart = start.date === existing.date && start.hour === existing.from && facilityId === existing.facilityId;
    const sameRecurrence = JSON.stringify(isObject(raw.recurrence) ? { frequency: raw.recurrence.frequency ?? "none", until: raw.recurrence.until ?? null } : { frequency: "none", until: null }) === JSON.stringify(existing.recurrence);
    if (!sameStart || !sameRecurrence) {
      fail(422, "ACTIVITY_ALREADY_STARTED", "Activitatea a început deja: facilitatea, ziua, ora de început și repetarea nu se mai pot schimba.");
    }
  } else if (Date.parse(String(raw.startTime)) <= Date.now()) {
    fail(422, "INVALID_TIME_RANGE", "Intervalul a început deja. Alege o oră viitoare.");
  }
  if (Date.parse(String(raw.endTime)) <= Date.now()) {
    fail(422, "INVALID_TIME_RANGE", "Ora de sfârșit a trecut deja.");
  }
  const rec = isObject(raw.recurrence) ? raw.recurrence : {};
  const frequency = rec.frequency === "weekly" ? "weekly" : "none";
  const until = frequency === "weekly" ? rec.until : null;
  if (frequency === "weekly" && (!validDate(typeof until === "string" ? until : null) || (until as string) < start.date)) {
    fail(422, "INVALID_RECURRENCE", "Pentru repetare alege data ultimei apariții (după prima zi).");
  }
  if (frequency === "weekly" && (until as string) > addDays(start.date, 7 * 26)) {
    fail(422, "INVALID_RECURRENCE", "Repetarea poate dura cel mult 26 de săptămâni.");
  }
  return {
    name,
    organizer,
    calendarMessage,
    type: raw.type as "course" | "event",
    facilityId: facilityId as string,
    date: start.date,
    from: start.hour,
    to: end.hour,
    recurrence: { frequency: frequency as "none" | "weekly", until: (until as string | null) ?? null },
    resolveConflicts: raw.resolveConflicts === true,
  };
}

const ACTIVE_BOOKING = ["confirmed", "in_verification", "awaiting_transfer"];
const overlaps = (aFrom: number, aTo: number, bFrom: number, bTo: number) => aFrom < bTo && bFrom < aTo;
const hourOf = (iso: string) => localSlot(iso)?.hour ?? -1;

/** Ce s-ar suprapune cu activitatea, în fiecare zi în care apare. */
function conflictsFor(input: ReturnType<typeof parseActivityBody>, ignoreId?: string) {
  const affected: MockBooking[] = [];
  const overlapping: MockActivity[] = [];
  let maintenance: MockEntry | null = null;
  for (const date of occurrences(input)) {
    for (const b of bookingsOn(date)) {
      if (b.facility.id === input.facilityId && ACTIVE_BOOKING.includes(b.status) &&
          overlaps(input.from, input.to, hourOf(b.startTime), hourOf(b.endTime))) affected.push(b);
    }
    for (const a of activitiesOn(date)) {
      if (a.id !== ignoreId && a.facilityId === input.facilityId && overlaps(input.from, input.to, a.from, a.to) &&
          !overlapping.includes(a)) overlapping.push(a);
    }
    maintenance ??= incidentEntriesOn(date).find(
      (e) => e.facilityId === input.facilityId && overlaps(input.from, input.to, e.from, e.to),
    ) ?? null;
  }
  return { affected, overlapping, maintenance };
}

function previewActivity(raw: unknown) {
  const input = parseActivityBody(raw);
  const { affected, overlapping, maintenance } = conflictsFor(input);
  const available = affected.length === 0 && overlapping.length === 0 && !maintenance;
  const message = maintenance
    ? `Intervalul se suprapune cu „${maintenance.title}”.`
    : overlapping.length > 0
      ? `Intervalul se suprapune cu ${overlapping.length === 1 ? "o altă activitate USV" : `${overlapping.length} activități USV`}.`
      : affected.length > 0
        ? `${affected.length} ${affected.length === 1 ? "rezervare afectată" : "rezervări afectate"}`
        : "Interval disponibil · 0 rezervări afectate";
  return { available, affectedBookings: affected, overlappingActivities: overlapping.map(activityJson), message };
}

function createActivity(raw: unknown) {
  const input = parseActivityBody(raw);
  // Reverificăm totul la salvare: între previzualizare și publicare se pot schimba lucruri.
  const { affected, overlapping, maintenance } = conflictsFor(input);
  if (overlapping.length > 0 || maintenance) {
    fail(409, "ACTIVITY_OVERLAPS_ACTIVITY", "Intervalul se suprapune cu o altă activitate sau cu o blocare de mentenanță.");
  }
  if (affected.length > 0 && !input.resolveConflicts) {
    fail(409, "ACTIVITY_CONFLICTS_WITH_BOOKINGS", `Intervalul are ${affected.length} rezervări suprapuse. Revizuiește-le înainte de publicare.`);
  }
  const now = new Date().toISOString();
  for (const b of affected) {
    // Rezervarea se anulează, iar studentul își primește înapoi rezervarea din cotă.
    b.status = "cancelled";
    b.cancelledBy = "university_activity";
    b.cancelReason = `Interval rezervat pentru „${input.name}”.`;
    b.cancelledAt = now;
    b.quotaRefunded = b.usesIncludedQuota;
  }
  activityCounter += 1;
  const activity: MockActivity = {
    id: `act-new-${activityCounter}`,
    code: `ACT-${activityCounter}`,
    name: input.name,
    type: input.type,
    facilityId: input.facilityId,
    organizer: input.organizer,
    date: input.date,
    from: input.from,
    to: input.to,
    recurrence: input.recurrence,
    calendarMessage: input.calendarMessage,
    status: "published",
    createdAt: now,
  };
  activities.set(activity.id, activity);
  return activityJson(activity);
}

/** Găsește activitatea; pentru cele din șablon, ziua se află din id (act-AAAALLZZ-n). */
function findActivity(id: string): MockActivity {
  const fromTemplate = /^act-(\d{4})(\d{2})(\d{2})-\d+$/.exec(id);
  if (fromTemplate) {
    const date = `${fromTemplate[1]}-${fromTemplate[2]}-${fromTemplate[3]}`;
    if (validDate(date)) ensureDay(date);
  }
  const activity = activities.get(id);
  if (!activity) fail(404, "NOT_FOUND", "Activitatea nu există.");
  return activity;
}

/** PUT: aceleași reguli ca la creare, dar activitatea nu se suprapune „cu ea însăși”. */
function updateActivity(id: string, raw: unknown) {
  const activity = findActivity(id);
  if (activity.status === "cancelled") fail(409, "ACTIVITY_CANCELLED", "Activitatea a fost anulată și nu mai poate fi editată.");
  const input = parseActivityBody(raw, activity);
  const { affected, overlapping, maintenance } = conflictsFor(input, id);
  if (overlapping.length > 0 || maintenance) {
    fail(409, "ACTIVITY_OVERLAPS_ACTIVITY", "Noul interval se suprapune cu o altă activitate sau cu o blocare de mentenanță.");
  }
  if (affected.length > 0 && !input.resolveConflicts) {
    fail(409, "ACTIVITY_CONFLICTS_WITH_BOOKINGS", `Noul interval are ${affected.length} rezervări suprapuse. Revizuiește-le înainte de salvare.`);
  }
  const now = new Date().toISOString();
  for (const b of affected) {
    b.status = "cancelled";
    b.cancelledBy = "university_activity";
    b.cancelReason = `Interval rezervat pentru „${input.name}”.`;
    b.cancelledAt = now;
    b.quotaRefunded = b.usesIncludedQuota;
  }
  Object.assign(activity, {
    name: input.name,
    type: input.type,
    facilityId: input.facilityId,
    organizer: input.organizer,
    date: input.date,
    from: input.from,
    to: input.to,
    recurrence: input.recurrence,
    calendarMessage: input.calendarMessage,
  });
  return activityJson(activity);
}

/** DELETE: anulează activitatea (în mock, toată), dacă mai are intervale viitoare. */
function cancelActivity(id: string, scope: string | null) {
  if (scope !== null && !["this_occurrence", "this_and_following", "series"].includes(scope)) {
    fail(400, "VALIDATION_ERROR", "Parametrul scope este invalid.");
  }
  const activity = findActivity(id);
  if (activity.status === "cancelled") fail(409, "ACTIVITY_CANCELLED", "Activitatea este deja anulată.");
  const days = occurrences(activity);
  if (Date.parse(at(days[days.length - 1], activity.to)) <= Date.now()) {
    fail(409, "ACTIVITY_ALREADY_ENDED", "Activitatea s-a încheiat deja; nu mai are intervale de eliberat.");
  }
  activity.status = "cancelled";
  return undefined; // 204 No Content
}

// ---------------------------------------------------------------------------
// Incidente / blocări de mentenanță
// ---------------------------------------------------------------------------

/** Forma `Incident` din contract. */
function incidentJson(i: MockIncident) {
  return {
    id: i.id,
    code: i.code,
    facility: { id: i.facilityId, name: facilityName(i.facilityId) },
    type: i.type,
    status: i.status,
    publicReason: i.publicReason,
    startTime: i.start,
    endTime: i.end,
    reopenedAt: i.reopenedAt,
    affectedBookings: i.affectedBookings,
    quotasRefunded: i.quotasRefunded,
    notifiedUsers: i.notifiedUsers,
    pendingNotifications: 0,
    createdBy: { id: "4", name: "Administratorul Bazei Sportive" },
    createdAt: i.createdAt,
  };
}

/** O blocare durează cel mult o săptămână; pentru mai mult se creează blocări noi. */
const MAX_BLOCK_HOURS = 7 * 24;

/** Verifică un corp IncidentCreate (aceleași reguli pentru previzualizare și creare). */
function parseIncidentBody(raw: unknown) {
  if (!isObject(raw)) fail(400, "VALIDATION_ERROR", "Corpul cererii lipsește.");
  const facilityId = raw.facilityId;
  if (typeof facilityId !== "string" || !Object.values(facilityIds).includes(facilityId)) {
    fail(400, "VALIDATION_ERROR", "Facilitate necunoscută.");
  }
  if (!INCIDENT_TYPES.includes(raw.type as IncidentType)) fail(400, "VALIDATION_ERROR", "Tip de blocare necunoscut.");
  const publicReason = textField(raw, "publicReason", 5, 300, "Motivul vizibil");
  const internalNote = raw.internalNote === undefined ? "" : textField(raw, "internalNote", 0, 500, "Nota internă");
  const start = localSlot(raw.startTime);
  const end = localSlot(raw.endTime);
  if (!start || !end) fail(422, "INVALID_TIME_RANGE", "Începutul și sfârșitul trebuie să fie la ore fixe.");
  const startMs = Date.parse(String(raw.startTime));
  const endMs = Date.parse(String(raw.endTime));
  if (endMs <= startMs) fail(422, "INVALID_TIME_RANGE", "Sfârșitul trebuie să fie după început.");
  if (endMs <= Date.now()) fail(422, "INVALID_TIME_RANGE", "Intervalul s-a încheiat deja.");
  if (startMs < Date.now() - 3_600_000) fail(422, "INVALID_TIME_RANGE", "Începutul nu poate fi în trecut.");
  if ((endMs - startMs) / 3_600_000 > MAX_BLOCK_HOURS) fail(422, "INVALID_TIME_RANGE", "O blocare durează cel mult 7 zile.");
  const channels = Array.isArray(raw.notifyChannels) ? raw.notifyChannels : ["push", "email"];
  if (channels.some((c) => typeof c !== "string" || !CHANNELS.includes(c))) fail(400, "VALIDATION_ERROR", "Canal de notificare necunoscut.");
  return {
    facilityId: facilityId as string,
    type: raw.type as IncidentType,
    publicReason,
    internalNote,
    start: at(start.date, start.hour),
    end: at(end.date, end.hour),
    startMs,
    endMs,
    channels: [...new Set(channels as string[])],
    confirmed: raw.confirmed === true,
  };
}

/** Zilele (YYYY-MM-DD) dintre două momente, ca să încărcăm rezervările lor. */
function daysBetween(startIso: string, endIso: string) {
  const first = localSlot(startIso)!.date;
  const last = localSlot(endIso)!.date;
  const days: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Ce ar afecta blocarea: rezervările viitoare suprapuse și o eventuală altă blocare. */
function incidentImpact(input: ReturnType<typeof parseIncidentBody>) {
  const affected: MockBooking[] = [];
  for (const date of daysBetween(input.start, input.end)) {
    for (const b of bookingsOn(date)) {
      if (b.facility.id === input.facilityId && ACTIVE_BOOKING.includes(b.status) &&
          Date.parse(b.startTime) < input.endMs && Date.parse(b.endTime) > input.startMs &&
          Date.parse(b.endTime) > Date.now()) affected.push(b);
    }
  }
  const overlapping = [...incidents.values()].find(
    (i) => i.facilityId === input.facilityId && i.status === "active" &&
      Date.parse(i.start) < input.endMs && Date.parse(effectiveEnd(i)) > input.startMs,
  );
  if (overlapping) {
    fail(409, "INCIDENT_OVERLAP", `Facilitatea este deja blocată în acest interval (${overlapping.code}). Modifică intervalul.`);
  }
  return affected.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function previewIncident(raw: unknown) {
  const input = parseIncidentBody(raw);
  const affected = incidentImpact(input);
  return {
    facilityId: input.facilityId,
    startTime: input.start,
    endTime: input.end,
    durationHours: (input.endMs - input.startMs) / 3_600_000,
    affectedBookings: affected.map((b) => ({
      bookingId: b.id,
      code: b.code,
      userName: b.user.name,
      userRole: b.user.role,
      startTime: b.startTime,
      endTime: b.endTime,
      quotaWillBeRefunded: b.usesIncludedQuota,
    })),
    affectedCount: affected.length,
    quotaRefunds: affected.filter((b) => b.usesIncludedQuota).length,
    // În mock: o persoană pe lista de așteptare pentru fiecare zi cu rezervări afectate.
    waitlistInformed: new Set(affected.map((b) => b.startTime.slice(0, 10))).size,
    channels: input.channels,
    impactToken: affected.map((b) => b.id).join(","),
  };
}

function createIncident(raw: unknown) {
  const input = parseIncidentBody(raw);
  if (!input.confirmed) fail(422, "CONFIRMATION_REQUIRED", "Blocarea trebuie confirmată explicit (confirmed: true).");
  // Reverificăm impactul la salvare: între timp pot apărea rezervări noi.
  const affected = incidentImpact(input);
  const now = new Date().toISOString();
  for (const b of affected) {
    b.status = "cancelled";
    b.cancelledBy = "maintenance";
    b.cancelReason = input.publicReason;
    b.cancelledAt = now;
    b.quotaRefunded = b.usesIncludedQuota;
  }
  incidentCounter += 1;
  const id = `inc-new-${incidentCounter}`;
  const refunds = affected.filter((b) => b.usesIncludedQuota).length;
  const people = new Set(affected.map((b) => b.user.id)).size;
  const incident: MockIncident = {
    id,
    code: `INC-${incidentCounter}`,
    facilityId: input.facilityId,
    type: input.type,
    title: INCIDENT_TITLE[input.type],
    publicReason: input.publicReason,
    internalNote: input.internalNote,
    start: input.start,
    end: input.end,
    status: "active",
    reopenedAt: null,
    affectedBookings: affected.length,
    quotasRefunded: refunds,
    notifiedUsers: people,
    channels: input.channels,
    createdAt: now,
    log: [
      { id: `${id}-log-1`, occurredAt: now, type: "maintenance_closure", title: "Blocare aplicată", description: `${facilityName(input.facilityId)} · ${input.publicReason}` },
      { id: `${id}-log-2`, occurredAt: now, type: "booking_cancelled", title: `${affected.length} rezervări anulate`, description: `${refunds} cote restituite.` },
      { id: `${id}-log-3`, occurredAt: now, type: "notification_sent", title: `${people} persoane notificate`, description: `Canale: ${input.channels.join(", ") || "—"}.` },
    ],
  };
  incidents.set(id, incident);
  return incidentJson(incident);
}

/** Găsește incidentul; pentru cele din șablon, ziua se află din id (inc-AAAALLZZ-n). */
function findIncident(id: string): MockIncident {
  const fromTemplate = /^inc-(\d{4})(\d{2})(\d{2})-\d+$/.exec(id);
  if (fromTemplate) {
    const date = `${fromTemplate[1]}-${fromTemplate[2]}-${fromTemplate[3]}`;
    if (validDate(date)) ensureDay(date);
  }
  const incident = incidents.get(id);
  if (!incident) fail(404, "NOT_FOUND", "Incidentul nu există.");
  return incident;
}

/** GET /admin/incidents/{id}/log: jurnalul în forma AuditLogEntry, în ordine cronologică. */
function incidentLog(incident: MockIncident) {
  return [...incident.log]
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map((entry) => ({
      ...entry,
      actor: { id: "4", name: "Administratorul Bazei Sportive", role: "administrator" },
      facilityId: incident.facilityId,
      reference: incident.code,
      result: entry.title,
    }));
}

/**
 * POST /admin/incidents/{id}/reopen — deblocare anticipată.
 * Cere `safetyConfirmed: true`; ora de redeschidere trebuie să fie fixă, în
 * intervalul blocării și nu în trecut. Rezervările anulate NU se reactivează.
 */
function reopenIncident(id: string, raw: unknown) {
  const incident = findIncident(id);
  if (!isObject(raw)) fail(400, "VALIDATION_ERROR", "Corpul cererii lipsește.");
  if (raw.safetyConfirmed !== true) {
    fail(422, "SAFETY_CONFIRMATION_REQUIRED", "Deblocarea cere confirmarea siguranței de către echipa tehnică.");
  }
  if (incident.status !== "active") fail(409, "INCIDENT_NOT_ACTIVE", "Incidentul nu mai este activ.");
  const slot = localSlot(raw.reopenFrom);
  if (!slot) fail(422, "INVALID_TIME_RANGE", "Ora de redeschidere trebuie să fie o oră fixă.");
  const reopenMs = Date.parse(String(raw.reopenFrom));
  if (reopenMs < Date.parse(incident.start) || reopenMs >= Date.parse(incident.end)) {
    fail(422, "INVALID_TIME_RANGE", "Ora de redeschidere trebuie să fie în intervalul blocării.");
  }
  const currentHourStart = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  if (reopenMs < currentHourStart) fail(422, "INVALID_TIME_RANGE", "Ora de redeschidere a trecut deja.");

  const reopenedAt = at(slot.date, slot.hour);
  incident.status = "reopened_early";
  incident.reopenedAt = reopenedAt;
  const endSlot = localSlot(incident.end)!;
  incident.log.push({
    id: `${incident.id}-log-${incident.log.length + 1}`,
    occurredAt: new Date().toISOString(),
    type: "facility_reopened",
    title: "Deblocare anticipată",
    description: `${facilityName(incident.facilityId)} redevine disponibilă de la ${String(slot.hour).padStart(2, "0")}:00 (blocarea era până la ${String(endSlot.hour).padStart(2, "0")}:00). Siguranța a fost confirmată de echipa tehnică.`,
  });
  return incidentJson(incident);
}

/** GET /admin/incidents: filtrare după stare, facilitate și zile, cu paginare. */
function listIncidents(query: URLSearchParams) {
  const status = query.get("status");
  if (status && !["active", "reopened_early", "closed"].includes(status)) fail(400, "VALIDATION_ERROR", "Stare necunoscută.");
  const from = query.get("from") ?? today();
  const to = query.get("to") ?? from;
  if (!validDate(from) || !validDate(to) || to < from) fail(400, "VALIDATION_ERROR", "Interval de date invalid.");
  const page = Number(query.get("page") ?? 1);
  const pageSize = Number(query.get("pageSize") ?? 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    fail(400, "VALIDATION_ERROR", "Paginare invalidă.");
  }
  for (let d = from; d <= to; d = addDays(d, 1)) ensureDay(d);
  const facilityId = query.get("facilityId");
  const rangeStart = Date.parse(at(from, 0));
  const rangeEnd = Date.parse(at(addDays(to, 1), 0));
  const items = [...incidents.values()]
    .filter((i) => (!status || i.status === status) && (!facilityId || i.facilityId === facilityId))
    .filter((i) => Date.parse(i.start) < rangeEnd && Date.parse(effectiveEnd(i)) > rangeStart)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map(incidentJson);
  const startIndex = (page - 1) * pageSize;
  return { page, pageSize, totalItems: items.length, totalPages: Math.ceil(items.length / pageSize), items: items.slice(startIndex, startIndex + pageSize) };
}

function scheduleFor(date: string, facilityId: string | null) {
  const entries = entriesFor(date);
  const dayLabel =
    date === today() ? "Astăzi" : new Date(`${date}T12:00:00Z`).toLocaleDateString("ro-RO", { day: "numeric", month: "short" });
  const range = (e: MockEntry) => `${String(e.from).padStart(2, "0")}:00–${String(e.to).padStart(2, "0")}:00`;

  const facilitiesStatus = facilities.map((f) => {
    const id = facilityIds[f.id];
    const own = entries.filter((e) => e.facilityId === id);
    const block = own.find((e) => e.blockType === "repair" || e.blockType === "maintenance");
    const course = own.find((e) => e.blockType === "course" || e.blockType === "event");
    if (block) {
      return {
        facilityId: id,
        name: f.name,
        status: "under_maintenance",
        statusLabel: block.blockType === "repair" ? "Reparație activă" : "Mentenanță programată",
        note: `${dayLabel} · ${range(block)}`,
      };
    }
    if (id === SALA && course) {
      return { facilityId: id, name: f.name, status: "university_activity", statusLabel: "Activități USV", note: `Curs · ${range(course)}` };
    }
    return {
      facilityId: id,
      name: f.name,
      status: "operational",
      statusLabel: id === BAZIN ? "Operațional" : "Operațională",
      note: course ? `Curs USV · ${range(course)}` : id === BAZIN ? "4 culoare · 4 rezervări / oră" : "Fără blocări",
    };
  });

  // Incidentul afișat în orar: primul activ din zi (cel în desfășurare are prioritate).
  const dayIncidents = entries
    .filter((e) => e.incidentId)
    .map((e) => incidents.get(e.incidentId!)!)
    .filter((i) => i.status === "active")
    .sort((a, b) => Number(Date.parse(b.start) <= Date.now()) - Number(Date.parse(a.start) <= Date.now()) || Date.parse(a.start) - Date.parse(b.start));
  return {
    date,
    facilities: facilitiesStatus,
    entries: entries
      .filter((e) => !facilityId || e.facilityId === facilityId)
      .map((e) => ({
        startTime: at(date, e.from),
        endTime: at(date, e.to),
        title: e.title,
        facilityId: e.facilityId,
        facilityName: facilityName(e.facilityId),
        source: e.source,
        blockType: e.blockType,
        activityId: e.activityId ?? null,
        incidentId: e.incidentId ?? null,
      })),
    activeIncident: dayIncidents[0] ? incidentJson(dayIncidents[0]) : null,
  };
}

/**
 * Persoanele care rezervă în mock. Id-ul fiecăreia este `u-<poziția + 1>`, la fel ca în directorul
 * de utilizatori (USERS). Cristina Pop (u-10) nu are rezervări: contul ei nu e confirmat.
 */
const PEOPLE = [
  "Andrei Munteanu",
  "Daria Stan",
  "Radu Ionescu",
  "Elena Rusu",
  "Vlad Ciobanu",
  "Ioana Popescu",
  "Maria Enache",
  "Ioana Pavel",
  "Alexandru Luca",
];
// Cine nu e student: profesorii nu au cotă lunară, externii nu au cotă inclusă.
const ROLE_OF: Record<string, string> = { "Elena Rusu": "professor", "Vlad Ciobanu": "external" };
/** Contul suspendat are doar rezervări mai vechi de atâtea zile (după suspendare nu mai poate rezerva). */
const SUSPENDED_SINCE_DAYS = 5;

type MockBooking = ReturnType<typeof seedBookings>[number];

/** Ziua săptămânii unei date: 0 = duminică, 1 = luni, …, 6 = sâmbătă. */
const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/**
 * Lista de așteptare: doar joia, la fitness, unde 18:00 și 19:00 sunt ocupate.
 * Maria și Ioana Pavel așteaptă 18:00; Andrei are deja 18:00 și așteaptă 19:00 (mutare).
 * Intervalele trecute au expirat.
 */
function seedWaitlist(date: string): MockWaitlistEntry[] {
  if (weekdayOf(date) !== 4) return [];
  const rows: Array<[number, string, string, number, string | null]> = [
    [18, "u-7", "Maria Enache", 1, null],
    [18, "u-8", "Ioana Pavel", 2, null],
    [19, "u-1", "Andrei Munteanu", 1, `b-${date}-1`],
  ];
  return rows.map(([hour, userId, name, position, replaceBookingId], index) => {
    const endTime = at(date, hour + 1);
    return {
      id: `w-${date}-${index + 1}`,
      facilityId: FITNESS,
      user: { id: userId, name },
      startTime: at(date, hour),
      endTime,
      position,
      status: Date.parse(endTime) <= Date.now() ? "expired" : "active",
      replaceBookingId,
      offerExpiresAt: null,
      createdAt: new Date(Math.min(Date.parse(at(date, hour)) - 2 * 86_400_000, Date.now() - 3_600_000)).toISOString(),
    };
  });
}

/**
 * Programul săptămânal al rezervărilor: fiecare interval (facilitate, oră) și cine îl
 * rezervă în fiecare zi a săptămânii (1 = luni … 6 = sâmbătă; lipsă = liber).
 * Fiecare persoană rezervă de 2–4 ori pe săptămână, ca în realitate; lunea și joia sunt
 * zilele aglomerate (joi, la bazin, 18:00 are 3 culoare ocupate).
 * Poziția intervalului în listă dă id-ul și codul rezervării (b-<zi>-<n>, USV-LLZZ-<183 + n>),
 * deci codurile rămân aceleași ca înainte.
 */
const WEEKLY: Array<[string, number, Partial<Record<number, number>>]> = [
  [FITNESS, 18, { 1: 0, 4: 0, 5: 1 }], //       Andrei luni și joi, Daria vineri
  [FITNESS, 19, { 1: 1, 3: 6, 4: 1 }], //       Daria luni și joi, Maria miercuri
  [FITNESS, 20, { 1: 2, 3: 2, 5: 8 }], //       Radu luni și miercuri, Alexandru vineri (înainte de suspendare)
  [TEREN, 10, { 1: 4, 6: 4 }], //               Vlad luni și sâmbătă
  [SALA, 17, { 1: 3, 2: 3, 3: 3, 4: 3 }], //    Elena (cadru didactic) de luni până joi
  [BAZIN, 9, { 1: 7 }], //                      Ioana Pavel luni
  [BAZIN, 9, { 1: 5 }], //                      Ioana Popescu luni
  [BAZIN, 18, { 2: 5, 4: 7 }], //               Ioana Popescu marți, Ioana Pavel joi
  [BAZIN, 18, { 4: 4 }], //                     Vlad joi
  [BAZIN, 18, { 4: 6 }], //                     Maria joi
  [BAZIN, 18, {}], //                           (liber)
  // Anulată de utilizator (pentru fila „Anulate”; nu apare în orar).
  [SALA, 12, { 2: 5 }], //                      Ioana Popescu marți
];
/** Poziția intervalului anulat de utilizator în WEEKLY. */
const CANCELLED_SLOT = WEEKLY.length - 1;

/** Rezervările inițiale ale unei zile, după programul săptămânal (aceleași la fiecare pornire). */
function seedBookings(date: string) {
  const weekday = weekdayOf(date);
  const mmdd = date.slice(5, 7) + date.slice(8, 10);
  const suspendedFrom = addDays(today(), -SUSPENDED_SINCE_DAYS);
  const seeded = WEEKLY.flatMap(([facilityId, hour, byDay], index) => {
    const person = byDay[weekday];
    if (person === undefined) return [];
    const name = PEOPLE[person];
    // Contul suspendat nu mai are rezervări după suspendare.
    // (USERS e definit mai jos, dar zilele se generează doar la cereri, după încărcarea modulului.)
    if (USERS.some((u) => u.id === `u-${person + 1}` && u.accessStatus === "suspended") && date > suspendedFrom) return [];
    const role = ROLE_OF[name] ?? "student";
    const booking = {
      id: `b-${date}-${index + 1}`,
      code: `USV-${mmdd}-${184 + index}`,
      facility: { id: facilityId, name: facilityName(facilityId), campus: "Campus USV" },
      user: { id: `u-${person + 1}`, name, role },
      startTime: at(date, hour),
      endTime: at(date, hour + 1),
      durationMinutes: 60,
      status: "confirmed" as string,
      usesIncludedQuota: role === "student",
      cancelledBy: null as string | null,
      cancelReason: null as string | null,
      cancelledAt: null as string | null,
      quotaRefunded: false,
    };
    if (index === CANCELLED_SLOT) {
      booking.status = "cancelled";
      booking.cancelledBy = "user";
      booking.cancelReason = "Nu mai pot ajunge la ora rezervată.";
      // Anulată cu o zi înainte, dar niciodată „în viitor” față de momentul de acum. Pentru zilele
      // care urmează, momentul vine la 25 de minute după crearea rezervării (vezi bookingCreatedAt),
      // diferit pentru fiecare zi, ca jurnalul să nu aibă toate anulările la aceeași oră.
      const daysAhead = Math.max(0, Math.round((Date.parse(booking.startTime) - Date.now()) / 86_400_000));
      const latest = Date.now() - (71 + daysAhead * 37) * 60_000;
      booking.cancelledAt = new Date(Math.min(Date.parse(booking.startTime) - 86_400_000, latest)).toISOString();
      booking.quotaRefunded = booking.usesIncludedQuota;
    }
    return [booking];
  });
  return seeded;
}

function requireAdmin(token: string | null | undefined) {
  const role = mockRoleForToken(token);
  if (!role) fail(401, "UNAUTHENTICATED", "Autentifică-te cu contul USV.");
  if (role !== "administrator") fail(403, "FORBIDDEN", "Nu ai permisiunea necesară.");
}

/**
 * Momentul în care a fost făcută rezervarea: cu 3 zile înainte, dar niciodată „în viitor”.
 * Rezervările din zilele următoare primesc momente diferite din ultimele ore (în funcție
 * de zi și de numărul rezervării), ca jurnalul să nu aibă zeci de intrări la aceeași oră.
 * Folosit de detaliile rezervării și de jurnalul de acțiuni, ca să arate același moment.
 */
function bookingCreatedAt(b: MockBooking) {
  const index = Number(/-(\d+)$/.exec(b.id)?.[1] ?? 0);
  const daysAhead = Math.max(0, Math.round((Date.parse(b.startTime) - Date.now()) / 86_400_000));
  const latest = Date.now() - 3_600_000 - daysAhead * 37 * 60_000 - index * 3 * 60_000;
  return new Date(Math.min(Date.parse(b.startTime) - 3 * 86_400_000, latest)).toISOString();
}

/**
 * GET /admin/bookings/{bookingId}: rezervarea (Booking) și cota lunară a
 * utilizatorului (Quota). Ziua se află din id (b-AAAA-LL-ZZ-n).
 */
function bookingDetails(id: string) {
  const day = /^b-(\d{4}-\d{2}-\d{2})-\d+$/.exec(id)?.[1];
  if (day && validDate(day)) ensureDay(day);
  const booking = bookings.get(id);
  if (!booking) fail(404, "NOT_FOUND", "Rezervarea nu există.");

  const createdAt = bookingCreatedAt(booking);

  // Cota lunară: doar studenții au 4 rezervări incluse; profesorii nelimitat, externii fără cotă.
  const month = booking.startTime.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const resetsOn = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  const role = booking.user.role;
  const counted = [...bookings.values()].filter(
    (b) => b.user.id === booking.user.id && b.startTime.startsWith(month) && b.status !== "cancelled" && b.status !== "rejected",
  ).length;
  const used = Math.min(counted, 4);
  const userQuota =
    role === "student"
      ? { month, included: 4, used, remaining: 4 - used, resetsOn, priority: false, limitReached: used >= 4, appliesTo: "student" }
      : role === "professor"
        ? { month, included: null, used: counted, remaining: null, resetsOn, priority: true, limitReached: false, appliesTo: "professor_unlimited" }
        : { month, included: null, used: counted, remaining: null, resetsOn, priority: false, limitReached: false, appliesTo: "external_none" };

  return {
    ...booking,
    status: shownStatus(booking),
    createdAt,
    updatedAt: booking.cancelledAt ?? createdAt,
    canCancel: booking.status === "confirmed" && Date.parse(booking.startTime) > Date.now(),
    userQuota,
  };
}

/**
 * POST /admin/bookings/{bookingId}/cancel — anulare administrativă.
 * Motiv obligatoriu (3–300); doar rezervările active și neîncheiate (altfel 409).
 * Restituie cota studenților; regula „cu 2 ore înainte” nu se aplică administratorului.
 */
function cancelBookingAsAdmin(id: string, raw: unknown) {
  const day = /^b-(\d{4}-\d{2}-\d{2})-\d+$/.exec(id)?.[1];
  if (day && validDate(day)) ensureDay(day);
  const booking = bookings.get(id);
  if (!booking) fail(404, "NOT_FOUND", "Rezervarea nu există.");
  if (!isObject(raw)) fail(400, "VALIDATION_ERROR", "Corpul cererii lipsește.");
  const reason = textField(raw, "reason", 3, 300, "Motivul");
  if (!ACTIVE_BOOKING.includes(booking.status) || Date.parse(booking.endTime) <= Date.now()) {
    fail(409, "BOOKING_NOT_ACTIVE", "Rezervarea nu mai este activă (a fost deja anulată sau s-a încheiat).");
  }
  booking.status = "cancelled";
  booking.cancelledBy = "administrator";
  booking.cancelReason = reason;
  booking.cancelledAt = new Date().toISOString();
  booking.quotaRefunded = booking.usesIncludedQuota;
  // Locul eliberat se oferă primei persoane din coada acelui interval (30 de minute ca să răspundă).
  const next = [...waitlist.values()]
    .filter((w) => w.facilityId === booking.facility.id && w.startTime === booking.startTime && w.status === "active")
    .sort((a, b) => a.position - b.position)[0];
  if (next) {
    next.status = "offered";
    next.offerExpiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  }
  return {
    booking,
    quotaRestored: booking.quotaRefunded,
    waitlistNotified: next ? 1 : 0,
  };
}

/**
 * Statusul văzut de administrator: o rezervare confirmată care s-a încheiat devine
 * „completed” (Finalizată), ca în backend. Restul statusurilor rămân neschimbate.
 */
function shownStatus(b: MockBooking, now = Date.now()) {
  return b.status === "confirmed" && Date.parse(b.endTime) <= now ? "completed" : b.status;
}

/** Elimină diacriticele și literele mari, ca „radu” să găsească „Radu Ionescu”. */
const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Câte zile acoperă implicit fiecare filă, când nu se trimit `from` / `to` (doar în mock). */
const DEFAULT_SPAN = 13;

/**
 * GET /admin/bookings — lista rezervărilor, pe file (upcoming / history / cancelled),
 * cu căutare (`q`: nume sau cod), filtre (facilitate, utilizator, perioadă), paginare
 * și contoarele pentru file (`counts`).
 * Fără perioadă, mock-ul folosește un interval implicit în jurul zilei de azi
 * (backend-ul real caută în toate rezervările).
 */
function listBookings(query: URLSearchParams, facilityId: string | null) {
  const tab = query.get("tab") ?? "upcoming";
  if (!["upcoming", "history", "cancelled"].includes(tab)) fail(400, "VALIDATION_ERROR", "Filă necunoscută.");
  const page = Number(query.get("page") ?? 1);
  const pageSize = Number(query.get("pageSize") ?? 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    fail(400, "VALIDATION_ERROR", "Paginare invalidă.");
  }
  const q = (query.get("q") ?? "").trim();
  if (q.length > 100) fail(400, "VALIDATION_ERROR", "Textul căutat este prea lung.");
  const userId = query.get("userId");
  const fromParam = query.get("from");
  const toParam = query.get("to");
  if ((fromParam && !validDate(fromParam)) || (toParam && !validDate(toParam)) || (fromParam && toParam && toParam < fromParam)) {
    fail(400, "VALIDATION_ERROR", "Interval de date invalid.");
  }

  const now = Date.now();
  const day = today();
  /** Intervalul de zile citit pentru o filă (cel cerut sau cel implicit). */
  const rangeFor = (t: string) => {
    const from = fromParam ?? (t === "upcoming" ? day : addDays(day, -DEFAULT_SPAN));
    const to = toParam ?? (t === "history" ? day : addDays(day, DEFAULT_SPAN));
    // Limităm intervalul citit, ca mock-ul să nu genereze luni întregi.
    return { from, to: to > addDays(from, 62) ? addDays(from, 62) : to };
  };
  const needle = normalize(q);
  /** Rezervările unei file, cu toate filtrele aplicate. */
  const itemsFor = (t: string) => {
    const { from, to } = rangeFor(t);
    const all: MockBooking[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) all.push(...bookingsOn(d));
    return all
      .filter((b) => !facilityId || b.facility.id === facilityId)
      .filter((b) => !userId || b.user.id === userId)
      .filter((b) => !needle || normalize(b.user.name).includes(needle) || normalize(b.code).includes(needle))
      .filter((b) =>
        t === "cancelled"
          ? b.status === "cancelled"
          : b.status !== "cancelled" && (t === "history" ? Date.parse(b.endTime) <= now : Date.parse(b.endTime) > now),
      )
      // Viitoare: cele mai apropiate întâi; istoric: cele mai recente întâi;
      // anulate: cele anulate cel mai recent întâi.
      .sort((a, b) =>
        t === "cancelled"
          ? (b.cancelledAt ?? b.startTime).localeCompare(a.cancelledAt ?? a.startTime) || a.id.localeCompare(b.id)
          : (t === "upcoming" ? 1 : -1) * a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id),
      );
  };

  const items = itemsFor(tab);
  const start = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    totalItems: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    counts: {
      upcoming: tab === "upcoming" ? items.length : itemsFor("upcoming").length,
      history: tab === "history" ? items.length : itemsFor("history").length,
      cancelled: tab === "cancelled" ? items.length : itemsFor("cancelled").length,
      // Contorul listei de așteptare folosește aceleași filtre (fără filă).
      waitlist: waitlistFor(query, facilityId).length,
    },
    items: items.slice(start, start + pageSize).map((b) => ({ ...b, status: shownStatus(b, now) })),
  };
}

/** Facilitatea unei înscrieri, în forma din contract. */
function waitlistJson(w: MockWaitlistEntry) {
  return {
    id: w.id,
    facility: { id: w.facilityId, name: facilityName(w.facilityId) },
    user: w.user,
    startTime: w.startTime,
    endTime: w.endTime,
    position: w.position,
    status: w.status,
    replaceBookingId: w.replaceBookingId,
    offerExpiresAt: w.offerExpiresAt,
    createdAt: w.createdAt,
  };
}

/**
 * Înscrierile care corespund filtrelor (q = nume, facilitate, perioadă). Fără perioadă,
 * mock-ul folosește azi + următoarele 13 zile (backend-ul real caută peste tot).
 */
function waitlistFor(query: URLSearchParams, facilityId: string | null) {
  const day = today();
  const fromParam = query.get("from");
  const toParam = query.get("to");
  if ((fromParam && !validDate(fromParam)) || (toParam && !validDate(toParam)) || (fromParam && toParam && toParam < fromParam)) {
    fail(400, "VALIDATION_ERROR", "Interval de date invalid.");
  }
  const from = fromParam ?? day;
  const toRaw = toParam ?? addDays(day, DEFAULT_SPAN);
  const to = toRaw > addDays(from, 62) ? addDays(from, 62) : toRaw;
  for (let d = from; d <= to; d = addDays(d, 1)) ensureDay(d);
  const needle = normalize((query.get("q") ?? "").trim());
  return [...waitlist.values()]
    .filter((w) => w.startTime.slice(0, 10) >= from && w.startTime.slice(0, 10) <= to)
    .filter((w) => !facilityId || w.facilityId === facilityId)
    .filter((w) => !needle || normalize(w.user.name).includes(needle))
    // În ordinea intervalului, apoi a poziției în coadă.
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.position - b.position);
}

/** GET /admin/waitlist — lista de așteptare (vedere administrator), paginată. */
function listWaitlist(query: URLSearchParams, facilityId: string | null) {
  const page = Number(query.get("page") ?? 1);
  const pageSize = Number(query.get("pageSize") ?? 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    fail(400, "VALIDATION_ERROR", "Paginare invalidă.");
  }
  if ((query.get("q") ?? "").length > 100) fail(400, "VALIDATION_ERROR", "Textul căutat este prea lung.");
  const items = waitlistFor(query, facilityId);
  const start = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    totalItems: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    items: items.slice(start, start + pageSize).map(waitlistJson),
  };
}

/**
 * O celulă CSV sigură: ghilimelele se dublează, iar textele care încep cu = + - @
 * primesc un apostrof în față, ca Excel să nu le execute ca formule (CSV injection).
 */
function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

const STATUS_RO: Record<string, string> = {
  in_verification: "În verificare",
  confirmed: "Confirmată",
  awaiting_transfer: "În așteptarea transferului",
  completed: "Finalizată",
  rejected: "Respinsă",
  cancelled: "Anulată",
};

/**
 * GET /admin/bookings/export — fișierul CSV al unei file (tab, perioadă, facilitate).
 * Contractul nu are căutare (`q`) la export. Mock-ul generează doar CSV.
 */
function exportBookings(query: URLSearchParams, facilityId: string | null) {
  const format = query.get("format") ?? "csv";
  if (format !== "csv" && format !== "xlsx") fail(400, "VALIDATION_ERROR", "Format necunoscut.");
  if (format === "xlsx") fail(400, "VALIDATION_ERROR", "Mock-ul generează doar fișiere CSV.");
  const tab = query.get("tab") ?? "upcoming";
  const rows: Array<Record<string, unknown>> = [];
  for (let page = 1; page <= 50; page += 1) {
    const pageQuery = new URLSearchParams({ tab, page: String(page), pageSize: "100" });
    for (const key of ["from", "to"]) {
      const value = query.get(key);
      if (value) pageQuery.set(key, value);
    }
    const result = listBookings(pageQuery, facilityId);
    rows.push(...(result.items as Array<Record<string, unknown>>));
    if (page >= result.totalPages) break;
  }
  const header = ["Cod", "Persoană", "Rol", "Facilitate", "Început", "Sfârșit", "Status", "Anulată de", "Motiv anulare"];
  const lines = rows.map((b) => {
    const user = b.user as { name: string; role: string };
    const facility = b.facility as { name: string };
    return [b.code, user.name, user.role, facility.name, b.startTime, b.endTime, STATUS_RO[String(b.status)] ?? b.status, b.cancelledBy, b.cancelReason]
      .map(csvCell)
      .join(";");
  });
  return {
    // BOM-ul (U+FEFF) face ca Excel să citească corect diacriticele.
    content: `\uFEFF${[header.map(csvCell).join(";"), ...lines].join("\r\n")}`,
    filename: `rezervari-${tab}-${today()}.csv`,
    type: "text/csv;charset=utf-8",
  };
}

// ---------------------------------------------------------------------------
// Utilizatori (directorul de administrare)
// ---------------------------------------------------------------------------

type MockUser = {
  id: string;
  name: string;
  email: string;
  role: "student" | "professor" | "external";
  faculty: string | null;
  department: string | null;
  identitySource: "sso" | "external_email";
  accessStatus: "active" | "suspended" | "unverified";
};

/**
 * Utilizatorii din mock: aceiași oameni ca în rezervări și lista de așteptare (aceleași id-uri),
 * plus un cont suspendat și unul extern neverificat, ca filtrele de acces să aibă ce arăta.
 * Administratorii nu apar în director (contractul numără doar studenți, cadre didactice, externi).
 */
const USERS: MockUser[] = [
  { id: "u-1", name: "Andrei Munteanu", email: "a.munteanu@student.usv.ro", role: "student", faculty: "Facultatea de Inginerie Electrică", department: null, identitySource: "sso", accessStatus: "active" },
  { id: "u-2", name: "Daria Stan", email: "d.stan@student.usv.ro", role: "student", faculty: "Facultatea de Educație Fizică și Sport", department: null, identitySource: "sso", accessStatus: "active" },
  { id: "u-3", name: "Radu Ionescu", email: "r.ionescu@student.usv.ro", role: "student", faculty: "Facultatea de Inginerie Electrică", department: null, identitySource: "sso", accessStatus: "active" },
  { id: "u-4", name: "Elena Rusu", email: "elena.rusu@usm.ro", role: "professor", faculty: null, department: "Departamentul de Educație Fizică", identitySource: "sso", accessStatus: "active" },
  { id: "u-5", name: "Vlad Ciobanu", email: "vlad.ciobanu@gmail.com", role: "external", faculty: null, department: null, identitySource: "external_email", accessStatus: "active" },
  { id: "u-6", name: "Ioana Popescu", email: "i.popescu@student.usv.ro", role: "student", faculty: "Facultatea de Litere și Științe ale Comunicării", department: null, identitySource: "sso", accessStatus: "active" },
  { id: "u-7", name: "Maria Enache", email: "m.enache@student.usv.ro", role: "student", faculty: "Facultatea de Economie, Administrație și Afaceri", department: null, identitySource: "sso", accessStatus: "active" },
  { id: "u-8", name: "Ioana Pavel", email: "i.pavel@student.usv.ro", role: "student", faculty: "Facultatea de Inginerie Alimentară", department: null, identitySource: "sso", accessStatus: "active" },
  { id: "u-9", name: "Alexandru Luca", email: "a.luca@student.usv.ro", role: "student", faculty: "Facultatea de Inginerie Electrică", department: null, identitySource: "sso", accessStatus: "suspended" },
  { id: "u-10", name: "Cristina Pop", email: "cristina.pop@yahoo.com", role: "external", faculty: null, department: null, identitySource: "external_email", accessStatus: "unverified" },
];

/** Textul din coloana „Verificare / acces”. */
function verificationLabel(u: MockUser) {
  const source = u.identitySource === "sso" ? "SSO USV" : "E-mail";
  const access = { active: u.identitySource === "sso" ? "activ" : "verificat", suspended: "suspendat", unverified: "neconfirmat" }[u.accessStatus];
  return `${source} · ${access}`;
}

/** Cota lunară (luna curentă) a unui utilizator, în forma `Quota` din contract. */
function userQuota(u: MockUser) {
  const month = today().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const resetsOn = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  const counted = [...bookings.values()].filter(
    (b) => b.user.id === u.id && b.startTime.startsWith(month) && b.status !== "cancelled" && b.status !== "rejected",
  ).length;
  if (u.role !== "student") {
    return { month, included: null, used: counted, remaining: null, resetsOn, priority: u.role === "professor", limitReached: false, appliesTo: u.role === "professor" ? "professor_unlimited" : "external_none" };
  }
  const used = Math.min(counted, 4);
  return { month, included: 4, used, remaining: 4 - used, resetsOn, priority: true, limitReached: used >= 4, appliesTo: "student" };
}

/** Rândul din director (`AdminUserRow` din contract). */
function userRow(u: MockUser) {
  const quota = userQuota(u);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    verification: verificationLabel(u),
    quotaLabel: quota.included === null ? (u.role === "professor" ? "Fără limită" : "Fără cotă inclusă") : `${quota.used} / ${quota.included} utilizate`,
    quota,
  };
}

/** Utilizatorii care corespund filtrelor (q = nume sau e-mail, rol, stare acces), după nume. */
function usersFor(query: URLSearchParams) {
  const role = query.get("role");
  if (role && !["student", "professor", "external", "administrator"].includes(role)) fail(400, "VALIDATION_ERROR", "Categorie necunoscută.");
  const access = query.get("accessStatus");
  if (access && !["active", "suspended", "unverified"].includes(access)) fail(400, "VALIDATION_ERROR", "Stare de acces necunoscută.");
  const q = (query.get("q") ?? "").trim();
  if (q.length > 100) fail(400, "VALIDATION_ERROR", "Textul căutat este prea lung.");
  const needle = normalize(q);
  // Cota se calculează din rezervările lunii curente: le generăm înainte.
  const month = today().slice(0, 8);
  for (let d = `${month}01`; d.startsWith(month.slice(0, 7)); d = addDays(d, 1)) ensureDay(d);
  return USERS.filter((u) => !role || u.role === role)
    .filter((u) => !access || u.accessStatus === access)
    .filter((u) => !needle || normalize(u.name).includes(needle) || normalize(u.email).includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name, "ro"));
}

/** GET /admin/users — directorul, paginat, cu totalurile pe categorii (pentru cardurile de sus). */
function listUsers(query: URLSearchParams) {
  const page = Number(query.get("page") ?? 1);
  const pageSize = Number(query.get("pageSize") ?? 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    fail(400, "VALIDATION_ERROR", "Paginare invalidă.");
  }
  const items = usersFor(query);
  const start = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    totalItems: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    // Totalurile sunt pentru toată comunitatea, nu doar pentru filtrele alese.
    totals: {
      total: USERS.length,
      students: USERS.filter((u) => u.role === "student").length,
      professors: USERS.filter((u) => u.role === "professor").length,
      external: USERS.filter((u) => u.role === "external").length,
    },
    items: items.slice(start, start + pageSize).map(userRow),
  };
}

/** GET /admin/users/export — toți utilizatorii, CSV (contractul nu are filtre la export). */
function exportUsers(query: URLSearchParams) {
  const format = query.get("format") ?? "csv";
  if (format !== "csv" && format !== "xlsx") fail(400, "VALIDATION_ERROR", "Format necunoscut.");
  if (format === "xlsx") fail(400, "VALIDATION_ERROR", "Mock-ul generează doar fișiere CSV.");
  const header = ["Nume", "E-mail", "Categorie", "Facultate / departament", "Verificare / acces", "Cotă lunară"];
  const roleRo: Record<string, string> = { student: "Student", professor: "Cadru didactic", external: "Public extern" };
  const lines = usersFor(new URLSearchParams()).map((u) =>
    [u.name, u.email, roleRo[u.role], u.faculty ?? u.department ?? "", verificationLabel(u), userRow(u).quotaLabel].map(csvCell).join(";"),
  );
  return {
    content: `\uFEFF${[header.map(csvCell).join(";"), ...lines].join("\r\n")}`,
    filename: `utilizatori-${today()}.csv`,
    type: "text/csv;charset=utf-8",
  };
}

/** Campusul afișat în profil (toți utilizatorii din mock sunt la Suceava). */
const CAMPUS = "Campus Suceava";

/** Utilizatorul cu id-ul dat (404 dacă nu există). */
function findUser(id: string) {
  const user = USERS.find((u) => u.id === id);
  if (!user) fail(404, "NOT_FOUND", "Utilizatorul nu există.");
  return user;
}

/**
 * GET /admin/users/{userId} — profilul (`User` + `quota` + `lastLoginAt` din contract).
 * Telefonul e mascat, ca în backend. Contul neconfirmat nu s-a autentificat niciodată.
 */
function userProfile(id: string) {
  const u = findUser(id);
  // Cota se calculează din rezervările lunii curente: le generăm înainte (ca în director).
  usersFor(new URLSearchParams());
  const index = USERS.indexOf(u);
  // Ultima autentificare: câteva ore / zile în urmă, diferit pentru fiecare utilizator.
  const lastLoginAt = u.accessStatus === "unverified" ? null : new Date(Date.now() - (index * 19 + 2) * 3_600_000).toISOString();
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    mobileNumber: `07•• ••• ${String(200 + index * 7).padStart(3, "0")}`,
    faculty: u.faculty,
    department: u.department,
    campus: CAMPUS,
    identitySource: u.identitySource,
    // Acces prioritar: comunitatea USV (studenți și cadre didactice), nu publicul extern.
    priority: u.role !== "external",
    accessStatus: u.accessStatus,
    quota: userQuota(u),
    lastLoginAt,
  };
}

/**
 * GET /admin/users/{userId}/bookings — rezervările utilizatorului, paginate.
 * Întâi cele care urmează (cea mai apropiată prima), apoi cele trecute (cea mai recentă prima).
 * Mock-ul citește aceeași perioadă implicită ca lista de rezervări (±DEFAULT_SPAN zile).
 */
function userBookings(id: string, query: URLSearchParams) {
  findUser(id);
  const page = Number(query.get("page") ?? 1);
  const pageSize = Number(query.get("pageSize") ?? 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    fail(400, "VALIDATION_ERROR", "Paginare invalidă.");
  }
  const now = Date.now();
  const day = today();
  const all: MockBooking[] = [];
  for (let d = addDays(day, -DEFAULT_SPAN); d <= addDays(day, DEFAULT_SPAN); d = addDays(d, 1)) all.push(...bookingsOn(d));
  const mine = all.filter((b) => b.user.id === id);
  const upcoming = mine.filter((b) => Date.parse(b.endTime) > now).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const past = mine.filter((b) => Date.parse(b.endTime) <= now).sort((a, b) => b.startTime.localeCompare(a.startTime));
  const items = [...upcoming, ...past];
  const start = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    totalItems: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    items: items.slice(start, start + pageSize).map((b) => ({ ...b, status: shownStatus(b, now) })),
  };
}

// ---------------------------------------------------------------------------
// Jurnalul de acțiuni (construit din rezervările din perioada mock-ului)
// ---------------------------------------------------------------------------

/** Contul de administrator din mock (cine apare ca autor al anulărilor administrative). */
const ADMIN_ACTOR = { id: "admin-1", name: "Administratorul Bazei Sportive", role: "administrator" };

const AUDIT_TYPES = [
  "maintenance_closure", "booking_cancelled", "quota_refunded", "notification_sent", "notification_failed",
  "notification_retried", "reservation_confirmed", "activity_created", "activity_updated", "activity_cancelled",
  "facility_reopened", "user_access_changed", "user_profile_viewed",
];

/** „Sală fitness · 26 nov., 18:00–19:00” — descrierea unei rezervări în jurnal. */
function bookingSummary(b: MockBooking) {
  const fmt = (iso: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ro-RO", { timeZone: TIMEZONE, ...options }).format(new Date(iso));
  const time = (iso: string) => fmt(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${b.facility.name} · ${fmt(b.startTime, { day: "numeric", month: "short" })}, ${time(b.startTime)}–${time(b.endTime)}`;
}

/** Intrările jurnalului pentru o rezervare: confirmarea și, dacă e cazul, anularea și cota restituită. */
function auditForBooking(b: MockBooking) {
  const user = { id: b.user.id, name: b.user.name, role: b.user.role };
  const entries = [
    {
      id: `log-${b.id}-c`,
      occurredAt: bookingCreatedAt(b),
      type: "reservation_confirmed",
      title: "Rezervare confirmată",
      description: bookingSummary(b),
      actor: user,
      facilityId: b.facility.id,
      reference: b.code,
      result: b.usesIncludedQuota ? "Din cota lunară" : "Confirmată",
    },
  ];
  if (b.status === "cancelled" && b.cancelledAt) {
    const actor = b.cancelledBy === "user" ? user : ADMIN_ACTOR;
    entries.push({
      id: `log-${b.id}-x`,
      occurredAt: b.cancelledAt,
      type: "booking_cancelled",
      title: "Rezervare anulată",
      description: `${bookingSummary(b)}${b.cancelReason ? ` · Motiv: ${b.cancelReason}` : ""}`,
      actor,
      facilityId: b.facility.id,
      reference: b.code,
      result: b.cancelledBy === "user" ? "Anulată de utilizator" : "Anulată de administrator",
    });
    if (b.quotaRefunded) {
      entries.push({
        id: `log-${b.id}-q`,
        // Cota se restituie imediat după anulare.
        occurredAt: new Date(Date.parse(b.cancelledAt) + 1000).toISOString(),
        type: "quota_refunded",
        title: "Cotă restituită",
        description: `${bookingSummary(b)} · 1 rezervare înapoi în cota lunară`,
        actor,
        facilityId: b.facility.id,
        reference: b.code,
        result: "Cotă restituită",
      });
    }
  }
  return entries;
}

/**
 * GET /admin/audit-log — filtre: date (ziua, în ora României), type, facilityId, actorId; paginat.
 * Cele mai noi intrări primele. Doar evenimentele care s-au întâmplat deja.
 */
function auditLog(query: URLSearchParams, facilityId: string | null) {
  const page = Number(query.get("page") ?? 1);
  const pageSize = Number(query.get("pageSize") ?? 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    fail(400, "VALIDATION_ERROR", "Paginare invalidă.");
  }
  const date = query.get("date");
  if (date && !validDate(date)) fail(400, "VALIDATION_ERROR", "Parametrul date trebuie să fie o dată YYYY-MM-DD.");
  const type = query.get("type");
  if (type && !AUDIT_TYPES.includes(type)) fail(400, "VALIDATION_ERROR", "Tip de eveniment necunoscut.");
  const actorId = query.get("actorId");
  if (actorId && !/^[A-Za-z0-9_-]{1,64}$/.test(actorId)) fail(400, "VALIDATION_ERROR", "Identificator invalid.");

  const now = Date.now();
  const day = today();
  const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date(iso));
  const all: ReturnType<typeof auditForBooking> = [];
  for (let d = addDays(day, -DEFAULT_SPAN); d <= addDays(day, DEFAULT_SPAN); d = addDays(d, 1)) {
    for (const b of bookingsOn(d)) all.push(...auditForBooking(b));
  }
  const items = all
    .filter((e) => Date.parse(e.occurredAt) <= now)
    .filter((e) => !actorId || e.actor.id === actorId)
    .filter((e) => !type || e.type === type)
    .filter((e) => !facilityId || e.facilityId === facilityId)
    .filter((e) => !date || dayOf(e.occurredAt) === date)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
  const start = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    totalItems: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    items: items.slice(start, start + pageSize),
  };
}

export function adminMockHandler(path: string, method: HttpMethod, token: string | null | undefined, body?: unknown) {
  requireAdmin(token);

  const [route, queryString = ""] = path.split("?");
  const query = new URLSearchParams(queryString);
  const facilityId = query.get("facilityId");
  if (facilityId && !Object.values(facilityIds).includes(facilityId)) {
    fail(400, "VALIDATION_ERROR", "Facilitate necunoscută.");
  }

  if (route === "/admin/schedule" && method === "GET") {
    const date = query.get("date");
    if (!validDate(date)) fail(400, "VALIDATION_ERROR", "Parametrul date trebuie să fie o dată YYYY-MM-DD.");
    return scheduleFor(date, facilityId);
  }

  // /admin/bookings/{bookingId}: detaliile unei rezervări (id-ul trebuie să aibă forma permisă).
  const bookingRoute = /^\/admin\/bookings\/([A-Za-z0-9_-]{1,64})(\/cancel)?$/.exec(route);
  if (bookingRoute && bookingRoute[1] !== "export") {
    if (!bookingRoute[2] && method === "GET") return bookingDetails(bookingRoute[1]);
    if (bookingRoute[2] && method === "POST") return cancelBookingAsAdmin(bookingRoute[1], body);
  }

  if (route === "/admin/bookings" && method === "GET") return listBookings(query, facilityId);
  if (route === "/admin/bookings/export" && method === "GET") return exportBookings(query, facilityId);
  if (route === "/admin/waitlist" && method === "GET") return listWaitlist(query, facilityId);
  if (route === "/admin/users" && method === "GET") return listUsers(query);
  if (route === "/admin/users/export" && method === "GET") return exportUsers(query);

  if (route === "/admin/audit-log" && method === "GET") return auditLog(query, facilityId);

  // /admin/users/{userId}[/bookings]: id-ul trebuie să aibă forma permisă.
  const userRoute = /^\/admin\/users\/([A-Za-z0-9_-]{1,64})(\/bookings)?$/.exec(route);
  if (userRoute && userRoute[1] !== "export" && method === "GET") {
    return userRoute[2] ? userBookings(userRoute[1], query) : userProfile(userRoute[1]);
  }

  if (route === "/admin/activities/preview" && method === "POST") return previewActivity(body);
  if (route === "/admin/activities" && method === "POST") return createActivity(body);

  if (route === "/admin/incidents" && method === "GET") return listIncidents(query);
  if (route === "/admin/incidents/preview" && method === "POST") return previewIncident(body);
  if (route === "/admin/incidents" && method === "POST") return createIncident(body);

  // /admin/incidents/{incidentId}[/log | /reopen]: id-ul trebuie să aibă forma permisă.
  const incidentRoute = /^\/admin\/incidents\/([A-Za-z0-9_-]{1,64})(\/log|\/reopen)?$/.exec(route);
  if (incidentRoute && incidentRoute[1] !== "preview") {
    const id = incidentRoute[1];
    if (!incidentRoute[2] && method === "GET") return incidentJson(findIncident(id));
    if (incidentRoute[2] === "/log" && method === "GET") return incidentLog(findIncident(id));
    if (incidentRoute[2] === "/reopen" && method === "POST") return reopenIncident(id, body);
  }

  // /admin/activities/{activityId}: id-ul trebuie să aibă forma permisă (fără „/”, „..” etc.).
  const activityRoute = /^\/admin\/activities\/([A-Za-z0-9_-]{1,64})$/.exec(route);
  if (activityRoute) {
    const id = decodeURIComponent(activityRoute[1]);
    if (method === "GET") return activityJson(findActivity(id));
    if (method === "PUT") return updateActivity(id, body);
    if (method === "DELETE") return cancelActivity(id, query.get("scope"));
  }

  fail(404, "NOT_FOUND", "Resursa de administrare nu există.");
}
