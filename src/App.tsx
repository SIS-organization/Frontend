import { Route, Routes } from "react-router-dom";
import { BookingsProvider } from "./context/BookingsContext";
import Layout from "./components/layout/Layout";
import FacilitiesPage from "./pages/FacilitiesPage";
import FacilityDetailPage from "./pages/FacilityDetailPage";
import MyBookingsPage from "./pages/MyBookingsPage";
import AdminSchedulePage from "./pages/AdminSchedulePage";

export default function App() {
  return (
    <BookingsProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<FacilitiesPage />} />
          <Route path="facilitati/:id" element={<FacilityDetailPage />} />
          <Route path="programari" element={<MyBookingsPage />} />
          <Route path="bookings" element={<MyBookingsPage />} />
          <Route path="rezervari" element={<MyBookingsPage />} />
          <Route path="reservari" element={<MyBookingsPage />} />
          <Route path="admin/orar" element={<AdminSchedulePage />} />
        </Route>
      </Routes>
    </BookingsProvider>
  );
}
