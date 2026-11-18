import { facilities } from "./data";
import type {
  AmenityCode,
  Facility,
  FacilityAvailability,
  FacilityListResponse,
  SlotCell,
  SlotStatus,
  SportCode,
} from "../api/facilities";

const timezone = "Europe/Bucharest";
const facilityIds: Record<number, string> = {
  1: "e0b1cdd4-d6fd-49ef-a7bd-2be2c33a5b11",
  2: "e0b1cdd4-d6fd-49ef-a7bd-2be2c33a5b12",
  3: "e0b1cdd4-d6fd-49ef-a7bd-2be2c33a5b13",
  4: "e0b1cdd4-d6fd-49ef-a7bd-2be2c33a5b14",
};

const sportCodes: Record<string, Array<{ code: SportCode; label: string }>> = {
  Fotbal: [{ code: "football", label: "Fotbal" }],
  Fitness: [{ code: "fitness", label: "Fitness" }],
  Înot: [{ code: "swimming", label: "Înot" }],
  "Baschet / Volei": [
    { code: "basketball", label: "Baschet" },
    { code: "volleyball", label: "Volei" },
  ],
};

const amenityCodes: Record<string, { code: AmenityCode; label: string }> = {
  Vestiare: { code: "changing_rooms", label: "Vestiare" },
  Dușuri: { code: "showers", label: "Dușuri" },
  Nocturnă: { code: "floodlights", label: "Nocturnă" },
  Accesibil: { code: "accessibility", label: "Accesibilitate" },
};

function dateInBucharest(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateTimeInBucharest(date: string, hour: number) {
  const [year, month, day] = date.split("-").map(Number);
  const targetLocalTime = Date.UTC(year, month - 1, day, hour);
  let timestamp = targetLocalTime;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
    const representedLocalTime = Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second,
    );
    timestamp += targetLocalTime - representedLocalTime;
  }

  return new Date(timestamp).toISOString();
}

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function findFacility(id: string) {
  const facility = facilities.find((item) => facilityIds[item.id] === id);
  if (!facility) throw new Error(`Facility not found: ${id}`);
  return facility;
}

function slotsForDate(facilityId: string, date: string): SlotCell[] {
  const facility = findFacility(facilityId);
  const today = dateInBucharest();
  const nowParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const currentHour = Number(nowParts.find((part) => part.type === "hour")?.value ?? 0);
  const currentMinute = Number(nowParts.find((part) => part.type === "minute")?.value ?? 0);

  return Array.from({ length: 13 }, (_, index) => {
    const hour = index + 8;
    const isPast = date < today || (date === today && (hour < currentHour || (hour === currentHour && currentMinute > 0)));
    const value = (facility.id * 11 + Number(date.slice(-2)) * 13 + hour * 5) % 11;
    const status: SlotStatus = isPast
      ? "past"
      : value === 0
        ? "maintenance"
        : value === 1
          ? "university_course"
          : value === 2
            ? "university_event"
            : value === 3 || value === 4
              ? "booked"
              : "free";
    const startTime = dateTimeInBucharest(date, hour);
    const endTime = dateTimeInBucharest(date, hour + 1);
    const labels: Partial<Record<SlotStatus, string>> = {
      booked: "Ocupat",
      university_course: "Curs USV",
      university_event: "Eveniment USV",
      maintenance: "Mentenanță",
      past: "Interval trecut",
    };

    return {
      startTime,
      endTime,
      status,
      label: labels[status] ?? null,
      bookable: status === "free",
      bookedByMe: false,
      waitlistAvailable: status === "booked",
      waitlistCount: status === "booked" ? (value % 3) + 1 : 0,
    };
  });
}

function availabilityFor(facilityId: string, from: string, to: string): FacilityAvailability {
  if (!validDate(from) || !validDate(to)) throw new Error("Availability requires valid from and to dates");

  const fromTime = Date.parse(`${from}T00:00:00.000Z`);
  const toTime = Date.parse(`${to}T00:00:00.000Z`);
  const daysBetween = (toTime - fromTime) / 86_400_000;
  if (daysBetween < 0 || daysBetween > 14) {
    throw new Error("Availability date range must be between 0 and 14 days");
  }

  findFacility(facilityId);
  const days = Array.from({ length: daysBetween + 1 }, (_, index) => {
    const date = new Date(fromTime + index * 86_400_000).toISOString().slice(0, 10);
    return {
      date,
      isToday: date === dateInBucharest(),
      open: "08:00",
      close: "21:00",
      slots: slotsForDate(facilityId, date),
    };
  });

  return {
    facilityId,
    timezone,
    from,
    to,
    generatedAt: new Date().toISOString(),
    days,
  };
}

function toFacilityResponse(facilityId: number, date: string): Facility {
  const source = facilities.find((item) => item.id === facilityId);
  if (!source) throw new Error(`Facility not found: ${facilityId}`);

  const sports = sportCodes[source.sport] ?? [];
  const amenities = source.amenities.map((label) => amenityCodes[label]).filter((item) => item !== undefined);
  const nextFreeSlot =
    slotsForDate(facilityIds[source.id], date).find((slot) => slot.status === "free" && slot.bookable) ?? null;

  return {
    id: facilityIds[source.id],
    name: source.name,
    description: `${sports.map((sport) => sport.label).join(" · ")} · ${amenities.map((amenity) => amenity.label).join(" · ")}`,
    campus: "Campus USV",
    imageUrl: null,
    sports,
    amenities,
    status: "operational",
    statusNote: null,
    openingTime: "08:00",
    closingTime: "21:00",
    slotDurationMinutes: 60,
    timezone,
    nextFreeSlot: nextFreeSlot
      ? { startTime: nextFreeSlot.startTime, endTime: nextFreeSlot.endTime }
      : null,
  };
}

function listFacilities(path: string): FacilityListResponse {
  const query = new URLSearchParams(path.split("?")[1] ?? "");
  const date = query.get("date") ?? dateInBucharest();
  if (!validDate(date)) throw new Error("Facility date must be a valid YYYY-MM-DD value");

  const search = query.get("q")?.trim().toLocaleLowerCase();
  const sport = query.get("sport");
  const requiredAmenities = (query.get("amenities") ?? "").split(",").filter(Boolean);
  const includeUnavailable = query.get("includeUnavailable") !== "false";
  const page = Number(query.get("page") ?? 1);
  const pageSize = Number(query.get("pageSize") ?? 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error("Invalid facility pagination parameters");
  }

  const items = facilities
    .map((item) => toFacilityResponse(item.id, date))
    .filter((item) => includeUnavailable || item.status === "operational")
    .filter((item) => !sport || item.sports.some((entry) => entry.code === sport))
    .filter((item) => requiredAmenities.every((code) => item.amenities.some((amenity) => amenity.code === code)))
    .filter((item) => {
      if (!search) return true;
      return [item.name, ...item.sports.map((entry) => entry.label)]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search);
    });
  const start = (page - 1) * pageSize;

  return {
    page,
    pageSize,
    totalItems: items.length,
    totalPages: Math.ceil(items.length / pageSize),
    items: items.slice(start, start + pageSize),
  };
}

export function mockApiHandler(path: string, method: "GET" | "POST", body?: unknown) {
  if (path === "/users/me/quota" && method === "GET") {
    return { success: true, data: { remainingQuota: 2, limit: 4 } };
  }

  if ((path === "/facilities" || path.startsWith("/facilities?")) && method === "GET") {
    return listFacilities(path);
  }

  if (method === "GET") {
    const availabilityMatch = path.match(/^\/facilities\/([^/]+)\/availability(?:\?(.*))?$/);
    if (availabilityMatch) {
      const [, encodedId, queryString = ""] = availabilityMatch;
      const query = new URLSearchParams(queryString);
      const from = query.get("from");
      const to = query.get("to");
      if (!from || !to) throw new Error("Availability requires from and to query parameters");
      return availabilityFor(decodeURIComponent(encodedId), from, to);
    }

    const facilityMatch = path.match(/^\/facilities\/([^/?]+)$/);
    if (facilityMatch) {
      const id = decodeURIComponent(facilityMatch[1]);
      const facility = findFacility(id);
      return toFacilityResponse(facility.id, dateInBucharest());
    }
  }

  if (path === "/bookings" && method === "POST") {
    const payload = body as {
      facilityId: number;
      facilityName?: string;
      startsAt: string;
      endsAt: string;
    };

    const date = payload.startsAt.slice(0, 10);
    const hour = Number(payload.startsAt.slice(11, 13));
    const code = `USV-${Math.floor(1000 + Math.random() * 9000)}`;

    return {
      success: true,
      data: {
        id: `mock-${Date.now()}`,
        facilityId: payload.facilityId,
        facilityName: payload.facilityName ?? `Facilitate ${payload.facilityId}`,
        date,
        hour,
        status: "upcoming",
        code,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
      },
    };
  }

  if (path.startsWith("/bookings/") && method === "GET") {
    const id = path.split("/").at(-1) ?? "mock-1";
    return {
      success: true,
      data: {
        id,
        code: `USV-${Math.floor(1000 + Math.random() * 9000)}`,
        qrUrl: `https://example.com/qr/${id}`,
      },
    };
  }

  throw new Error(`No mock defined for ${method} ${path}`);
}
