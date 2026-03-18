// Shared types — Contratos v1

export type UserRole = "admin" | "seller" | "buyer";
export type UserStatus = "active" | "inactive";

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  createdAt: string;
  status: UserStatus;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  status: "active" | "inactive" | "draft";
  imageUrl: string;
  shortDescription: string;
}

export type OrderStatus = "approved" | "pending" | "refunded" | "chargeback" | "abandoned";
export type PaymentMethod = "pix" | "boleto" | "credit_card";

export type { PaymentProvider, PaymentResult } from "./payments";

export interface Order {
  id: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerCpf: string;
  productName: string;
  amount: number;
  method: PaymentMethod;
  status: OrderStatus;
  createdAt: string;
  transactionId: string;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
  };
}

export interface SidebarItem {
  label: string;
  icon: string;
  path: string;
}

export interface BreadcrumbItem {
  label: string;
  path?: string;
}
