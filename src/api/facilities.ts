import type { Facility } from "../types";
import { apiRequest } from "./client";

export type AvailabilityStatus = "free" | "booked" | "maintenance";

export type FacilityAvailability = {
  facilityId: number;
  date: string;
  hour: number;
  status: AvailabilityStatus;
};

export async function getFacilities(): Promise<Facility[]> {
  const response = await apiRequest<{ id: number; name: string; sport: string; amenities: string[]; nextFree: string }[]>("/facilities");
  return response.map((facility) => ({
    id: facility.id,
    name: facility.name,
    sport: facility.sport,
    amenities: facility.amenities,
    nextFree: facility.nextFree,
  }));
}

export async function getFacilityAvailability(facilityId: number, date: string): Promise<FacilityAvailability[]> {
  return apiRequest<FacilityAvailability[]>(`/facilities/${facilityId}/availability?date=${date}`);
}
