import { Fragment } from "react";
import type { SlotStatus } from "../../types";
import { slotStatus } from "../../mock/data";
import { HOURS, hourLabel, toISO } from "../../utils/dates";

type Selected = { date: string; hour: number } | null;

type Props = {
  facilityId: number;
  days: Date[];
  selected: Selected;
  onSelect: (date: string, hour: number) => void;
};

const styles: Record<SlotStatus | "selected", string> = {
  free: "border-gray-200 bg-white hover:bg-lime/50",
  selected: "border-primary bg-primary text-white",
  busy: "cursor-not-allowed border-transparent bg-gray-200 text-muted",
  class: "cursor-not-allowed border-transparent bg-blue-100 text-blue-800",
  maintenance: "cursor-not-allowed border-transparent bg-amber-100 text-amber-800",
};

const labels: Record<SlotStatus | "selected", string> = {
  free: "",
  selected: "Ales",
  busy: "Ocupat",
  class: "Curs",
  maintenance: "Mentenanță",
};

export default function TimeGrid({ facilityId, days, selected, onSelect }: Props) {
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
            {days.map((d, di) => {
              const iso = toISO(d);
              const isSelected = selected?.date === iso && selected.hour === h;
              const status = slotStatus(facilityId, di, h);
              const key = isSelected ? "selected" : status;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={status !== "free"}
                  onClick={() => onSelect(iso, h)}
                  className={`h-10 rounded border text-[11px] ${styles[key]}`}
                >
                  {labels[key]}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
