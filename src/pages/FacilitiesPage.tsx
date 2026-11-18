import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Badge from "../components/common/Badge";
import { getFacilities, type AmenityCode, type Facility, type SportCode } from "../api/facilities";
import { toISO } from "../utils/dates";

const sports: Array<{ label: string; code?: SportCode }> = [
  { label: "Toate sporturile" },
  { label: "Fotbal", code: "football" },
  { label: "Fitness", code: "fitness" },
  { label: "Bazin", code: "swimming" },
  { label: "Baschet", code: "basketball" },
  { label: "Volei", code: "volleyball" },
  { label: "Tenis", code: "tennis" },
];

const amenities: Array<{ label: string; code: AmenityCode }> = [
  { label: "Vestiare", code: "changing_rooms" },
  { label: "Dușuri", code: "showers" },
  { label: "Accesibilitate", code: "accessibility" },
  { label: "Nocturnă", code: "floodlights" },
  { label: "Cardio", code: "cardio" },
  { label: "Greutăți", code: "weights" },
  { label: "Culoare de înot", code: "swim_lanes" },
  { label: "Tribune", code: "bleachers" },
  { label: "Suprafață sportivă", code: "sports_flooring" },
];

function slotLabel(slot: Facility["nextFreeSlot"], timezone: string) {
  if (!slot) return "Nu există interval liber";
  return new Intl.DateTimeFormat("ro-RO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(slot.startTime));
}

function statusLabel(status: Facility["status"]) {
  switch (status) {
    case "under_maintenance":
      return "În mentenanță";
    case "university_activity":
      return "Activitate USV";
    case "closed":
      return "Închisă";
    default:
      return "Operațională";
  }
}

export default function FacilitiesPage() {
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState<SportCode | undefined>();
  const [selectedAmenities, setSelectedAmenities] = useState<AmenityCode[]>([]);
  const [date, setDate] = useState(() => toISO(new Date()));
  const filtersKey = JSON.stringify([query, sport, selectedAmenities, date]);
  const [result, setResult] = useState<{
    filtersKey: string;
    facilities: Facility[];
    error: string | null;
  } | null>(null);
  const loading = result?.filtersKey !== filtersKey;
  const facilities = result?.filtersKey === filtersKey ? result.facilities : [];
  const error = result?.filtersKey === filtersKey ? result.error : null;

  useEffect(() => {
    let active = true;

    getFacilities({
      q: query.trim() || undefined,
      sport,
      amenities: selectedAmenities,
      date,
      includeUnavailable: true,
    })
      .then((response) => {
        if (active) setResult({ filtersKey, facilities: response.items, error: null });
      })
      .catch((requestError: unknown) => {
        if (active) {
          setResult({
            filtersKey,
            facilities: [],
            error: requestError instanceof Error ? requestError.message : "Facilitățile nu au putut fi încărcate.",
          });
        }
      })

    return () => {
      active = false;
    };
  }, [query, sport, selectedAmenities, date, filtersKey]);

  const toggleAmenity = (code: AmenityCode) => {
    setSelectedAmenities((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  };

  return (
    <>
      <header className="mb-6">
        <p className="text-sm font-medium text-primary">Campus USV · Comunitatea USV</p>
        <h1 className="mt-1 text-2xl font-bold">Găsește facilitatea potrivită</h1>
        <p className="mt-1 text-muted">Alege un sport și verifică intervalele disponibile.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section>
          <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
            <label className="text-sm font-medium">
              Caută o facilitate
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nume facilitate sau sport"
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-white px-3 font-normal"
              />
            </label>
            <label className="text-sm font-medium">
              Data intervalului
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-white px-3 font-normal"
              />
            </label>
          </div>

          <div className="mb-4">
            <p className="mb-2 text-sm font-medium">Sport</p>
            <div className="flex flex-wrap gap-2">
              {sports.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  aria-pressed={sport === item.code}
                  onClick={() => setSport(item.code)}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    sport === item.code ? "bg-primary text-white" : "border border-gray-200 bg-white"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <fieldset className="mb-5">
            <legend className="mb-2 text-sm font-medium">Dotări</legend>
            <div className="flex flex-wrap gap-2">
              {amenities.map((item) => {
                const checked = selectedAmenities.includes(item.code);
                return (
                  <label
                    key={item.code}
                    className={`cursor-pointer rounded-full px-3 py-1.5 text-sm ${
                      checked ? "bg-lime text-heading" : "border border-gray-200 bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAmenity(item.code)}
                      className="sr-only"
                    />
                    {item.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Facilitățile nu au putut fi încărcate: {error}
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {loading && facilities.length === 0 && <p className="text-muted">Se încarcă facilitățile…</p>}
            {!loading && !error && facilities.length === 0 && (
              <p className="text-muted">Nicio facilitate găsită. Schimbă filtrele și încearcă din nou.</p>
            )}
            {facilities.map((facility) => (
              <article key={facility.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                {facility.imageUrl ? (
                  <img src={facility.imageUrl} alt="" className="h-36 w-full object-cover" />
                ) : (
                  <div className="flex h-36 items-end bg-gradient-to-br from-primary to-heading p-4 text-white">
                    <span className="text-sm font-medium">
                      {facility.sports.map((item) => item.label).join(" · ")}
                    </span>
                  </div>
                )}
                <div className="p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-primary">
                      {facility.sports.map((item) => item.label).join(" · ")}
                    </p>
                    <Badge
                      text={statusLabel(facility.status)}
                      tone={facility.status === "operational" ? "green" : "gray"}
                    />
                  </div>
                  <h2 className="text-lg font-semibold">{facility.name}</h2>
                  {facility.description && <p className="mt-1 text-sm text-muted">{facility.description}</p>}
                  <div className="my-3 flex flex-wrap gap-1">
                    {facility.amenities.map((item) => <Badge key={item.code} text={item.label} />)}
                  </div>
                  {facility.statusNote && <p className="mb-2 text-sm text-muted">{facility.statusNote}</p>}
                  <div className="flex items-end justify-between gap-3 border-t border-gray-100 pt-3">
                    <p className="text-sm text-muted">
                      Următorul interval liber
                      <span className="mt-1 block font-medium text-heading">
                        {slotLabel(facility.nextFreeSlot, facility.timezone ?? "Europe/Bucharest")}
                      </span>
                    </p>
                    <Link
                      to={`/facilitati/${encodeURIComponent(facility.id)}`}
                      className="inline-flex h-10 shrink-0 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white"
                    >
                      Vezi disponibilitatea
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">Prioritate pentru comunitatea USV</h2>
            <p className="text-sm text-muted">
              Intervalele afișate țin cont de orarul universitar și de mentenanță. Disponibilitatea se verifică din nou
              înainte de confirmarea rezervării.
            </p>
            <p className="mt-3 text-sm text-muted">Selectează o facilitate pentru a consulta programul săptămânal.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
