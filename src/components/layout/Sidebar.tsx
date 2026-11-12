import { NavLink } from "react-router-dom";
import { navItems } from "./navItems";

export default function Sidebar() {
  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 w-[216px] flex-col bg-sidebar p-4 text-white">
      <div className="mb-8 px-3 text-lg font-bold">USV Sport</div>
      <nav className="flex flex-col gap-1">
        {navItems.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.to === "/"}
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 text-sm ${isActive ? "bg-lime font-medium text-heading" : "text-white/80 hover:bg-white/10"}`
            }
          >
            {i.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-1 text-sm text-white/60">
        <button type="button" className="px-3 py-2 text-left">Ajutor</button>
        <button type="button" className="px-3 py-2 text-left">Cont</button>
      </div>
    </aside>
  );
}
