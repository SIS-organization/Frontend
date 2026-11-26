// Fereastra „Detaliile rezervării” (vederea de administrator).
// Se deschide din orar („Vezi detaliile rezervării”) și poate fi refolosită de
// pagina „Rezervări”. Datele vin din GET /admin/bookings/{bookingId}:
// rezervarea și cota lunară a persoanei (Quota).
//
// Fereastra în sine (fundal, Escape, focus, derulare blocată) e AdminDialog.
// Textele de la server sunt afișate ca text simplu (fără HTML).

import { useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { getAdminBooking, type BookingDetails, type UserQuota } from "../api";
import AdminDialog from "./AdminDialog";
import { BOOKING_STATUS, BOOKING_STATUS_TONE, CANCELLED_BY_LABEL, ROLE_LABEL } from "../bookingText";
import { bucharestParts, formatClock, formatDayMonth, formatDayMonthYear, formatTimeRange } from "../time";


/** „noiembrie 2026” dintr-o lună „2026-11”. */
function monthLabel(month: string) {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("ro-RO", { timeZone: "UTC", month: "long", year: "numeric" });
}

/** „26 noiembrie · 14:32” pentru un moment ISO. */
function momentLabel(iso: string) {
  return `${formatDayMonth(bucharestParts(iso).date)} · ${formatClock(iso)}`;
}

/** Mesajul pentru administrator, după eroarea primită de la server. */
function describeError(error: unknown) {
  if (error instanceof ApiError && error.status === 403) return "Contul tău nu mai are drepturi de administrator.";
  if (error instanceof ApiError && error.status === 404) return "Rezervarea nu există sau a fost ștearsă.";
  if (error instanceof ApiError && error.status === 501) return "Serverul nu oferă încă detaliile rezervărilor.";
  return error instanceof Error ? error.message : "Detaliile nu au putut fi încărcate.";
}

/** Cota lunară: bara cu 4 rezervări la studenți, un text simplu la profesori și externi. */
function QuotaBlock({ quota }: { quota: UserQuota }) {
  if (quota.appliesTo === "professor_unlimited") {
    return <p className="text-[13px] text-muted">Cadru didactic · fără limită lunară, cu acces prioritar.</p>;
  }
  if (quota.appliesTo === "external_none" || quota.included === null) {
    return <p className="text-[13px] text-muted">Utilizator extern · nu are rezervări incluse în cota lunară.</p>;
  }
  const included = quota.included;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-heading">
        {quota.used} din {included} rezervări folosite în {monthLabel(quota.month)}
        {quota.remaining !== null && ` · ${quota.remaining} rămase`}
      </p>
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: included }, (_, i) => (
          <span key={i} className={`h-2 flex-1 rounded-full ${i < quota.used ? "bg-primary" : "bg-[#dde5e2]"}`} />
        ))}
      </div>
      <p className="text-xs text-muted">
        {quota.limitReached ? "Limita lunară a fost atinsă. " : ""}
        {quota.resetsOn && `Cota se resetează pe ${formatDayMonth(quota.resetsOn)}.`}
      </p>
    </div>
  );
}

export default function BookingDetailsDialog(props: {
  /** Rezervarea afișată; null = fereastra e închisă. */
  bookingId: string | null;
  onClose: () => void;
  /** Sesiune expirată (401): pagina părinte face delogarea. */
  onUnauthorized: () => void;
}) {
  const { bookingId, onClose, onUnauthorized } = props;
  const [result, setResult] = useState<{ id: string; data: BookingDetails | null; error: string | null } | null>(null);

  // Încărcăm detaliile la fiecare deschidere; cererea se anulează dacă fereastra se închide.
  useEffect(() => {
    if (!bookingId) return;
    const controller = new AbortController();
    getAdminBooking(bookingId, controller.signal)
      .then((data) => setResult({ id: bookingId, data, error: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) onUnauthorized();
        else setResult({ id: bookingId, data: null, error: describeError(err) });
      });
    return () => controller.abort();
  }, [bookingId, onUnauthorized]);

  if (!bookingId) return null;
  const current = result && result.id === bookingId ? result : null;
  const booking = current?.data ?? null;

  return (
    <AdminDialog
      title="Detaliile rezervării"
      onClose={onClose}
      subtitle={
        booking && (
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            {booking.code}
            <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${BOOKING_STATUS_TONE[booking.status]}`}>
              {BOOKING_STATUS[booking.status]}
            </span>
          </p>
        )
      }
    >
      {!current && <p className="text-sm text-muted">Se încarcă detaliile…</p>}
      {current?.error && (
        <p role="alert" className="rounded-lg bg-[#fcedea] px-3 py-2 text-sm text-[#ac443c]">
          {current.error}
        </p>
      )}

      {booking && (
        <>
          {/* Datele principale ale rezervării. */}
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {(
              [
                ["Persoană", `${booking.userName ?? "—"}${booking.userRole ? ` · ${ROLE_LABEL[booking.userRole] ?? booking.userRole}` : ""}`],
                ["Facilitate", booking.facilityName],
                ["Data", formatDayMonthYear(bucharestParts(booking.startTime).date)],
                ["Interval", formatTimeRange(booking.startTime, booking.endTime)],
                ["Cotă lunară", booking.usesIncludedQuota ? "Inclusă în cele 4 rezervări" : "Nu se numără în cotă"],
                ["Creată", booking.createdAt ? momentLabel(booking.createdAt) : "—"],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <dt className="text-xs font-semibold text-muted">{label}</dt>
                <dd className="text-sm text-heading">{value}</dd>
              </div>
            ))}
          </dl>

          {/* Anularea (dacă e cazul): cine, când, de ce și dacă s-a restituit cota. */}
          {booking.status === "cancelled" && (
            <div className="flex flex-col gap-1 rounded-xl bg-[#fcedea] p-4 text-[13px] text-[#ac443c]">
              <p className="font-semibold">
                Anulată {booking.cancelledBy ? CANCELLED_BY_LABEL[booking.cancelledBy] : ""}
                {booking.cancelledAt && ` · ${momentLabel(booking.cancelledAt)}`}
              </p>
              {booking.cancelReason && <p>Motiv: {booking.cancelReason}</p>}
              {booking.usesIncludedQuota && (
                <p>{booking.quotaRefunded ? "Rezervarea a fost restituită în cota lunară." : "Cota nu a fost restituită."}</p>
              )}
            </div>
          )}

          {booking.quota && (
            <section className="flex flex-col gap-2 rounded-xl bg-bg p-4">
              <h3 className="text-sm font-semibold text-heading">Cota lunară a persoanei</h3>
              <QuotaBlock quota={booking.quota} />
            </section>
          )}
        </>
      )}
    </AdminDialog>
  );
}
