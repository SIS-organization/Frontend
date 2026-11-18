import { useState } from "react";
import { Link } from "react-router-dom";
import Badge from "../components/common/Badge";
import Button from "../components/common/Button";
import CancelBookingDialog from "../components/booking/CancelBookingDialog";
import { useBookings } from "../context/BookingsContext";
import { useNow } from "../hooks/useNow";
import type { Booking } from "../types";
import { canCancelBooking } from "../utils/cancellation";
import { formatDate, hourLabel } from "../utils/dates";
import { isBookingInProgress } from "../utils/releaseEarly";

const tabs = [
  { key: "upcoming", label: "Urmează" },
  { key: "history", label: "Istoric" },
  { key: "waitlist", label: "Lista de așteptare" },
] as const;

export default function MyBookingsPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("upcoming");
  const { bookings, cancelBooking, releaseEarly } = useBookings();
  const now = useNow();
  const [toCancel, setToCancel] = useState<{ booking: Booking; canCancel: boolean } | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ text: string; error?: boolean } | null>(null);

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

  const shown = bookings.filter((b) =>
    tab === "upcoming" ? b.status === "upcoming" : tab === "history" ? b.status !== "upcoming" : false
  );

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Programările mele</h1>
          <p className="mt-1 text-muted">Rezervările tale viitoare și istoricul.</p>
        </div>
        <Link to="/" className="inline-flex h-10 items-center rounded-lg border border-primary bg-white px-4 text-sm font-medium text-primary">
          Explorează facilitățile
        </Link>
      </div>

      {actionResult && (
        <p
          role={actionResult.error ? "alert" : "status"}
          className={`mb-5 max-w-3xl rounded-xl px-4 py-3 text-sm ${actionResult.error ? "bg-red-50 text-red-700" : "bg-primary/10 text-primary"}`}
        >
          {actionResult.text}
        </p>
      )}

      <div className="mb-5 flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm ${tab === t.key ? "bg-primary text-white" : "border border-gray-200 bg-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex max-w-3xl flex-col gap-4">
        {shown.map((b) => (
          <article key={b.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{b.facilityName}</h2>
                <p className="text-sm text-muted">{formatDate(b.date)}, {hourLabel(b.hour)}–{hourLabel(b.hour + 1)}</p>
                <p className="text-xs text-muted">Cod: {b.code}</p>
              </div>
              <Badge
                text={b.status === "upcoming" ? "Confirmată" : b.status === "past" ? "Finalizată" : "Anulată"}
                tone={b.status === "upcoming" ? "green" : b.status === "cancelled" ? "red" : "gray"}
              />
            </div>
            {b.status === "upcoming" && (
              <div className="mt-4 flex flex-col gap-2 md:flex-row">
                <Button variant="outline">Vezi detalii</Button>
                {isBookingInProgress(b, now) && (
                  <Button variant="outline" disabled={releasingId === b.id} onClick={() => handleReleaseEarly(b)}>
                    {releasingId === b.id ? "Se eliberează…" : "Eliberează anticipat"}
                  </Button>
                )}
                <Button variant="danger" onClick={() => openCancelDialog(b)}>Anulează rezervarea</Button>
              </div>
            )}
          </article>
        ))}
        {shown.length === 0 && (
          <p className="text-muted">
            {tab === "waitlist" ? "Nu ești pe nicio listă de așteptare." : "Nimic aici încă. Rezervă o facilitate ca să apară în listă."}
          </p>
        )}
      </div>

      <CancelBookingDialog
        booking={toCancel?.booking ?? null}
        canCancel={toCancel?.canCancel ?? false}
        onClose={() => setToCancel(null)}
        onConfirm={confirmCancel}
      />
    </>
  );
}
