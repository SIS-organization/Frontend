import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./AdminLayout";
import AdminActivityNewPage from "./pages/AdminActivityNewPage";
import AdminSchedulePage from "./pages/AdminSchedulePage";

// Rutele zonei /admin/*.
//
// Acest fișier (și tot ce importă) se încarcă separat (React.lazy în App.tsx) și
// DOAR după ce RequireAdmin a confirmat la server rolul de administrator. Astfel,
// browserul unui student nu descarcă niciodată codul paginilor de administrare.
//
// Momentan este implementată secțiunea „Orar și incidente”:
//   /admin/orar                    → orarul zilei
//   /admin/orar/activitate-noua    → „Adaugă activitate USV”
// Orice altă adresă /admin/... duce înapoi la orar.
export default function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route path="orar" element={<AdminSchedulePage />} />
        <Route path="orar/activitate-noua" element={<AdminActivityNewPage />} />
        <Route path="*" element={<Navigate to="/admin/orar" replace />} />
      </Route>
    </Routes>
  );
}
