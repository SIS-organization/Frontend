import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { BookingsProvider } from "./context/BookingsContext";
import Layout from "./components/layout/Layout";
import RequireAuth from "./components/auth/RequireAuth";
import RequireAdmin from "./components/auth/RequireAdmin";
import LoginPage from "./pages/LoginPage";
import FacilitiesPage from "./pages/FacilitiesPage";
import FacilityDetailPage from "./pages/FacilityDetailPage";
import MyBookingsPage from "./pages/MyBookingsPage";

// Zona de administrare se descarcă abia după ce serverul confirmă rolul de administrator.
const AdminApp = lazy(() => import("./admin/AdminApp"));

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route
          path="admin/*"
          element={
            <RequireAuth>
              <RequireAdmin>
                <Suspense fallback={null}>
                  <AdminApp />
                </Suspense>
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          element={
            <RequireAuth>
              <BookingsProvider>
                <Layout />
              </BookingsProvider>
            </RequireAuth>
          }
        >
          <Route index element={<FacilitiesPage />} />
          <Route path="facilitati/:id" element={<FacilityDetailPage />} />
          <Route path="programari" element={<MyBookingsPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}