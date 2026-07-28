import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  MessageSquare,
} from "lucide-react";
import type { NavItem } from "./nav-items";

// Sidebar del cliente. Mismas cuatro secciones que el prototipo, con el plan en
// segundo lugar porque es la pantalla que el cliente abre a diario. Citas y
// mensajes se marcan como proximos: su lado cliente llega con las interacciones.
export const clientNavItems: NavItem[] = [
  { label: "Dashboard", href: "/my/dashboard", icon: LayoutDashboard },
  { label: "My Plan", href: "/my/plan", icon: ClipboardList },
  { label: "Appointments", href: "/my/appointments", icon: Calendar, soon: true },
  { label: "Messages", href: "/my/messages", icon: MessageSquare, soon: true },
];
