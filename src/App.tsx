import { Route, Routes } from "react-router-dom";
import Layout from "./components/layout/Layout";
import FacilitiesPage from "./pages/FacilitiesPage";
import FacilityDetailPage from "./pages/FacilityDetailPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<FacilitiesPage />} />
        <Route path="facilitati/:id" element={<FacilityDetailPage />} />
      </Route>
    </Routes>
  );
}
