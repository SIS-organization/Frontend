import { apiRequest, type ApiResult } from "./client";

export type UserQuota = {
  remainingQuota: number;
  limit: number;
};

export type BookingInput = {
  facilityId: number;
  facilityName?: string;
  startsAt: string;
  endsAt: string;
};

export type BookingResponse = {
  id: string;
  facilityId: number;
  facilityName: string;
  date: string;
  hour: number;
  status: "upcoming" | "past" | "cancelled";
  code: string;
  startsAt: string;
  endsAt: string;
};

export async function getUserQuota(): Promise<UserQuota> {
  return apiRequest<UserQuota>("/users/me/quota");
}

export async function createBooking(payload: BookingInput): Promise<BookingResponse> {
  return apiRequest<BookingResponse>("/bookings", "POST", payload);
}

export async function getBookingDetails(id: string): Promise<{ id: string; code: string; qrUrl: string }> {
  return apiRequest<{ id: string; code: string; qrUrl: string }>(`/bookings/${id}`);
}

export type CancelBookingResponse = {
  id: string;
  status: "cancelled";
  quotaRefunded: boolean;
};

// Backend: răspunde 422 dacă rezervarea începe în mai puțin de 2 ore (KAN-39).
export async function cancelBooking(id: string): Promise<CancelBookingResponse> {
  const result = await apiRequest<ApiResult<CancelBookingResponse>>(`/bookings/${id}/cancel`, "POST");
  return result.data;
}
