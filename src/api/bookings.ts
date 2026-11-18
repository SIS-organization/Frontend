import { apiRequest } from "./client";

export type UserQuota = {
  remainingQuota: number;
  limit: number;
};

export type BookingInput = {
  facilityId: string;
  startTime: string;
  endTime: string;
  allowPaidExtra?: boolean;
};

export type BookingResponse = {
  id: string;
  code: string;
  facility: {
    id: string;
    name: string;
    campus?: string;
  };
  startTime: string;
  endTime: string;
  status:
    | "in_verification"
    | "payment_pending"
    | "confirmed"
    | "rejected"
    | "cancelled"
    | "awaiting_transfer"
    | "completed";
};

export async function getUserQuota(): Promise<UserQuota> {
  return apiRequest<UserQuota>("/users/me/quota");
}

export async function createBooking(payload: BookingInput): Promise<BookingResponse> {
  return apiRequest<BookingResponse>("/bookings", "POST", payload, {
    "Idempotency-Key": crypto.randomUUID(),
  });
}

export async function getBookingDetails(id: string): Promise<BookingResponse> {
  return apiRequest<BookingResponse>(`/bookings/${encodeURIComponent(id)}`);
}
