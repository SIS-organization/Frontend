// Texte comune pentru incidente (pagina de blocare și pagina de deblocare anticipată).

import type { IncidentType } from "./api";
import { bucharestParts, formatDayMonth, hourLabel } from "./time";

/** Denumirea scurtă a incidentului din cardul „Incident activ”. */
export const INCIDENT_SHORT: Record<IncidentType, string> = {
  urgent_cleaning: "Igienizare urgentă",
  scheduled_cleaning: "Igienizare programată",
  repair: "Reparație",
  equipment_failure: "Defecțiune echipament",
  maintenance: "Mentenanță",
};

/** Intervalul unei blocări: „20 octombrie, 14:00–16:00” sau, pe mai multe zile, cu ambele date. */
export function formatSpan(startIso: string, endIso: string) {
  const start = bucharestParts(startIso);
  const end = bucharestParts(endIso);
  if (start.date === end.date) return `${formatDayMonth(start.date)}, ${hourLabel(start.hour)}–${hourLabel(end.hour)}`;
  return `${formatDayMonth(start.date)} ${hourLabel(start.hour)} – ${formatDayMonth(end.date)} ${hourLabel(end.hour)}`;
}
