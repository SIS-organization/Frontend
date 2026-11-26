// Pagina „Blocare pentru mentenanță” (Figma: „Admin · Blocare pentru mentenanță”).
// Se deschide din orar, cu butonul „Blochează interval”.
//
// Fluxul, conform Swagger:
//   1. Administratorul completează facilitatea, motivul și intervalul.
//      Impactul se calculează automat („Ciornă · nicio acțiune aplicată”):
//      POST /admin/incidents/preview — nu modifică nimic.
//   2. Bifează că a verificat intervalul și rezervările afectate.
//   3. „Confirmă blocarea și notifică”: reverificăm impactul; dacă s-a schimbat
//      între timp, arătăm noua listă și cerem din nou confirmarea. Altfel:
//      POST /admin/incidents cu `confirmed: true`. Serverul anulează rezervările
//      suprapuse, restituie cotele și trimite notificările.
// În stânga se văd incidentele active ale zilei (GET /admin/incidents?status=active).
// Dacă intervalul se suprapune cu un curs sau un eveniment USV, afișăm un avertisment
// (citim orarul zilelor respective: GET /admin/schedule).
// Serverul reverifică totul; verificările de aici doar ajută administratorul.

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/useAuth";
import { CheckCheckIcon, CheckIcon, LockOpenIcon, PlusIcon, ShieldCheckIcon, TriangleAlertIcon } from "../AdminIcons";
import { ID_PATTERN } from "../activityForm";
import { COMING_SOON } from "../adminNav";
import {
  CHANNEL_LABEL,
  INCIDENT_TYPES,
  INCIDENT_TYPE_LABEL,
  createIncident,
  getActiveIncidents,
  getAdminSchedule,
  getFacilityKinds,
  previewIncident,
  type Channel,
  type FacilityKind,
  type Incident,
  type IncidentInput,
  type IncidentPreview,
  type IncidentType,
  type ScheduleEntry,
} from "../api";
import { Card, DateInput, Field, Select, input, primaryButton, secondaryButton } from "../components/ActivityForm";
import {
  END_HOURS,
  START_HOURS,
  bucharestIso,
  bucharestParts,
  formatDayMonth,
  formatTimeRange,
  hourLabel,
  isValidIsoDate,
  shiftDate,
  todayInBucharest,
} from "../time";

// Limitele din contract (IncidentCreate.publicReason).
const REASON_MIN = 5;
const REASON_MAX = 300;
/** O blocare durează cel mult 7 zile (pentru mai mult se creează una nouă). */
const MAX_DAYS = 7;
/** Cât așteptăm după ultima modificare înainte de calculul impactului (ms). */
const PREVIEW_DELAY = 400;
/** Canalele afișate în Figma; „În aplicație” e mereu inclus de server. */
const SHOWN_CHANNELS: Channel[] = ["sms", "push", "email"];

/** Cum apare rolul unei persoane afectate. */
const ROLE_LABEL: Record<string, string> = {
  student: "Student",
  professor: "Cadru didactic",
  external: "Extern",
  administrator: "Administrator",
};

/** Denumirea scurtă a incidentului din cardul „Incident activ”. */
const INCIDENT_SHORT: Record<IncidentType, string> = {
  urgent_cleaning: "Igienizare urgentă",
  scheduled_cleaning: "Igienizare programată",
  repair: "Reparație",
  equipment_failure: "Defecțiune echipament",
  maintenance: "Mentenanță",
};

type BlockForm = {
  facilityId: string;
  type: IncidentType;
  publicReason: string;
  startDate: string;
  startHour: number;
  endDate: string;
  endHour: number;
  channels: Channel[];
};

/** Ora curentă în România (0–23). */
function currentHour() {
  return bucharestParts(new Date().toISOString()).hour;
}

/** Valorile de pornire: ziua și facilitatea din adresă (dacă sunt valide), altfel azi. */
function initialForm(dayParam: string | null, facilityParam: string | null): BlockForm {
  const today = todayInBucharest();
  let date = isValidIsoDate(dayParam) && dayParam >= today ? dayParam : today;
  let startHour = 12;
  if (date === today) {
    const next = Math.max(currentHour() + 1, START_HOURS[0]);
    if (next > START_HOURS[START_HOURS.length - 1]) date = shiftDate(today, 1);
    else startHour = Math.max(startHour, next);
  }
  return {
    facilityId: facilityParam && ID_PATTERN.test(facilityParam) ? facilityParam : "",
    type: "urgent_cleaning",
    publicReason: "",
    startDate: date,
    startHour,
    endDate: date,
    endHour: Math.min(startHour + 2, END_HOURS[END_HOURS.length - 1]),
    channels: [...SHOWN_CHANNELS],
  };
}

/** Compară două momente date ca (zi, oră). */
const moment = (date: string, hour: number) => `${date}T${String(hour).padStart(2, "0")}`;

/** Verifică formularul; întoarce corpul cererii sau erorile pe câmpuri. */
function validate(form: BlockForm, facilities: FacilityKind[]) {
  const errors: Partial<Record<keyof BlockForm, string>> = {};
  const reason = form.publicReason.trim();
  const today = todayInBucharest();

  if (!facilities.some((f) => f.id === form.facilityId)) errors.facilityId = "Alege facilitatea.";
  if (reason.length < REASON_MIN) errors.publicReason = `Motivul are cel puțin ${REASON_MIN} caractere.`;
  if (!isValidIsoDate(form.startDate) || form.startDate < today) errors.startDate = "Alege o zi de azi înainte.";
  // Ora curentă e permisă: o blocare urgentă poate începe chiar acum.
  else if (form.startDate === today && form.startHour < currentHour()) errors.startDate = "Ora de început a trecut deja.";
  if (!isValidIsoDate(form.endDate) || moment(form.endDate, form.endHour) <= moment(form.startDate, form.startHour)) {
    errors.endDate = "Sfârșitul trebuie să fie după început.";
  } else if (form.endDate > shiftDate(form.startDate, MAX_DAYS)) {
    errors.endDate = `O blocare durează cel mult ${MAX_DAYS} zile.`;
  }
  if (form.channels.length === 0) errors.channels = "Alege cel puțin un canal de notificare.";
  if (Object.keys(errors).length > 0) return { body: null, errors };

  const body: IncidentInput = {
    facilityId: form.facilityId,
    type: form.type,
    publicReason: reason,
    startTime: bucharestIso(form.startDate, form.startHour),
    endTime: bucharestIso(form.endDate, form.endHour),
    notifyChannels: form.channels,
  };
  return { body, errors };
}

/** Intervalul unei blocări: „20 octombrie, 14:00–16:00” sau, pe mai multe zile, cu ambele date. */
function formatSpan(startIso: string, endIso: string) {
  const start = bucharestParts(startIso);
  const end = bucharestParts(endIso);
  if (start.date === end.date) return `${formatDayMonth(start.date)}, ${hourLabel(start.hour)}–${hourLabel(end.hour)}`;
  return `${formatDayMonth(start.date)} ${hourLabel(start.hour)} – ${formatDayMonth(end.date)} ${hourLabel(end.hour)}`;
}

/** Inițialele pentru cerculețul din lista de impact („Daria Stan” → „DS”). */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Mesajul pentru administrator, după eroarea primită de la server. */
function describeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "Contul tău nu mai are drepturi de administrator.";
  if (error instanceof ApiError && (error.status === 404 || error.status === 501)) {
    return "Serverul nu oferă încă blocarea facilităților (/admin/incidents).";
  }
  return error instanceof Error ? error.message : "Operația nu a reușit. Încearcă din nou.";
}

/** Id-urile rezervărilor afectate, ca să observăm dacă impactul s-a schimbat. */
const impactKey = (preview: IncidentPreview) => preview.affectedBookings.map((b) => b.id).join(",");

export default function AdminBlockFacilityPage() {
  const { logout } = useAuth();
  const [params] = useSearchParams();
  const dayParam = params.get("zi");
  const facilityParam = params.get("facilitate");
  const day = isValidIsoDate(dayParam) ? dayParam : todayInBucharest();

  const [form, setForm] = useState<BlockForm>(() => initialForm(dayParam, facilityParam));
  const [facilities, setFacilities] = useState<FacilityKind[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  // Rezultatul calculului de impact; `key` spune pentru ce date a fost făcut.
  const [preview, setPreview] = useState<{ key: string; data: IncidentPreview | null; error: string | null } | null>(null);
  // Confirmarea e legată de impactul văzut: orice modificare o anulează.
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Incident | null>(null);
  const [incidents, setIncidents] = useState<{ day: string; reload: number; items: Incident[] } | null>(null);
  const [reload, setReload] = useState(0);
  // Cursurile / evenimentele USV din intervalul ales (pentru avertisment); `key` = datele verificate.
  const [overlap, setOverlap] = useState<{ key: string; items: ScheduleEntry[] } | null>(null);

  // Lista facilităților (o singură dată). Fără facilitate validă în adresă, o alegem pe prima.
  useEffect(() => {
    const controller = new AbortController();
    getFacilityKinds(controller.signal)
      .then((list) => {
        setFacilities(list);
        setForm((current) =>
          list.some((f) => f.id === current.facilityId) ? current : { ...current, facilityId: list[0]?.id ?? "" },
        );
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) logout();
        else setLoadError(describeError(err));
      });
    return () => controller.abort();
  }, [logout]);

  // Cardul din stânga arată incidentele zilei pe care o blochezi (data de început din
  // formular), nu doar ziua din care s-a deschis pagina. Așa, o blocare nouă apare
  // imediat în listă, chiar dacă e în altă zi.
  const listDay = isValidIsoDate(form.startDate) ? form.startDate : day;

  // Incidentele active ale zilei; se reîncarcă la schimbarea zilei și după o blocare nouă.
  useEffect(() => {
    const controller = new AbortController();
    getActiveIncidents(listDay, controller.signal)
      .then((items) => setIncidents({ day: listDay, reload, items }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) logout();
        else setIncidents({ day: listDay, reload, items: [] });
      });
    return () => controller.abort();
  }, [listDay, reload, logout]);

  const { body, errors } = useMemo(() => validate(form, facilities), [form, facilities]);
  const previewKey = body ? JSON.stringify(body) : null;

  // Calculul automat al impactului, la o scurtă pauză după ultima modificare.
  useEffect(() => {
    if (!body || !previewKey || created) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      previewIncident(body, controller.signal)
        .then((data) => setPreview({ key: previewKey, data, error: null }))
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if (err instanceof ApiError && err.status === 401) logout();
          else setPreview({ key: previewKey, data: null, error: describeError(err) });
        });
    }, PREVIEW_DELAY);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // `body` se schimbă odată cu `previewKey`; cheia evită cereri repetate degeaba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, created, logout]);

  // Activitățile USV care s-ar suprapune: citim orarul fiecărei zile din interval.
  useEffect(() => {
    if (!body || !previewKey || created) return;
    const controller = new AbortController();
    const days: string[] = [];
    for (let d = form.startDate; d <= form.endDate && days.length <= MAX_DAYS; d = shiftDate(d, 1)) days.push(d);
    const start = Date.parse(body.startTime);
    const end = Date.parse(body.endTime);
    const timer = window.setTimeout(() => {
      Promise.all(days.map((d) => getAdminSchedule(d, null, controller.signal)))
        .then((schedules) => {
          const items = schedules
            .flatMap((schedule) => schedule.entries)
            .filter(
              (e) =>
                e.facilityId === body.facilityId &&
                (e.blockType === "course" || e.blockType === "event") &&
                Date.parse(e.startTime) < end &&
                Date.parse(e.endTime) > start,
            );
          setOverlap({ key: previewKey, items });
        })
        // Avertismentul e doar informativ: dacă orarul nu se poate citi, nu blocăm fluxul.
        .catch(() => undefined);
    }, PREVIEW_DELAY);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // Aceleași dependențe ca la calculul impactului (cheia include toate câmpurile).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, created]);

  const current = preview && preview.key === previewKey ? preview : null;
  const overlappingActivities = overlap && overlap.key === previewKey ? overlap.items : [];
  const impact = current?.data ?? null;
  const confirmed = Boolean(previewKey) && confirmedKey === previewKey;
  const facilityName = (id: string | null) => facilities.find((f) => f.id === id)?.name ?? "Facilitate";

  // Incidentele din stânga: cele în desfășurare întâi, apoi în ordinea începerii.
  const shownIncidents = incidents && incidents.day === listDay ? incidents.items : null;
  const [openedAt] = useState(() => Date.now());
  const sortedIncidents = shownIncidents
    ? [...shownIncidents].sort(
        (a, b) =>
          Number(Date.parse(b.startTime) <= openedAt) - Number(Date.parse(a.startTime) <= openedAt) ||
          a.startTime.localeCompare(b.startTime),
      )
    : [];

  const backQuery = new URLSearchParams({ zi: day });
  if (facilityParam && ID_PATTERN.test(facilityParam)) backQuery.set("facilitate", facilityParam);
  const backLink = `/admin/orar?${backQuery.toString()}`;

  /** Modifică un câmp; orice modificare anulează confirmarea dată pentru impactul vechi. */
  const update = <K extends keyof BlockForm>(key: K, value: BlockForm[K]) => {
    // După prima modificare arătăm erorile, ca să fie clar ce lipsește până la calculul impactului.
    setShowErrors(true);
    setError(null);
    setConfirmedKey(null);
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Sfârșitul rămâne după început: dacă îl depășește, îl mutăm odată cu el.
      if ((key === "startDate" || key === "startHour") && moment(next.endDate, next.endHour) <= moment(next.startDate, next.startHour)) {
        next.endDate = next.startDate;
        next.endHour = Math.min(next.startHour + 1, END_HOURS[END_HOURS.length - 1]);
      }
      return next;
    });
  };

  const toggleChannel = (channel: Channel) =>
    update(
      "channels",
      form.channels.includes(channel) ? form.channels.filter((c) => c !== channel) : [...form.channels, channel],
    );

  /** Erorile comune: sesiune expirată → login; altfel mesajul rămâne pe pagină. */
  const handleError = (err: unknown) => {
    if (err instanceof ApiError && err.status === 401) logout();
    else setError(describeError(err));
  };

  /** Impactul s-a schimbat: arătăm lista nouă și cerem din nou confirmarea. */
  const showChangedImpact = (fresh: IncidentPreview) => {
    if (previewKey) setPreview({ key: previewKey, data: fresh, error: null });
    setConfirmedKey(null);
    setError("Impactul s-a schimbat de la verificare. Revizuiește lista actualizată și confirmă din nou.");
  };

  /** „Confirmă blocarea și notifică”: reverifică impactul, apoi aplică blocarea. */
  const confirmBlock = async () => {
    setShowErrors(true);
    setError(null);
    if (!body || !impact || !confirmed || busy) return;
    setBusy(true);
    try {
      const fresh = await previewIncident(body);
      if (impactKey(fresh) !== impactKey(impact)) {
        showChangedImpact(fresh);
        return;
      }
      const incident = await createIncident(body);
      setCreated(incident);
      setReload((n) => n + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === "IMPACT_CHANGED_REVIEW_REQUIRED") {
        const fresh = await previewIncident(body).catch(() => null);
        if (fresh) {
          showChangedImpact(fresh);
          return;
        }
      }
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  /** „Blochează alt interval”: formular nou, cu aceeași facilitate și zi. */
  const startOver = () => {
    setForm({ ...initialForm(form.startDate, form.facilityId), facilityId: form.facilityId });
    setCreated(null);
    setPreview(null);
    setConfirmedKey(null);
    setShowErrors(false);
    setError(null);
  };

  const shown = (key: keyof BlockForm) => (showErrors ? errors[key] : undefined);
  const affectedCount = impact?.affectedCount ?? 0;

  return (
    <>
      <div className="flex flex-col items-start gap-4 md:flex-row md:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-[11px] font-bold text-primary">ADMINISTRATORUL BAZEI SPORTIVE</p>
          <h1 className="text-[28px] leading-[1.16] text-heading">Blocare pentru mentenanță</h1>
          <p className="text-[13px] leading-normal text-muted">
            Definește perioada închiderii și verifică rezervările afectate înainte de confirmare.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to={backLink} className={secondaryButton}>
            ← Înapoi la orar
          </Link>
          <Link to={`/admin/orar/activitate-noua?${backQuery.toString()}`} className={`${secondaryButton} gap-2`}>
            Adaugă activitate USV
            <PlusIcon className="size-4" />
          </Link>
        </div>
      </div>

      {loadError && (
        <p role="alert" className="rounded-lg bg-[#fcedea] px-4 py-3 text-sm text-[#ac443c]">
          {loadError}
        </p>
      )}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* Stânga: toate incidentele active ale zilei (cel tocmai creat e evidențiat). */}
        <Card className="flex min-w-0 flex-1 flex-col gap-3 p-6 leading-normal">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl text-heading">{sortedIncidents.length > 1 ? "Incidente active" : "Incident activ"}</h2>
            {/* Ziua afișată, ca să fie clar a cărei zile sunt incidentele (urmează data de început). */}
            <span className="text-xs text-muted">
              {sortedIncidents.length > 1 && `${sortedIncidents.length} · `}
              {formatDayMonth(listDay)}
            </span>
          </div>
          {!shownIncidents && <p className="text-sm text-muted">Se încarcă incidentele…</p>}
          {shownIncidents && sortedIncidents.length === 0 && (
            <p className="text-sm text-muted">Nu există incidente active pe {formatDayMonth(listDay)}.</p>
          )}
          {sortedIncidents.map((incident, i) => (
            <div
              key={incident.id}
              className={`flex flex-col gap-3 ${i > 0 ? "border-t border-[#dde5e2] pt-3" : ""} ${
                created?.id === incident.id ? "-mx-3 rounded-lg bg-[#e7f2ef] px-3 pb-3" : ""
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-base text-heading">
                  {incident.facilityName ?? facilityName(incident.facilityId)}
                  {incident.type && ` · ${INCIDENT_SHORT[incident.type]}`}
                </p>
                <span className="flex items-center gap-2">
                  {created?.id === incident.id && <span className="text-xs font-semibold text-primary">Nou</span>}
                  <span className="text-xs text-muted">{incident.code}</span>
                  {Date.parse(incident.startTime) <= openedAt ? (
                    <span className="rounded-md bg-[#fcedea] px-2 py-1 text-xs font-semibold text-[#ac443c]">Acces suspendat</span>
                  ) : (
                    <span className="rounded-md bg-[#fdf3e3] px-2 py-1 text-xs font-semibold text-[#926018]">Programat</span>
                  )}
                </span>
              </div>
              <p className="text-[13px] text-muted">
                {formatSpan(incident.startTime, incident.endTime)} · {incident.publicReason}
              </p>
              <p className="flex items-center gap-2 text-xs font-semibold text-primary">
                <CheckCheckIcon className="size-4" />
                {incident.notifiedUsers > 0
                  ? `${incident.notifiedUsers} ${incident.notifiedUsers === 1 ? "persoană notificată" : "persoane notificate"} · alerte trimise`
                  : "Nicio rezervare afectată · nu au fost necesare alerte"}
                {incident.pendingNotifications > 0 && ` · ${incident.pendingNotifications} în reîncercare`}
              </p>
              {/* Deblocarea anticipată este ecranul următor; până atunci butonul e inactiv. */}
              <button type="button" disabled title={COMING_SOON} className={`${secondaryButton} gap-2 self-start disabled:cursor-not-allowed`}>
                Deblocare anticipată
                <LockOpenIcon className="size-4" />
              </button>
            </div>
          ))}
          {sortedIncidents.length > 0 && (
            <p className="text-[11px] text-muted">
              După confirmarea echipei tehnice, intervalele rămase redevin disponibile în calendarul public. Acțiunea este
              înregistrată în jurnal.
            </p>
          )}
        </Card>

        {/* Dreapta: blocarea unei facilități (formular, impact, confirmare). */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-sidebar bg-white">
          <div className="flex flex-col gap-1.5 bg-sidebar px-6 py-5 text-white">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl">Blochează o facilitate</h2>
              <TriangleAlertIcon className="size-5 text-lime" />
            </div>
            <p className="text-[13px] text-white/80">Mentenanță sau curs universitar. Verifică impactul înainte de confirmare.</p>
            <ol className="flex gap-4 text-[11px] font-semibold text-lime">
              <li className="flex items-center gap-1">
                {body && <CheckIcon className="size-3" />} Detalii
              </li>
              <li className="flex items-center gap-1">
                {created ? <CheckIcon className="size-3" /> : "02 ·"} Impact și confirmare
              </li>
            </ol>
          </div>

          {created ? (
            <div className="flex flex-col gap-4 p-6">
              <div role="status" className="flex flex-col gap-1 rounded-xl bg-[#e7f2ef] p-4 text-primary">
                <p className="font-semibold">Blocarea a fost aplicată · {created.code}</p>
                <p className="text-[13px]">
                  {created.facilityName ?? facilityName(created.facilityId)} · {formatSpan(created.startTime, created.endTime)}
                </p>
                <p className="text-[13px]">
                  {created.affectedBookings} rezervări anulate · {created.quotasRefunded} cote restituite ·{" "}
                  {created.notifiedUsers} persoane notificate
                </p>
              </div>
              <p className="text-sm text-muted">Intervalul apare acum în orar ca blocare și nu mai poate fi rezervat.</p>
              <div className="flex flex-wrap gap-3">
                {/* Orarul zilei, cu toate facilitățile, ca să se vadă toate blocările, nu doar ultima. */}
                <Link to={`/admin/orar?zi=${bucharestParts(created.startTime).date}`} className={primaryButton}>
                  Vezi în orar
                </Link>
                <button type="button" className={secondaryButton} onClick={startOver}>
                  Blochează alt interval
                </button>
              </div>
            </div>
          ) : (
            <form
              noValidate
              className="flex flex-col gap-4 p-6"
              onSubmit={(event) => {
                event.preventDefault();
                void confirmBlock();
              }}
            >
              <span className="self-start rounded-md bg-[#fdf3e3] px-2 py-1 text-xs font-semibold text-[#926018]">
                Ciornă · nicio acțiune aplicată
              </span>

              <div className="flex flex-col gap-4 sm:flex-row">
                <Field title="Facilitate afectată" htmlFor="block-facility" error={shown("facilityId")}>
                  <Select id="block-facility" value={form.facilityId} onChange={(e) => update("facilityId", e.target.value)}>
                    {facilities.length === 0 && <option value="">Se încarcă…</option>}
                    {facilities.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field title="Motivul blocării" htmlFor="block-type">
                  <Select id="block-type" value={form.type} onChange={(e) => update("type", e.target.value as IncidentType)}>
                    {INCIDENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {INCIDENT_TYPE_LABEL[type]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field title="Motiv vizibil pentru utilizatori" htmlFor="block-reason" error={shown("publicReason")}>
                <input
                  id="block-reason"
                  className={input}
                  value={form.publicReason}
                  maxLength={REASON_MAX}
                  placeholder="Igienizare urgentă a zonei de antrenament și verificarea echipamentelor."
                  onChange={(e) => update("publicReason", e.target.value)}
                />
              </Field>

              <div className="flex flex-col gap-4 sm:flex-row">
                <Field title="Început · data și ora" htmlFor="block-start-date" error={shown("startDate")}>
                  <div className="flex gap-2">
                    <DateInput short id="block-start-date" value={form.startDate} min={todayInBucharest()} onChange={(v) => update("startDate", v)} />
                    <div className="w-[104px] shrink-0">
                      <Select aria-label="Ora de început" value={form.startHour} onChange={(e) => update("startHour", Number(e.target.value))}>
                        {START_HOURS.map((h) => (
                          <option key={h} value={h}>
                            {hourLabel(h)}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </Field>
                <Field title="Sfârșit · data și ora" htmlFor="block-end-date" error={shown("endDate")}>
                  <div className="flex gap-2">
                    <DateInput short id="block-end-date" value={form.endDate} min={form.startDate} onChange={(v) => update("endDate", v)} />
                    <div className="w-[104px] shrink-0">
                      <Select aria-label="Ora de sfârșit" value={form.endHour} onChange={(e) => update("endHour", Number(e.target.value))}>
                        {END_HOURS.filter((h) => form.endDate !== form.startDate || h > form.startHour).map((h) => (
                          <option key={h} value={h}>
                            {hourLabel(h)}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </Field>
              </div>

              <hr className="border-[#dde5e2]" />

              {/* Impactul calculat de server: ce se anulează dacă se confirmă. */}
              <div className="flex flex-col gap-3" aria-live="polite">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg text-heading">Impact înainte de confirmare</h3>
                  {impact && (
                    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${affectedCount > 0 ? "bg-[#fcedea] text-[#ac443c]" : "bg-[#e7f2ef] text-primary"}`}>
                      {affectedCount} {affectedCount === 1 ? "rezervare" : "rezervări"}
                    </span>
                  )}
                </div>
                {!body && <p className="text-[13px] text-muted">Completează detaliile ca să vezi rezervările afectate.</p>}
                {body && !current && <p className="text-[13px] text-muted">Se calculează impactul…</p>}
                {current?.error && (
                  <p role="alert" className="rounded-lg bg-[#fcedea] px-3 py-2 text-sm text-[#ac443c]">
                    {current.error}
                  </p>
                )}
                {overlappingActivities.length > 0 && (
                  <div className="flex flex-col gap-1 rounded-lg bg-[#fdf3e3] px-3 py-2 text-xs text-[#926018]">
                    <p className="font-semibold">Intervalul se suprapune cu o activitate USV</p>
                    {overlappingActivities.map((e) => (
                      <p key={`${e.startTime}-${e.title}`}>
                        {e.title} · {formatDayMonth(bucharestParts(e.startTime).date)} · {formatTimeRange(e.startTime, e.endTime)}
                      </p>
                    ))}
                    <p>Activitatea rămâne în orar. Anunță organizatorul sau anuleaz-o din „Gestionează activitatea USV”.</p>
                  </div>
                )}
                {impact && (
                  <>
                    <p className="text-xs text-muted">
                      {affectedCount > 0
                        ? "Vor fi anulate numai rezervările care se suprapun intervalului blocat:"
                        : "Nicio rezervare nu se suprapune intervalului blocat."}
                    </p>
                    <ul className="flex flex-col gap-2">
                      {impact.affectedBookings.map((b) => (
                        <li key={b.id} className="flex items-center gap-3 rounded-lg bg-[#eef3f1] px-3 py-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#dde5e2] text-[11px] text-heading">
                            {initials(b.userName ?? b.code)}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-[13px] font-semibold text-heading">{b.userName ?? b.code}</span>
                            <span className="text-[11px] text-muted">
                              {ROLE_LABEL[b.userRole ?? ""] ?? "Utilizator"}
                              {b.quotaWillBeRefunded && " · cota se restituie"}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-heading">
                            {bucharestParts(b.startTime).date !== form.startDate && `${formatDayMonth(bucharestParts(b.startTime).date)} · `}
                            {hourLabel(bucharestParts(b.startTime).hour)}–{hourLabel(bucharestParts(b.endTime).hour)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {impact.waitlistInformed > 0 && (
                      <p className="text-xs text-muted">
                        + {impact.waitlistInformed}{" "}
                        {impact.waitlistInformed === 1 ? "persoană pe lista de așteptare va primi" : "persoane de pe lista de așteptare vor primi"} o
                        informare de indisponibilitate, nu o ofertă de rezervare.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Ce se întâmplă la confirmare și pe ce canale se trimit alertele. */}
              <div className="flex flex-col gap-2 rounded-xl bg-[#e7f2ef] p-4 text-primary">
                <p className="text-[13px]">La confirmare: blochează · anulează · notifică</p>
                <div className="flex flex-wrap gap-2">
                  {SHOWN_CHANNELS.map((channel) => {
                    const on = form.channels.includes(channel);
                    return (
                      <button
                        key={channel}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleChannel(channel)}
                        className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${on ? "bg-white text-primary" : "text-muted line-through"}`}
                      >
                        {on && <CheckIcon className="size-3" />}
                        {CHANNEL_LABEL[channel]}
                      </button>
                    );
                  })}
                </div>
                {shown("channels") && <p className="text-xs text-[#ac443c]">{shown("channels")}</p>}
                <p className="text-[11px]">
                  Alertele se trimit automat persoanelor afectate pe canalele alese. Dacă serviciul nu răspunde, livrarea
                  este reîncercată automat.
                </p>
              </div>

              <label className="flex items-start gap-2 text-[13px] text-heading">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={confirmed}
                  disabled={!impact || busy}
                  onChange={(e) => setConfirmedKey(e.target.checked ? previewKey : null)}
                />
                {affectedCount > 0
                  ? `Am verificat intervalul și cele ${affectedCount} rezervări afectate. Confirmarea va aplica blocarea și anulările.`
                  : "Am verificat intervalul. Confirmarea va aplica blocarea."}
              </label>

              {error && (
                <p role="alert" className="rounded-lg bg-[#fcedea] px-3 py-2 text-sm text-[#ac443c]">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap gap-3">
                <button type="submit" className={`${primaryButton} gap-2`} disabled={!confirmed || !impact || busy}>
                  {busy ? "Se aplică blocarea…" : "Confirmă blocarea și notifică"}
                  <ShieldCheckIcon className="size-4" />
                </button>
                <Link to={backLink} className={secondaryButton}>
                  Renunță
                </Link>
              </div>
              <p className="text-[11px] text-muted">
                Sfârșitul trebuie să fie după început. Disponibilitatea și rezervările afectate sunt reverificate la
                confirmare.
              </p>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
