import { NavLink } from "react-router-dom";
import type { AuthRole } from "../../api/auth";
import { PulseIcon } from "../auth/LoginIcons";
import { BellIcon, GraduationCapIcon, HelpCircleIcon } from "../common/AppIcons";
import { useAuth } from "../../context/useAuth";
import { useBookings } from "../../context/useBookings";
import { monthName } from "../../utils/dates";
import { navItems } from "./navItems";

const roleCard: Record<AuthRole, { title: string; text: string; account: string }> = {
  student: {
    title: "Student USV",
    text: "Acces prioritar pentru comunitatea universitară.",
    account: "Student · cont instituțional",
  },
  admin: {
    title: "Administrator USV",
    text: "Acces la orar, incidente și rezervări.",
    account: "Administrator · cont instituțional",
  },
  guest: {
    title: "Public extern",
    text: "Acces la intervalele eligibile rămase după comunitatea USV.",
    account: "Public extern",
  },
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

// Meniul lateral din design („Comunitatea USV”): navigare, cardul rolului cu cota lunară și contul.
export default function Sidebar() {
  const { user } = useAuth();
  const { quota } = useBookings();
  const card = roleCard[user?.role ?? "student"];
  const hasQuota = quota && quota.included !== null && quota.included > 0;
  const usedPercent = hasQuota ? Math.min(100, (quota.used / (quota.included ?? 1)) * 100) : 0;

  return (
    <aside className="sticky top-0 hidden h-screen w-[216px] shrink-0 flex-col bg-sidebar px-[18px] pb-5 pt-7 text-white lg:flex">
      <div className="flex items-center gap-2.5 px-2">
        <span className="grid size-[34px] place-items-center rounded-md bg-lime text-heading">
          <PulseIcon className="size-5" />
        </span>
        <span className="flex flex-col">
          <span className="text-xl leading-tight">USV Sport</span>
          <span className="text-[8px] font-semibold uppercase tracking-wide text-white/75">Campus în mișcare</span>
        </span>
      </div>
      <p className="mt-6 px-2 text-[9px] font-semibold uppercase tracking-wide text-white/70">Comunitatea USV</p>

      <nav className="mt-7 flex flex-col gap-2.5">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex h-[45px] items-center gap-3 rounded-lg px-3.5 text-[13px] ${
                isActive ? "bg-lime text-heading" : "text-white/85 hover:bg-white/5"
              }`
            }
          >
            <Icon className="size-[18px]" />
            {label}
          </NavLink>
        ))}
        <span className="flex h-[45px] items-center gap-3 rounded-lg px-3.5 text-[13px] text-white/85">
          <BellIcon className="size-[18px]" />
          Notificări
        </span>
      </nav>

      <section className="mt-6 rounded-xl bg-white/[0.04] p-4">
        <GraduationCapIcon className="size-5 text-lime" />
        <p className="mt-3 text-[13px] font-semibold">{card.title}</p>
        <p className="mt-2.5 text-[11px] leading-relaxed text-white/65">{card.text}</p>
        {hasQuota && (
          <>
            <div className="mt-3.5 h-[3px] rounded-full bg-white/15">
              <div className="h-full rounded-full bg-lime" style={{ width: `${usedPercent}%` }} />
            </div>
            <p className="mt-3 text-[10px] font-semibold text-lime">
              {quota.used} din {quota.included} utilizate · {monthName(quota.month)}
            </p>
          </>
        )}
      </section>

      <div className="mt-auto">
        <p className="flex items-center gap-2.5 px-2 pb-4 text-[11px] text-white/75">
          <HelpCircleIcon className="size-[18px]" />
          Ajutor și regulament
        </p>
        <div className="flex items-center gap-3 border-t border-white/10 px-1 pt-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 text-[11px] font-semibold">
            {initials(user?.name ?? "")}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[11px] font-semibold">{user?.name}</span>
            <span className="block truncate text-[9px] text-white/65">{card.account}</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
