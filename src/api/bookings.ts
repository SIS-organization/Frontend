import { apiRequest } from "./client";

export type UserQuota = {
  month: string;
  included: number | null;
  used: number;
  remaining: number | null;
  resetsOn?: string;
  priority: boolean;
  limitReached: boolean;
  appliesTo?: "student" | "professor_unlimited" | "external_none";
};

export type BookingInput = {
  facilityId: string;
  startTime: string;
  endTime: string;
  notes?: string;
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
  durationMinutes?: number;
  status:
    | "in_verification"
    | "confirmed"
    | "rejected"
    | "cancelled"
    | "awaiting_transfer"
    | "completed";
  usesIncludedQuota?: boolean;
  cancellableUntil?: string | null;
  canCancel?: boolean;
  canReleaseEarly?: boolean;
  quotaRefunded?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type BookingListResponse = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  items: BookingResponse[];
};

export type BookingScope = "upcoming" | "history" | "all";

export type BookingFilters = {
  scope?: BookingScope;
  status?: BookingResponse["status"];
  facilityId?: string;
  page?: number;
  pageSize?: number;
};

export type CancelBookingResult = {
  booking: BookingResponse;
  quotaRestored: boolean;
  waitlistNotified: number;
};

export async function getUserQuota(month?: string): Promise<UserQuota> {
  const query = month ? `?month=${encodeURIComponent(month)}` : "";
  return apiRequest<UserQuota>(`/users/me/quota${query}`);
}

export async function createBooking(payload: BookingInput): Promise<BookingResponse> {
  return apiRequest<BookingResponse>("/bookings", "POST", payload, {
    "Idempotency-Key": crypto.randomUUID(),
  });
}

export async function getBookingDetails(id: string): Promise<BookingResponse> {
  return apiRequest<BookingResponse>(`/bookings/${encodeURIComponent(id)}`);
}

export async function getMyBookings(filters: BookingFilters = {}): Promise<BookingListResponse> {
  const query = new URLSearchParams();
  if (filters.scope) query.set("scope", filters.scope);
  if (filters.status) query.set("status", filters.status);
  if (filters.facilityId) query.set("facilityId", filters.facilityId);
  query.set("page", String(filters.page ?? 1));
  query.set("pageSize", String(filters.pageSize ?? 20));
  return apiRequest<BookingListResponse>(`/bookings?${query.toString()}`);
}

export async function cancelBooking(id: string, reason?: string): Promise<CancelBookingResult> {
  const body = reason?.trim() ? { reason: reason.trim() } : undefined;
  return apiRequest<CancelBookingResult>(
    `/bookings/${encodeURIComponent(id)}/cancel`,
    "POST",
    body,
  );
}
