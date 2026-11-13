import type { Booking, BookingStatus } from "../types";
import { apiRequest } from "./client";

// Forma rezervării, exact cum o trimite backend-ul.
type BackendBooking = {
  id: number;
  facility: { id: number; name: string; location: string };
  startTime: string; // ISO 8601 cu offset, ora locală (ex. 2030-01-08T10:00:00+02:00)
  endTime: string;
  durationMinutes: number;
  status: "confirmed" | "cancelled" | "completed";
  earlyReleasedAt: string | null;
  createdAt: string;
};

type BackendBookingPage = {
  items: BackendBooking[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

const toStatus = (b: BackendBooking): BookingStatus => {
  if (b.status === "cancelled") return "cancelled";
  if (b.status === "completed" || new Date(b.endTime) <= new Date()) return "past";
  return "upcoming";
};

/** Din forma backend-ului în forma folosită de interfață. */
export function toBooking(b: BackendBooking): Booking {
  return {
    id: String(b.id),
    facilityId: b.facility.id,
    facilityName: b.facility.name,
    // Data și ora se iau direct din text: backend-ul le trimite deja în ora campusului.
    date: b.startTime.slice(0, 10),
    hour: Number(b.startTime.slice(11, 13)),
    status: toStatus(b),
    code: `USV-${String(b.id).padStart(4, "0")}`,
    startsAt: b.startTime,
  };
}

export type NewBookingInput = {
  facilityId: number;
  date: string; // YYYY-MM-DD
  hour: number; // ora de start, interval de 60 de minute
};

const pad = (n: number) => String(n).padStart(2, "0");

export async function createBooking({ facilityId, date, hour }: NewBookingInput): Promise<Booking> {
  const created = await apiRequest<BackendBooking>("/bookings", "POST", {
    facilityId,
    startTime: `${date}T${pad(hour)}:00:00`,
    endTime: `${date}T${pad(hour + 1)}:00:00`,
  });
  return toBooking(created);
}

export async function getMyBookings(): Promise<Booking[]> {
  const page = await apiRequest<BackendBookingPage>("/bookings?scope=all&pageSize=100");
  return page.items.map(toBooking);
}

export async function cancelBookingRequest(id: string): Promise<Booking> {
  return toBooking(await apiRequest<BackendBooking>(`/bookings/${id}/cancel`, "POST"));
}
