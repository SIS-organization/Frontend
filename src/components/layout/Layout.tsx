import { Outlet } from "react-router-dom";
import Footer from "./Footer";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

// Structura comună din design: meniul lateral, bara de sus, conținutul paginii și subsolul.
export default function Layout() {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col px-5 py-8 md:px-10">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  );
}
