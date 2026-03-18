import { Outlet } from "react-router-dom";
import { adminMenu } from "@/data/sidebar-menus";
import { PageMetaProvider } from "@/contexts/PageMetaContext";
import AppShell from "./AppShell";

const AdminLayout = () => (
  <PageMetaProvider>
    <AppShell menuItems={adminMenu} menuTitle="Plataforma">
      <Outlet />
    </AppShell>
  </PageMetaProvider>
);

export default AdminLayout;
