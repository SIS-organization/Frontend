import { createContext, useContext } from "react";
import type { Booking } from "../types";
import type { UserQuota } from "../api/bookings";

export type BookingsContextValue = {
  bookings: Booking[];
  cancelBooking: (id: string) => Promise<{ quotaRefunded: boolean }>;
  releaseEarly: (id: string) => Promise<void>;
  quota: UserQuota | null;
  quotaError: boolean;
  bookingsError: boolean;
};

export const BookingsContext = createContext<BookingsContextValue | null>(null);

export function useBookings(): BookingsContextValue {
  const context = useContext(BookingsContext);
  if (!context) {
    throw new Error("useBookings trebuie folosit în BookingsProvider");
  }
  return context;
}
