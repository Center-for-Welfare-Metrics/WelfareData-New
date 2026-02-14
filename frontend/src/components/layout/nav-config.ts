import {
  LayoutDashboard,
  Network,
  PawPrint,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Processogramas", href: "/processogramas", icon: Network },
  { label: "Espécies", href: "/especies", icon: PawPrint },
  { label: "Admin", href: "/admin", icon: ShieldCheck, adminOnly: true },
];
