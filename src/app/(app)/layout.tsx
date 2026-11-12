import { requireUser } from "../../lib/auth/guard";
import { NavShell, type NavItem } from "../../components/NavShell";

const BASE_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/attendance", label: "Attendance", icon: "🕒" },
  { href: "/leave", label: "Leave", icon: "🗓️" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
];

const APPROVER_ITEMS: NavItem[] = [{ href: "/approvals", label: "Approvals", icon: "✅" }];
const HR_ITEMS: NavItem[] = [
  { href: "/admin/employees", label: "Employees", icon: "👥" },
  { href: "/admin/holidays", label: "Holidays", icon: "🎉" },
  { href: "/admin/leave-types", label: "Leave Types", icon: "🧾" },
  { href: "/admin/attendance-import", label: "Import Attendance", icon: "📥" },
  { href: "/admin/settings", label: "Settings", icon: "⚙️" },
  { href: "/reports", label: "Reports", icon: "📊" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const items = [...BASE_ITEMS];
  if (["MANAGER", "HR", "OWNER"].includes(user.role)) items.push(...APPROVER_ITEMS);
  if (["HR", "OWNER"].includes(user.role)) items.push(...HR_ITEMS);

  return (
    <NavShell items={items} userName={user.name} userRole={user.role}>
      {children}
    </NavShell>
  );
}
