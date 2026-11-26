import { apiRequest } from "./client";

// Lista de așteptare (Epic 7), după contractul backend-ului: GET /waitlist, DELETE /waitlist/{id}.

export type WaitlistStatus = "active" | "offered" | "fulfilled" | "declined" | "expired" | "cancelled";

export type WaitlistEntry = {
  id: string;
  facility: { id: string; name: string };
  user?: { id: string; name: string };
  startTime: string;
  endTime: string;
  position: number | null;
  status: WaitlistStatus;
  replaceBookingId: string | null;
  offerExpiresAt: string | null;
  createdAt: string;
};

export async function getMyWaitlist(): Promise<WaitlistEntry[]> {
  return apiRequest<WaitlistEntry[]>("/waitlist");
}

export async function leaveWaitlist(id: string): Promise<void> {
  await apiRequest<void>(`/waitlist/${encodeURIComponent(id)}`, "DELETE");
}
