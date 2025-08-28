"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Gavel,
  LayoutGrid,
  Users,
  CheckSquare,
  MessageSquare,
  LineChart,
  LogOut,
} from "lucide-react";

import {
  Sidebar,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "./ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/dashboard/clients", label: "Clientes", icon: Users },
  { href: "/dashboard/processes", label: "Processos", icon: Gavel },
  { href: "/dashboard/tasks", label: "Tarefas", icon: CheckSquare },
  { href: "/dashboard/communications", label: "Comunicações", icon: MessageSquare },
  { href: "/dashboard/reports", label: "Relatórios", icon: LineChart },
];

export function DashboardNav() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 p-2">
            <Gavel className="size-8 text-sidebar-primary" />
            <span className="text-lg font-semibold text-sidebar-foreground">
              Barão de Mauá
            </span>
        </div>
      </SidebarHeader>
      <SidebarMenu>
        {links.map((link) => (
          <SidebarMenuItem key={link.href}>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith(link.href) && (link.href !== "/dashboard" || pathname === "/dashboard")}
              tooltip={link.label}
            >
              <Link href={link.href}>
                <link.icon className="size-5" />
                <span>{link.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
      <SidebarFooter>
        <SidebarMenu>
           <SidebarMenuItem>
             <SidebarMenuButton onClick={handleLogout} tooltip="Sair">
                <LogOut className="size-5" />
                <span>Sair</span>
             </SidebarMenuButton>
           </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
