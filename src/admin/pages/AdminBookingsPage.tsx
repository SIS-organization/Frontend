// Pagina „Rezervări” (/admin/rezervari): lista tuturor rezervărilor, pe mai multe zile.
//
// Spre deosebire de orar (o singură zi, pe ore), aici administratorul:
//   - caută după nume sau cod (ex. USV-1130-185);
//   - filtrează după facilitate și perioadă;
//   - deschide detaliile unei rezervări sau o anulează (aceleași ferestre ca în orar).
// Datele vin din GET /admin/bookings (tab, q, facilityId, from, to, page, pageSize).
//
// Fila și filtrele stau în adresă (?fila=&cauta=&facilitate=&de=&pana=&pagina=), ca pagina
// să poată fi reîncărcată sau trimisă altcuiva; fiecare valoare e verificată înainte de folosire.
// File: „Viitoare” (implicită), „Istoric” (rezervările încheiate) și „Anulate” (cine, când și de ce).

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/useAuth";
import { ID_PATTERN } from "../activityForm";
import { COMING_SOON } from "../adminNav";
import {
  SEARCH_MAX,
  getAdminBookingsPage,
  getFacilityKinds,
  type AdminBooking,
  type BookingsPage,
  type BookingsTab,
  type FacilityKind,
} from "../api";
import { BOOKING_STATUS, BOOKING_STATUS_TONE, CANCELLED_BY_LABEL, ROLE_LABEL } from "../bookingText";
import { Card, DateInput, Select, input, secondaryButton } from "../components/ActivityForm";
import BookingDetailsDialog from "../components/BookingDetailsDialog";
import CancelBookingDialog from "../components/CancelBookingDialog";
import { bucharestParts, formatClock, formatDayMonth, formatTimeRange, formatWeekday, isValidIsoDate } from "../time";

/** Câte rezervări pe pagină. */
const PAGE_SIZE = 20;
/** Cât așteptăm după ultima tastă înainte de căutare (ms). */
const SEARCH_DELAY = 350;
/** Statusurile în care o rezervare mai poate fi anulată de administrator. */
const CANCELLABLE: readonly AdminBooking["status"][] = ["confirmed", "in_verification", "awaiting_transfer"];

/**
 * Filele paginii. `param` = valoarea din adresă (?fila=); `empty` = textul când lista e goală.
 * `ready: false` = fila apare, dar e inactivă (toate sunt implementate acum).
 */
const TABS: { value: BookingsTab; param: string | null; label: string; ready: boolean; empty: string }[] = [
  { value: "upcoming", param: null, label: "Viitoare", ready: true, empty: "rezervări viitoare" },
  { value: "history", param: "istoric", label: "Istoric", ready: true, empty: "rezervări încheiate" },
  { value: "cancelled", param: "anulate", label: "Anulate", ready: true, empty: "rezervări anulate" },
];

/** Mesajul pentru administrator, după eroarea primită de la server. */
function describeError(error: unknown) {
  if (error instanceof ApiError && error.status === 403) return "Contul tău nu mai are drepturi de administrator.";
  if (error instanceof ApiError && (error.status === 404 || error.status === 501)) {
    return "Serverul nu oferă încă lista de rezervări (/admin/bookings).";
  }
  return error instanceof Error ? error.message : "Rezervările nu au putut fi încărcate.";
}

/** „Luni, 30 noiembrie” pentru începutul rezervării. */
function dayLabel(iso: string) {
  const { date } = bucharestParts(iso);
  return `${formatWeekday(date)}, ${formatDayMonth(date)}`;
}

export default function AdminBookingsPage() {
  const { logout } = useAuth();
  const [params, setParams] = useSearchParams();

  // Filtrele din adresă, verificate (o valoare greșită e ignorată, nu trimisă la server).
  const q = (params.get("cauta") ?? "").slice(0, SEARCH_MAX);
  const rawFacility = params.get("facilitate");
  const facilityId = rawFacility && ID_PATTERN.test(rawFacility) ? rawFacility : null;
  const rawFrom = params.get("de");
  const rawTo = params.get("pana");
  const from = isValidIsoDate(rawFrom) ? rawFrom : null;
  const to = isValidIsoDate(rawTo) && (!from || rawTo >= from) ? rawTo : null;
  const rawPage = Number(params.get("pagina") ?? 1);
  const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 1000 ? rawPage : 1;
  // Fila din adresă; o valoare necunoscută sau o filă încă inactivă duce la „Viitoare”.
  const tabInfo = TABS.find((t) => t.ready && t.param !== null && t.param === params.get("fila")) ?? TABS[0];
  const tab = tabInfo.value;

  const [facilities, setFacilities] = useState<FacilityKind[]>([]);
  // Textul din căutare se trimite cu o mică întârziere, ca să nu facem o cerere la fiecare tastă.
  const [searchText, setSearchText] = useState(q);
  // Dacă adresa se schimbă din altă parte (Înapoi / Înainte în browser), căutarea o urmează.
  const [syncedQ, setSyncedQ] = useState(q);
  if (q !== syncedQ) {
    setSyncedQ(q);
    setSearchText(q);
  }
  const [reload, setReload] = useState(0);
  const requestKey = JSON.stringify([tab, q, facilityId, from, to, page, reload]);
  const [result, setResult] = useState<{ key: string; data: BookingsPage | null; error: string | null } | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const closeDetails = useCallback(() => setDetailsId(null), []);
  const [cancelTarget, setCancelTarget] = useState<AdminBooking | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Momentul deschiderii paginii: ascundem „Anulează” la rezervările deja încheiate.
  const [openedAt] = useState(() => Date.now());

  /** Schimbă unul sau mai multe filtre din adresă; orice filtru nou duce la pagina 1. */
  const setFilters = useCallback(
    (next: Record<string, string | null>, keepPage = false) => {
      setParams(
        (current) => {
          const search = new URLSearchParams(current);
          for (const [key, value] of Object.entries(next)) {
            if (value) search.set(key, value);
            else search.delete(key);
          }
          if (!keepPage) search.delete("pagina");
          return search;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Lista facilităților pentru filtru (o singură dată).
  useEffect(() => {
    const controller = new AbortController();
    getFacilityKinds(controller.signal)
      .then(setFacilities)
      .catch((err: unknown) => {
        if (!controller.signal.aborted && err instanceof ApiError && err.status === 401) logout();
      });
    return () => controller.abort();
  }, [logout]);

  // Căutarea: după o scurtă pauză în tastare, textul ajunge în adresă (și declanșează cererea).
  useEffect(() => {
    const trimmed = searchText.trim();
    if (trimmed === q) return;
    const timer = window.setTimeout(() => setFilters({ cauta: trimmed || null }), SEARCH_DELAY);
    return () => window.clearTimeout(timer);
  }, [searchText, q, setFilters]);

  // Rezervările paginii curente; se reîncarcă la orice schimbare de filtru sau după o anulare.
  useEffect(() => {
    const controller = new AbortController();
    getAdminBookingsPage({ tab, q, facilityId, from, to, page, pageSize: PAGE_SIZE }, controller.signal)
      .then((data) => setResult({ key: requestKey, data, error: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) logout();
        else setResult({ key: requestKey, data: null, error: describeError(err) });
      });
    return () => controller.abort();
    // `requestKey` conține deja toate valorile folosite mai sus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, logout]);

  const current = result && result.key === requestKey ? result : null;
  // Cât se încarcă pagina nouă, păstrăm vizibil rezultatul anterior (estompat).
  const shown = current ?? result;
  const data = shown?.data ?? null;
  const loading = !current;
  const hasFilters = Boolean(q || facilityId || from || to);

  const firstIndex = data && data.totalItems > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastIndex = data ? Math.min(data.page * data.pageSize, data.totalItems) : 0;

  return (
    <>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="text-[11px] font-bold text-primary">ADMINISTRATORUL BAZEI SPORTIVE</p>
        <h1 className="text-[28px] leading-[1.16] text-heading">Rezervări</h1>
        <p className="max-w-[710px] text-[13px] leading-normal text-muted">
          Caută, verifică și gestionează rezervările tuturor utilizatorilor, pe orice perioadă.
        </p>
      </div>

      {notice && (
        <p role="status" className="rounded-lg bg-[#e7f2ef] px-4 py-3 text-sm text-primary">
          {notice}
        </p>
      )}

      <Card className="flex flex-col gap-4 p-5">
        {/* Filele (cu contoarele primite de la server). */}
        <div role="tablist" aria-label="Rezervări" className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const active = t.value === tab;
            const total = data?.counts[t.value];
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={!t.ready}
                title={t.ready ? undefined : COMING_SOON}
                // Schimbarea filei păstrează căutarea și filtrele, dar revine la pagina 1.
                onClick={() => {
                  setNotice(null);
                  setFilters({ fila: t.param });
                }}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                  active ? "border-primary bg-primary text-white" : "border-[#dde5e2] bg-white text-heading"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {t.label}
                {typeof total === "number" && ` · ${total}`}
              </button>
            );
          })}
        </div>

        {/* Filtrele. */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[240px] flex-[2] flex-col gap-1.5">
            <label htmlFor="bookings-search" className="text-xs font-semibold text-muted">
              Caută
            </label>
            <input
              id="bookings-search"
              type="search"
              className={input}
              value={searchText}
              maxLength={SEARCH_MAX}
              placeholder="Nume sau cod (ex. USV-1130-185)"
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
            <label htmlFor="bookings-facility" className="text-xs font-semibold text-muted">
              Facilitate
            </label>
            <Select
              id="bookings-facility"
              value={facilityId ?? ""}
              onChange={(e) => setFilters({ facilitate: e.target.value || null })}
            >
              <option value="">Toate facilitățile</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex w-[160px] flex-col gap-1.5">
            <label htmlFor="bookings-from" className="text-xs font-semibold text-muted">
              De la
            </label>
            <DateInput short id="bookings-from" value={from ?? ""} min="2020-01-01" onChange={(v) => setFilters({ de: v, pana: to && to < v ? null : to })} />
          </div>
          <div className="flex w-[160px] flex-col gap-1.5">
            <label htmlFor="bookings-to" className="text-xs font-semibold text-muted">
              Până la
            </label>
            <DateInput short id="bookings-to" value={to ?? ""} min={from ?? "2020-01-01"} onChange={(v) => setFilters({ pana: v })} />
          </div>
          <button
            type="button"
            className={secondaryButton}
            disabled={!hasFilters && !searchText}
            onClick={() => {
              setSearchText("");
              setFilters({ cauta: null, facilitate: null, de: null, pana: null });
            }}
          >
            Resetează filtrele
          </button>
        </div>

        {shown?.error && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-[#fcedea] px-4 py-3 text-sm text-[#ac443c]">
            {shown.error}
            <button type="button" className={secondaryButton} onClick={() => setReload((n) => n + 1)}>
              Reîncearcă
            </button>
          </div>
        )}

        {/* Tabelul. Textele vin de la server, dar React le afișează ca text simplu (fără HTML). */}
        <div className={`overflow-x-auto ${loading && data ? "opacity-50" : ""}`} aria-busy={loading}>
          {!data && !shown?.error && <p className="py-10 text-center text-sm text-muted">Se încarcă rezervările…</p>}
          {data && data.items.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">
              {hasFilters ? `Nicio rezervare din „${tabInfo.label}” nu corespunde filtrelor alese.` : `Nu există ${tabInfo.empty}.`}
            </p>
          )}
          {data && data.items.length > 0 && (
            <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#dde5e2] text-xs text-muted">
                  <th scope="col" className="py-2 pr-3 font-semibold">Cod</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Persoană</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Facilitate</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Data și ora</th>
                  {/* În „Anulate” statusul e mereu „Anulată”; arătăm în schimb detaliile anulării. */}
                  <th scope="col" className="py-2 pr-3 font-semibold">{tab === "cancelled" ? "Anulare" : "Status"}</th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    <span className="sr-only">Acțiuni</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((b) => (
                  <tr key={b.id} className="border-b border-[#eef3f1] last:border-0">
                    <td className="py-3 pr-3 font-semibold whitespace-nowrap text-heading">{b.code}</td>
                    <td className="py-3 pr-3">
                      <span className="block text-heading">{b.userName ?? "—"}</span>
                      {b.userRole && <span className="text-xs text-muted">{ROLE_LABEL[b.userRole] ?? b.userRole}</span>}
                    </td>
                    <td className="py-3 pr-3 text-heading">{b.facilityName}</td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <span className="block text-heading">{dayLabel(b.startTime)}</span>
                      <span className="text-xs text-muted">{formatTimeRange(b.startTime, b.endTime)}</span>
                    </td>
                    {tab === "cancelled" ? (
                      <td className="max-w-[320px] py-3 pr-3">
                        <span className="block text-heading">
                          Anulată {b.cancelledBy ? CANCELLED_BY_LABEL[b.cancelledBy] : ""}
                        </span>
                        {b.cancelledAt && (
                          <span className="block text-xs text-muted">
                            {formatDayMonth(bucharestParts(b.cancelledAt).date)} · {formatClock(b.cancelledAt)}
                          </span>
                        )}
                        {/* Motivul poate fi lung: îl tăiem la un rând, textul complet e în title și în Detalii. */}
                        {b.cancelReason && (
                          <span className="block truncate text-xs text-muted" title={b.cancelReason}>
                            Motiv: {b.cancelReason}
                          </span>
                        )}
                      </td>
                    ) : (
                      <td className="py-3 pr-3">
                        <span className={`rounded-md px-2 py-1 text-xs font-semibold whitespace-nowrap ${BOOKING_STATUS_TONE[b.status]}`}>
                          {BOOKING_STATUS[b.status]}
                        </span>
                      </td>
                    )}
                    <td className="py-3 text-right whitespace-nowrap">
                      <span className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailsId(b.id)}
                          aria-label={`Detalii pentru rezervarea ${b.code}`}
                          className="rounded-[7px] bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                        >
                          Detalii
                        </button>
                        {/* Doar la rezervările viitoare active (în Istoric s-au încheiat deja). */}
                        {tab === "upcoming" && CANCELLABLE.includes(b.status) && Date.parse(b.endTime) > openedAt && (
                          <button
                            type="button"
                            onClick={() => {
                              setNotice(null);
                              setCancelTarget(b);
                            }}
                            aria-label={`Anulează rezervarea ${b.code}`}
                            className="rounded-[7px] border border-[#f0c9c3] bg-white px-3 py-1.5 text-xs font-semibold text-[#ac443c] hover:bg-[#fcedea]"
                          >
                            Anulează
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginarea. */}
        {data && data.totalItems > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
            <p>
              {firstIndex}–{lastIndex} din {data.totalItems} {data.totalItems === 1 ? "rezervare" : "rezervări"}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={secondaryButton}
                disabled={data.page <= 1 || loading}
                onClick={() => setFilters({ pagina: data.page - 1 > 1 ? String(data.page - 1) : null }, true)}
              >
                ← Anterioara
              </button>
              <span>
                Pagina {data.page} din {data.totalPages}
              </span>
              <button
                type="button"
                className={secondaryButton}
                disabled={data.page >= data.totalPages || loading}
                onClick={() => setFilters({ pagina: String(data.page + 1) }, true)}
              >
                Următoarea →
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Ferestrele refolosite din orar. 401 → delogare. */}
      <BookingDetailsDialog bookingId={detailsId} onClose={closeDetails} onUnauthorized={logout} />
      {cancelTarget && (
        <CancelBookingDialog
          booking={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onUnauthorized={logout}
          onCancelled={(booking, outcome) => {
            setCancelTarget(null);
            setNotice(
              `Rezervarea ${booking.code} (${booking.userName ?? "fără nume"}) a fost anulată, iar persoana a fost notificată cu motivul.` +
                (outcome.quotaRestored ? " Cota lunară i-a fost restituită." : ""),
            );
            setReload((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
