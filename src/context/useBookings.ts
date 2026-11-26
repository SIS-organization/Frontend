import { createContext, useContext } from "react";
import type { Booking } from "../types";
import type { UserQuota } from "../api/bookings";
import type { WaitlistEntry } from "../api/waitlist";

export type BookingsContextValue = {
  bookings: Booking[];
  cancelBooking: (id: string) => Promise<{ quotaRefunded: boolean }>;
  releaseEarly: (id: string) => Promise<void>;
  quota: UserQuota | null;
  quotaError: boolean;
  bookingsError: boolean;
  waitlist: WaitlistEntry[];
  leaveWaitlist: (id: string) => Promise<void>;
};

export const BookingsContext = createContext<BookingsContextValue | null>(null);

export function useBookings(): BookingsContextValue {
  const context = useContext(BookingsContext);
  if (!context) {
    throw new Error("useBookings trebuie folosit în BookingsProvider");
  }
  return context;
}
