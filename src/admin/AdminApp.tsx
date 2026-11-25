import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./AdminLayout";
import AdminSchedulePage from "./pages/AdminSchedulePage";

// Rutele zonei /admin/*.
//
// Acest fișier (și tot ce importă) se încarcă separat (React.lazy în App.tsx) și
// DOAR după ce RequireAdmin a confirmat la server rolul de administrator. Astfel,
// browserul unui student nu descarcă niciodată codul paginilor de administrare.
//
// Momentan există o singură pagină: „Orar și incidente” (/admin/orar). Orice altă
// adresă /admin/... duce înapoi la ea.
export default function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route path="orar" element={<AdminSchedulePage />} />
        <Route path="*" element={<Navigate to="/admin/orar" replace />} />
      </Route>
    </Routes>
  );
}
