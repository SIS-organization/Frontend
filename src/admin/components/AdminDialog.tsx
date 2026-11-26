// Fereastra (dialogul) folosită în zona de administrare, peste pagină.
// O folosesc „Detaliile rezervării” și „Anulează rezervarea”.
//
// Ce face pentru toate ferestrele:
//   - fundal întunecat; click în afara ferestrei o închide (dacă nu e blocată);
//   - Escape o închide (dacă nu e blocată);
//   - pagina din spate nu se poate derula cât timp fereastra e deschisă;
//   - focusul merge în fereastră la deschidere și revine apoi unde era;
//   - role="dialog" + aria-modal + titlu legat prin aria-labelledby.

import { useEffect, useId, useRef, type ReactNode } from "react";

export default function AdminDialog(props: {
  /** Titlul ferestrei (citit și de cititoarele de ecran). */
  title: string;
  /** Rândul mic de sub titlu (ex. codul rezervării și statusul). */
  subtitle?: ReactNode;
  /** Lățimea maximă, în pixeli. */
  width?: number;
  /** `true` cât rulează o acțiune: fereastra nu se poate închide (ca să nu pierdem răspunsul). */
  locked?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const { title, subtitle, width = 640, locked = false, onClose, children } = props;
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  // Funcția de închidere și starea „blocat” se schimbă între randări; efectele de mai jos
  // nu trebuie să ruleze din nou din cauza lor, așa că le citim mereu prin referință.
  const closeState = useRef({ onClose, locked });
  useEffect(() => {
    closeState.current = { onClose, locked };
  });

  // Derularea paginii e blocată; lățimea barei de derulare devine spațiu în dreapta,
  // ca pagina din spate să nu „sară” în lateral. La închidere refacem valorile anterioare.
  useEffect(() => {
    const root = document.documentElement;
    const scrollbar = window.innerWidth - root.clientWidth;
    const previous = { overflow: root.style.overflow, paddingRight: root.style.paddingRight };
    root.style.overflow = "hidden";
    if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`;
    return () => {
      root.style.overflow = previous.overflow;
      root.style.paddingRight = previous.paddingRight;
    };
  }, []);

  // Focusul intră pe „Închide” și revine la elementul anterior; Escape închide fereastra.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !closeState.current.locked) closeState.current.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !locked) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        style={{ maxWidth: width }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#dde5e2] px-6 py-4">
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-bold text-primary">ADMINISTRATORUL BAZEI SPORTIVE</p>
            <h2 id={titleId} className="text-xl text-heading">
              {title}
            </h2>
            {subtitle}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={locked}
            className="rounded-lg border border-[#dde5e2] px-3 py-1.5 text-[13px] font-semibold text-heading hover:bg-bg disabled:opacity-50"
          >
            Închide
          </button>
        </header>
        <div className="flex flex-col gap-5 overflow-y-auto overscroll-contain px-6 py-5 leading-normal">{children}</div>
      </section>
    </div>
  );
}
