export type Facility = {
  id: number;
  name: string;
  sport: string;
  amenities: string[];
  nextFree?: string;
  location?: string;
  capacity?: number; // câte rezervări simultane suportă (ex. 4 culoare la bazin)
  isActive?: boolean;
};

export type SlotStatus = "free" | "busy" | "class" | "maintenance" | "past";
export type BookingStatus = "upcoming" | "past" | "cancelled";

export type Booking = {
  id: string;
  facilityId: number;
  facilityName: string;
  date: string; // YYYY-MM-DD
  hour: number; // ora de start, slot de 60 min
  status: BookingStatus;
  code: string;
  startsAt?: string; // ISO 8601, pentru sortare
};
