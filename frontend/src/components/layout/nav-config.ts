import {
  LayoutDashboard,
  Network,
  PawPrint,
  Boxes,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Processogramas", href: "/admin/processograms", icon: Network },
  { label: "Espécies", href: "/admin/species", icon: PawPrint },
  { label: "Módulos", href: "/admin/modules", icon: Boxes },
];
