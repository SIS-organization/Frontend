import { useMemo, useState } from "react";
import Button from "../components/common/Button";

const hours = Array.from({ length: 9 }, (_, i) => 8 + i);
const facilities = ["Teren de fotbal", "Sală fitness", "Bazin", "Sală de sport"];
const statuses = [
  { label: "Disponibil", tone: "bg-emerald-100 text-emerald-800" },
  { label: "Ocupat", tone: "bg-gray-200 text-gray-700" },
  { label: "Curs USV", tone: "bg-blue-100 text-blue-800" },
  { label: "Blocat", tone: "bg-amber-100 text-amber-800" },
] as const;

const seedStatus = (facility: string, hour: number) => {
  const hash = (facility.length + hour * 7) % 5;
  if (hash === 0) return "class";
  if (hash === 1) return "busy";
  if (hash === 2) return "maintenance";
  return "free";
};

export default function AdminSchedulePage() {
  const [selectedFacility, setSelectedFacility] = useState(facilities[0]);
  const [selectedSlot, setSelectedSlot] = useState<{ facility: string; hour: number } | null>({
    facility: "Sală fitness",
    hour: 16,
  });
  const incidentOpen = true;

  const details = useMemo(
    () => ({
      facility: selectedSlot?.facility ?? selectedFacility,
      hour: selectedSlot?.hour ?? 16,
      title: selectedSlot ? "Rezervare confirmată" : "Nicio selecție",
      range: `${String(selectedSlot?.hour ?? 16).padStart(2, "0")}:00–${String((selectedSlot?.hour ?? 16) + 1).padStart(2, "0")}:00`,
    }),
    [selectedSlot, selectedFacility]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Orar și blocări</h1>
          <p className="mt-1 text-sm text-muted">Verifică disponibilitatea în timp real și administrează intervalele blocate.</p>
        </div>
        <Button variant="primary">Adaugă activitate USV</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {statuses.map((status) => (
          <div key={status.label} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">{status.label}</span>
              <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${status.tone}`}>Live</span>
            </div>
            <p className="text-xl font-bold text-heading">{status.label === "Disponibil" ? "12" : status.label === "Ocupat" ? "7" : status.label === "Curs USV" ? "3" : "2"}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">←</button>
            <input type="date" defaultValue="2026-11-12" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" />
            <button type="button" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">→</button>
            <button type="button" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">Astăzi</button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedFacility}
              onChange={(e) => setSelectedFacility(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              {facilities.map((facility) => (
                <option key={facility} value={facility}>{facility}</option>
              ))}
            </select>
            <Button variant="outline">Blochează interval</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="grid min-w-[700px] grid-cols-[60px_repeat(4,minmax(140px,1fr))] gap-2">
            <div />
            {facilities.map((facility) => (
              <div key={facility} className="rounded-lg bg-gray-50 px-3 py-2 text-center text-sm font-medium text-muted">
                {facility}
              </div>
            ))}

            {hours.map((hour) => (
              <div key={`${hour}-row`} className="contents">
                <div className="flex items-center text-xs font-medium text-muted">{String(hour).padStart(2, "0")}:00</div>
                {facilities.map((facility) => {
                  const status = seedStatus(facility, hour);
                  const selected = selectedSlot?.facility === facility && selectedSlot.hour === hour;
                  const tone =
                    status === "free"
                      ? "border-gray-200 bg-white text-heading hover:bg-lime/40"
                      : status === "busy"
                        ? "border-transparent bg-gray-200 text-gray-600"
                        : status === "class"
                          ? "border-transparent bg-blue-100 text-blue-700"
                          : "border-transparent bg-amber-100 text-amber-800";
                  return (
                    <button
                      key={`${facility}-${hour}`}
                      type="button"
                      onClick={() => setSelectedSlot({ facility, hour })}
                      className={`h-12 rounded-lg border text-[11px] font-medium transition ${selected ? "border-primary bg-primary text-white" : tone}`}
                    >
                      {selected ? "Ales" : status === "free" ? "Liber" : status === "busy" ? "Ocupat" : status === "class" ? "Curs" : "Blocat"}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-gray-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-muted">Interval selectat</p>
              <p className="text-base font-semibold">{details.facility}</p>
              <p className="text-sm text-muted">{details.range} · 1 oră</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline">Vezi detaliile rezervării</Button>
              <Button variant="primary">Gestionează blocările</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1.5fr]">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Incident activ</h2>
            <button type="button" className="text-sm font-medium text-primary">{incidentOpen ? "Deblocare anticipată" : "Activează incidentul"}</button>
          </div>
          {incidentOpen && (
            <div className="mt-4 rounded-lg bg-slate-50 p-3">
              <p className="text-sm text-muted">Facilitate</p>
              <p className="font-medium">{details.facility}</p>
              <p className="mt-3 text-sm text-muted">Motiv</p>
              <p className="font-medium">Defecțiune la sistemul de ventilație</p>
              <p className="mt-3 text-sm text-muted">Interval</p>
              <p className="font-medium">{details.range}</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-4 text-lg font-semibold">Blochează intervalul</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="font-medium text-muted">Facilitate</span>
              <select defaultValue={details.facility} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2">
                {facilities.map((facility) => (
                  <option key={facility} value={facility}>{facility}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-muted">Motiv</span>
              <select defaultValue="Întreținere" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2">
                <option>Întreținere</option>
                <option>Eveniment USV</option>
                <option>Incident</option>
              </select>
            </label>
            <label className="space-y-2 text-sm md:col-span-2">
              <span className="font-medium text-muted">Explicație publică</span>
              <textarea defaultValue="Închis temporar din motive de siguranță și verificare tehnică." className="min-h-[80px] w-full rounded-lg border border-gray-200 bg-white px-3 py-2" />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-muted">Interval</span>
              <input defaultValue="2026-11-12 15:00–16:00" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2" />
            </label>
            <div className="space-y-3 md:col-span-2">
              <div className="rounded-lg border border-gray-200 bg-slate-50 p-3">
                <p className="mb-2 text-sm font-medium">Rezervări afectate</p>
                <ul className="space-y-2 text-sm text-muted">
                  <li>• Teren de fotbal · 15:00–16:00 · 2 rezervări</li>
                  <li>• Sală fitness · 16:00–17:00 · 1 rezervare</li>
                </ul>
              </div>

              <div className="rounded-lg border border-gray-200 bg-slate-50 p-3">
                <p className="mb-2 text-sm font-medium">Canale de notificare</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-white px-2 py-1">Email</span>
                  <span className="rounded-full bg-white px-2 py-1">SMS</span>
                  <span className="rounded-full bg-white px-2 py-1">Push</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 pt-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-gray-300" />
              Confirm că această blocare va afecta rezervările existente.
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="primary" className="flex-1">Confirmă blocarea și notifică</Button>
              <Button variant="outline" className="flex-1">Renunță</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Detalii rezervării</h2>
          <button type="button" className="text-sm text-primary">Vezi toate</button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm text-muted">Utilizator</p>
            <p className="mt-1 font-medium">Andrei Popescu</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm text-muted">Data</p>
            <p className="mt-1 font-medium">12 nov 2026</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm text-muted">Status</p>
            <p className="mt-1 font-medium text-emerald-700">Confirmată</p>
          </div>
        </div>
      </div>
    </div>
  );
}
