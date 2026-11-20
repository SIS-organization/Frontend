import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  cancelBooking as cancelBookingRequest,
  getMyBookings,
  getUserQuota,
  releaseEarly as releaseEarlyRequest,
  type BookingResponse,
  type UserQuota,
} from "../api/bookings";
import type { Booking } from "../types";
import { BookingsContext, type BookingsContextValue } from "./useBookings";

function toLocalBooking(booking: BookingResponse): Booking {
  const start = new Date(booking.startTime);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(start);
  const dateParts = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Bucharest",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(start),
  );
  const status =
    booking.status === "completed"
      ? "past"
      : booking.status === "cancelled" || booking.status === "rejected"
        ? "cancelled"
        : "upcoming";

  return {
    id: booking.id,
    facilityId: booking.facility.id,
    facilityName: booking.facility.name,
    date: `${dateParts.year}-${dateParts.month}-${dateParts.day}`,
    hour,
    status,
    code: booking.code,
  };
}

export function BookingsProvider({ children }: { children: ReactNode }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [quota, setQuota] = useState<UserQuota | null>(null);
  const [quotaError, setQuotaError] = useState(false);
  const [bookingsError, setBookingsError] = useState(false);

  const refreshQuota = useCallback(async () => {
    try {
      setQuota(await getUserQuota());
      setQuotaError(false);
    } catch {
      setQuotaError(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getMyBookings({ scope: "all", pageSize: 100 })
      .then((response) => {
        if (active) {
          setBookings(response.items.map(toLocalBooking));
          setBookingsError(false);
        }
      })
      .catch(() => {
        if (active) setBookingsError(true);
      });
    getUserQuota()
      .then((result) => {
        if (active) {
          setQuota(result);
          setQuotaError(false);
        }
      })
      .catch(() => {
        if (active) setQuotaError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const cancelBooking = async (id: string) => {
    const result = await cancelBookingRequest(id);
    setBookings((current) =>
      current.map((booking) =>
        booking.id === id ? toLocalBooking(result.booking) : booking,
      ),
    );
    if (result.quotaRestored) void refreshQuota();
    return { quotaRefunded: result.quotaRestored };
  };

  const releaseEarly = async (id: string) => {
    const booking = await releaseEarlyRequest(id);
    setBookings((current) =>
      current.map((item) => (item.id === id ? toLocalBooking(booking) : item)),
    );
  };

  return (
    <BookingsContext.Provider
      value={
        {
          bookings,
          cancelBooking,
          releaseEarly,
          quota,
          quotaError,
          bookingsError,
        } satisfies BookingsContextValue
      }
    >
      {children}
    </BookingsContext.Provider>
  );
}
