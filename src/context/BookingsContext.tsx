import { createContext, useContext, useState, type ReactNode } from "react";
import { createBooking } from "../api/bookings";
import type { Booking } from "../types";
import { toISO } from "../utils/dates";

type NewBooking = Pick<Booking, "facilityId" | "facilityName" | "date" | "hour">;

type Ctx = {
  bookings: Booking[];
  addBooking: (data: NewBooking) => Promise<Booking>;
  cancelBooking: (id: string) => void;
};

const BookingsContext = createContext<Ctx | null>(null);

const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toISO(d);
};

const initial: Booking[] = [
  { id: "b1", facilityId: 2, facilityName: "Sală fitness", date: inDays(2), hour: 17, status: "upcoming", code: "USV-1042" },
  { id: "b2", facilityId: 1, facilityName: "Teren de fotbal", date: inDays(-5), hour: 19, status: "past", code: "USV-0987" },
];

export function BookingsProvider({ children }: { children: ReactNode }) {
  const [bookings, setBookings] = useState<Booking[]>(initial);

  const addBooking = async (data: NewBooking) => {
    const payload = {
      facilityId: data.facilityId,
      facilityName: data.facilityName,
      startsAt: `${data.date}T${String(data.hour).padStart(2, "0")}:00:00`,
      endsAt: `${data.date}T${String(data.hour + 1).padStart(2, "0")}:00:00`,
    };

    const serverBooking = await createBooking(payload);
    const b: Booking = {
      id: serverBooking.id,
      facilityId: serverBooking.facilityId,
      facilityName: serverBooking.facilityName,
      date: serverBooking.date,
      hour: serverBooking.hour,
      status: serverBooking.status,
      code: serverBooking.code,
    };

    setBookings((prev) => [b, ...prev]);
    return b;
  };

  const cancelBooking = (id: string) =>
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)));

  return <BookingsContext.Provider value={{ bookings, addBooking, cancelBooking }}>{children}</BookingsContext.Provider>;
}

export function useBookings() {
  const ctx = useContext(BookingsContext);
  if (!ctx) throw new Error("useBookings trebuie folosit în BookingsProvider");
  return ctx;
}
