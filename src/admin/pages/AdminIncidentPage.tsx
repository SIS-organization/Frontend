// Pagina „Deblocare anticipată” (Figma: „Admin · Deblocare anticipată”).
// Se deschide din orar (selectezi o reparație / igienizare, apoi „Deblocare
// anticipată” sau „Istoric intervenție” — atunci adresa primește „?fila=istoric”),
// din „Gestionează blocările” sau din lista paginii „Blocare pentru mentenanță”.
//
// Două file:
//   - „Incident activ”: detaliile incidentului și redeschiderea mai devreme.
//       GET  /admin/incidents/{id}
//       POST /admin/incidents/{id}/reopen  { reopenFrom, safetyConfirmed: true }
//     Butonul de confirmare e activ doar după bifarea confirmării de siguranță.
//     Rezervările anulate NU se reactivează; doar intervalele rămase redevin libere.
//   - „Istoric intervenție”: jurnalul incidentului (GET /admin/incidents/{id}/log).
// Id-ul din adresă e verificat înainte de a fi trimis la server.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/useAuth";
import { CheckCheckIcon, LockOpenIcon } from "../AdminIcons";
import { ID_PATTERN } from "../activityForm";
import { getIncident, getIncidentLog, reopenIncident, type Incident, type LogEntry } from "../api";
import { Card, Select, primaryButton, secondaryButton } from "../components/ActivityForm";
import { INCIDENT_SHORT, formatSpan } from "../incidentText";
import { bucharestIso, bucharestParts, formatDayMonth, formatClock, hourLabel, isValidIsoDate } from "../time";

type Tab = "incident" | "history";

const HOUR = 3_600_000;
/** Orele la care se poate redeschide (programul bazei sportive). */
const OPEN_FROM = 8;
const OPEN_UNTIL = 20;

/** Mesajul pentru administrator, după eroarea primită de la server. */
function describeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "Contul tău nu mai are drepturi de administrator.";
  if (error instanceof ApiError && error.status === 404) return "Incidentul nu există sau a fost șters.";
  if (error instanceof ApiError && error.status === 501) return "Serverul nu oferă încă deblocarea anticipată.";
  return error instanceof Error ? error.message : "Operația nu a reușit. Încearcă din nou.";
}

/**
 * Orele la care se poate redeschide facilitatea: din ora curentă (sau de la
 * începutul blocării, dacă e în viitor) până la o oră înainte de sfârșit,
 * doar în programul bazei. Valoarea fiecărei opțiuni e momentul ISO.
 */
function reopenOptions(incident: Incident, now: number): { value: string; label: string }[] {
  const start = Date.parse(incident.startTime);
  const end = Date.parse(incident.endTime);
  const first = Math.max(start, Math.floor(now / HOUR) * HOUR);
  const sameDay = bucharestParts(incident.startTime).date === bucharestParts(incident.endTime).date;
  const options: { value: string; label: string }[] = [];
  for (let t = first; t < end && options.length < 200; t += HOUR) {
    const { date, hour } = bucharestParts(new Date(t).toISOString());
    if (t !== start && (hour < OPEN_FROM || hour > OPEN_UNTIL)) continue;
    options.push({
      value: bucharestIso(date, hour),
      label: sameDay ? hourLabel(hour) : `${formatDayMonth(date)} · ${hourLabel(hour)}`,
    });
  }
  return options;
}

/** Eticheta de stare a incidentului (culoare + text). */
function statusBadge(incident: Incident, now: number) {
  if (incident.status === "reopened_early") return { text: "Redeschis anticipat", tone: "bg-[#e7f2ef] text-primary" };
  if (incident.status === "closed") return { text: "Închis", tone: "bg-bg text-muted" };
  if (Date.parse(incident.startTime) <= now) return { text: "Acces suspendat", tone: "bg-[#fcedea] text-[#ac443c]" };
  return { text: "Programat", tone: "bg-[#fdf3e3] text-[#926018]" };
}

export default function AdminIncidentPage() {
  const { logout } = useAuth();
  const { incidentId = "" } = useParams();
  const [params] = useSearchParams();
  const validId = ID_PATTERN.test(incidentId);

  const [incident, setIncident] = useState<Incident | null>(null);
  const [loadError, setLoadError] = useState<string | null>(validId ? null : "Adresa incidentului nu este validă.");
  // „?fila=istoric” (din cardul de selecție al orarului) deschide direct istoricul.
  const [tab, setTab] = useState<Tab>(() => (params.get("fila") === "istoric" ? "history" : "incident"));
  const [log, setLog] = useState<{ reload: number; items: LogEntry[] | null; error: string | null } | null>(null);
  const [logReload, setLogReload] = useState(0);
  const [reopenFrom, setReopenFrom] = useState("");
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Momentul deschiderii paginii: de aici încep orele posibile de redeschidere.
  const [openedAt] = useState(() => Date.now());

  // Încărcăm incidentul o singură dată.
  useEffect(() => {
    if (!validId) return;
    const controller = new AbortController();
    getIncident(incidentId, controller.signal)
      .then(setIncident)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) logout();
        else setLoadError(describeError(err));
      });
    return () => controller.abort();
  }, [incidentId, validId, logout]);

  // Jurnalul se încarcă doar când e deschisă fila „Istoric intervenție” (și după o deblocare).
  useEffect(() => {
    if (!validId || tab !== "history") return;
    const controller = new AbortController();
    getIncidentLog(incidentId, controller.signal)
      .then((items) => setLog({ reload: logReload, items, error: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) logout();
        else setLog({ reload: logReload, items: null, error: describeError(err) });
      });
    return () => controller.abort();
  }, [incidentId, validId, tab, logReload, logout]);

  const options = useMemo(() => (incident ? reopenOptions(incident, openedAt) : []), [incident, openedAt]);
  // Ora aleasă; implicit prima posibilă (dacă alegerea nu mai e validă, revenim la ea).
  const chosen = options.some((o) => o.value === reopenFrom) ? reopenFrom : (options[0]?.value ?? "");

  const dayParam = params.get("zi");
  const startDay = incident ? bucharestParts(incident.startTime).date : null;
  const backDay = isValidIsoDate(dayParam) ? dayParam : startDay;
  const backQuery = new URLSearchParams();
  if (backDay) backQuery.set("zi", backDay);
  const facilityParam = params.get("facilitate");
  if (facilityParam && ID_PATTERN.test(facilityParam)) backQuery.set("facilitate", facilityParam);
  const backLink = `/admin/orar${backQuery.size ? `?${backQuery.toString()}` : ""}`;

  /** Redeschide facilitatea de la ora aleasă (după confirmarea de siguranță). */
  const confirmReopen = async () => {
    if (!incident || !chosen || !safetyConfirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await reopenIncident(incident.id, chosen);
      setIncident(updated);
      setSafetyConfirmed(false);
      setLogReload((n) => n + 1);
      const at = updated.reopenedAt ?? chosen;
      setNotice(
        `Facilitatea redevine disponibilă de la ${formatClock(at)}. Intervalul ${formatSpan(at, updated.endTime)} este din nou liber în calendar.`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <div className="flex flex-col items-start gap-4 md:flex-row md:items-end">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[11px] font-bold text-primary">ADMINISTRATORUL BAZEI SPORTIVE</p>
        <h1 className="text-[28px] leading-[1.16] text-heading">Deblocare anticipată</h1>
        <p className="text-[13px] leading-normal text-muted">
          {incident
            ? [incident.code, incident.facilityName, incident.type && INCIDENT_SHORT[incident.type]].filter(Boolean).join(" · ")
            : "Redeschide o facilitate după ce lucrările s-au terminat mai repede."}
        </p>
      </div>
      <Link to={backLink} className={secondaryButton}>
        ← Înapoi la orar
      </Link>
    </div>
  );

  if (loadError || !incident) {
    return (
      <>
        {header}
        <Card className="p-6">
          {loadError ? (
            <p role="alert" className="text-sm text-[#ac443c]">
              {loadError}
            </p>
          ) : (
            <p className="text-sm text-muted">Se încarcă incidentul…</p>
          )}
        </Card>
      </>
    );
  }

  const badge = statusBadge(incident, openedAt);
  const active = incident.status === "active";
  const stats: [string, number][] = [
    ["Rezervări anulate", incident.affectedBookings],
    ["Cote restituite", incident.quotasRefunded],
    ["Persoane notificate", incident.notifiedUsers],
    ["Alerte în reîncercare", incident.pendingNotifications],
  ];
  const shownLog = log && log.reload === logReload ? log : null;

  return (
    <>
      {header}

      {/* Filele paginii. */}
      <div role="tablist" aria-label="Incident" className="flex flex-wrap gap-3 text-xs font-semibold">
        {(
          [
            ["incident", "Incident activ"],
            ["history", "Istoric intervenție"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`rounded-lg border px-3 py-2.5 text-left sm:w-[190px] ${tab === value ? "border-primary bg-primary text-white" : "border-[#dde5e2] bg-white text-heading hover:bg-bg"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {notice && (
        <p role="status" className="rounded-lg bg-[#e7f2ef] px-4 py-3 text-sm text-primary">
          {notice}
        </p>
      )}

      {tab === "incident" ? (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          {/* Stânga: detaliile incidentului. */}
          <Card className="flex min-w-0 flex-1 flex-col gap-3 p-6 leading-normal">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl text-heading">{active ? "Incident activ" : "Incident"}</h2>
              <span className="text-xs text-muted">{incident.code}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-base text-heading">
                {incident.facilityName ?? "Facilitate"}
                {incident.type && ` · ${INCIDENT_SHORT[incident.type]}`}
              </p>
              <span className={`rounded-md px-2 py-1 text-xs font-semibold ${badge.tone}`}>{badge.text}</span>
            </div>
            <p className="text-[13px] text-muted">
              {formatSpan(incident.startTime, incident.endTime)} · {incident.publicReason}
            </p>
            {incident.reopenedAt && (
              <p className="text-[13px] text-primary">Redeschis de la {formatClock(incident.reopenedAt)}.</p>
            )}
            <dl className="grid grid-cols-2 gap-2">
              {stats.map(([label, value]) => (
                <div key={label} className="rounded-lg bg-bg px-3 py-2">
                  <dt className="text-[11px] text-muted">{label}</dt>
                  <dd className="text-lg text-heading">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="flex items-center gap-2 text-xs font-semibold text-primary">
              <CheckCheckIcon className="size-4" />
              {incident.notifiedUsers > 0
                ? `${incident.notifiedUsers} ${incident.notifiedUsers === 1 ? "persoană notificată" : "persoane notificate"} · alerte trimise`
                : "Nicio rezervare afectată · nu au fost necesare alerte"}
            </p>
          </Card>

          {/* Dreapta: redeschiderea anticipată. */}
          <Card className="flex min-w-0 flex-1 flex-col gap-4 p-6 leading-normal">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl text-heading">Redeschide facilitatea</h2>
              <LockOpenIcon className="size-5 text-primary" />
            </div>

            {!active ? (
              <p className="rounded-lg bg-bg px-3 py-2 text-sm text-muted">
                {incident.status === "reopened_early"
                  ? "Facilitatea a fost deja redeschisă. Detaliile rămân în fila „Istoric intervenție”."
                  : "Incidentul s-a încheiat; nu mai există intervale de redeschis."}
              </p>
            ) : options.length === 0 ? (
              <p className="rounded-lg bg-bg px-3 py-2 text-sm text-muted">
                Nu mai există ore la care facilitatea să poată fi redeschisă înainte de sfârșitul blocării.
              </p>
            ) : (
              <form
                noValidate
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void confirmReopen();
                }}
              >
                <p className="text-[13px] text-muted">
                  Folosește deblocarea doar când lucrările s-au terminat mai repede și echipa tehnică a confirmat că
                  facilitatea este sigură.
                </p>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="reopen-from" className="text-xs font-semibold text-muted">
                    Redeschide de la
                  </label>
                  <Select
                    id="reopen-from"
                    value={chosen}
                    disabled={busy}
                    onChange={(e) => {
                      setReopenFrom(e.target.value);
                      setSafetyConfirmed(false);
                    }}
                  >
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex flex-col gap-1 rounded-xl bg-[#e7f2ef] p-4 text-primary">
                  <p className="text-[13px] font-semibold">Interval reactivat în calendar</p>
                  <p className="text-[13px]">{formatSpan(chosen, incident.endTime)} · redevine disponibil pentru rezervări</p>
                  <p className="text-xs">
                    Rezervările anulate nu se reactivează automat; intervalele trecute rămân în istoric.
                  </p>
                </div>

                <label className="flex items-start gap-2 text-[13px] text-heading">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={safetyConfirmed}
                    disabled={busy}
                    onChange={(e) => setSafetyConfirmed(e.target.checked)}
                  />
                  Echipa tehnică a confirmat că facilitatea este sigură pentru utilizare.
                </label>

                {error && (
                  <p role="alert" className="rounded-lg bg-[#fcedea] px-3 py-2 text-sm text-[#ac443c]">
                    {error}
                  </p>
                )}

                <div className="flex flex-wrap gap-3">
                  <button type="submit" className={`${primaryButton} gap-2`} disabled={!safetyConfirmed || busy}>
                    {busy ? "Se deblochează…" : "Confirmă deblocarea"}
                    <LockOpenIcon className="size-4" />
                  </button>
                  <Link to={backLink} className={secondaryButton}>
                    Păstrează blocarea
                  </Link>
                </div>
              </form>
            )}
            <p className="text-[11px] text-muted">
              Deblocarea este înregistrată în jurnal. Persoanele de pe lista de așteptare pot rezerva din nou intervalele
              eliberate.
            </p>
          </Card>
        </div>
      ) : (
        /* Fila „Istoric intervenție”: jurnalul incidentului, în ordine cronologică. */
        <Card className="flex flex-col gap-4 p-6 leading-normal">
          <h2 className="text-xl text-heading">Istoric intervenție</h2>
          {!shownLog && <p className="text-sm text-muted">Se încarcă istoricul…</p>}
          {shownLog?.error && (
            <p role="alert" className="text-sm text-[#ac443c]">
              {shownLog.error}
            </p>
          )}
          {shownLog?.items && shownLog.items.length === 0 && <p className="text-sm text-muted">Jurnalul este gol.</p>}
          {shownLog?.items && shownLog.items.length > 0 && (
            <ol className="flex flex-col">
              {shownLog.items.map((entry) => (
                <li key={entry.id} className="flex gap-4 border-l-2 border-[#dde5e2] pb-4 pl-4 last:pb-0">
                  <span className="w-[120px] shrink-0 text-xs text-muted">
                    {formatDayMonth(bucharestParts(entry.occurredAt).date)} · {formatClock(entry.occurredAt)}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-semibold text-heading">{entry.title}</span>
                    {entry.description && <span className="text-[13px] text-muted">{entry.description}</span>}
                    {entry.actorName && <span className="text-[11px] text-muted">{entry.actorName}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}
    </>
  );
}
