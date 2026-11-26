import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRightIcon, DumbbellIcon, TargetIcon, VolleyballIcon, WavesIcon } from "../components/auth/LoginIcons";
import CancelBookingDialog from "../components/booking/CancelBookingDialog";
import QuotaCard from "../components/booking/QuotaCard";
import WaitlistCard from "../components/booking/WaitlistCard";
import { CheckCircleIcon, CheckIcon, DoorOpenIcon } from "../components/common/AppIcons";
import { useBookings } from "../context/useBookings";
import { useNow } from "../hooks/useNow";
import type { Booking } from "../types";
import {
  cardBandLabel,
  clockLabel,
  dateTile,
  dayMonthYearLabel,
  facilityKind,
  fullDateUpper,
  monthYearLabel,
  relativeDayLabel,
  weekdayName,
} from "../utils/bookingDisplay";
import { canCancelBooking } from "../utils/cancellation";
import { hourLabel } from "../utils/dates";
import { isBookingInProgress } from "../utils/releaseEarly";

type TabKey = "upcoming" | "history" | "waitlist";

// Bannerul „Rezervare confirmată” apare pentru o rezervare făcută în ultimele minute.
const CONFIRMATION_WINDOW_MS = 10 * 60 * 1000;

const interval = (b: Booking) => `${hourLabel(b.hour)}–${hourLabel(b.hour + 1)}`;
const startOf = (b: Booking) => new Date(`${b.date}T${hourLabel(b.hour)}:00`);

function FacilityIcon({ name, className }: { name: string; className?: string }) {
  switch (facilityKind(name)) {
    case "fitness":
      return <DumbbellIcon className={className} />;
    case "pool":
      return <WavesIcon className={className} />;
    case "field":
      return <TargetIcon className={className} />;
    default:
      return <VolleyballIcon className={className} />;
  }
}

function StatusPill({ status }: { status: Booking["status"] }) {
  if (status === "upcoming") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[#e3f0ee] px-2 py-1 text-[11px] font-semibold text-primary">
        <CheckIcon className="size-3" />
        Confirmată
      </span>
    );
  }
  if (status === "cancelled") {
    return <span className="rounded-md bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">Anulată</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-black/5 px-2 py-1 text-[11px] font-medium text-muted">
      <CheckIcon className="size-3" />
      Finalizată
    </span>
  );
}

function HistoryTable({ items }: { items: Booking[] }) {
  if (items.length === 0) {
    return <p className="rounded-2xl border border-black/10 bg-white p-6 text-sm text-muted">Nu ai încă rezervări în istoric.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead className="bg-[#eef0ec] text-[10px] uppercase tracking-wide text-muted">
          <tr>
            <th className="px-5 pb-6 pt-3 font-normal">Facilitate</th>
            <th className="px-5 pb-6 pt-3 font-normal">Data</th>
            <th className="px-5 pb-6 pt-3 font-normal">Interval</th>
            <th className="px-5 pb-6 pt-3 font-normal">Stare</th>
            <th className="px-5 pb-6 pt-3" />
          </tr>
        </thead>
        <tbody>
          {items.map((b) => (
            <tr key={b.id} className="border-t border-black/10">
              <td className="px-5 py-5 font-semibold text-heading">{b.facilityName}</td>
              <td className="px-5 py-5 text-muted">{dayMonthYearLabel(b.date)}</td>
              <td className="px-5 py-5 text-heading">{interval(b)}</td>
              <td className="px-5 py-5">
                <StatusPill status={b.status} />
              </td>
              <td className="px-5 py-5 text-right">
                <button type="button" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                  Detalii
                  <ArrowUpRightIcon className="size-3" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MyBookingsPage() {
  const [tab, setTab] = useState<TabKey>("upcoming");
  const { bookings, cancelBooking, releaseEarly, quota, quotaError, bookingsError, waitlist, leaveWaitlist } =
    useBookings();
  const now = useNow();
  const [toCancel, setToCancel] = useState<{ booking: Booking; canCancel: boolean } | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ text: string; error?: boolean } | null>(null);

  const upcoming = bookings
    .filter((b) => b.status === "upcoming")
    .sort((a, b) => startOf(a).getTime() - startOf(b).getTime());
  const history = bookings
    .filter((b) => b.status !== "upcoming")
    .sort((a, b) => startOf(b).getTime() - startOf(a).getTime());
  const [featured, ...others] = upcoming;

  const justConfirmed = upcoming
    .filter((b) => b.createdAt && now.getTime() - new Date(b.createdAt).getTime() < CONFIRMATION_WINDOW_MS)
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0];

  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: "upcoming", label: "Urmează", count: upcoming.length },
    { key: "history", label: "Istoric", count: history.length },
    { key: "waitlist", label: "Lista de așteptare", count: waitlist.length },
  ];

  const openCancelDialog = (booking: Booking) => {
    setActionResult(null);
    setToCancel({ booking, canCancel: canCancelBooking(booking, new Date()) });
  };

  const confirmCancel = async (booking: Booking) => {
    const { quotaRefunded } = await cancelBooking(booking.id);
    setToCancel(null);
    setActionResult({
      text: `Rezervarea ${booking.code} a fost anulată.${quotaRefunded ? " Ora a revenit în cota ta lunară." : ""}`,
    });
  };

  const handleReleaseEarly = async (booking: Booking) => {
    setActionResult(null);
    setReleasingId(booking.id);
    try {
      await releaseEarly(booking.id);
      setActionResult({
        text: `Ai eliberat restul intervalului pentru ${booking.code}. Următorul utilizator eligibil va fi anunțat.`,
      });
    } catch {
      setActionResult({ text: "Eliberarea nu a reușit. Încearcă din nou.", error: true });
    } finally {
      setReleasingId(null);
    }
  };

  // Ora de la care s-ar elibera locul: acum (rotunjit la 5 minute) dacă rezervarea a început, altfel la jumătatea ei.
  const releaseFrom = (b: Booking) => {
    const start = startOf(b);
    const from = isBookingInProgress(b, now) ? new Date(Math.ceil(now.getTime() / 300_000) * 300_000) : new Date(start.getTime() + 30 * 60_000);
    return clockLabel(from);
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Planurile tale, într-un singur loc</p>
          <h1 className="mt-2 text-[38px] leading-tight font-normal tracking-tight text-heading">Programările mele</h1>
          <p className="mt-2 text-[15px] text-muted">Totul e pregătit. Vezi rezervările, gestionează timpul și lasă loc și altora.</p>
        </div>
        <Link
          to="/"
          className="inline-flex h-11 items-center gap-3 rounded-lg border border-black/10 bg-white px-[18px] text-[13px] font-semibold text-heading hover:bg-bg"
        >
          Explorează facilitățile
          <ArrowUpRightIcon className="size-4" />
        </Link>
      </div>

      {justConfirmed && (
        <section className="mt-7 flex items-center gap-4 rounded-xl bg-[#e6f1ef] px-5 py-4">
          <CheckCircleIcon className="size-6 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] text-heading">Rezervare confirmată. Ne vedem la antrenament!</p>
            <p className="mt-0.5 text-[12px] text-primary">
              {justConfirmed.facilityName} · {dayMonthYearLabel(justConfirmed.date).replace(/ \d{4}$/, "")},{" "}
              {interval(justConfirmed)} · Confirmarea a fost trimisă prin e-mail și push.
            </p>
          </div>
          <span className="hidden text-[12px] font-semibold text-primary sm:inline">{justConfirmed.code}</span>
        </section>
      )}

      {bookingsError && (
        <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          Nu am putut încărca rezervările. Reîncarcă pagina ca să încerci din nou.
        </p>
      )}
      {actionResult && (
        <p
          role={actionResult.error ? "alert" : "status"}
          className={`mt-5 rounded-xl px-4 py-3 text-sm ${actionResult.error ? "bg-red-50 text-red-700" : "bg-[#e6f1ef] text-primary"}`}
        >
          {actionResult.text}
        </p>
      )}

      <div role="tablist" className="mt-8 flex gap-8 overflow-x-auto overflow-y-hidden border-b border-black/10">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px whitespace-nowrap border-b-2 pb-3.5 text-[14px] ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted hover:text-heading"
            }`}
          >
            {t.label} · {t.count}
          </button>
        ))}
      </div>

      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="flex min-w-0 flex-col gap-5">
          {tab === "upcoming" && (
            <>
              {featured ? (
                <>
                  <article className="overflow-hidden rounded-2xl border border-black/10 bg-white">
                    <div className="flex items-center justify-between bg-sidebar px-6 py-4 text-[11px]">
                      <span className="text-lime">{cardBandLabel(featured.date)}</span>
                      <span className="text-white/70">{featured.code}</span>
                    </div>
                    <div className="px-6 pb-6 pt-7">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="flex items-center gap-4 text-[26px] leading-tight text-heading">
                          <FacilityIcon name={featured.facilityName} className="size-7 text-primary" />
                          {featured.facilityName}
                        </h2>
                        <StatusPill status={featured.status} />
                      </div>
                      <div className="mt-6 flex flex-col gap-5 md:flex-row md:items-center">
                        <div className="flex-1">
                          <p className="text-[10px] font-medium tracking-wide text-muted">{fullDateUpper(featured.date)}</p>
                          <p className="mt-1 text-[40px] leading-tight text-primary">{interval(featured)}</p>
                        </div>
                        <div className="md:w-[200px] md:border-l md:border-black/10 md:pl-8">
                          <p className="text-[15px] font-semibold text-heading">60 minute</p>
                          <p className="mt-2 text-[12px] text-muted">
                            {featured.campus ?? "Campus USV"} · {featured.facilityName}
                          </p>
                          {featured.usesIncludedQuota !== false && (
                            <p className="mt-1.5 text-[12px] text-muted">1 rezervare inclusă</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-6 flex flex-wrap gap-3 border-t border-black/10 pt-6">
                        <button type="button" className="h-9 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-white hover:opacity-90">
                          Vezi detalii
                        </button>
                        {isBookingInProgress(featured, now) && (
                          <button
                            type="button"
                            disabled={releasingId === featured.id}
                            onClick={() => handleReleaseEarly(featured)}
                            className="h-9 rounded-lg border border-black/10 bg-white px-3.5 text-[13px] font-semibold text-heading hover:bg-bg disabled:opacity-50"
                          >
                            {releasingId === featured.id ? "Se eliberează…" : "Eliberează anticipat"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openCancelDialog(featured)}
                          className="h-9 rounded-lg border border-black/10 bg-white px-3.5 text-[13px] font-semibold text-red-700 hover:bg-red-50"
                        >
                          Anulează rezervarea
                        </button>
                      </div>
                    </div>
                  </article>

                  {relativeDayLabel(featured.date) === "astăzi" && (
                    <section className="flex gap-3 rounded-xl bg-[#e6f1ef] px-5 py-4">
                      <DoorOpenIcon className="mt-0.5 size-5 shrink-0 text-primary" />
                      <div>
                        <p className="text-[13px] text-primary">
                          Pleci la {releaseFrom(featured)}? Anunță eliberarea anticipată.
                        </p>
                        <p className="mt-1.5 text-[12px] leading-relaxed text-primary">
                          După începerea rezervării, poți elibera restul intervalului {releaseFrom(featured)}–
                          {hourLabel(featured.hour + 1)}. Notificăm următorul utilizator eligibil; nu se creează o
                          rezervare simultană peste a ta.
                        </p>
                      </div>
                    </section>
                  )}
                </>
              ) : (
                <p className="rounded-2xl border border-black/10 bg-white p-6 text-sm text-muted">
                  Nimic aici încă. Rezervă o facilitate ca să apară în listă.
                </p>
              )}

              {others.map((b) => {
                const tile = dateTile(b.date);
                return (
                  <article key={b.id} className="flex flex-wrap items-center gap-5 rounded-2xl border border-black/10 bg-white px-6 py-5">
                    <span className="grid w-14 place-items-center rounded-lg bg-black/5 py-2 text-center">
                      <span className="text-[22px] leading-none text-heading">{tile.day}</span>
                      <span className="mt-1 text-[10px] font-medium text-muted">{tile.month}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[17px] text-heading">{b.facilityName}</h3>
                      <p className="mt-1 text-[12px] text-muted">
                        {weekdayName(b.date)} · {interval(b)} · 60 minute
                      </p>
                    </div>
                    <StatusPill status={b.status} />
                    <button type="button" className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
                      Detalii
                      <ArrowUpRightIcon className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openCancelDialog(b)}
                      className="text-[13px] font-semibold text-red-700 hover:underline"
                    >
                      Anulează
                    </button>
                  </article>
                );
              })}
            </>
          )}

          {tab === "history" && <HistoryTable items={history} />}

          {tab === "waitlist" &&
            (waitlist.length === 0 ? (
              <p className="rounded-2xl border border-black/10 bg-white p-6 text-sm text-muted">
                Nu ești pe nicio listă de așteptare.
              </p>
            ) : (
              waitlist.map((entry) => <WaitlistCard key={entry.id} entry={entry} bookings={bookings} onLeave={leaveWaitlist} />)
            ))}
        </div>

        <aside className="flex flex-col gap-5">
          <QuotaCard quota={quota} error={quotaError} />
          {tab !== "waitlist" && waitlist[0] && (
            <WaitlistCard entry={waitlist[0]} bookings={bookings} onLeave={leaveWaitlist} />
          )}
        </aside>
      </div>

      {tab === "upcoming" && (
        <section className="mt-10">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[22px] text-heading">Istoric recent</h2>
            <span className="text-[12px] text-muted">{monthYearLabel(now)}</span>
          </div>
          <HistoryTable items={history.slice(0, 5)} />
        </section>
      )}

      <CancelBookingDialog
        booking={toCancel?.booking ?? null}
        canCancel={toCancel?.canCancel ?? false}
        onClose={() => setToCancel(null)}
        onConfirm={confirmCancel}
      />
    </>
  );
}
