"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { navItems, settingsItem, type NavItem } from "./nav-items";
import { clientNavItems } from "./client-nav-items";

const STORAGE_KEY = "nutriapp:sidebar-collapsed";

// Un solo sidebar con dos juegos de secciones. La variante viaja como texto y
// las tablas de navegacion se quedan de este lado del limite, porque los iconos
// son componentes y no se pueden pasar como props desde el servidor.
type Sections = { items: NavItem[]; footerItem?: NavItem };

const SECTIONS: Record<"nutritionist" | "client", Sections> = {
  nutritionist: { items: navItems, footerItem: settingsItem },
  client: { items: clientNavItems },
};

export function Sidebar({ variant }: { variant: keyof typeof SECTIONS }) {
  const { items, footerItem } = SECTIONS[variant];
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-border bg-card transition-[width] duration-200",
        collapsed ? "w-sidebar-collapsed" : "w-sidebar"
      )}
    >
      <div
        className={cn(
          "flex h-header items-center border-b border-border px-4",
          collapsed ? "justify-center" : "justify-between"
        )}
      >
        <Logo showText={!collapsed} />
        {!collapsed && (
          <button
            onClick={toggle}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Colapsar menú"
          >
            <PanelLeftClose className="size-5" />
          </button>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {collapsed && (
          <button
            onClick={toggle}
            className="mb-1 flex h-10 items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Expandir menú"
          >
            <PanelLeft className="size-5" />
          </button>
        )}
        {items.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            active={pathname.startsWith(item.href)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {footerItem && (
        <div className="border-t border-border p-3">
          <SidebarLink
            item={footerItem}
            active={pathname.startsWith(footerItem.href)}
            collapsed={collapsed}
          />
        </div>
      )}
    </aside>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  if (item.soon) {
    return (
      <div
        title={collapsed ? `${item.label} (soon)` : undefined}
        className={cn(
          "flex h-10 items-center gap-3 rounded-control px-3 text-sm text-muted-foreground/60",
          collapsed && "justify-center px-0"
        )}
      >
        <Icon className="size-5 shrink-0" />
        {!collapsed && (
          <>
            <span>{item.label}</span>
            <span className="ml-auto text-xs uppercase tracking-wide">Soon</span>
          </>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-control px-3 text-sm transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-brand-soft font-semibold text-brand"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="size-5 shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}
