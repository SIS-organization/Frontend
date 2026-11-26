// Interfața formularului unei activități USV, folosită de două ecrane:
//   - „Adaugă activitate USV” (POST /admin/activities)
//   - „Gestionează activitatea USV” (PUT /admin/activities/{id})
// Aici sunt câmpurile și câteva piese comune (card, butoane, lista rezervărilor
// afectate). Regulile de validare sunt în ../activityForm.ts.

import type { ReactNode } from "react";
import { ChevronDownIcon } from "../AdminIcons";
import { MESSAGE_MAX, NAME_MAX, ORGANIZER_MAX, type ActivityForm } from "../activityForm";
import { ACTIVITY_TYPE_LABEL, type ActivityPreview, type ActivityType, type FacilityKind } from "../api";
import {
  END_HOURS,
  START_HOURS,
  bucharestParts,
  formatDayMonth,
  formatDayMonthYear,
  formatTimeRange,
  hourLabel,
  isValidIsoDate,
  shiftDate,
  todayInBucharest,
} from "../time";

const input =
  "h-11 w-full rounded-lg border border-[#dde5e2] bg-white px-3 text-sm text-heading outline-none focus:border-primary disabled:bg-bg";
const label = "text-xs font-semibold text-muted";
export const secondaryButton =
  "flex h-10 items-center rounded-lg border border-[#dde5e2] bg-white px-4 text-[13px] font-semibold text-heading hover:bg-bg disabled:opacity-50";
export const primaryButton =
  "flex h-10 items-center rounded-lg bg-primary px-5 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-[#dde5e2] bg-white ${className}`}>{children}</section>;
}

function Field({ title, error, children, htmlFor }: { title: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <label htmlFor={htmlFor} className={label}>
        {title}
      </label>
      {children}
      {error && <p className="text-xs text-[#ac443c]">{error}</p>}
    </div>
  );
}

/** Listă derulantă cu săgeata din Figma. */
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative min-w-0 flex-1">
      <select {...props} className={`${input} appearance-none pr-8`} />
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-heading" />
    </div>
  );
}

/** Câmp de dată afișat ca „22 octombrie 2026”, cu selectorul nativ al browserului. */
function DateInput(props: { id: string; value: string; min: string; disabled?: boolean; onChange: (value: string) => void }) {
  const { id, value, min, disabled, onChange } = props;
  return (
    <div className={`${disabled ? input.replace("bg-white", "bg-bg") : input} relative flex items-center`}>
      {isValidIsoDate(value) ? formatDayMonthYear(value) : <span className="text-muted">Alege data</span>}
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        disabled={disabled}
        onClick={(event) => {
          try {
            event.currentTarget.showPicker();
          } catch {
            // browsere fără showPicker: câmpul rămâne utilizabil de la tastatură
          }
        }}
        onChange={(event) => {
          if (isValidIsoDate(event.target.value)) onChange(event.target.value);
        }}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
      />
    </div>
  );
}

/** Rezervările care s-ar anula, ca listă scurtă: „Daria Stan · 18:00–19:00”. */
export function AffectedList({ preview, limit }: { preview: Pick<ActivityPreview, "affectedBookings">; limit?: number }) {
  const shown = limit ? preview.affectedBookings.slice(0, limit) : preview.affectedBookings;
  const rest = preview.affectedBookings.length - shown.length;
  return (
    <ul className="flex flex-col gap-1">
      {shown.map((b) => (
        <li key={b.id} className="flex flex-wrap gap-x-1">
          <span className="font-semibold">{b.userName ?? b.code}</span>
          <span>
            · {formatDayMonth(bucharestParts(b.startTime).date)} · {formatTimeRange(b.startTime, b.endTime)}
          </span>
        </li>
      ))}
      {rest > 0 && <li>și încă {rest}</li>}
    </ul>
  );
}

/**
 * Câmpurile formularului, așezate ca în Figma. Nu știe nimic despre server:
 * primește valorile, erorile de afișat și funcția de modificare.
 * `disabled` = doar vizualizare (ecranul de gestionare, înainte de „Editează”).
 * `lockSchedule` = activitate deja începută: facilitatea, ziua, ora de început și
 * repetarea nu se mai pot schimba; restul câmpurilor (și ora de sfârșit) da.
 */
export function ActivityFields(props: {
  form: ActivityForm;
  facilities: FacilityKind[];
  errors: Partial<Record<keyof ActivityForm, string>>;
  disabled?: boolean;
  lockSchedule?: boolean;
  onChange: <K extends keyof ActivityForm>(key: K, value: ActivityForm[K]) => void;
}) {
  const { form, facilities, errors, disabled, lockSchedule, onChange } = props;
  const scheduleDisabled = disabled || lockSchedule;
  const shown = (key: keyof ActivityForm) => errors[key];
  return (
    <>
      <Field title="Denumire" htmlFor="act-name" error={shown("name")}>
        <input
          id="act-name"
          className={input}
          disabled={disabled}
          value={form.name}
          maxLength={NAME_MAX}
          placeholder="Eveniment universitar · Sală de sport"
          onChange={(e) => onChange("name", e.target.value)}
        />
      </Field>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Field title="Tip de activitate" htmlFor="act-type">
          <Select disabled={disabled} id="act-type" value={form.type} onChange={(e) => onChange("type", e.target.value as ActivityType)}>
            {(Object.keys(ACTIVITY_TYPE_LABEL) as ActivityType[]).map((type) => (
              <option key={type} value={type}>
                {ACTIVITY_TYPE_LABEL[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field title="Facilitate" htmlFor="act-facility" error={shown("facilityId")}>
          <Select disabled={scheduleDisabled} id="act-facility" value={form.facilityId} onChange={(e) => onChange("facilityId", e.target.value)}>
            {facilities.length === 0 && <option value="">Se încarcă…</option>}
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field title="Organizator / responsabil" htmlFor="act-organizer" error={shown("organizer")}>
        <input
          id="act-organizer"
          className={input}
          disabled={disabled}
          value={form.organizer}
          maxLength={ORGANIZER_MAX}
          placeholder="FEFS · Secretariatul facultății"
          onChange={(e) => onChange("organizer", e.target.value)}
        />
      </Field>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Field title="Data" htmlFor="act-date" error={shown("date")}>
          <DateInput disabled={scheduleDisabled} id="act-date" value={form.date} min={todayInBucharest()} onChange={(v) => onChange("date", v)} />
        </Field>
        <Field title="Interval" htmlFor="act-start" error={shown("startHour") ?? shown("endHour")}>
          <div className="flex items-center gap-2">
            <Select disabled={scheduleDisabled} id="act-start" aria-label="Ora de început" value={form.startHour} onChange={(e) => onChange("startHour", Number(e.target.value))}>
              {START_HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </Select>
            <span className="text-muted">–</span>
            <Select disabled={disabled} aria-label="Ora de sfârșit" value={form.endHour} onChange={(e) => onChange("endHour", Number(e.target.value))}>
              {END_HOURS.filter((h) => h > form.startHour).map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </Select>
          </div>
        </Field>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Field title="Repetare" htmlFor="act-repeat">
          <Select
            disabled={scheduleDisabled}
            id="act-repeat"
            value={form.frequency}
            onChange={(e) => onChange("frequency", e.target.value === "weekly" ? "weekly" : "none")}
          >
            <option value="none">Fără repetare</option>
            <option value="weekly">Săptămânal</option>
          </Select>
        </Field>
        {form.frequency === "weekly" && (
          <Field title="Ultima apariție" htmlFor="act-until" error={shown("until")}>
            <DateInput disabled={scheduleDisabled} id="act-until" value={form.until} min={shiftDate(form.date, 7)} onChange={(v) => onChange("until", v)} />
          </Field>
        )}
      </div>
      <Field title="Mesaj vizibil în calendar" htmlFor="act-message">
        <input
          id="act-message"
          className={input}
          disabled={disabled}
          value={form.calendarMessage}
          maxLength={MESSAGE_MAX}
          placeholder="Sală rezervată pentru eveniment universitar."
          onChange={(e) => onChange("calendarMessage", e.target.value)}
        />
      </Field>

    </>
  );
}
