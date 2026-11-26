// Pagina „Rezervări” (/admin/rezervari): lista tuturor rezervărilor, pe mai multe zile.
//
// Spre deosebire de orar (o singură zi, pe ore), aici administratorul:
//   - caută după nume sau cod (ex. USV-1130-185);
//   - filtrează după facilitate și perioadă;
//   - deschide detaliile unei rezervări sau o anulează (aceleași ferestre ca în orar);
//   - vede lista de așteptare și exportă lista afișată.
//
// File:
//   - Viitoare / Istoric / Anulate → GET /admin/bookings?tab=…
//   - Lista de așteptare            → GET /admin/waitlist (contoarele vin din /admin/bookings)
// Export („Exportă lista”):
//   - rezervări → GET /admin/bookings/export (fila, perioada, facilitatea; fără căutare);
//   - lista de așteptare → fișier CSV generat în browser (contractul nu are export pentru ea).
//
// Fila și filtrele stau în adresă (?fila=&cauta=&facilitate=&de=&pana=&pagina=), ca pagina
// să poată fi reîncărcată sau trimisă altcuiva; fiecare valoare e verificată înainte de folosire.

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/useAuth";
import { ID_PATTERN } from "../activityForm";
import {
  SEARCH_MAX,
  exportBookings,
  getAdminBookingsPage,
  getAdminWaitlistPage,
  getAllWaitlist,
  getFacilityKinds,
  type AdminBooking,
  type BookingsPage,
  type BookingsTab,
  type FacilityKind,
  type WaitlistItem,
} from "../api";
import { BOOKING_STATUS, BOOKING_STATUS_TONE, CANCELLED_BY_LABEL, ROLE_LABEL, WAITLIST_STATUS } from "../bookingText";
import { Card, DateInput, Select, input, secondaryButton } from "../components/ActivityForm";
import BookingDetailsDialog from "../components/BookingDetailsDialog";
import CancelBookingDialog from "../components/CancelBookingDialog";
import WaitlistDetailsDialog from "../components/WaitlistDetailsDialog";
import { buildCsv, saveFile } from "../download";
import { bucharestParts, formatClock, formatDayMonth, formatTimeRange, formatWeekday, isValidIsoDate, todayInBucharest } from "../time";

/** Câte înregistrări pe pagină. */
const PAGE_SIZE = 20;
/** Cât așteptăm după ultima tastă înainte de căutare (ms). */
const SEARCH_DELAY = 350;
/** Câte numere de pagină arătăm în paginare (în jurul paginii curente). */
const PAGE_WINDOW = 5;
/** Statusurile în care o rezervare mai poate fi anulată de administrator. */
const CANCELLABLE: readonly AdminBooking["status"][] = ["confirmed", "in_verification", "awaiting_transfer"];

/** Filele paginii: cele trei de rezervări și lista de așteptare. */
type PageTab = BookingsTab | "waitlist";

/**
 * Filele paginii. `param` = valoarea din adresă (?fila=); `title` = titlul paginii pe filă
 * (ca în Figma, fiecare filă are titlul ei); `empty` = textul când lista e goală.
 */
const TABS: { value: PageTab; param: string | null; label: string; title: string; empty: string }[] = [
  { value: "upcoming", param: null, label: "Viitoare", title: "Rezervări", empty: "rezervări viitoare" },
  { value: "history", param: "istoric", label: "Istoric", title: "Istoricul rezervărilor", empty: "rezervări încheiate" },
  { value: "cancelled", param: "anulate", label: "Anulate", title: "Rezervări anulate", empty: "rezervări anulate" },
  { value: "waitlist", param: "asteptare", label: "Lista de așteptare", title: "Lista de așteptare", empty: "înscrieri pe lista de așteptare" },
];

/** Ce arată pagina după încărcare (rezervări sau lista de așteptare), cu paginarea și contoarele. */
type ListView = {
  counts: BookingsPage["counts"];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  bookings: AdminBooking[];
  waitlist: WaitlistItem[];
};

/** Mesajul pentru administrator, după eroarea primită de la server. */
function describeError(error: unknown) {
  if (error instanceof ApiError && error.status === 403) return "Contul tău nu mai are drepturi de administrator.";
  if (error instanceof ApiError && (error.status === 404 || error.status === 501)) {
    return "Serverul nu oferă încă această listă.";
  }
  return error instanceof Error ? error.message : "Lista nu a putut fi încărcată.";
}

/** „Luni, 30 noiembrie” pentru începutul rezervării. */
function dayLabel(iso: string) {
  const { date } = bucharestParts(iso);
  return `${formatWeekday(date)}, ${formatDayMonth(date)}`;
}

/** „20 oct. · 17:00–18:00” (coloana „Dată / interval” din lista de așteptare). */
function shortSlot(startIso: string, endIso: string) {
  const { date } = bucharestParts(startIso);
  const short = new Date(`${date}T12:00:00Z`).toLocaleDateString("ro-RO", { timeZone: "UTC", day: "numeric", month: "short" });
  return `${short} · ${formatTimeRange(startIso, endIso)}`;
}

/** Numerele de pagină afișate (cel mult PAGE_WINDOW, în jurul paginii curente). */
function pageNumbers(page: number, totalPages: number) {
  const start = Math.max(1, Math.min(page - Math.floor(PAGE_WINDOW / 2), totalPages - PAGE_WINDOW + 1));
  return Array.from({ length: Math.min(PAGE_WINDOW, totalPages) }, (_, i) => start + i);
}

const th = "px-3 py-2.5 text-[10px] font-semibold tracking-wide text-muted uppercase";

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
  // Fila din adresă; o valoare necunoscută duce la „Viitoare”.
  const tabInfo = TABS.find((t) => t.param !== null && t.param === params.get("fila")) ?? TABS[0];
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
  const [result, setResult] = useState<{ key: string; view: ListView | null; error: string | null } | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const closeDetails = useCallback(() => setDetailsId(null), []);
  const [cancelTarget, setCancelTarget] = useState<AdminBooking | null>(null);
  const [waitlistEntry, setWaitlistEntry] = useState<WaitlistItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
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

  // Lista paginii curente; se reîncarcă la orice schimbare de filă / filtru sau după o anulare.
  useEffect(() => {
    const controller = new AbortController();
    const filters = { q, facilityId, from, to };
    const load: Promise<ListView> =
      tab === "waitlist"
        ? // Lista de așteptare + o cerere mică la rezervări, doar pentru contoarele filelor.
          Promise.all([
            getAdminWaitlistPage({ ...filters, page, pageSize: PAGE_SIZE }, controller.signal),
            getAdminBookingsPage({ ...filters, tab: "upcoming", page: 1, pageSize: 1 }, controller.signal),
          ]).then(([waitlist, bookings]) => ({ ...waitlist, counts: bookings.counts, bookings: [], waitlist: waitlist.items }))
        : getAdminBookingsPage({ ...filters, tab, page, pageSize: PAGE_SIZE }, controller.signal).then((data) => ({
            ...data,
            bookings: data.items,
            waitlist: [],
          }));
    load
      .then((view) => setResult({ key: requestKey, view, error: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) logout();
        else setResult({ key: requestKey, view: null, error: describeError(err) });
      });
    return () => controller.abort();
    // `requestKey` conține deja toate valorile folosite mai sus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, logout]);

  /**
   * „Exportă lista”: rezervările se exportă de pe server (fila, perioada, facilitatea);
   * lista de așteptare se citește complet și se salvează ca CSV din browser.
   */
  const exportList = async () => {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    setNotice(null);
    try {
      const day = todayInBucharest();
      if (tab === "waitlist") {
        const entries = await getAllWaitlist({ q, facilityId, from, to });
        const csv = buildCsv(
          ["Persoană", "Poziție", "Facilitate", "Început", "Sfârșit", "Stare", "Tip", "Rezervarea înlocuită", "Oferta expiră", "Înscrisă"],
          entries.map((w) => [
            w.userName,
            w.position,
            w.facilityName,
            w.startTime,
            w.endTime,
            WAITLIST_STATUS[w.status].label,
            w.replaceBookingId ? "Mutare" : "Rezervare nouă",
            w.replaceBookingId,
            w.offerExpiresAt,
            w.createdAt,
          ]),
        );
        saveFile(csv, `lista-asteptare-${day}.csv`);
      } else {
        const file = await exportBookings({ tab, facilityId, from, to });
        saveFile(file.blob, file.filename ?? `rezervari-${tab}-${day}.csv`);
        // Exportul serverului nu primește căutarea: spunem clar ce conține fișierul.
        if (q) setNotice("Fișierul conține toată fila pentru perioada și facilitatea alese; căutarea nu se aplică la export.");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else setExportError(err instanceof Error ? err.message : "Exportul nu a reușit.");
    } finally {
      setExporting(false);
    }
  };

  const current = result && result.key === requestKey ? result : null;
  // Cât se încarcă pagina nouă, păstrăm vizibil rezultatul anterior (estompat).
  const shown = current ?? result;
  const view = shown?.view ?? null;
  const loading = !current;
  const hasFilters = Boolean(q || facilityId || from || to);
  const rowCount = view ? (tab === "waitlist" ? view.waitlist.length : view.bookings.length) : 0;

  return (
    <>
      <div className="flex flex-col items-start gap-4 md:flex-row md:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-[11px] font-bold text-primary">ADMINISTRATORUL BAZEI SPORTIVE</p>
          <h1 className="text-[28px] leading-[1.16] text-heading">{tabInfo.title}</h1>
          <p className="max-w-[710px] text-[13px] leading-normal text-muted">
            Vizualizează programările campusului și gestionează excepțiile dintr-un singur loc.
          </p>
        </div>
        <button type="button" className={secondaryButton} disabled={exporting || !view} onClick={() => void exportList()}>
          {exporting ? "Se exportă…" : "Exportă lista"}
        </button>
      </div>

      {notice && (
        <p role="status" className="rounded-lg bg-[#e7f2ef] px-4 py-3 text-sm text-primary">
          {notice}
        </p>
      )}
      {exportError && (
        <p role="alert" className="rounded-lg bg-[#fcedea] px-4 py-3 text-sm text-[#ac443c]">
          {exportError}
        </p>
      )}

      {/* Filele (cu contoarele primite de la server). */}
      <div role="tablist" aria-label="Rezervări" className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = t.value === tab;
          const total = view?.counts[t.value];
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              // Schimbarea filei păstrează căutarea și filtrele, dar revine la pagina 1.
              onClick={() => {
                setNotice(null);
                setExportError(null);
                setFilters({ fila: t.param });
              }}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                active ? "border-primary bg-primary text-white" : "border-[#dde5e2] bg-white text-heading hover:bg-bg"
              }`}
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
            placeholder={tab === "waitlist" ? "Caută după nume" : "Caută după nume sau cod"}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
          <label htmlFor="bookings-facility" className="text-xs font-semibold text-muted">
            Facilitate
          </label>
          <Select id="bookings-facility" value={facilityId ?? ""} onChange={(e) => setFilters({ facilitate: e.target.value || null })}>
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

      <Card className="flex flex-col gap-4 p-5">
        {shown?.error && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-[#fcedea] px-4 py-3 text-sm text-[#ac443c]">
            {shown.error}
            <button type="button" className={secondaryButton} onClick={() => setReload((n) => n + 1)}>
              Reîncearcă
            </button>
          </div>
        )}

        {/* Tabelul. Textele vin de la server, dar React le afișează ca text simplu (fără HTML). */}
        <div className={`overflow-x-auto ${loading && view ? "opacity-50" : ""}`} aria-busy={loading}>
          {!view && !shown?.error && <p className="py-10 text-center text-sm text-muted">Se încarcă lista…</p>}
          {view && rowCount === 0 && (
            <p className="py-10 text-center text-sm text-muted">
              {hasFilters ? `Nicio înregistrare din „${tabInfo.label}” nu corespunde filtrelor alese.` : `Nu există ${tabInfo.empty}.`}
            </p>
          )}

          {/* Lista de așteptare (coloanele din Figma). */}
          {view && tab === "waitlist" && rowCount > 0 && (
            <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="bg-[#eef3f1]">
                  <th scope="col" className={th}>Utilizator / poziție</th>
                  <th scope="col" className={th}>Facilitate</th>
                  <th scope="col" className={th}>Dată / interval</th>
                  <th scope="col" className={th}>Stare</th>
                  <th scope="col" className={th}>Acțiune</th>
                </tr>
              </thead>
              <tbody>
                {view.waitlist.map((w) => (
                  <tr key={w.id} className="border-b border-[#eef3f1] last:border-0">
                    <td className="px-3 py-3 font-semibold text-heading">
                      {w.userName ?? "—"}
                      {w.position && ` · #${w.position}`}
                    </td>
                    <td className="px-3 py-3 text-heading">{w.facilityName}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-heading">{shortSlot(w.startTime, w.endTime)}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-md px-2 py-1 text-xs font-semibold whitespace-nowrap ${WAITLIST_STATUS[w.status].tone}`}>
                        {WAITLIST_STATUS[w.status].label}
                      </span>
                      {/* La o ofertă trimisă contează până când poate răspunde persoana. */}
                      {w.status === "offered" && w.offerExpiresAt && (
                        <span className="mt-1 block text-xs text-muted">expiră la {formatClock(w.offerExpiresAt)}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setWaitlistEntry(w)}
                        className="text-xs font-semibold whitespace-nowrap text-primary hover:underline"
                      >
                        Vezi solicitarea →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Rezervările (Viitoare / Istoric / Anulate). */}
          {view && tab !== "waitlist" && rowCount > 0 && (
            <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="bg-[#eef3f1]">
                  <th scope="col" className={th}>Cod</th>
                  <th scope="col" className={th}>Persoană</th>
                  <th scope="col" className={th}>Facilitate</th>
                  <th scope="col" className={th}>Dată / interval</th>
                  {/* În „Anulate” statusul e mereu „Anulată”; arătăm în schimb detaliile anulării. */}
                  <th scope="col" className={th}>{tab === "cancelled" ? "Anulare" : "Status"}</th>
                  <th scope="col" className={`${th} text-right`}>Acțiune</th>
                </tr>
              </thead>
              <tbody>
                {view.bookings.map((b) => (
                  <tr key={b.id} className="border-b border-[#eef3f1] last:border-0">
                    <td className="px-3 py-3 font-semibold whitespace-nowrap text-heading">{b.code}</td>
                    <td className="px-3 py-3">
                      <span className="block text-heading">{b.userName ?? "—"}</span>
                      {b.userRole && <span className="text-xs text-muted">{ROLE_LABEL[b.userRole] ?? b.userRole}</span>}
                    </td>
                    <td className="px-3 py-3 text-heading">{b.facilityName}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="block text-heading">{dayLabel(b.startTime)}</span>
                      <span className="text-xs text-muted">{formatTimeRange(b.startTime, b.endTime)}</span>
                    </td>
                    {tab === "cancelled" ? (
                      <td className="max-w-[320px] px-3 py-3">
                        <span className="block text-heading">Anulată {b.cancelledBy ? CANCELLED_BY_LABEL[b.cancelledBy] : ""}</span>
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
                      <td className="px-3 py-3">
                        <span className={`rounded-md px-2 py-1 text-xs font-semibold whitespace-nowrap ${BOOKING_STATUS_TONE[b.status]}`}>
                          {BOOKING_STATUS[b.status]}
                        </span>
                      </td>
                    )}
                    <td className="px-3 py-3 text-right whitespace-nowrap">
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
      </Card>

      {/* Paginarea (ca în Figma): „3 din 3 înregistrări · Campus USV”, „← Înapoi”, pagini, „Înainte →”. */}
      {view && view.totalItems > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <p>
            {rowCount} din {view.totalItems} {view.totalItems === 1 ? "înregistrare" : "înregistrări"} · Campus USV
          </p>
          <nav aria-label="Paginare" className="flex items-center gap-2">
            <button
              type="button"
              className={secondaryButton}
              disabled={view.page <= 1 || loading}
              onClick={() => setFilters({ pagina: view.page - 1 > 1 ? String(view.page - 1) : null }, true)}
            >
              ← Înapoi
            </button>
            {pageNumbers(view.page, view.totalPages).map((n) => (
              <button
                key={n}
                type="button"
                aria-current={n === view.page ? "page" : undefined}
                disabled={loading}
                onClick={() => setFilters({ pagina: n > 1 ? String(n) : null }, true)}
                className={`flex size-10 items-center justify-center rounded-lg text-[13px] font-semibold ${
                  n === view.page ? "bg-primary text-white" : "border border-[#dde5e2] bg-white text-heading hover:bg-bg"
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className={secondaryButton}
              disabled={view.page >= view.totalPages || loading}
              onClick={() => setFilters({ pagina: String(view.page + 1) }, true)}
            >
              Înainte →
            </button>
          </nav>
        </div>
      )}

      {/* Ferestrele (detalii și anulare refolosite din orar; solicitarea de pe lista de așteptare). */}
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
                (outcome.quotaRestored ? " Cota lunară i-a fost restituită." : "") +
                (outcome.waitlistNotified > 0 ? " Locul a fost oferit primei persoane de pe lista de așteptare." : ""),
            );
            setReload((n) => n + 1);
          }}
        />
      )}
      {waitlistEntry && (
        <WaitlistDetailsDialog
          entry={waitlistEntry}
          onClose={() => setWaitlistEntry(null)}
          onShowBooking={(bookingId) => {
            // O singură fereastră deschisă odată: închidem solicitarea, deschidem rezervarea.
            setWaitlistEntry(null);
            setDetailsId(bookingId);
          }}
        />
      )}
    </>
  );
}
