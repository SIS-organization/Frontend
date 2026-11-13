import { Fragment } from "react";
import type { FacilityAvailability } from "../../api/facilities";
import type { SlotStatus } from "../../types";
import { HOURS, hourLabel, slotKey, toISO } from "../../utils/dates";

type Selected = { date: string; hour: number } | null;

type Props = {
  days: Date[];
  // Disponibilitatea de la backend, indexată cu slotKey(data, ora).
  slots: Record<string, FacilityAvailability>;
  selected: Selected;
  onSelect: (date: string, hour: number) => void;
};

type CellKey = SlotStatus | "selected" | "unknown";

const styles: Record<CellKey, string> = {
  free: "border-gray-200 bg-white hover:bg-lime/50",
  selected: "border-primary bg-primary text-white",
  busy: "cursor-not-allowed border-transparent bg-gray-200 text-muted",
  class: "cursor-not-allowed border-transparent bg-blue-100 text-blue-800",
  maintenance: "cursor-not-allowed border-transparent bg-amber-100 text-amber-800",
  past: "cursor-not-allowed border-transparent bg-gray-50 text-gray-300",
  unknown: "cursor-not-allowed border-transparent bg-gray-100",
};

const labels: Record<CellKey, string> = {
  free: "",
  selected: "Ales",
  busy: "Ocupat",
  class: "Curs",
  maintenance: "Mentenanță",
  past: "",
  unknown: "",
};

export default function TimeGrid({ days, slots, selected, onSelect }: Props) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[680px] grid-cols-[56px_repeat(7,1fr)] gap-1 text-xs">
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} className="pb-1 text-center font-medium text-muted">
            {d.toLocaleDateString("ro-RO", { weekday: "short", day: "numeric" })}
          </div>
        ))}

        {HOURS.map((h) => (
          <Fragment key={h}>
            <div className="flex items-center text-muted">{hourLabel(h)}</div>
            {days.map((d) => {
              const iso = toISO(d);
              const slot = slots[slotKey(iso, h)];
              const isSelected = selected?.date === iso && selected.hour === h;
              const status: CellKey = slot?.status ?? "unknown";
              const key: CellKey = isSelected ? "selected" : status;
              // La facilități cu mai multe locuri (bazin) arătăm câte au rămas libere.
              const label =
                key === "free" && slot && slot.capacity > 1 ? `${slot.freeSpots}/${slot.capacity} locuri` : labels[key];
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={status !== "free"}
                  onClick={() => onSelect(iso, h)}
                  data-testid={`slot-${iso}-${h}`}
                  data-status={status}
                  className={`h-10 rounded border text-[11px] ${styles[key]}`}
                >
                  {label}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
