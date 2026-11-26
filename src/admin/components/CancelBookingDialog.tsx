// Fereastra „Anulează rezervarea” (anulare administrativă).
// Se deschide din orar, pentru rezervarea selectată.
//
// Fluxul, conform Swagger (POST /admin/bookings/{bookingId}/cancel):
//   - motivul e obligatoriu (3–300 de caractere) și ajunge la persoană în notificare;
//   - serverul eliberează intervalul, restituie cota (la studenți) și scrie în jurnal;
//   - 409 = rezervarea nu mai e activă (anulată între timp sau încheiată).
// Cât rulează cererea, fereastra nu se poate închide (ca să nu pierdem răspunsul).

import { useState } from "react";
import { ApiError } from "../../api/client";
import { CANCEL_REASON_MAX, CANCEL_REASON_MIN, cancelAdminBooking, type AdminBooking, type CancelResult } from "../api";
import { bucharestParts, formatDayMonthYear, formatTimeRange } from "../time";
import AdminDialog from "./AdminDialog";

/** Mesajul pentru administrator, după eroarea primită de la server. */
function describeError(error: unknown) {
  if (error instanceof ApiError && error.status === 403) return "Contul tău nu mai are drepturi de administrator.";
  if (error instanceof ApiError && error.status === 404) return "Rezervarea nu mai există.";
  if (error instanceof ApiError && error.status === 409) {
    return "Rezervarea nu mai este activă (a fost deja anulată sau s-a încheiat). Reîmprospătează orarul.";
  }
  if (error instanceof ApiError && error.status === 501) return "Serverul nu oferă încă anularea administrativă.";
  return error instanceof Error ? error.message : "Anularea nu a reușit. Încearcă din nou.";
}

export default function CancelBookingDialog(props: {
  /** Rezervarea de anulat (fereastra se afișează doar când există). */
  booking: AdminBooking;
  onClose: () => void;
  /** Anularea a reușit: pagina părinte reîncarcă orarul și afișează confirmarea. */
  onCancelled: (booking: AdminBooking, result: CancelResult) => void;
  /** Sesiune expirată (401): pagina părinte face delogarea. */
  onUnauthorized: () => void;
}) {
  const { booking, onClose, onCancelled, onUnauthorized } = props;
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = reason.trim();
  const valid = trimmed.length >= CANCEL_REASON_MIN && trimmed.length <= CANCEL_REASON_MAX;

  /** Trimite anularea; la reușită anunță pagina părinte. */
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await cancelAdminBooking(booking.id, trimmed);
      onCancelled(booking, result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      else setError(describeError(err));
      setBusy(false);
    }
  };

  return (
    <AdminDialog title="Anulează rezervarea" width={560} locked={busy} onClose={onClose}>
      {/* Ce se anulează. */}
      <div className="flex flex-col gap-0.5 rounded-xl bg-bg p-4">
        <p className="text-base text-heading">
          {booking.userName ?? "Rezervare"} · {booking.facilityName}
        </p>
        <p className="text-[13px] text-muted">
          {formatDayMonthYear(bucharestParts(booking.startTime).date)} · {formatTimeRange(booking.startTime, booking.endTime)} ·{" "}
          {booking.code}
        </p>
      </div>

      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cancel-reason" className="text-xs font-semibold text-muted">
            Motivul anulării (trimis persoanei)
          </label>
          <textarea
            id="cancel-reason"
            rows={3}
            value={reason}
            maxLength={CANCEL_REASON_MAX}
            disabled={busy}
            placeholder="Ex.: Sala este rezervată pentru o competiție oficială în acest interval."
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            className="w-full resize-none rounded-lg border border-[#dde5e2] bg-white px-3 py-2 text-sm text-heading outline-none focus:border-primary disabled:bg-bg"
          />
          <p className="flex justify-between text-xs text-muted">
            <span>{trimmed.length > 0 && !valid ? `Cel puțin ${CANCEL_REASON_MIN} caractere.` : ""}</span>
            <span>
              {reason.length}/{CANCEL_REASON_MAX}
            </span>
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-[#fcedea] px-3 py-2 text-sm text-[#ac443c]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={!valid || busy}
            className="flex h-10 items-center rounded-lg bg-[#ac443c] px-5 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Se anulează…" : "Anulează rezervarea și notifică"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex h-10 items-center rounded-lg border border-[#dde5e2] bg-white px-4 text-[13px] font-semibold text-heading hover:bg-bg disabled:opacity-50"
          >
            Renunță
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
