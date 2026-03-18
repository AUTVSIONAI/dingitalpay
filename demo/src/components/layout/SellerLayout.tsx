import { Outlet } from "react-router-dom";
import { sellerMenu } from "@/data/sidebar-menus";
import { PageMetaProvider } from "@/contexts/PageMetaContext";
import AppShell from "./AppShell";

const SellerLayout = () => (
  <PageMetaProvider>
    <AppShell menuItems={sellerMenu} menuTitle="Minha Loja">
      <Outlet />
    </AppShell>
  </PageMetaProvider>
);

export default SellerLayout;
