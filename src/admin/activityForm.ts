// Logica formularului de activitate USV (fără interfață): valorile de pornire,
// conversia dintr-o activitate existentă și validarea după regulile din contract
// (ActivityCreate). Folosită de „Adaugă activitate USV” și „Gestionează activitatea USV”.
// Validarea de aici doar ajută administratorul; serverul reverifică totul.

import type { Activity, ActivityInput, ActivityType, FacilityKind } from "./api";
import { START_HOURS, END_HOURS, bucharestIso, bucharestParts, isValidIsoDate, shiftDate, todayInBucharest } from "./time";

// Limitele din contract (ActivityCreate). Le aplicăm și în câmpuri (maxLength).
const NAME_MIN = 3;
export const NAME_MAX = 150;
export const ORGANIZER_MAX = 150;
export const MESSAGE_MAX = 200;
/** O repetare săptămânală durează cel mult un semestru (26 de săptămâni). */
const MAX_WEEKS = 26;
// Forma acceptată pentru id-ul facilității din adresă (UUID sau număr).
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Valorile din formular (ora ca număr, data ca YYYY-MM-DD). */
export type ActivityForm = {
  name: string;
  type: ActivityType;
  facilityId: string;
  organizer: string;
  date: string;
  startHour: number;
  endHour: number;
  frequency: "none" | "weekly";
  until: string;
  calendarMessage: string;
};

/** Ora curentă în România (0–23), ca să nu propunem ore deja trecute. */
function currentHour() {
  return bucharestParts(new Date().toISOString()).hour;
}

/** Valorile de pornire: ziua și facilitatea din adresă (dacă sunt valide), altfel azi. */
export function initialForm(dayParam: string | null, facilityParam: string | null): ActivityForm {
  const today = todayInBucharest();
  let date = isValidIsoDate(dayParam) && dayParam >= today ? dayParam : today;
  let startHour = 12;
  if (date === today) {
    const next = Math.max(currentHour() + 1, START_HOURS[0]);
    if (next > START_HOURS[START_HOURS.length - 1]) date = shiftDate(today, 1);
    else startHour = Math.max(startHour, next);
  }
  return {
    name: "",
    type: "event",
    facilityId: facilityParam && ID_PATTERN.test(facilityParam) ? facilityParam : "",
    organizer: "",
    date,
    startHour,
    endHour: Math.min(startHour + 2, END_HOURS[END_HOURS.length - 1]),
    frequency: "none",
    until: "",
    calendarMessage: "",
  };
}

/**
 * Verifică formularul. Întoarce fie corpul cererii (ActivityCreate), fie
 * mesajele de eroare pe câmpuri. Aceleași reguli le aplică și serverul.
 */
export function validate(form: ActivityForm, facilities: FacilityKind[]): { body: ActivityInput | null; errors: Partial<Record<keyof ActivityForm, string>> } {
  const errors: Partial<Record<keyof ActivityForm, string>> = {};
  const name = form.name.trim();
  const organizer = form.organizer.trim();
  const today = todayInBucharest();

  if (name.length < NAME_MIN) errors.name = `Denumirea are cel puțin ${NAME_MIN} caractere.`;
  if (!organizer) errors.organizer = "Completează organizatorul sau responsabilul.";
  if (!facilities.some((f) => f.id === form.facilityId)) errors.facilityId = "Alege facilitatea.";
  if (!isValidIsoDate(form.date) || form.date < today) errors.date = "Alege o zi de azi înainte.";
  else if (form.date === today && form.startHour <= currentHour()) errors.startHour = "Ora de început a trecut deja.";
  if (form.endHour <= form.startHour) errors.endHour = "Sfârșitul trebuie să fie după început.";
  if (form.frequency === "weekly") {
    if (!isValidIsoDate(form.until) || form.until <= form.date) errors.until = "Alege data ultimei apariții, după prima zi.";
    else if (form.until > shiftDate(form.date, 7 * MAX_WEEKS)) errors.until = `Repetarea durează cel mult ${MAX_WEEKS} de săptămâni.`;
  }
  if (Object.keys(errors).length > 0) return { body: null, errors };

  return {
    errors,
    body: {
      name,
      type: form.type,
      facilityId: form.facilityId,
      organizer,
      startTime: bucharestIso(form.date, form.startHour),
      endTime: bucharestIso(form.date, form.endHour),
      recurrence: { frequency: form.frequency, until: form.frequency === "weekly" ? form.until : null },
      calendarMessage: form.calendarMessage.trim(),
    },
  };
}

/** Valorile formularului pentru o activitate existentă (ecranul de gestionare). */
export function formFromActivity(activity: Activity): ActivityForm {
  const start = bucharestParts(activity.startTime);
  const end = bucharestParts(activity.endTime);
  return {
    name: activity.name,
    type: activity.type,
    facilityId: activity.facilityId,
    organizer: activity.organizer,
    date: start.date,
    startHour: start.hour,
    // O activitate care se termină la miezul nopții ar avea ora 0; o limităm la program.
    endHour: end.hour > start.hour ? end.hour : Math.min(start.hour + 1, 21),
    frequency: activity.recurrence.frequency,
    until: activity.recurrence.until ?? "",
    calendarMessage: activity.calendarMessage,
  };
}
