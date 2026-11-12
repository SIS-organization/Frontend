export type Facility = {
  id: number;
  name: string;
  sport: string;
  amenities: string[];
  nextFree: string;
};

export type SlotStatus = "free" | "busy" | "class" | "maintenance";
export type BookingStatus = "upcoming" | "past" | "cancelled";

export type Booking = {
  id: string;
  facilityId: number;
  facilityName: string;
  date: string; // YYYY-MM-DD
  hour: number; // ora de start, slot de 60 min
  status: BookingStatus;
  code: string;
};
