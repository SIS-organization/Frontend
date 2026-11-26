// Pagina „Adaugă activitate USV” (Figma: „Admin · Adaugă activitate USV”).
//
// Administratorul rezervă din timp o facilitate pentru un curs sau un eveniment
// universitar. Fluxul, conform Swagger:
//   1. În timp ce completează formularul, intervalul se verifică automat
//      (POST /admin/activities/preview — nu salvează nimic).
//   2. „Verifică și publică” reverifică intervalul:
//      - liber → publică direct (POST /admin/activities);
//      - cu rezervări suprapuse → pasul „02 · Verificare și publicare”, unde
//        administratorul confirmă explicit anularea lor (resolveConflicts: true);
//      - suprapus cu altă activitate sau cu mentenanță → nu se poate publica.
// Serverul reverifică oricum totul la salvare; verificările de aici sunt doar
// pentru o experiență mai bună, nu o măsură de securitate.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/useAuth";
import { ChevronDownIcon } from "../AdminIcons";
import {
  ACTIVITY_TYPE_LABEL,
  createActivity,
  getFacilityKinds,
  previewActivity,
  type Activity,
  type ActivityInput,
  type ActivityPreview,
  type ActivityType,
  type FacilityKind,
} from "../api";
import {
  END_HOURS,
  START_HOURS,
  bucharestIso,
  bucharestParts,
  formatDayMonth,
  formatDayMonthYear,
  formatTimeRange,
  hourLabel,
  isValidIsoDate,
  shiftDate,
  todayInBucharest,
} from "../time";

// Limitele din contract (ActivityCreate). Le aplicăm și în câmpuri (maxLength).
const NAME_MIN = 3;
const NAME_MAX = 150;
const ORGANIZER_MAX = 150;
const MESSAGE_MAX = 200;
/** O repetare săptămânală durează cel mult un semestru (26 de săptămâni). */
const MAX_WEEKS = 26;
/** Cât așteptăm după ultima tastare înainte de verificarea automată (ms). */
const PREVIEW_DELAY = 400;
// Forma acceptată pentru id-ul facilității din adresă (UUID sau număr).
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

type Form = {
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

type Step = "details" | "review" | "done";

const input =
  "h-11 w-full rounded-lg border border-[#dde5e2] bg-white px-3 text-sm text-heading outline-none focus:border-primary disabled:bg-bg";
const label = "text-xs font-semibold text-muted";
const secondaryButton =
  "flex h-10 items-center rounded-lg border border-[#dde5e2] bg-white px-4 text-[13px] font-semibold text-heading hover:bg-bg disabled:opacity-50";
const primaryButton =
  "flex h-10 items-center rounded-lg bg-primary px-5 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

/** Ora curentă în România (0–23), ca să nu propunem ore deja trecute. */
function currentHour() {
  return bucharestParts(new Date().toISOString()).hour;
}

/** Valorile de pornire: ziua și facilitatea din adresă (dacă sunt valide), altfel azi. */
function initialForm(dayParam: string | null, facilityParam: string | null): Form {
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
function validate(form: Form, facilities: FacilityKind[]): { body: ActivityInput | null; errors: Partial<Record<keyof Form, string>> } {
  const errors: Partial<Record<keyof Form, string>> = {};
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

/** Mesajul pentru administrator, după eroarea primită de la server. */
function describeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "Contul tău nu mai are drepturi de administrator.";
  if (error instanceof ApiError && (error.status === 404 || error.status === 501)) {
    return "Serverul nu oferă încă publicarea activităților (POST /admin/activities).";
  }
  return error instanceof Error ? error.message : "Operația nu a reușit. Încearcă din nou.";
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
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
function DateInput({ id, value, min, onChange }: { id: string; value: string; min: string; onChange: (value: string) => void }) {
  return (
    <div className={`${input} relative flex items-center`}>
      {isValidIsoDate(value) ? formatDayMonthYear(value) : <span className="text-muted">Alege data</span>}
      <input
        id={id}
        type="date"
        value={value}
        min={min}
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
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </div>
  );
}

/** Rezervările care s-ar anula, ca listă scurtă: „Daria Stan · 18:00–19:00”. */
function AffectedList({ preview, limit }: { preview: ActivityPreview; limit?: number }) {
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

export default function AdminActivityNewPage() {
  const { logout } = useAuth();
  const [params] = useSearchParams();
  const dayParam = params.get("zi");
  const facilityParam = params.get("facilitate");

  const [form, setForm] = useState<Form>(() => initialForm(dayParam, facilityParam));
  const [facilities, setFacilities] = useState<FacilityKind[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [step, setStep] = useState<Step>("details");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Pasul 2: verificarea proaspătă de la apăsarea butonului și confirmarea explicită.
  const [review, setReview] = useState<ActivityPreview | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [published, setPublished] = useState<Activity | null>(null);
  // Rezultatul verificării automate; `key` spune pentru ce date a fost făcută.
  const [preview, setPreview] = useState<{ key: string; data: ActivityPreview | null; error: string | null } | null>(null);

  // Lista facilităților (o singură dată). Dacă adresa nu avea o facilitate validă, o alegem pe prima.
  useEffect(() => {
    const controller = new AbortController();
    getFacilityKinds(controller.signal)
      .then((list) => {
        setFacilities(list);
        setForm((current) =>
          list.some((f) => f.id === current.facilityId) ? current : { ...current, facilityId: list[0]?.id ?? "" },
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) logout();
        else setLoadError(describeError(error));
      });
    return () => controller.abort();
  }, [logout]);

  const { body, errors } = useMemo(() => validate(form, facilities), [form, facilities]);
  const previewKey = body ? JSON.stringify(body) : null;

  // Verificarea automată a intervalului, la o scurtă pauză după ultima modificare.
  useEffect(() => {
    if (!body || !previewKey || step !== "details") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      previewActivity(body, controller.signal)
        .then((data) => setPreview({ key: previewKey, data, error: null }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          if (error instanceof ApiError && error.status === 401) logout();
          else setPreview({ key: previewKey, data: null, error: describeError(error) });
        });
    }, PREVIEW_DELAY);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // `body` se schimbă odată cu `previewKey`; folosim cheia ca să nu repetăm cererea degeaba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, step, logout]);

  const currentPreview = preview && preview.key === previewKey ? preview : null;
  const facilityName = facilities.find((f) => f.id === form.facilityId)?.name ?? "Facilitate";
  const backQuery = new URLSearchParams();
  if (isValidIsoDate(dayParam)) backQuery.set("zi", dayParam);
  if (facilityParam && ID_PATTERN.test(facilityParam)) backQuery.set("facilitate", facilityParam);
  const backLink = `/admin/orar${backQuery.size ? `?${backQuery.toString()}` : ""}`;

  const update = <K extends keyof Form>(key: K, value: Form[K]) => {
    setSubmitError(null);
    setForm((current) => {
      const next = { ...current, [key]: value };
      // Sfârșitul rămâne mereu după început.
      if (key === "startHour" && next.endHour <= next.startHour) next.endHour = Math.min(next.startHour + 1, 21);
      return next;
    });
  };

  /** Erorile comune: sesiune expirată → login; altfel mesajul rămâne pe pagină. */
  const handleError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) logout();
    else setSubmitError(describeError(error));
  };

  /** Publică efectiv. `resolveConflicts` = administratorul a confirmat anularea rezervărilor. */
  const publish = async (activity: ActivityInput, resolveConflicts: boolean) => {
    try {
      const created = await createActivity({ ...activity, resolveConflicts });
      setPublished(created);
      setStep("done");
    } catch (error) {
      // Între timp a apărut o rezervare nouă: o arătăm pentru revizuire, nu publicăm pe ascuns.
      if (error instanceof ApiError && error.status === 409 && error.code === "ACTIVITY_CONFLICTS_WITH_BOOKINGS") {
        const fresh = await previewActivity(activity).catch(() => null);
        if (fresh && fresh.overlappingActivities.length === 0) {
          setReview(fresh);
          setReviewConfirmed(false);
          setStep("review");
          setSubmitError("Au apărut rezervări noi în interval. Verifică-le din nou înainte de publicare.");
          return;
        }
      }
      handleError(error);
    }
  };

  /** „Verifică și publică”: reverifică intervalul, apoi publică sau cere revizuirea. */
  const verifyAndPublish = async () => {
    setShowErrors(true);
    setSubmitError(null);
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      const fresh = await previewActivity(body);
      if (fresh.affectedBookings.length === 0 && !fresh.available) {
        setSubmitError(fresh.message ?? "Intervalul nu este disponibil.");
      } else if (fresh.overlappingActivities.length > 0) {
        setSubmitError(fresh.message ?? "Intervalul se suprapune cu o altă activitate USV.");
      } else if (fresh.affectedBookings.length > 0) {
        setReview(fresh);
        setReviewConfirmed(false);
        setStep("review");
      } else {
        await publish(body, false);
      }
    } catch (error) {
      handleError(error);
    } finally {
      setSubmitting(false);
    }
  };

  /** Pasul 2: publică după confirmarea explicită a anulărilor. */
  const confirmAndPublish = async () => {
    if (!body || !reviewConfirmed || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    await publish(body, true);
    setSubmitting(false);
  };

  const startOver = () => {
    setForm({ ...initialForm(form.date, form.facilityId), facilityId: form.facilityId });
    setShowErrors(false);
    setPublished(null);
    setReview(null);
    setSubmitError(null);
    setStep("details");
  };

  const shownError = (key: keyof Form) => (showErrors ? errors[key] : undefined);
  const interval = `${formatDayMonth(form.date)} · ${hourLabel(form.startHour)}–${hourLabel(form.endHour)}`;
  const repeatNote =
    form.frequency === "weekly" && isValidIsoDate(form.until) ? ` · săptămânal până la ${formatDayMonth(form.until)}` : "";

  return (
    <>
      <div className="flex flex-col items-start gap-4 md:flex-row md:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-[11px] font-bold text-primary">ADMINISTRATORUL BAZEI SPORTIVE</p>
          <h1 className="text-[28px] leading-[1.16] text-heading">Adaugă activitate USV</h1>
          <p className="text-[13px] leading-normal text-muted">
            Rezervă din timp facilitățile pentru cursuri și evenimente universitare.
          </p>
        </div>
        <Link to={backLink} className={secondaryButton}>
          ← Înapoi la orar
        </Link>
      </div>

      {/* Pașii fluxului (doar informativ, nu se pot sări). */}
      <ol className="flex flex-wrap gap-3 text-xs font-semibold">
        <li
          aria-current={step === "details" ? "step" : undefined}
          className={`rounded-lg border px-3 py-2.5 sm:w-[190px] ${step === "details" ? "border-primary bg-primary text-white" : "border-[#dde5e2] bg-white text-heading"}`}
        >
          01 · Detalii activitate
        </li>
        <li
          aria-current={step !== "details" ? "step" : undefined}
          className={`rounded-lg border px-3 py-2.5 sm:w-[230px] ${step !== "details" ? "border-primary bg-primary text-white" : "border-[#dde5e2] bg-white text-heading"}`}
        >
          02 · Verificare și publicare
        </li>
      </ol>

      {loadError && (
        <p role="alert" className="rounded-lg bg-[#fcedea] px-4 py-3 text-sm text-[#ac443c]">
          {loadError}
        </p>
      )}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* Stânga: formularul (pasul 1), revizuirea (pasul 2) sau confirmarea publicării. */}
        {step === "details" && (
          <Card className="flex min-w-0 flex-1 flex-col gap-4 p-6">
            <h2 className="text-xl text-heading">Detaliile activității</h2>
            <form
              noValidate
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void verifyAndPublish();
              }}
            >
              <Field title="Denumire" htmlFor="act-name" error={shownError("name")}>
                <input
                  id="act-name"
                  className={input}
                  value={form.name}
                  maxLength={NAME_MAX}
                  placeholder="Eveniment universitar · Sală de sport"
                  onChange={(e) => update("name", e.target.value)}
                />
              </Field>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Field title="Tip de activitate" htmlFor="act-type">
                  <Select id="act-type" value={form.type} onChange={(e) => update("type", e.target.value as ActivityType)}>
                    {(Object.keys(ACTIVITY_TYPE_LABEL) as ActivityType[]).map((type) => (
                      <option key={type} value={type}>
                        {ACTIVITY_TYPE_LABEL[type]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field title="Facilitate" htmlFor="act-facility" error={shownError("facilityId")}>
                  <Select id="act-facility" value={form.facilityId} onChange={(e) => update("facilityId", e.target.value)}>
                    {facilities.length === 0 && <option value="">Se încarcă…</option>}
                    {facilities.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field title="Organizator / responsabil" htmlFor="act-organizer" error={shownError("organizer")}>
                <input
                  id="act-organizer"
                  className={input}
                  value={form.organizer}
                  maxLength={ORGANIZER_MAX}
                  placeholder="FEFS · Secretariatul facultății"
                  onChange={(e) => update("organizer", e.target.value)}
                />
              </Field>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Field title="Data" htmlFor="act-date" error={shownError("date")}>
                  <DateInput id="act-date" value={form.date} min={todayInBucharest()} onChange={(v) => update("date", v)} />
                </Field>
                <Field title="Interval" htmlFor="act-start" error={shownError("startHour") ?? shownError("endHour")}>
                  <div className="flex items-center gap-2">
                    <Select id="act-start" aria-label="Ora de început" value={form.startHour} onChange={(e) => update("startHour", Number(e.target.value))}>
                      {START_HOURS.map((h) => (
                        <option key={h} value={h}>
                          {hourLabel(h)}
                        </option>
                      ))}
                    </Select>
                    <span className="text-muted">–</span>
                    <Select aria-label="Ora de sfârșit" value={form.endHour} onChange={(e) => update("endHour", Number(e.target.value))}>
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
                    id="act-repeat"
                    value={form.frequency}
                    onChange={(e) => update("frequency", e.target.value === "weekly" ? "weekly" : "none")}
                  >
                    <option value="none">Fără repetare</option>
                    <option value="weekly">Săptămânal</option>
                  </Select>
                </Field>
                {form.frequency === "weekly" && (
                  <Field title="Ultima apariție" htmlFor="act-until" error={shownError("until")}>
                    <DateInput id="act-until" value={form.until} min={shiftDate(form.date, 7)} onChange={(v) => update("until", v)} />
                  </Field>
                )}
              </div>
              <Field title="Mesaj vizibil în calendar" htmlFor="act-message">
                <input
                  id="act-message"
                  className={input}
                  value={form.calendarMessage}
                  maxLength={MESSAGE_MAX}
                  placeholder="Sală rezervată pentru eveniment universitar."
                  onChange={(e) => update("calendarMessage", e.target.value)}
                />
              </Field>

              {submitError && (
                <p role="alert" className="rounded-lg bg-[#fcedea] px-3 py-2 text-sm text-[#ac443c]">
                  {submitError}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <button type="submit" className={primaryButton} disabled={submitting || facilities.length === 0}>
                  {submitting ? "Se verifică…" : "Verifică și publică"}
                </button>
                <Link to={backLink} className={secondaryButton}>
                  Renunță
                </Link>
              </div>
            </form>
          </Card>
        )}

        {step === "review" && review && (
          <Card className="flex min-w-0 flex-1 flex-col gap-4 p-6">
            <h2 className="text-xl text-heading">Verifică rezervările afectate</h2>
            <p className="text-sm text-muted">
              „{form.name.trim()}” · {facilityName} · {interval}
              {repeatNote}
            </p>
            <div className="flex flex-col gap-2 rounded-xl bg-[#fdf3e3] p-4 text-[13px] text-[#926018]">
              <p className="font-semibold">
                {review.affectedBookings.length}{" "}
                {review.affectedBookings.length === 1 ? "rezervare va fi anulată" : "rezervări vor fi anulate"}
              </p>
              <AffectedList preview={review} />
              <p>Utilizatorii sunt informați automat, iar studenții își primesc înapoi rezervarea din cota lunară.</p>
            </div>
            <label className="flex items-start gap-2 text-sm text-heading">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={reviewConfirmed}
                onChange={(e) => setReviewConfirmed(e.target.checked)}
              />
              Am verificat rezervările afectate și accept anularea lor.
            </label>
            {submitError && (
              <p role="alert" className="rounded-lg bg-[#fcedea] px-3 py-2 text-sm text-[#ac443c]">
                {submitError}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button type="button" className={primaryButton} disabled={!reviewConfirmed || submitting} onClick={() => void confirmAndPublish()}>
                {submitting ? "Se publică…" : "Publică activitatea"}
              </button>
              <button
                type="button"
                className={secondaryButton}
                disabled={submitting}
                onClick={() => {
                  setSubmitError(null);
                  setStep("details");
                }}
              >
                Înapoi la detalii
              </button>
            </div>
          </Card>
        )}

        {step === "done" && published && (
          <Card className="flex min-w-0 flex-1 flex-col gap-4 p-6">
            <div role="status" className="flex flex-col gap-1 rounded-xl bg-[#e7f2ef] p-4 text-primary">
              <p className="font-semibold">Activitatea a fost publicată{published.code ? ` · ${published.code}` : ""}</p>
              <p className="text-[13px]">
                {published.name} · {facilityName} · {formatDayMonth(bucharestParts(published.startTime).date)} ·{" "}
                {formatTimeRange(published.startTime, published.endTime)}
                {published.recurrence.frequency === "weekly" && published.recurrence.until
                  ? ` · săptămânal până la ${formatDayMonth(published.recurrence.until)}`
                  : ""}
              </p>
            </div>
            <p className="text-sm text-muted">Intervalul apare acum în orar și nu mai poate fi rezervat de utilizatori.</p>
            <div className="flex flex-wrap gap-3">
              <Link
                to={`/admin/orar?zi=${bucharestParts(published.startTime).date}&facilitate=${encodeURIComponent(published.facilityId)}`}
                className={primaryButton}
              >
                Vezi în orar
              </Link>
              <button type="button" className={secondaryButton} onClick={startOver}>
                Adaugă altă activitate
              </button>
            </div>
          </Card>
        )}

        {/* Dreapta: verificarea intervalului și regulile din Figma. */}
        <Card className="flex min-w-0 flex-1 flex-col gap-4 p-6 leading-normal">
          <h2 className="text-xl text-heading">Verificarea intervalului</h2>
          <PreviewBox
            ready={Boolean(body)}
            loading={Boolean(body) && !currentPreview && step === "details"}
            preview={step === "review" ? review : (currentPreview?.data ?? null)}
            error={step === "details" ? (currentPreview?.error ?? null) : null}
            title={`${interval}${repeatNote}`}
            facilityName={facilityName}
          />
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold text-heading">Prioritate universitară</h3>
            <p className="text-[13px] text-muted">
              După publicare, intervalul nu mai poate fi rezervat de studenți sau publicul extern. Suprapunerile sunt
              reverificate înainte de salvare.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold text-heading">Opțiuni de programare</h3>
            <p className="text-[13px] text-muted">
              Tip: Curs universitar / Eveniment USV
              <br />
              Repetare: Fără / Săptămânal
              <br />
              Pentru repetare: selectează data ultimei apariții.
            </p>
          </div>
          <div className="flex flex-col gap-1 rounded-xl bg-[#e7f2ef] p-4 text-primary">
            <p className="text-[13px] font-semibold">Dacă există un conflict</p>
            <p className="text-xs">
              Publicarea cere revizuirea rezervărilor afectate. Persoanele vizate sunt informate automat despre modificări
              sau anulări.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}

/** Caseta „Interval disponibil / Rezervări afectate / Interval indisponibil”. */
function PreviewBox(props: {
  ready: boolean;
  loading: boolean;
  preview: ActivityPreview | null;
  error: string | null;
  title: string;
  facilityName: string;
}) {
  const { ready, loading, preview, error, title, facilityName } = props;
  const box = "flex flex-col gap-1 rounded-xl p-4 text-[13px]";

  if (!ready) {
    return (
      <div className={`${box} bg-bg text-muted`}>
        <p className="font-semibold text-heading">Completează detaliile</p>
        <p>Verificarea pornește automat după ce alegi facilitatea, ziua și intervalul.</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className={`${box} bg-bg text-muted`} aria-live="polite">
        <p className="font-semibold text-heading">Se verifică intervalul…</p>
        <p>{title}</p>
      </div>
    );
  }
  if (error || !preview) {
    return (
      <div role="alert" className={`${box} bg-[#fcedea] text-[#ac443c]`}>
        <p className="font-semibold">Intervalul nu a putut fi verificat</p>
        <p>{error ?? "Încearcă din nou."}</p>
      </div>
    );
  }
  if (preview.overlappingActivities.length > 0 || (!preview.available && preview.affectedBookings.length === 0)) {
    return (
      <div className={`${box} bg-[#fcedea] text-[#ac443c]`} aria-live="polite">
        <p className="font-semibold">Interval indisponibil</p>
        <p>{title}</p>
        <p>{preview.message ?? "Intervalul se suprapune cu o altă blocare."}</p>
        {preview.overlappingActivities.map((a) => (
          <p key={a.id}>
            {a.name} · {formatTimeRange(a.startTime, a.endTime)}
          </p>
        ))}
      </div>
    );
  }
  if (preview.affectedBookings.length > 0) {
    return (
      <div className={`${box} bg-[#fdf3e3] text-[#926018]`} aria-live="polite">
        <p className="font-semibold">Rezervări afectate</p>
        <p>{title}</p>
        <p>
          {facilityName} · {preview.affectedBookings.length}{" "}
          {preview.affectedBookings.length === 1 ? "rezervare afectată" : "rezervări afectate"}
        </p>
        <AffectedList preview={preview} limit={4} />
      </div>
    );
  }
  return (
    <div className={`${box} bg-[#e7f2ef] text-primary`} aria-live="polite">
      <p className="font-semibold">Interval disponibil</p>
      <p>{title}</p>
      <p>{facilityName} · 0 rezervări afectate</p>
    </div>
  );
}
