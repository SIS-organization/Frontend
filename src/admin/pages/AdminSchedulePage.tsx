// Pagina „Orar și incidente” (Figma: „Administrare · Baza sportivă · Desktop”).
//
// Arată, pentru o zi, toate facilitățile una lângă alta, pe intervale de 60 de
// minute (08:00–21:00): rezervările utilizatorilor, cursurile și evenimentele USV,
// mentenanța și reparațiile. Datele vin din trei apeluri, conform Swagger:
//   GET /admin/schedule  → starea facilităților + blocările zilei
//   GET /admin/bookings  → rezervările zilei (cu numele utilizatorului)
//   GET /facilities      → doar ca să știm care facilitate are culoare (bazinul)
//
// „Adaugă activitate USV” deschide formularul de activitate, cu ziua și
// facilitatea alese aici deja completate. Un click pe un curs sau un eveniment
// USV din grilă deschide „Gestionează activitatea USV”, iar „Blochează interval”
// deschide „Blocare pentru mentenanță”. Celelalte acțiuni (blochează interval,
// detalii) sunt afișate ca în Figma, dar inactive: țin de pașii următori.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/useAuth";
import { PlusIcon, ChevronDownIcon } from "../AdminIcons";
import {
  getAdminBookingsForDay,
  getAdminSchedule,
  getFacilityKinds,
  type AdminBooking,
  type AdminSchedule,
  type BookingStatus,
  type FacilityStatus,
  type ScheduleFacility,
} from "../api";
import {
  BLOCK_STYLES,
  HOUR_COUNT,
  POOL_LANES,
  bookingBlocks,
  entryBlocks,
  freeLanesByHour,
} from "../scheduleGrid";
import {
  DAY_START_HOUR,
  formatDayMonth,
  formatDayMonthYear,
  formatTimeRange,
  formatWeekday,
  hourLabel,
  isValidIsoDate,
  shiftDate,
  todayInBucharest,
} from "../time";

// Înălțimea unei ore în grilă (px). În Figma e 60; am redus-o ca orarul
// întreg (08:00–21:00) să încapă mai bine pe ecran, cu textul la fel de lizibil.
const ROW = 48;
// Forma acceptată pentru id-ul din adresă (UUID sau număr); orice altceva e ignorat.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const NOT_READY = "Disponibil într-un pas următor";

// Eticheta colorată din cardurile de sus, după starea facilității (culori din Figma).
const STATUS_BADGE: Record<FacilityStatus, { box: string; icon: string; label: string }> = {
  operational: { box: "bg-[#e7f2ef] text-primary", icon: "✓", label: "Operațională" },
  under_maintenance: { box: "bg-[#fcede8] text-[#ac443c]", icon: "⚒", label: "În mentenanță" },
  university_activity: { box: "bg-[#e9edf5] text-[#4a5879]", icon: "▣", label: "Activități USV" },
  closed: { box: "bg-gray-200 text-muted", icon: "■", label: "Închisă" },
};

// Textul stării unei rezervări, afișat în „Rezervare selectată”.
const BOOKING_STATUS: Record<BookingStatus, string> = {
  in_verification: "În verificare",
  confirmed: "Confirmată",
  awaiting_transfer: "În așteptarea transferului",
  completed: "Finalizată",
  rejected: "Respinsă",
  cancelled: "Anulată",
};

// Tot ce s-a încărcat pentru o anumită zi + filtru. `key` spune pentru ce cerere
// sunt datele: dacă diferă de cererea curentă, pagina știe că încă se încarcă.
type Loaded = {
  key: string;
  schedule: AdminSchedule | null;
  bookings: AdminBooking[];
  laneFacilities: Set<string>;
  error: { kind: "forbidden" | "missing" | "other"; message: string } | null;
  bookingsError: string | null;
};

const toolButton =
  "rounded-[7px] border border-[#dde5e2] bg-white px-3 py-2 text-xs leading-[1.4] font-semibold text-heading hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50";

/** Transformă o eroare de la server într-un mesaj pentru administrator. */
function describeError(error: unknown): Loaded["error"] {
  if (error instanceof ApiError && error.status === 403) {
    return { kind: "forbidden", message: "Contul tău nu mai are drepturi de administrator." };
  }
  if (error instanceof ApiError && (error.status === 404 || error.status === 501)) {
    return { kind: "missing", message: "Serverul nu oferă încă orarul de administrare (GET /admin/schedule)." };
  }
  return { kind: "other", message: error instanceof Error ? error.message : "Orarul nu a putut fi încărcat." };
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-[#dde5e2] bg-white ${className}`}>{children}</section>;
}

/** Un card din rândul de sus: numele facilității, starea și nota (ex. „Astăzi · 14:00–16:00”). */
function FacilityStatusCard({ facility, hasLanes }: { facility: ScheduleFacility; hasLanes: boolean }) {
  const badge = STATUS_BADGE[facility.status];
  const note = facility.note ?? (hasLanes ? `${POOL_LANES} culoare · ${POOL_LANES} rezervări / oră` : null);
  return (
    <Card className="flex min-w-0 flex-col items-start gap-2 px-4 py-3">
      <h2 className="text-[15px] text-heading">{facility.name}</h2>
      <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${badge.box}`}>
        {badge.icon} {facility.statusLabel ?? badge.label}
      </span>
      {note && <p className="text-[11px] text-muted">{note}</p>}
    </Card>
  );
}

export default function AdminSchedulePage() {
  const { logout } = useAuth();
  const [params, setParams] = useSearchParams();
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  // Parametrii din adresă sunt date de la utilizator: îi validăm înainte de folosire.
  const rawDay = params.get("zi");
  const day = isValidIsoDate(rawDay) ? rawDay : todayInBucharest();
  const rawFacility = params.get("facilitate");
  const facilityFilter = rawFacility && ID_PATTERN.test(rawFacility) ? rawFacility : null;
  // Ziua se încarcă o singură dată pentru toate facilitățile (cardurile de sus le
  // arată pe toate); filtrul doar ascunde coloane, deci nu face cereri noi.
  const requestKey = `${day}|${reloadKey}`;
  const loading = loaded?.key !== requestKey;

  // Încărcarea datelor la fiecare schimbare de zi / filtru / „Reîncearcă”.
  // AbortController anulează cererile vechi: dacă administratorul schimbă repede
  // ziua, nu riscăm să afișăm rezervările altei zile.
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      const result: Loaded = {
        key: requestKey,
        schedule: null,
        bookings: [],
        laneFacilities: new Set(),
        error: null,
        bookingsError: null,
      };
      const [schedule, bookings, kinds] = await Promise.allSettled([
        getAdminSchedule(day, null, signal),
        getAdminBookingsForDay(day, null, signal),
        getFacilityKinds(signal),
      ]);
      if (signal.aborted) return;

      const failures = [schedule, bookings].flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
      // 401 = token expirat sau invalid: închidem sesiunea, RequireAuth trimite la /login.
      if (failures.some((e) => e instanceof ApiError && e.status === 401)) {
        logout(); // sesiune expirată → /login
        return;
      }

      if (schedule.status === "fulfilled") result.schedule = schedule.value;
      else result.error = describeError(schedule.reason);

      if (bookings.status === "fulfilled") result.bookings = bookings.value;
      else if (bookings.reason instanceof ApiError && bookings.reason.status === 403) {
        result.error = describeError(bookings.reason);
      } else result.bookingsError = "Rezervările zilei nu au putut fi încărcate.";

      // Dacă lista facilităților nu vine, orarul merge oricum (doar fără „culoare libere”).
      if (kinds.status === "fulfilled") {
        result.laneFacilities = new Set(kinds.value.filter((k) => k.hasLanes).map((k) => k.id));
      }
      // La 403 nu păstrăm nicio dată primită.
      if (result.error?.kind === "forbidden") {
        result.schedule = null;
        result.bookings = [];
      }
      setLoaded(result);
    })();

    return () => controller.abort();
  }, [day, requestKey, logout]);

  const schedule = loaded?.schedule ?? null;
  const allFacilities = useMemo(() => schedule?.facilities ?? [], [schedule]);
  const columns = facilityFilter ? allFacilities.filter((f) => f.facilityId === facilityFilter) : allFacilities;
  const bookings = loaded?.bookings ?? [];
  const lanes = loaded?.laneFacilities ?? new Set<string>();
  const selected = bookings.find((b) => b.id === selectedId) ?? null;
  const incident = schedule?.activeIncident ?? null;

  // Ziua și filtrul stau în adresă (?zi=2026-10-20&facilitate=...), ca pagina să
  // poată fi reîncărcată sau trimisă unui coleg. Schimbarea lor reîncarcă datele.
  const update = (next: { zi?: string; facilitate?: string | null }) => {
    const search = new URLSearchParams(params);
    if (next.zi !== undefined) search.set("zi", next.zi);
    if (next.facilitate !== undefined) {
      if (next.facilitate) search.set("facilitate", next.facilitate);
      else search.delete("facilitate");
    }
    setSelectedId(null);
    setParams(search);
  };

  // Filtrul din adresă trebuie să fie una dintre facilitățile primite de la server;
  // altfel (adresă modificată de mână / facilitate ștearsă) îl scoatem din adresă.
  const unknownFilter = !loading && schedule && facilityFilter && !allFacilities.some((f) => f.facilityId === facilityFilter);
  useEffect(() => {
    if (unknownFilter) {
      const search = new URLSearchParams(params);
      search.delete("facilitate");
      setParams(search, { replace: true });
    }
  }, [unknownFilter, params, setParams]);

  // 403 = contul a pierdut rolul de administrator între timp: nu mai afișăm nimic din orar.
  if (loaded?.error?.kind === "forbidden") {
    return (
      <Card className="p-6" >
        <p role="alert" className="text-sm text-[#ac443c]">{loaded.error.message}</p>
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-col items-start gap-4 md:flex-row md:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-[11px] font-bold text-primary">ADMINISTRATORUL BAZEI SPORTIVE</p>
          <h1 className="text-[28px] leading-[1.16] text-heading">Orarul rezervărilor</h1>
          <p className="max-w-[710px] text-[13px] leading-normal text-muted">
            Vezi fiecare rezervare pe interval orar, alături de cursuri și mentenanță.
          </p>
        </div>
        <Link
          to={`/admin/orar/activitate-noua?${new URLSearchParams(facilityFilter ? { zi: day, facilitate: facilityFilter } : { zi: day }).toString()}`}
          className="flex h-10 items-center gap-2 rounded-lg border border-[#dde5e2] bg-white px-[18px] text-[13px] font-semibold text-heading hover:bg-bg"
        >
          Adaugă activitate USV
          <PlusIcon className="size-4" />
        </Link>
      </div>

      {allFacilities.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {allFacilities.map((facility) => (
            <FacilityStatusCard key={facility.facilityId} facility={facility} hasLanes={lanes.has(facility.facilityId)} />
          ))}
        </div>
      )}

      {/* Orarul zilei: bara de navigare, titlul, grila și legenda. */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <button type="button" className={toolButton} aria-label="Ziua anterioară" onClick={() => update({ zi: shiftDate(day, -1) })}>
            ←
          </button>
          <label className="relative cursor-pointer rounded-[7px] bg-primary px-3 py-2 text-xs leading-[1.4] font-semibold text-white">
            {formatDayMonthYear(day)} ⌄
            <input
              type="date"
              aria-label="Alege ziua"
              value={day}
              onClick={(event) => {
                try {
                  event.currentTarget.showPicker();
                } catch {
                  // browsere fără showPicker: câmpul rămâne utilizabil de la tastatură
                }
              }}
              onChange={(event) => {
                if (isValidIsoDate(event.target.value)) update({ zi: event.target.value });
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <button type="button" className={toolButton} aria-label="Ziua următoare" onClick={() => update({ zi: shiftDate(day, 1) })}>
            →
          </button>
          <button type="button" className={toolButton} onClick={() => update({ zi: todayInBucharest() })}>
            Astăzi
          </button>
          <div className="relative">
            <select
              aria-label="Facilitatea afișată"
              value={facilityFilter ?? ""}
              onChange={(event) => update({ facilitate: event.target.value || null })}
              className={`${toolButton} appearance-none pr-8`}
            >
              <option value="">Toate facilitățile</option>
              {allFacilities.map((f) => (
                <option key={f.facilityId} value={f.facilityId}>
                  {f.name}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-heading" />
          </div>
          {/* Deschide „Blocare pentru mentenanță” cu ziua și facilitatea alese aici. */}
          <Link
            to={`/admin/orar/blocare?${new URLSearchParams(facilityFilter ? { zi: day, facilitate: facilityFilter } : { zi: day }).toString()}`}
            className={`${toolButton} flex items-center`}
          >
            Blochează interval
          </Link>
        </div>

        <div className="flex flex-wrap items-start gap-4 leading-[1.4]">
          <h2 className="min-w-0 flex-1 text-lg text-heading">{formatWeekday(day)} · 08:00–21:00</h2>
          <p className="text-xs text-muted md:w-[245px]">Ora locală · Europe/Bucharest</p>
        </div>

        {loaded?.error && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-[#fcedea] px-4 py-3 text-sm text-[#ac443c]">
            {loaded.error.message}
            <button type="button" className={toolButton} onClick={() => setReloadKey((k) => k + 1)}>
              Reîncearcă
            </button>
          </div>
        )}
        {loaded?.bookingsError && !loaded.error && (
          <p role="status" className="text-xs text-[#926018]">{loaded.bookingsError}</p>
        )}

        <div className={`overflow-x-auto ${loading ? "opacity-50" : ""}`} aria-busy={loading}>
          {loading && !schedule && <p className="py-10 text-center text-sm text-muted">Se încarcă orarul…</p>}
          {columns.length > 0 && (
            <div style={{ minWidth: 56 + columns.length * 200 }}>
              <div className="flex text-[14px] leading-[1.4] font-semibold">
                <p className="w-14 shrink-0 text-[10px] text-muted">ORA</p>
                {columns.map((f) => (
                  <p key={f.facilityId} className="min-w-0 flex-1 truncate pr-2 text-heading">
                    {f.name}
                    {lanes.has(f.facilityId) && ` · ${POOL_LANES} culoare`}
                  </p>
                ))}
              </div>

              {/* Grila: prima coloană are orele, apoi câte o coloană pe facilitate.
                  Blocurile sunt poziționate pe verticală după oră (1 oră = ROW px). */}
              <div className="mt-2 flex" style={{ height: HOUR_COUNT * ROW }}>
                <div className="relative w-14 shrink-0">
                  {Array.from({ length: HOUR_COUNT + 1 }, (_, i) => (
                    <span
                      key={i}
                      className="absolute left-0 text-[11px] leading-[1.4] text-muted"
                      style={{ top: i === HOUR_COUNT ? HOUR_COUNT * ROW - 15 : i * ROW + 4 }}
                    >
                      {hourLabel(DAY_START_HOUR + i)}
                    </span>
                  ))}
                </div>

                {columns.map((facility, columnIndex) => {
                  const blocks = entryBlocks(schedule?.entries ?? [], facility.facilityId, day);
                  const hasLanes = lanes.has(facility.facilityId);
                  return (
                    <div
                      key={facility.facilityId}
                      className={`relative min-w-0 flex-1 border-l border-[#dde5e2] ${
                        columnIndex === columns.length - 1 ? "border-r" : ""
                      }`}
                    >
                      {Array.from({ length: HOUR_COUNT + 1 }, (_, i) => (
                        // ultima linie (21:00) stă cu 1px mai sus, ca să rămână în interiorul grilei
                        <div key={i} className="absolute inset-x-0 h-px bg-[#dde5e2]" style={{ top: Math.min(i * ROW, HOUR_COUNT * ROW - 1) }} />
                      ))}

                      {/* Bazinul: în loc de rezervări individuale arătăm câte culoare sunt libere pe oră. */}
                      {hasLanes &&
                        freeLanesByHour(bookings, blocks, facility.facilityId, day).map((free, hour) =>
                          free === null ? null : (
                            <p
                              key={hour}
                              className={`absolute left-[14px] text-[11px] leading-[1.4] ${free === 0 ? "text-[#ac443c]" : "text-primary"}`}
                              style={{ top: hour * ROW + (ROW - 15) / 2 }}
                            >
                              {free} / {POOL_LANES} culoare libere
                            </p>
                          ),
                        )}

                      {/* Blocările USV: cursuri, evenimente, mentenanță, reparații. */}
                      {blocks.map(({ entry, from, to, index, of }) => {
                        const style = BLOCK_STYLES[entry.blockType];
                        const incidentCode =
                          entry.blockType === "repair" && incident && entry.incidentId === incident.id ? incident.code : null;
                        const className = `absolute flex flex-col gap-0.5 overflow-hidden rounded-[7px] px-[10px] py-1 leading-[1.4] ${style.box}`;
                        // Blocurile suprapuse (ex. o blocare peste un eveniment) stau unul lângă altul.
                        const position = {
                          top: from * ROW + 3,
                          height: (to - from) * ROW - 6,
                          left: `calc(5px + ${index} * (100% - 10px) / ${of})`,
                          width: `calc((100% - 10px) / ${of} - ${of > 1 ? 4 : 0}px)`,
                        };
                        const content = (
                          <>
                            <p className="truncate text-xs font-semibold">{entry.title}</p>
                            <p className="truncate text-[11px]">
                              {formatTimeRange(entry.startTime, entry.endTime)}
                              {incidentCode && ` · ${incidentCode}`} · {style.label}
                            </p>
                          </>
                        );
                        // Cursurile și evenimentele USV se deschid în „Gestionează activitatea USV”.
                        // Id-ul vine de la server, dar a fost deja verificat în api.ts și e codificat în adresă.
                        if (entry.activityId) {
                          const query = new URLSearchParams(facilityFilter ? { zi: day, facilitate: facilityFilter } : { zi: day });
                          return (
                            <Link
                              key={`${entry.startTime}-${entry.title}`}
                              to={`/admin/orar/activitati/${encodeURIComponent(entry.activityId)}?${query.toString()}`}
                              title="Gestionează activitatea"
                              className={`${className} hover:brightness-95 focus-visible:outline-2 focus-visible:outline-primary`}
                              style={position}
                            >
                              {content}
                            </Link>
                          );
                        }
                        return (
                          <div key={`${entry.startTime}-${entry.title}`} className={className} style={position}>
                            {content}
                          </div>
                        );
                      })}

                      {/* Rezervările: click = selectare (detaliile apar dedesubt). Textele vin de la
                          server, dar React le afișează ca text simplu, deci nu pot rula cod (XSS). */}
                      {!hasLanes &&
                        bookingBlocks(bookings, facility.facilityId, day).map(({ booking, from, to, index, of }) => {
                          const isSelected = booking.id === selectedId;
                          return (
                            <button
                              key={booking.id}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => setSelectedId(isSelected ? null : booking.id)}
                              className={`absolute flex flex-col gap-0.5 overflow-hidden rounded-[7px] px-[10px] py-1 text-left leading-[1.4] ${
                                isSelected ? "bg-primary text-white" : "bg-[#e7f2ef] text-primary hover:bg-[#d7ebe6]"
                              }`}
                              style={{
                                top: from * ROW + 3,
                                height: (to - from) * ROW - 6,
                                left: `calc(5px + ${index} * (100% - 10px) / ${of})`,
                                width: `calc((100% - 10px) / ${of} - ${of > 1 ? 4 : 0}px)`,
                              }}
                            >
                              <span className="w-full truncate text-xs font-semibold">{booking.userName ?? "Rezervare"}</span>
                              <span className="w-full truncate text-[11px]">
                                {formatTimeRange(booking.startTime, booking.endTime)} · {booking.code}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!loading && schedule && columns.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">Nicio facilitate de afișat.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-3 text-[11px] leading-[1.4] font-medium">
          <span className="rounded-xl bg-[#e7f2ef] px-2 py-1 text-primary">Rezervare</span>
          <span className="rounded-xl bg-primary px-2 py-1 text-white">Selectată</span>
          <span className="rounded-xl bg-[#e9edf5] px-2 py-1 text-[#4a5879]">Curs / eveniment USV</span>
          <span className="rounded-xl bg-[#fcedea] px-2 py-1 text-[#ac443c]">Mentenanță</span>
        </div>
      </Card>

      {/* Sub orar: rezervarea selectată și regula bazinului. */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <Card className="flex min-w-0 flex-1 flex-col gap-2.5 p-4 leading-[1.4]">
          <p className="text-[10px] font-bold text-primary">REZERVARE SELECTATĂ</p>
          {selected ? (
            <>
              <p className="text-lg text-heading">
                {selected.userName ?? "Rezervare"} · {selected.facilityName}
              </p>
              <p className="text-sm text-muted">
                {formatDayMonth(day)} · {formatTimeRange(selected.startTime, selected.endTime)} ·{" "}
                {BOOKING_STATUS[selected.status]}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">Alege o rezervare din orar ca să vezi detaliile.</p>
          )}
          <div className="mt-1 flex flex-wrap gap-3">
            <button
              type="button"
              disabled
              title={NOT_READY}
              className="rounded-[7px] bg-primary px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Vezi detaliile rezervării
            </button>
            <button type="button" disabled title={NOT_READY} className={toolButton}>
              Gestionează blocările
            </button>
          </div>
        </Card>

        {columns.some((f) => lanes.has(f.facilityId)) && (
          <section className="flex min-w-0 flex-1 flex-col gap-2.5 rounded-xl bg-[#e7f2ef] p-4 leading-[1.4] text-primary">
            <p className="text-lg">Bazin · {POOL_LANES} culoare independente</p>
            <p className="text-[13px]">
              Fiecare culoar poate avea o singură rezervare într-un interval de 60 minute. Maximum {POOL_LANES} rezervări
              simultane în bazin.
            </p>
            <p className="text-xs">Alege facilitatea Bazin pentru a vedea rezervările și disponibilitatea pe fiecare culoar.</p>
          </section>
        )}
      </div>
    </>
  );
}
