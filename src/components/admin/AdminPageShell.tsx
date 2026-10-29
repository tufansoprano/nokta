import { ArrowLeft, BarChart3, CalendarDays, ClipboardPenLine, CreditCard, LayoutDashboard, MapPin, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

export const ADMIN_NAV_ITEMS = [
  { label: "Venues", to: "/admin/venues", icon: MapPin },
  // All six approve/reject workflows now live behind one queue.
  { label: "Review queue", to: "/admin/review", icon: ClipboardPenLine },
  { label: "Demand", to: "/admin/demand", icon: MessageSquare },
  { label: "Bookings", to: "/admin/bookings", icon: CalendarDays },
  { label: "Commercial", to: "/admin/commercial", icon: CreditCard },
  { label: "Insights", to: "/admin/insights", icon: BarChart3 },
];

const FOOTER_ITEMS = [
  { label: "Owner workspace", to: "/owner", icon: LayoutDashboard, end: true },
  { label: "Back to nokta", to: "/", icon: ArrowLeft, end: true },
];

export function AdminPageShell({ activePath, fullWidth = false, children }: { activePath: string; fullWidth?: boolean; children: ReactNode }) {
  return (
    <WorkspaceShell tag="Admin" homeTo="/admin/venues" label="Admin workspace" navItems={ADMIN_NAV_ITEMS} footerItems={FOOTER_ITEMS} activePath={activePath} storageKey="nokta-admin-sidebar-collapsed" fullWidth={fullWidth}>
      {children}
    </WorkspaceShell>
  );
}
