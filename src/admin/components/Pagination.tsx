// Paginarea din Figma, folosită de listele din administrare (Rezervări, Utilizatori):
// „3 din 3 înregistrări · Campus USV”, „← Înapoi”, numerele paginilor, „Înainte →”.

import { secondaryButton } from "./ActivityForm";

/** Câte numere de pagină arătăm (în jurul paginii curente). */
const PAGE_WINDOW = 5;

/** Numerele de pagină afișate (cel mult PAGE_WINDOW, în jurul paginii curente). */
function pageNumbers(page: number, totalPages: number) {
  const start = Math.max(1, Math.min(page - Math.floor(PAGE_WINDOW / 2), totalPages - PAGE_WINDOW + 1));
  return Array.from({ length: Math.min(PAGE_WINDOW, totalPages) }, (_, i) => start + i);
}

export default function Pagination(props: {
  page: number;
  totalPages: number;
  totalItems: number;
  /** Câte înregistrări sunt afișate pe pagina curentă. */
  shown: number;
  /** Cât se încarcă o pagină nouă, butoanele sunt inactive. */
  loading: boolean;
  onPage: (page: number) => void;
}) {
  const { page, totalPages, totalItems, shown, loading, onPage } = props;
  if (totalItems === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
      <p>
        {shown} din {totalItems} {totalItems === 1 ? "înregistrare" : "înregistrări"} · Campus USV
      </p>
      <nav aria-label="Paginare" className="flex items-center gap-2">
        <button type="button" className={secondaryButton} disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>
          ← Înapoi
        </button>
        {pageNumbers(page, totalPages).map((n) => (
          <button
            key={n}
            type="button"
            aria-current={n === page ? "page" : undefined}
            disabled={loading}
            onClick={() => onPage(n)}
            className={`flex size-10 items-center justify-center rounded-lg text-[13px] font-semibold ${
              n === page ? "bg-primary text-white" : "border border-[#dde5e2] bg-white text-heading hover:bg-bg"
            }`}
          >
            {n}
          </button>
        ))}
        <button type="button" className={secondaryButton} disabled={page >= totalPages || loading} onClick={() => onPage(page + 1)}>
          Înainte →
        </button>
      </nav>
    </div>
  );
}
