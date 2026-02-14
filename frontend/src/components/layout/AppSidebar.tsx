"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { NAV_ITEMS, type NavItem } from "./nav-config";

interface SidebarNavProps {
  onNavigate?: () => void;
}

function NavLink({ item, isActive, onNavigate }: { item: NavItem; isActive: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
        isActive
          ? "text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {isActive && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-md bg-primary/15 border border-primary/30"
          style={{
            boxShadow: "0 0 12px oklch(0.637 0.237 25.331 / 0.25), inset 0 0 12px oklch(0.637 0.237 25.331 / 0.08)",
          }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}

      {isActive && (
        <motion.div
          layoutId="sidebar-indicator"
          className="absolute left-0 top-1/2 h-5 w-0.75 -translate-y-1/2 rounded-r-full bg-primary"
          style={{
            boxShadow: "0 0 8px oklch(0.637 0.237 25.331 / 0.6)",
          }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}

      <motion.div
        className="relative z-10"
        whileHover={{ scale: 1.1 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
      >
        <Icon className={cn("size-4", isActive && "text-primary")} />
      </motion.div>

      <span className="relative z-10">{item.label}</span>
    </Link>
  );
}

export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <ScrollArea className="flex-1 py-2">
      <nav className="flex flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            isActive={isActive(item.href)}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </ScrollArea>
  );
}

export function SidebarContent({ onNavigate }: SidebarNavProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-3 px-4">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary/15 border border-primary/30">
          <Activity className="size-4 text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-wide text-foreground">
            WelfareData
          </span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            v1.0 — WFI/USP
          </span>
        </div>
      </div>

      <Separator className="opacity-40" />

      <SidebarNav onNavigate={onNavigate} />

      <Separator className="opacity-40" />

      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[11px] font-mono text-muted-foreground">
            System Online
          </span>
        </div>
      </div>
    </div>
  );
}
