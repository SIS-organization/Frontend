import { NavLink } from "react-router-dom";
import { navItems } from "./navItems";

export default function TopNav() {
  return (
    <header className="bg-sidebar px-5 py-3 text-white md:hidden">
      <div className="mb-3 font-bold">USV Sport</div>
      <nav className="flex gap-2">
        {navItems.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.to === "/"}
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 text-sm ${isActive ? "bg-lime font-medium text-heading" : "bg-white/10"}`
            }
          >
            {i.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
