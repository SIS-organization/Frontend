import type { Booking } from "../types";
import { hourLabel } from "./dates";

// KAN-42: „Eliberează anticipat” are sens doar cât timp rezervarea este în desfășurare.
export function isBookingInProgress(booking: Booking, now: Date): boolean {
  const start = new Date(`${booking.date}T${hourLabel(booking.hour)}:00`);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return booking.status === "upcoming" && now >= start && now < end;
}
