import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopNav from "./TopNav";
import Footer from "./Footer";

export default function Layout() {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <TopNav />
      <div className="flex min-h-screen flex-col md:ml-[216px]">
        <main className="w-full max-w-6xl flex-1 px-5 py-6 md:px-10 md:py-8">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  );
}
