// Mock pentru rutele /admin/* din contract (GET /admin/schedule, GET /admin/bookings).
// Se comportă ca backend-ul: fără token → 401, alt rol decât administrator → 403,
// parametri invalizi → 400. Răspunsurile au exact forma din Swagger.

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
};

const INCIDENT_ID = "6f1c2d3e-0000-4000-8000-000000000204";

function entriesFor(date: string): MockEntry[] {
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
        activityId: null,
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

function bookingsFor(date: string) {
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
    user: { id: `u-${(index % PEOPLE.length) + 1}`, name, role: "student" },
    startTime: at(date, hour),
    endTime: at(date, hour + 1),
    durationMinutes: 60,
    status: "confirmed",
  }));
}

function requireAdmin(token: string | null | undefined) {
  const role = mockRoleForToken(token);
  if (!role) fail(401, "UNAUTHENTICATED", "Autentifică-te cu contul USV.");
  if (role !== "administrator") fail(403, "FORBIDDEN", "Nu ai permisiunea necesară.");
}

export function adminMockHandler(path: string, method: Method, token: string | null | undefined) {
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
    const all: ReturnType<typeof bookingsFor> = [];
    for (let d = from; d <= to; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
      all.push(...bookingsFor(d));
    }
    const items = all
      .filter((b) => !facilityId || b.facility.id === facilityId)
      .filter((b) => (tab === "history" ? Date.parse(b.endTime) <= now : tab === "upcoming" ? Date.parse(b.endTime) > now : false));
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

  fail(404, "NOT_FOUND", "Resursa de administrare nu există.");
}
