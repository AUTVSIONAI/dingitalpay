export interface SidebarMenuItem {
  label: string;
  icon: string;
  path: string;
}

export const adminMenu: SidebarMenuItem[] = [
  { label: "Dashboard", icon: "LayoutDashboard", path: "/admin/dashboard" },
  { label: "Marketplace", icon: "ShoppingBag", path: "/admin/marketplace" },
  { label: "Usuários", icon: "Users", path: "/admin/users" },
  { label: "Saques", icon: "Wallet", path: "/admin/withdrawals" },
  { label: "Produtos", icon: "Package", path: "/admin/products" },
  { label: "Relatórios", icon: "BarChart3", path: "/admin/reports" },
  { label: "Financeiro", icon: "Landmark", path: "/admin/finances" },
  { label: "SMTP", icon: "Mail", path: "/admin/smtp" },
  { label: "E-mail Marketing", icon: "Megaphone", path: "/admin/email-campaigns" },
  { label: "Plataforma", icon: "Palette", path: "/admin/platform-settings" },
  { label: "Conquistas", icon: "Trophy", path: "/admin/achievements" },
  { label: "Adquirentes", icon: "CreditCard", path: "/admin/acquirers" },
  { label: "Atualizações", icon: "RefreshCw", path: "/admin/updates" },
];

export const sellerMenu: SidebarMenuItem[] = [
  { label: "Dashboard", icon: "LayoutDashboard", path: "/app/dashboard" },
  { label: "Marketplace", icon: "ShoppingBag", path: "/app/marketplace" },
  { label: "Vendas", icon: "ShoppingCart", path: "/app/sales" },
  { label: "Produtos", icon: "Package", path: "/app/products" },
  
  { label: "Saques", icon: "Wallet", path: "/app/withdrawals" },
  { label: "Integrações", icon: "Plug", path: "/app/integrations" },
];

export const buyerMenu: SidebarMenuItem[] = [
  { label: "Marketplace", icon: "ShoppingBag", path: "/buyer/marketplace" },
  { label: "Minhas Compras", icon: "ShoppingBag", path: "/buyer/purchases" },
  { label: "Afiliados", icon: "Megaphone", path: "/buyer/affiliates" },
  { label: "Meus Cursos", icon: "GraduationCap", path: "/members/courses" },
  { label: "Meu Perfil", icon: "User", path: "/buyer/profile" },
];
