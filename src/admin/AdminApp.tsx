import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./AdminLayout";
import AdminActivityManagePage from "./pages/AdminActivityManagePage";
import AdminActivityNewPage from "./pages/AdminActivityNewPage";
import AdminBlockFacilityPage from "./pages/AdminBlockFacilityPage";
import AdminBookingsPage from "./pages/AdminBookingsPage";
import AdminHelpPage from "./pages/AdminHelpPage";
import AdminIncidentPage from "./pages/AdminIncidentPage";
import AdminSchedulePage from "./pages/AdminSchedulePage";
import AdminUserProfilePage from "./pages/AdminUserProfilePage";
import AdminUsersPage from "./pages/AdminUsersPage";

// Rutele zonei /admin/*.
//
// Acest fișier (și tot ce importă) se încarcă separat (React.lazy în App.tsx) și
// DOAR după ce RequireAdmin a confirmat la server rolul de administrator. Astfel,
// browserul unui student nu descarcă niciodată codul paginilor de administrare.
//
// Secțiunea „Orar și incidente”:
//   /admin/orar                    → orarul zilei
//   /admin/orar/activitate-noua    → „Adaugă activitate USV”
//   /admin/orar/activitati/:id     → „Gestionează activitatea USV”
//   /admin/orar/blocare            → „Blocare pentru mentenanță”
//   /admin/orar/incidente/:id      → „Deblocare anticipată” (detalii, istoric, redeschidere)
// Secțiunea „Rezervări”:
//   /admin/rezervari               → lista rezervărilor (file, căutare, filtre)
// Secțiunea „Utilizatori”:
//   /admin/utilizatori             → directorul comunității (totaluri, căutare, filtre)
//   /admin/utilizatori/:userId     → „Profil utilizator” (profil, acces, rezervări recente)
// „Ajutor și regulament”:
//   /admin/ajutor                  → regulile platformei (GET /rules) și unde se află fiecare acțiune
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
        <Route path="rezervari" element={<AdminBookingsPage />} />
        <Route path="utilizatori" element={<AdminUsersPage />} />
        <Route path="utilizatori/:userId" element={<AdminUserProfilePage />} />
        <Route path="ajutor" element={<AdminHelpPage />} />
        <Route path="*" element={<Navigate to="/admin/orar" replace />} />
      </Route>
    </Routes>
  );
}
