import type { Facility, SlotStatus } from "../types";
import { apiRequest } from "./client";

type BackendFacility = {
  id: number;
  name: string;
  type: "football_field" | "gym" | "swimming_pool" | "sports_hall";
  capacity: number;
  location: string;
  isActive: boolean;
};

// Baza de date nu are sport/dotări: le derivăm din tipul facilității.
const SPORT: Record<BackendFacility["type"], string> = {
  football_field: "Fotbal",
  gym: "Fitness",
  swimming_pool: "Înot",
  sports_hall: "Baschet / Volei",
};

const AMENITIES: Record<BackendFacility["type"], string[]> = {
  football_field: ["Vestiare", "Nocturnă"],
  gym: ["Vestiare", "Dușuri"],
  swimming_pool: ["Vestiare", "Dușuri", "Accesibil"],
  sports_hall: ["Vestiare", "Accesibil"],
};

export async function getFacilities(): Promise<Facility[]> {
  const response = await apiRequest<{ items: BackendFacility[] }>("/facilities");
  return response.items.map((f) => ({
    id: f.id,
    name: f.name,
    sport: SPORT[f.type] ?? f.type,
    amenities: AMENITIES[f.type] ?? [],
    location: f.location,
    capacity: f.capacity,
    isActive: f.isActive,
  }));
}

export type FacilityAvailability = {
  facilityId: number;
  date: string; // YYYY-MM-DD
  hour: number;
  status: SlotStatus;
  capacity: number;
  freeSpots: number;
};

type BackendSlot = Omit<FacilityAvailability, "status"> & {
  status: "free" | "booked" | "class" | "maintenance" | "past";
};

/** Starea fiecărei ore între două date (inclusiv). */
export async function getFacilityAvailability(
  facilityId: number,
  from: string,
  to: string,
): Promise<FacilityAvailability[]> {
  const response = await apiRequest<{ items: BackendSlot[] }>(
    `/facilities/${facilityId}/availability?from=${from}&to=${to}`,
  );
  return response.items.map((slot) => ({
    ...slot,
    status: slot.status === "booked" ? "busy" : slot.status,
  }));
}
