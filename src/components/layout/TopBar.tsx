import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronDownIcon } from "../common/AppIcons";
import { useAuth } from "../../context/useAuth";
import { useNow } from "../../hooks/useNow";
import { longDate } from "../../utils/dates";
import { navItems, pageTitle } from "./navItems";

// Bara de sus din design: „Campus Suceava / pagina”, data de azi, comunitatea și meniul contului.
export default function TopBar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const today = useNow(60_000);
  const community = user?.role === "guest" ? "Public extern" : "Comunitatea USV";

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-20 border-b border-black/10 bg-white">
      <div className="flex h-20 items-center justify-between gap-4 px-5 md:px-10">
        <p className="text-[13px] text-muted">
          <span className="hidden sm:inline">Campus Suceava</span>
          <span className="mx-2.5 hidden sm:inline">/</span>
          <span className="font-semibold text-heading">{pageTitle(pathname)}</span>
        </p>
        <div className="relative flex items-center gap-4">
          <span className="hidden text-[13px] text-muted md:inline">{longDate(today)}</span>
          <span className="rounded-md bg-[#e3f0ee] px-2.5 py-1.5 text-[11px] font-semibold text-primary">
            {community}
          </span>
          <button
            type="button"
            aria-label="Meniul contului"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="grid size-8 place-items-center rounded-md text-muted hover:bg-bg"
          >
            <ChevronDownIcon className="size-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 w-48 rounded-xl border border-black/10 bg-white p-1.5 shadow-lg">
              <p className="truncate px-3 py-2 text-xs text-muted">{user?.name}</p>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-heading hover:bg-bg"
              >
                Deconectare
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Pe ecrane mici meniul lateral e ascuns, deci navigarea apare aici. */}
      <nav className="flex gap-2 overflow-x-auto px-5 pb-3 lg:hidden">
        {navItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${isActive ? "bg-lime text-heading" : "text-muted"}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
