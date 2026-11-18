import type { Booking } from "../types";
import { hourLabel } from "./dates";

// Regulament (KAN-39): anularea e permisă cu minimum 2 ore înainte și restituie ora în cotă.
export const CANCEL_MIN_HOURS = 2;

export function canCancelBooking(booking: Booking, now: Date): boolean {
  const start = new Date(`${booking.date}T${hourLabel(booking.hour)}:00`);
  return start.getTime() - now.getTime() >= CANCEL_MIN_HOURS * 3_600_000;
}
