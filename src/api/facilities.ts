import { apiRequest } from "./client";

export type SportCode =
  | "football"
  | "fitness"
  | "swimming"
  | "basketball"
  | "volleyball"
  | "tennis";

export type AmenityCode =
  | "changing_rooms"
  | "showers"
  | "floodlights"
  | "accessibility"
  | "cardio"
  | "weights"
  | "swim_lanes"
  | "bleachers"
  | "sports_flooring";

export type FacilityStatus =
  | "operational"
  | "under_maintenance"
  | "university_activity"
  | "closed";

export type Facility = {
  id: string;
  name: string;
  description?: string;
  campus?: string;
  imageUrl?: string | null;
  sports: Array<{ code: SportCode; label: string }>;
  amenities: Array<{ code: AmenityCode; label: string }>;
  status: FacilityStatus;
  statusNote?: string | null;
  openingTime?: string;
  closingTime?: string;
  slotDurationMinutes?: number;
  timezone?: string;
  nextFreeSlot?: TimeSlot | null;
};

export type TimeSlot = {
  startTime: string;
  endTime: string;
};

export type FacilityListResponse = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  items: Facility[];
};

export type SlotStatus =
  | "free"
  | "booked"
  | "university_course"
  | "university_event"
  | "maintenance"
  | "past"
  | "closed";

export type SlotCell = {
  startTime: string;
  endTime: string;
  status: SlotStatus;
  label?: string | null;
  bookable?: boolean;
  bookedByMe?: boolean;
  waitlistAvailable?: boolean;
  waitlistCount?: number;
};

export type DayAvailability = {
  date: string;
  isToday?: boolean;
  open?: string;
  close?: string;
  slots: SlotCell[];
};

export type FacilityAvailability = {
  facilityId: string;
  timezone: string;
  from: string;
  to: string;
  generatedAt: string;
  days: DayAvailability[];
};

export type FacilityFilters = {
  q?: string;
  sport?: SportCode;
  amenities?: AmenityCode[];
  date?: string;
  includeUnavailable?: boolean;
  page?: number;
  pageSize?: number;
};

export async function getFacilities(filters: FacilityFilters = {}): Promise<FacilityListResponse> {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.sport) query.set("sport", filters.sport);
  if (filters.amenities?.length) query.set("amenities", filters.amenities.join(","));
  if (filters.date) query.set("date", filters.date);
  if (filters.includeUnavailable !== undefined) {
    query.set("includeUnavailable", String(filters.includeUnavailable));
  }
  query.set("page", String(filters.page ?? 1));
  query.set("pageSize", String(filters.pageSize ?? 100));

  return apiRequest<FacilityListResponse>(`/facilities?${query.toString()}`);
}

export async function getFacility(facilityId: string): Promise<Facility> {
  return apiRequest<Facility>(`/facilities/${encodeURIComponent(facilityId)}`);
}

export async function getFacilityAvailability(
  facilityId: string,
  from: string,
  to: string,
): Promise<FacilityAvailability> {
  const query = new URLSearchParams({ from, to });
  return apiRequest<FacilityAvailability>(
    `/facilities/${encodeURIComponent(facilityId)}/availability?${query.toString()}`,
  );
}
