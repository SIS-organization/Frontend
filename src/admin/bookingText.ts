// Texte comune pentru rezervări (orar, pagina Rezervări, fereastra de detalii, pagina de blocare).

import type { BookingStatus, CancelledBy, WaitlistStatus } from "./api";

/** Statusul rezervării, cum îl vede administratorul. */
export const BOOKING_STATUS: Record<BookingStatus, string> = {
  in_verification: "În verificare",
  confirmed: "Confirmată",
  awaiting_transfer: "În așteptarea transferului",
  completed: "Finalizată",
  rejected: "Respinsă",
  cancelled: "Anulată",
};

/** Culoarea etichetei de status (fundal + text). */
export const BOOKING_STATUS_TONE: Record<BookingStatus, string> = {
  confirmed: "bg-[#e7f2ef] text-primary",
  in_verification: "bg-[#fdf3e3] text-[#926018]",
  awaiting_transfer: "bg-[#fdf3e3] text-[#926018]",
  completed: "bg-bg text-muted",
  rejected: "bg-[#fcedea] text-[#ac443c]",
  cancelled: "bg-[#fcedea] text-[#ac443c]",
};

/** Rolul persoanei care a rezervat (`Role` din contract). */
export const ROLE_LABEL: Record<string, string> = {
  student: "Student",
  professor: "Cadru didactic",
  external: "Extern",
  administrator: "Administrator",
};

/** Cine a anulat rezervarea (`CancelledBy` din contract). */
export const CANCELLED_BY_LABEL: Record<CancelledBy, string> = {
  user: "de utilizator",
  administrator: "de administrator",
  maintenance: "din cauza unei blocări de mentenanță",
  university_activity: "pentru o activitate USV",
  system: "automat de sistem",
};

/** Starea unei înscrieri pe lista de așteptare și culoarea etichetei. */
export const WAITLIST_STATUS: Record<WaitlistStatus, { label: string; tone: string }> = {
  active: { label: "În așteptare", tone: "bg-[#eef3f1] text-heading" },
  offered: { label: "Ofertă trimisă", tone: "bg-[#fdf3e3] text-[#926018]" },
  fulfilled: { label: "Onorată", tone: "bg-[#e7f2ef] text-primary" },
  declined: { label: "Refuzată", tone: "bg-bg text-muted" },
  expired: { label: "Expirată", tone: "bg-bg text-muted" },
  cancelled: { label: "Retrasă", tone: "bg-bg text-muted" },
};

