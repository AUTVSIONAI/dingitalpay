import { Outlet } from "react-router-dom";
import { buyerMenu } from "@/data/sidebar-menus";
import { PageMetaProvider } from "@/contexts/PageMetaContext";
import AppShell from "./AppShell";

const BuyerLayout = () => (
  <PageMetaProvider>
    <AppShell menuItems={buyerMenu} menuTitle="Minha Conta">
      <Outlet />
    </AppShell>
  </PageMetaProvider>
);

export default BuyerLayout;
