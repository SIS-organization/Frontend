import { CalendarIcon, GridIcon } from "../common/AppIcons";

export const navItems = [
  { to: "/", label: "Facilități", Icon: GridIcon },
  { to: "/programari", label: "Programările mele", Icon: CalendarIcon },
];

// Titlul paginii curente, afișat în bara de sus („Campus Suceava / …”).
export function pageTitle(pathname: string): string {
  if (pathname.startsWith("/programari")) return "Programările mele";
  return "Facilități";
}
