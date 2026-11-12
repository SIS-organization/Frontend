import { useState } from "react";
import { Link } from "react-router-dom";
import Badge from "../components/common/Badge";
import Button from "../components/common/Button";
import { useBookings } from "../context/BookingsContext";
import { formatDate, hourLabel } from "../utils/dates";

const tabs = [
  { key: "upcoming", label: "Urmează" },
  { key: "history", label: "Istoric" },
  { key: "waitlist", label: "Lista de așteptare" },
] as const;

export default function MyBookingsPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("upcoming");
  const { bookings, cancelBooking } = useBookings();

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
                <Button variant="outline">Eliberează anticipat</Button>
                <Button variant="danger" onClick={() => cancelBooking(b.id)}>Anulează rezervarea</Button>
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
    </>
  );
}
