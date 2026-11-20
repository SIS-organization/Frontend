import type { Facility, SlotStatus } from "../types";

export const facilities: Facility[] = [
  { id: 1, name: "Teren de fotbal", sport: "Fotbal", amenities: ["Vestiare", "Nocturnă"], nextFree: "Azi, 18:00" },
  { id: 2, name: "Sală fitness", sport: "Fitness", amenities: ["Vestiare", "Dușuri"], nextFree: "Azi, 16:00" },
  { id: 3, name: "Bazin de înot", sport: "Înot", amenities: ["Vestiare", "Dușuri", "Accesibil"], nextFree: "Mâine, 09:00" },
  { id: 4, name: "Sală de sport", sport: "Baschet / Volei", amenities: ["Vestiare", "Accesibil"], nextFree: "Azi, 19:00" },
];

// Status fals, dar stabil: același slot arată la fel la fiecare randare.
export function slotStatus(facilityId: number, dayIndex: number, hour: number): SlotStatus {
  const n = (facilityId * 7 + dayIndex * 13 + hour * 5) % 11;
  if (n === 0) return "class";
  if (n === 1 || n === 2) return "busy";
  if (n === 3 && dayIndex === 4) return "maintenance";
  return "free";
}
