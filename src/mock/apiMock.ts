import { facilities } from "./data";

const dayFromIso = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return d.toISOString().slice(0, 10);
};

const fakeSlots = (facilityId: number, date: string) => {
  const entries = [] as Array<{ facilityId: number; date: string; hour: number; status: "free" | "booked" | "maintenance" }>;

  for (let hour = 8; hour <= 20; hour += 1) {
    const n = (facilityId * 11 + hour * 5 + date.length) % 7;
    const status = n === 0 ? "maintenance" : n === 1 || n === 2 ? "booked" : "free";
    entries.push({ facilityId, date, hour, status });
  }

  return entries;
};

export function mockApiHandler(path: string, method: "GET" | "POST", body?: unknown) {
  if (path === "/users/me/quota" && method === "GET") {
    return { success: true, data: { remainingQuota: 2, limit: 4 } };
  }

  if (path === "/facilities" && method === "GET") {
    return {
      success: true,
      data: facilities.map((f) => ({
        id: f.id,
        name: f.name,
        sport: f.sport,
        amenities: f.amenities,
        nextFree: f.nextFree,
      })),
    };
  }

  if (path.startsWith("/facilities/") && path.includes("/availability") && method === "GET") {
    const match = path.match(/\/facilities\/(\d+)\/availability\?date=(\d{4}-\d{2}-\d{2})/);
    if (!match) {
      throw new Error("Invalid availability path");
    }

    const facilityId = Number(match[1]);
    const date = match[2];

    return {
      success: true,
      data: fakeSlots(facilityId, dayFromIso(date)),
    };
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
