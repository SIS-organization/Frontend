import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { ActivityIcon, ChevronDownIcon, LogOutIcon, ShieldCheckIcon } from "./AdminIcons";
import { COMING_SOON, adminHelpSection, adminSections, allAdminSections, type AdminSection } from "./adminNav";
import { formatLongDate, todayInBucharest } from "./time";
import { useIdleLogout } from "./useIdleLogout";

// Layout-ul zonei de administrare (Figma: „Administrare · Baza sportivă · Desktop”):
// meniul din stânga, antetul cu calea curentă și contul, conținutul paginii și subsolul.

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // deconectare automată după 15 minute fără activitate

/** Inițialele din avatar: „Administratorul Bazei Sportive” → „AB”. */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase("ro-RO"))
    .join("");
}

// Stilurile unui element din meniul lateral (dimensiuni și culori din Figma).
const NAV_ITEM = "flex h-10 w-full items-center gap-[10px] rounded-lg px-3 text-xs";
const NAV_ACTIVE = "bg-lime font-normal text-[#102832]";
const NAV_IDLE = "font-medium text-[#a8bec5] hover:bg-white/5 hover:text-white";

/**
 * Un element din meniul lateral. Secțiunile implementate sunt legături
 * (NavLink colorează automat secțiunea curentă); celelalte apar ca în Figma,
 * dar sunt inactive: nu duc nicăieri și sunt anunțate ca dezactivate.
 */
function SidebarItem({ section }: { section: AdminSection }) {
  const { path, label, Icon, ready } = section;
  const content = (
    <>
      <Icon className="size-[18px] shrink-0" />
      {label}
    </>
  );

  if (!ready) {
    return (
      <span aria-disabled="true" title={COMING_SOON} className={`${NAV_ITEM} cursor-not-allowed font-medium text-[#a8bec5]/60`}>
        {content}
      </span>
    );
  }
  return (
    <NavLink to={`/admin/${path}`} className={({ isActive }) => `${NAV_ITEM} ${isActive ? NAV_ACTIVE : NAV_IDLE}`}>
      {content}
    </NavLink>
  );
}

/** Săgeata din dreapta antetului: deschide meniul contului (deocamdată doar „Deconectare”). */
function AccountMenu({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Meniul se închide la click în afara lui sau la Escape.
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Meniul contului"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid size-7 place-items-center rounded-md text-muted hover:bg-black/5"
      >
        <ChevronDownIcon className="size-[18px]" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-[#dde5e2] bg-white p-1 shadow-lg">
          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-heading hover:bg-bg"
          >
            <LogOutIcon className="size-4" />
            Deconectare
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Deconectarea șterge token-ul (logout) și trimite la /login. Datele afișate în
  // paginile de admin stau doar în memorie, deci dispar odată cu ele.
  const signOut = useCallback(() => {
    logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  useIdleLogout(IDLE_TIMEOUT_MS, signOut);

  // Secțiunea curentă, pentru „Consolă operațională / …” din antet.
  const current = allAdminSections.find((section) => location.pathname.startsWith(`/admin/${section.path}`));
  const name = user?.name ?? "Administrator";

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="sticky top-0 hidden h-screen w-[216px] shrink-0 flex-col justify-between overflow-y-auto bg-sidebar px-[18px] pt-6 pb-5 lg:flex">
        {/* Partea de sus: identitatea aplicației, meniul și cardul de context. */}
        <div className="flex flex-col gap-7">
          <div className="flex flex-col gap-[18px] px-2">
            <div className="flex items-center gap-[10px]">
              <span className="grid h-[38px] w-[34px] place-items-center rounded-md bg-lime text-sidebar">
                <ActivityIcon className="size-[22px]" />
              </span>
              <span className="flex flex-col gap-[3px] whitespace-nowrap">
                <span className="text-xl text-white">USV Sport</span>
                <span className="text-[8px] font-semibold text-[#a8bec5]">CAMPUS ÎN MIȘCARE</span>
              </span>
            </div>
            <p className="text-[10px] font-semibold text-[#a8bec5]">ADMINISTRARE USV</p>
          </div>

          <nav aria-label="Administrare" className="flex flex-col gap-2">
            {adminSections.map((section) => (
              <SidebarItem key={section.path} section={section} />
            ))}
          </nav>

          <div className="flex flex-col gap-3 rounded-xl bg-[#102832] p-4">
            <ShieldCheckIcon className="size-[22px] text-lime" />
            <p className="text-[13px] font-semibold text-white">Administrare bază sportivă</p>
            <p className="text-[11px] leading-[1.6] text-[#a8bec5]">Orar universitar, mentenanță și acces la facilități.</p>
          </div>
        </div>

        {/* Partea de jos: ajutor și contul conectat (numele vine de la server, din /users/me). */}
        <div className="flex flex-col gap-[22px]">
          {/* „Ajutor și regulament” — inactiv până la implementarea secțiunii. */}
          <span
            aria-disabled="true"
            title={COMING_SOON}
            className="flex cursor-not-allowed items-center gap-[10px] px-3 text-xs text-[#a8bec5]"
          >
            <adminHelpSection.Icon className="size-[17px]" />
            {adminHelpSection.label}
          </span>
          <div className="h-px bg-[#2a4049]" />
          <div className="flex items-center gap-[10px] px-1.5">
            <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-[#314b55] text-[11px] font-bold text-white">
              {initials(name)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] font-semibold text-white">{name}</span>
              <span className="text-[10px] text-[#a8bec5]">Cont de administrator</span>
            </span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[#dde5e2] bg-white px-5 md:px-8">
          <nav aria-label="Cale de navigare" className="flex items-center gap-[10px] text-xs whitespace-nowrap">
            <span className="hidden text-muted sm:inline">Consolă operațională</span>
            <span className="hidden text-muted sm:inline">/</span>
            <span className="font-semibold text-heading">{current?.label ?? "Administrare"}</span>
          </nav>
          <div className="flex items-center gap-5">
            <span className="hidden text-xs text-muted md:inline">{formatLongDate(todayInBucharest())}</span>
            <span className="rounded-md bg-[#e9edf5] px-[9px] py-[5px] text-[11px] font-semibold whitespace-nowrap text-[#4a5879]">
              Acces autorizat
            </span>
            <AccountMenu onLogout={signOut} />
          </div>
        </header>

        {/* Pe ecrane mici, meniul din stânga devine o bandă orizontală. */}
        <nav aria-label="Administrare" className="flex gap-2 overflow-x-auto bg-sidebar px-4 py-2 lg:hidden">
          {allAdminSections.map(({ path, label, ready }) =>
            ready ? (
              <NavLink
                key={path}
                to={`/admin/${path}`}
                className={({ isActive }) =>
                  `shrink-0 rounded-lg px-3 py-2 text-xs ${isActive ? "bg-lime text-[#102832]" : "text-[#a8bec5]"}`
                }
              >
                {label}
              </NavLink>
            ) : (
              <span key={path} aria-disabled="true" title={COMING_SOON} className="shrink-0 px-3 py-2 text-xs text-[#a8bec5]/60">
                {label}
              </span>
            ),
          )}
        </nav>

        <main className="flex flex-1 flex-col gap-5 px-5 pt-6 pb-6 md:px-8">
          <Outlet />
        </main>

        <footer className="flex flex-col gap-2 px-5 py-4 text-[10px] text-muted md:flex-row md:justify-between md:px-10">
          <span>© 2026 USV Sport · Universitatea „Ștefan cel Mare” din Suceava</span>
          <span className="flex gap-5">
            <span>Regulament</span>
            <span>Confidențialitate</span>
            <span>Contact</span>
          </span>
        </footer>
      </div>
    </div>
  );
}
