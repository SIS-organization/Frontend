import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { cancelBookingRequest, createBooking, getMyBookings } from "../api/bookings";
import type { Booking } from "../types";

type NewBooking = Pick<Booking, "facilityId" | "facilityName" | "date" | "hour">;

type Ctx = {
  bookings: Booking[];
  loading: boolean;
  error: string | null;
  addBooking: (data: NewBooking) => Promise<Booking>;
  cancelBooking: (id: string) => Promise<void>;
};

const BookingsContext = createContext<Ctx | null>(null);

export function BookingsProvider({ children }: { children: ReactNode }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getMyBookings()
      .then((items) => {
        if (!active) return;
        setBookings(items);
        setError(null);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Nu s-au putut încărca rezervările.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const addBooking = async (data: NewBooking) => {
    const created = await createBooking({ facilityId: data.facilityId, date: data.date, hour: data.hour });
    setBookings((prev) => [created, ...prev]);
    return created;
  };

  const cancelBooking = async (id: string) => {
    const updated = await cancelBookingRequest(id);
    setBookings((prev) => prev.map((b) => (b.id === id ? updated : b)));
  };

  return (
    <BookingsContext.Provider value={{ bookings, loading, error, addBooking, cancelBooking }}>
      {children}
    </BookingsContext.Provider>
  );
}

export function useBookings() {
  const ctx = useContext(BookingsContext);
  if (!ctx) throw new Error("useBookings trebuie folosit în BookingsProvider");
  return ctx;
}
