import { useEffect, useRef, useState } from "react";
import Button from "../common/Button";
import type { Booking } from "../../types";
import { formatDate, hourLabel } from "../../utils/dates";
import { CANCEL_MIN_HOURS } from "../../utils/cancellation";

type Props = {
  booking: Booking | null;
  // Calculat de pagină la deschiderea dialogului, cu canCancelBooking().
  canCancel: boolean;
  onClose: () => void;
  onConfirm: (booking: Booking) => Promise<void>;
};

// Dialog de confirmare pentru anulare (KAN-41). Folosește <dialog> nativ: focus, Esc și fundal sunt gestionate de browser.
export default function CancelBookingDialog({ booking, canCancel, onClose, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (booking && !dialog.open) {
      setPending(false);
      setError(null);
      dialog.showModal();
    } else if (!booking && dialog.open) {
      dialog.close();
    }
  }, [booking]);

  const handleConfirm = async () => {
    if (!booking) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm(booking);
    } catch {
      setError("Anularea nu a reușit. Rezervarea rămâne activă; încearcă din nou.");
      setPending(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
      aria-labelledby="cancel-dialog-title"
      className="m-auto w-[calc(100%-2rem)] max-w-[540px] rounded-2xl border border-black/10 bg-white p-6 text-heading backdrop:bg-black/40 md:p-7"
    >
      {booking && (
        <>
          <h2 id="cancel-dialog-title" className="text-2xl">
            Anulezi această rezervare?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {booking.facilityName} · {formatDate(booking.date)}, {hourLabel(booking.hour)}–{hourLabel(booking.hour + 1)} ·{" "}
            {booking.code}
          </p>

          {canCancel ? (
            <div className="mt-5 rounded-xl bg-primary/10 p-4 text-primary">
              <p className="text-sm font-semibold">Înainte de confirmare</p>
              <ul className="mt-1.5 flex flex-col gap-0.5 text-[13px]">
                <li>Intervalul se eliberează pentru ceilalți utilizatori.</li>
                <li>Ora revine în cota ta lunară.</li>
              </ul>
            </div>
          ) : (
            <div className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">
              <p className="text-sm font-semibold">Anularea nu mai este posibilă</p>
              <p className="mt-1.5 text-[13px]">
                Rezervarea începe în mai puțin de {CANCEL_MIN_HOURS} ore. Conform regulamentului nu mai poate fi anulată,
                iar ora nu se restituie în cotă.
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button className="font-semibold" disabled={!canCancel || pending} onClick={handleConfirm}>
              {pending ? "Se anulează…" : "Confirmă anularea"}
            </Button>
            <Button
              variant="outline"
              className="border-black/10! font-semibold text-heading!"
              disabled={pending}
              onClick={onClose}
            >
              Păstrează rezervarea
            </Button>
          </div>
        </>
      )}
    </dialog>
  );
}
