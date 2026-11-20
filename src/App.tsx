import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Layout from "./components/layout/Layout";
import RequireAuth from "./components/auth/RequireAuth";
import LoginPage from "./pages/LoginPage";
import FacilitiesPage from "./pages/FacilitiesPage";
import FacilityDetailPage from "./pages/FacilityDetailPage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<FacilitiesPage />} />
          <Route path="facilitati/:id" element={<FacilityDetailPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}