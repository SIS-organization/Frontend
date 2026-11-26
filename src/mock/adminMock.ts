// Mock pentru rutele /admin/* din contract:
//   GET  /admin/schedule, GET /admin/bookings
//   POST /admin/activities/preview, POST /admin/activities
// Se comportă ca backend-ul: fără token → 401, alt rol decât administrator → 403,
// date invalide → 400 / 422, suprapuneri → 409. Răspunsurile au forma din Swagger.
//
// Ține minte ce se schimbă (activități publicate, rezervări anulate) cât timp
// pagina e deschisă, ca fluxurile să poată fi testate cap-coadă fără backend.
// La reîncărcarea paginii, totul revine la datele inițiale.

import { ApiError } from "../api/client";
import { mockRoleForToken } from "./authMock";
import { facilityIds } from "./apiMock";
import { facilities } from "./data";

type Method = "GET" | "POST" | "PATCH";


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

const INCIDENT_ID = "6f1c2d3e-0000-4000-8000-000000000204";

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
    {
      facilityId: TEREN,
      from: 14,
      to: 16,
      title: "Reparație instalație nocturnă",
      source: "Incident INC-204",
      blockType: "repair",
      incidentId: INCIDENT_ID,
    },
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

const activities = new Map<string, MockActivity>();
const bookings = new Map<string, MockBooking>();
const seededDays = new Set<string>();
let activityCounter = 120;

/** Prima dată când se cere o zi, îi creăm rezervările și activitățile din șablon. */
function ensureDay(date: string) {
  if (seededDays.has(date)) return;
  seededDays.add(date);
  for (const booking of seedBookings(date)) bookings.set(booking.id, booking);
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

/** Toate blocările unei zile: mentenanța din șablon + activitățile publicate. */
function entriesFor(date: string): MockEntry[] {
  const fixed = templateFor(date).filter((e) => e.blockType === "maintenance" || e.blockType === "repair");
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

function parseActivityBody(raw: unknown) {
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
  if (Date.parse(String(raw.startTime)) <= Date.now()) {
    fail(422, "INVALID_TIME_RANGE", "Intervalul a început deja. Alege o oră viitoare.");
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
    maintenance ??= templateFor(date).find(
      (e) => (e.blockType === "maintenance" || e.blockType === "repair") && e.facilityId === input.facilityId &&
        overlaps(input.from, input.to, e.from, e.to),
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

function scheduleFor(date: string, facilityId: string | null) {
  const entries = entriesFor(date);
  const dayLabel =
    date === today() ? "Astăzi" : new Date(`${date}T12:00:00Z`).toLocaleDateString("ro-RO", { day: "numeric", month: "short" });
  const range = (e: MockEntry) => `${String(e.from).padStart(2, "0")}:00–${String(e.to).padStart(2, "0")}:00`;

  const facilitiesStatus = facilities.map((f) => {
    const id = facilityIds[f.id];
    const own = entries.filter((e) => e.facilityId === id);
    const repair = own.find((e) => e.blockType === "repair");
    const course = own.find((e) => e.blockType === "course" || e.blockType === "event");
    if (repair) {
      return { facilityId: id, name: f.name, status: "under_maintenance", statusLabel: "Reparație activă", note: `${dayLabel} · ${range(repair)}` };
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

  const repair = entries.find((e) => e.blockType === "repair");
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
    activeIncident: repair
      ? {
          id: INCIDENT_ID,
          code: "INC-204",
          facility: { id: TEREN, name: facilityName(TEREN) },
          type: "repair",
          status: "active",
          publicReason: "Reparație instalație nocturnă",
          startTime: at(date, repair.from),
          endTime: at(date, repair.to),
          affectedBookings: 0,
          quotasRefunded: 0,
          notifiedUsers: 0,
          pendingNotifications: 0,
        }
      : null,
  };
}

const PEOPLE = ["Andrei Munteanu", "Daria Stan", "Radu Ionescu", "Elena Rusu", "Vlad Ciobanu", "Ioana Popescu"];
// Cine nu e student: profesorii nu au cotă lunară, externii nu au cotă inclusă.
const ROLE_OF: Record<string, string> = { "Elena Rusu": "professor", "Vlad Ciobanu": "external" };

type MockBooking = ReturnType<typeof seedBookings>[number];

/** Rezervările inițiale ale unei zile (aceleași la fiecare pornire). */
function seedBookings(date: string) {
  const slots: Array<[string, number, string]> = [
    [FITNESS, 18, PEOPLE[0]],
    [FITNESS, 19, PEOPLE[1]],
    [FITNESS, 20, PEOPLE[2]],
    [TEREN, 10, PEOPLE[4]],
    [SALA, 17, PEOPLE[3]],
    [BAZIN, 9, PEOPLE[0]],
    [BAZIN, 9, PEOPLE[5]],
    [BAZIN, 18, PEOPLE[1]],
    [BAZIN, 18, PEOPLE[2]],
    [BAZIN, 18, PEOPLE[3]],
    [BAZIN, 18, PEOPLE[4]],
  ];
  const mmdd = date.slice(5, 7) + date.slice(8, 10);
  return slots.map(([facilityId, hour, name], index) => ({
    id: `b-${date}-${index + 1}`,
    code: `USV-${mmdd}-${184 + index}`,
    facility: { id: facilityId, name: facilityName(facilityId), campus: "Campus USV" },
    user: { id: `u-${PEOPLE.indexOf(name) + 1}`, name, role: ROLE_OF[name] ?? "student" },
    startTime: at(date, hour),
    endTime: at(date, hour + 1),
    durationMinutes: 60,
    status: "confirmed" as string,
    usesIncludedQuota: (ROLE_OF[name] ?? "student") === "student",
    cancelledBy: null as string | null,
    cancelReason: null as string | null,
    cancelledAt: null as string | null,
    quotaRefunded: false,
  }));
}

function requireAdmin(token: string | null | undefined) {
  const role = mockRoleForToken(token);
  if (!role) fail(401, "UNAUTHENTICATED", "Autentifică-te cu contul USV.");
  if (role !== "administrator") fail(403, "FORBIDDEN", "Nu ai permisiunea necesară.");
}

export function adminMockHandler(path: string, method: Method, token: string | null | undefined, body?: unknown) {
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

  if (route === "/admin/bookings" && method === "GET") {
    const from = query.get("from") ?? today();
    const to = query.get("to") ?? from;
    if (!validDate(from) || !validDate(to) || to < from) fail(400, "VALIDATION_ERROR", "Interval de date invalid.");
    const tab = query.get("tab") ?? "upcoming";
    const page = Number(query.get("page") ?? 1);
    const pageSize = Number(query.get("pageSize") ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      fail(400, "VALIDATION_ERROR", "Paginare invalidă.");
    }

    const now = Date.now();
    const all: MockBooking[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) all.push(...bookingsOn(d));
    const items = all
      .filter((b) => !facilityId || b.facility.id === facilityId)
      .filter((b) =>
        tab === "cancelled"
          ? b.status === "cancelled"
          : b.status !== "cancelled" &&
            (tab === "history" ? Date.parse(b.endTime) <= now : tab === "upcoming" ? Date.parse(b.endTime) > now : false),
      );
    const start = (page - 1) * pageSize;
    return {
      page,
      pageSize,
      totalItems: items.length,
      totalPages: Math.ceil(items.length / pageSize),
      counts: { upcoming: 0, history: 0, cancelled: 0, waitlist: 0 },
      items: items.slice(start, start + pageSize),
    };
  }

  if (route === "/admin/activities/preview" && method === "POST") return previewActivity(body);
  if (route === "/admin/activities" && method === "POST") return createActivity(body);

  fail(404, "NOT_FOUND", "Resursa de administrare nu există.");
}
