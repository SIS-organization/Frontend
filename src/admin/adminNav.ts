import type { ComponentType, SVGProps } from "react";
import {
  CalendarRangeIcon,
  ChartIcon,
  CircleHelpIcon,
  ClipboardListIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "./AdminIcons";

export type AdminSection = {
  /** Calea relativă la /admin (ex. „orar” → /admin/orar). */
  path: string;
  /** Textul din meniu și din „Consolă operațională / …”. */
  label: string;
  /** Textul din „Consolă operațională / …”, dacă e mai scurt decât cel din meniu (ex. „Ajutor”). */
  crumb?: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /**
   * true = secțiunea are pagină și poate fi deschisă.
   * false = apare în meniu (ca în Figma), dar e inactivă până o implementăm.
   */
  ready: boolean;
};

// Meniul din stânga, în ordinea din Figma („Administrare · Baza sportivă”).
// Momentan sunt implementate „Orar și incidente”, „Rezervări”, „Utilizatori” și „Ajutor și regulament”.
export const adminSections: AdminSection[] = [
  { path: "orar", label: "Orar și incidente", Icon: CalendarRangeIcon, ready: true },
  { path: "rezervari", label: "Rezervări", Icon: ClipboardListIcon, ready: true },
  { path: "utilizatori", label: "Utilizatori", Icon: UsersIcon, ready: true },
  { path: "rapoarte", label: "Rapoarte", Icon: ChartIcon, ready: false },
  { path: "jurnal", label: "Jurnal și notificări", Icon: ClipboardListIcon, ready: false },
  { path: "cont", label: "Cont și preferințe", Icon: ShieldCheckIcon, ready: false },
];

// Legătura din partea de jos a meniului: „Ajutor și regulament” (/admin/ajutor).
export const adminHelpSection: AdminSection = {
  path: "ajutor",
  label: "Ajutor și regulament",
  crumb: "Ajutor",
  Icon: CircleHelpIcon,
  ready: true,
};

export const allAdminSections = [...adminSections, adminHelpSection];

/** Mesajul afișat (tooltip) pe elementele de meniu încă neimplementate. */
export const COMING_SOON = "Disponibil în curând";
