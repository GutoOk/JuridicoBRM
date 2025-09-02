
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState, useEffect } from "react";
import {
  Gavel,
  LayoutGrid,
  Users,
  CheckSquare,
  MessageSquare,
  LineChart,
  LogOut,
  Shield,
  FileText,
  User as UserIcon,
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
import { UserNav } from "./user-nav";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/dashboard/clients", label: "Clientes", icon: Users },
  { href: "/dashboard/processes", label: "Processos", icon: Gavel },
  { href: "/dashboard/tasks", label: "Tarefas", icon: CheckSquare },
  { href: "/dashboard/communications", label: "Atendimentos", icon: MessageSquare },
  { href: "/dashboard/annotations", label: "Anotações", icon: FileText },
  { href: "/dashboard/reports", label: "Relatórios", icon: LineChart },
  { href: "/dashboard/profile", label: "Perfil", icon: UserIcon },
  { href: "/dashboard/users", label: "Usuários", icon: Shield, admin: true },
];

export function DashboardNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [hasMasterAccess, setHasMasterAccess] = useState(false);

  useEffect(() => {
    // This check runs only on the client-side, after hydration
    if (typeof window !== 'undefined') {
      setHasMasterAccess(sessionStorage.getItem('master-access') === 'true');
    }
  }, []);

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
              Sistema Jurídico
            </span>
        </div>
      </SidebarHeader>
      <SidebarMenu>
        {links.map((link) => {
            if (link.label === "Usuários" && !hasMasterAccess) {
                return null;
            }
            if (link.label === "Relatórios" && user?.name !== "Áttila") {
                return null;
            }

            const isActive = link.href === "/dashboard" 
                ? pathname === "/dashboard"
                : pathname.startsWith(link.href);
            
            return (
              <SidebarMenuItem key={link.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={link.label}
                >
                  <Link href={link.href}>
                    <link.icon className="size-5" />
                    <span>{link.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
        })}
      </SidebarMenu>
      <SidebarFooter>
        <UserNav />
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
