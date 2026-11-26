import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./AdminLayout";
import AdminActivityManagePage from "./pages/AdminActivityManagePage";
import AdminActivityNewPage from "./pages/AdminActivityNewPage";
import AdminBlockFacilityPage from "./pages/AdminBlockFacilityPage";
import AdminIncidentPage from "./pages/AdminIncidentPage";
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
//   /admin/orar/activitati/:id     → „Gestionează activitatea USV”
//   /admin/orar/blocare            → „Blocare pentru mentenanță”
//   /admin/orar/incidente/:id      → „Deblocare anticipată” (detalii, istoric, redeschidere)
// Orice altă adresă /admin/... duce înapoi la orar.
export default function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route path="orar" element={<AdminSchedulePage />} />
        <Route path="orar/activitate-noua" element={<AdminActivityNewPage />} />
        <Route path="orar/activitati/:activityId" element={<AdminActivityManagePage />} />
        <Route path="orar/blocare" element={<AdminBlockFacilityPage />} />
        <Route path="orar/incidente/:incidentId" element={<AdminIncidentPage />} />
        <Route path="*" element={<Navigate to="/admin/orar" replace />} />
      </Route>
    </Routes>
  );
}
