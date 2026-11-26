import { facilities } from "./data";
import type { BookingResponse } from "../api/bookings";
import footballFieldImage from "../assets/facilities/football-field.jpg";
import fitnessRoomImage from "../assets/facilities/fitness-room.png";
import swimmingPoolImage from "../assets/facilities/swimming-pool.jpg";
import sportsHallImage from "../assets/facilities/sports-hall.jpg";
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

const facilityImages: Record<number, string> = {
  1: footballFieldImage,
  2: fitnessRoomImage,
  3: swimmingPoolImage,
  4: sportsHallImage,
};

const mockBookings: BookingResponse[] = [];

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
    const startTime = dateTimeInBucharest(date, hour);
    const endTime = dateTimeInBucharest(date, hour + 1);
    const status: SlotStatus = isPast
      ? "past"
      : mockBookings.some(
          (booking) =>
            booking.facility.id === facilityId &&
            booking.startTime === startTime &&
            booking.endTime === endTime,
        )
        ? "booked"
      : value === 0
        ? "maintenance"
        : value === 1
          ? "university_course"
          : value === 2
            ? "university_event"
            : value === 3 || value === 4
              ? "booked"
              : "free";
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
    imageUrl: facilityImages[source.id],
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

export function mockApiHandler(path: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown) {
  const waitlistResult = mockWaitlistHandler(path, method);
  if (waitlistResult !== undefined) return waitlistResult;

  if (path.startsWith("/users/me/quota") && method === "GET") {
    // Ca în designul „Programările mele”: toate cele 4 rezervări incluse sunt folosite.
    const month = dateInBucharest().slice(0, 7);
    const [year, monthNumber] = month.split("-").map(Number);
    const resetsOn = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
    return {
      success: true,
      data: {
        month,
        included: 4,
        used: 4,
        remaining: 0,
        resetsOn,
        priority: true,
        limitReached: true,
        appliesTo: "student",
      },
    };
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
      facilityId: string;
      startTime: string;
      endTime: string;
      notes?: string;
    };

    const facility = findFacility(payload.facilityId);
    const availableSlot = slotsForDate(payload.facilityId, payload.startTime.slice(0, 10)).find(
      (slot) => slot.startTime === payload.startTime && slot.endTime === payload.endTime,
    );
    if (!availableSlot || availableSlot.status !== "free" || availableSlot.bookable === false) {
      throw new Error("Intervalul nu mai este disponibil. Alege altă oră.");
    }

    const code = `USV-${Math.floor(1000 + Math.random() * 9000)}`;
    const booking: BookingResponse = {
      id: crypto.randomUUID(),
      code,
      facility: {
        id: payload.facilityId,
        name: facility.name,
        campus: "Campus USV",
      },
      startTime: payload.startTime,
      endTime: payload.endTime,
      status: "confirmed",
    };
    mockBookings.push(booking);
    return { success: true, data: booking };
  }

  if (path.startsWith("/bookings?") && method === "GET") {
    return {
      success: true,
      data: {
        page: 1,
        pageSize: 20,
        totalItems: mockBookings.length,
        totalPages: mockBookings.length ? 1 : 0,
        items: mockBookings,
      },
    };
  }

  if (path.startsWith("/bookings/") && method === "GET") {
    const id = path.split("/").at(-1) ?? "mock-1";
    const booking = mockBookings.find((item) => item.id === id);
    if (!booking) throw new Error(`Booking not found: ${id}`);
    return { success: true, data: booking };
  }

  const cancelMatch = path.match(/^\/bookings\/([^/]+)\/cancel$/);
  if (cancelMatch && method === "POST") {
    const booking = mockBookings.find((item) => item.id === cancelMatch[1]);
    if (!booking) throw new Error(`Booking not found: ${cancelMatch[1]}`);
    const cancelled = {
      ...booking,
      status: "cancelled" as const,
      canCancel: false,
      cancelledAt: new Date().toISOString(),
      quotaRefunded: booking.usesIncludedQuota ?? false,
      cancelReason:
        body && typeof body === "object" && "reason" in body
          ? String(body.reason)
          : null,
    };
    mockBookings.splice(mockBookings.indexOf(booking), 1, cancelled);
    return {
      success: true,
      data: {
        booking: cancelled,
        quotaRestored: cancelled.quotaRefunded,
        waitlistNotified: 0,
      },
    };
  }

  const releaseMatch = path.match(/^\/bookings\/([^/]+)\/release-early$/);
  if (releaseMatch && method === "POST") {
    const booking = mockBookings.find((item) => item.id === releaseMatch[1]);
    if (!booking) throw new Error(`Booking not found: ${releaseMatch[1]}`);
    const released = { ...booking, status: "completed" as const, canReleaseEarly: false };
    mockBookings.splice(mockBookings.indexOf(booking), 1, released);
    return { success: true, data: released };
  }

  throw new Error(`No mock defined for ${method} ${path}`);
}

// ---------- Date demo pentru „Programările mele” (doar în modul mock) ----------
// Reproduc situația din designul Figma: o rezervare azi (în desfășurare, deci se poate elibera
// anticipat), una mâine la bazin, două finalizate în istoric și o intrare pe lista de așteptare.
function shiftDate(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function seedBooking(id: string, code: string, facilityId: number, date: string, hour: number, status: BookingResponse["status"]) {
  const apiId = facilityIds[facilityId];
  const facility = findFacility(apiId);
  mockBookings.push({
    id,
    code,
    facility: { id: apiId, name: facility.name, campus: "Campus USV" },
    startTime: dateTimeInBucharest(date, hour),
    endTime: dateTimeInBucharest(date, hour + 1),
    durationMinutes: 60,
    status,
    usesIncludedQuota: true,
    createdAt: status === "confirmed" && date === dateInBucharest() ? new Date().toISOString() : dateTimeInBucharest(shiftDate(date, -3), 10),
  });
}

const demoToday = dateInBucharest();
const demoHour = Math.min(
  20,
  Math.max(8, Number(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(new Date()))),
);
seedBooking("demo-1", `USV-${demoToday.slice(5, 7)}${demoToday.slice(8)}-184`, 2, demoToday, demoHour, "confirmed");
seedBooking("demo-2", `USV-${shiftDate(demoToday, 1).slice(5).replace("-", "")}-201`, 3, shiftDate(demoToday, 1), 16, "confirmed");
seedBooking("demo-3", "USV-HIST-1", 1, shiftDate(demoToday, -7), 19, "completed");
seedBooking("demo-4", "USV-HIST-2", 2, shiftDate(demoToday, -14), 18, "completed");

const mockWaitlist = [
  {
    id: "wait-1",
    facility: { id: facilityIds[2], name: findFacility(facilityIds[2]).name },
    startTime: dateTimeInBucharest(shiftDate(demoToday, 1), 15),
    endTime: dateTimeInBucharest(shiftDate(demoToday, 1), 16),
    position: 2,
    status: "active",
    replaceBookingId: "demo-2",
    offerExpiresAt: null,
    createdAt: new Date().toISOString(),
  },
];

export function mockWaitlistHandler(path: string, method: string) {
  if (path === "/waitlist" && method === "GET") {
    return { success: true, data: mockWaitlist.filter((entry) => entry.status === "active" || entry.status === "offered") };
  }
  const leaveMatch = path.match(/^\/waitlist\/([^/]+)$/);
  if (leaveMatch && method === "DELETE") {
    const entry = mockWaitlist.find((item) => item.id === leaveMatch[1]);
    if (entry) entry.status = "cancelled";
    return { success: true, data: undefined };
  }
  return undefined;
}
