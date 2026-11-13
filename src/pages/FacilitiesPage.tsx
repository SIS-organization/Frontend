import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Badge from "../components/common/Badge";
import { getFacilities } from "../api/facilities";
import { useBookings } from "../context/BookingsContext";
import type { Facility } from "../types";
import { formatDate, hourLabel } from "../utils/dates";

const sports = ["Toate sporturile", "Fitness", "Fotbal", "Înot", "Baschet", "Volei"];

export default function FacilitiesPage() {
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState(sports[0]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { bookings } = useBookings();
  const next = bookings
    .filter((b) => b.status === "upcoming")
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""))[0];

  useEffect(() => {
    let active = true;
    getFacilities().then((data) => {
      if (active) {
        setFacilities(data);
        setLoading(false);
      }
    }).catch((err) => {
      if (active) {
        setError(err instanceof Error ? err.message : "Nu s-au putut încărca facilitățile.");
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  const shown = facilities.filter(
    (f) =>
      f.name.toLowerCase().includes(query.toLowerCase()) &&
      (sport === sports[0] || f.sport.includes(sport))
  );

  return (
    <>
      <h1 className="text-2xl font-bold">Facilități sportive</h1>
      <p className="mb-6 mt-1 text-muted">Alege o facilitate și vezi intervalele libere.</p>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Caută facilitate sau sport"
            className="mb-3 h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
          />
          <div className="mb-5 flex flex-wrap gap-2">
            {sports.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSport(s)}
                className={`rounded-full px-3 py-1.5 text-sm ${sport === s ? "bg-primary text-white" : "border border-gray-200 bg-white"}`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {error && <p role="alert" className="text-red-700">{error}</p>}
            {loading && facilities.length === 0 ? (
              <p className="text-muted">Se încarcă facilitățile…</p>
            ) : shown.map((f) => (
              <article key={f.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-3 h-32 rounded-lg bg-gray-200" />
                <h2 className="font-semibold">{f.name}</h2>
                <div className="my-2 flex flex-wrap gap-1">
                  {f.amenities.map((a) => <Badge key={a} text={a} />)}
                </div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <p className="text-sm text-muted">
                    {f.nextFree
                      ? `Următorul interval liber: ${f.nextFree}`
                      : [f.location, f.capacity && f.capacity > 1 ? `${f.capacity} locuri simultane` : null]
                          .filter(Boolean)
                          .join(" · ")}
                  </p>
                  <Link
                    to={`/facilitati/${f.id}`}
                    className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white"
                  >
                    Rezervă
                  </Link>
                </div>
              </article>
            ))}
            {!loading && !error && shown.length === 0 && <p className="text-muted">Nicio facilitate găsită. Schimbă căutarea sau filtrul.</p>}
          </div>
        </section>

        <aside>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">Următoarea ta rezervare</h2>
            {next ? (
              <>
                <p className="text-sm">{next.facilityName}</p>
                <p className="mb-3 text-sm text-muted">{formatDate(next.date)}, {hourLabel(next.hour)}</p>
                <Link to="/programari" className="text-sm font-medium text-primary underline">Vezi programarea</Link>
              </>
            ) : (
              <p className="text-sm text-muted">Nu ai nicio rezervare viitoare.</p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
