"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ForwardRefExoticComponent, type RefAttributes } from "react";
import {
  Gavel,
  LayoutGrid,
  Users,
  CheckSquare,
  LineChart,
  LogOut,
  FileText,
  Crosshair,
  Settings2,
  MessageSquareText,
  Shield,
  Folders,
  Wrench,
  LucideProps,
} from "lucide-react";

import {
  Sidebar,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { UserNav } from "./user-nav";
import { APP_NAME, isToolsOwner } from "@/lib/constants";

type Icon = ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>;
type NavLink = { href: string; label: string; description: string; icon: Icon };

const mainLinks: NavLink[] = [
  { href: "/dashboard", label: "Painel", description: "Resumo do dia, riscos e atalhos de trabalho.", icon: LayoutGrid },
  { href: "/dashboard/operacao", label: "Operação", description: "Fila principal para ligar, cobrar documentos e avançar checklists.", icon: Crosshair },
  { href: "/dashboard/clients", label: "Clientes", description: "Cadastro único de pessoas, contatos e vínculo com operações.", icon: Users },
  { href: "/dashboard/groups", label: "Grupos", description: "Listas personalizadas de clientes para organizar trabalhos em andamento.", icon: Folders },
  { href: "/dashboard/tasks", label: "Tarefas", description: "Pendências com responsável, prazo e prioridade.", icon: CheckSquare },
  { href: "/dashboard/updates", label: "Andamentos", description: "Histórico geral de contatos, tarefas, anotações e movimentações.", icon: FileText },
  { href: "/dashboard/processes", label: "Processos", description: "Números processuais e dados judiciais ligados aos clientes.", icon: Gavel },
  { href: "/dashboard/reports", label: "Relatórios", description: "Listas prontas, indicadores e exportações para gestão.", icon: LineChart },
];

const adminLinks: NavLink[] = [
  { href: "/dashboard/settings/templates", label: "Mensagens padrão", description: "Modelos de WhatsApp com variáveis do cliente.", icon: MessageSquareText },
  { href: "/dashboard/users", label: "Usuários", description: "Cria acessos, papéis e redefinição de senha.", icon: Shield },
];

const toolsLink: NavLink = {
  href: "/dashboard/tools",
  label: "Ferramentas",
  description: "Importações, duplicatas e revisão da qualidade cadastral.",
  icon: Wrench,
};

export function DashboardNav() {
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuth();
  const router = useRouter();
  const visibleAdminLinks = isToolsOwner(user?.email) ? [...adminLinks, toolsLink] : adminLinks;

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader>
        <div className="m-1 rounded-md border border-sidebar-border/60 bg-sidebar-accent/25 p-2">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary/90 text-sidebar-primary-foreground">
              <Gavel className="size-4" />
            </span>
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold text-sidebar-foreground">{APP_NAME}</span>
              <span className="block truncate text-[11px] text-sidebar-foreground/60">Operação jurídica</span>
            </div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarMenu>
        {mainLinks.map((link) => (
          <SidebarMenuItem key={link.href}>
            <SidebarMenuButton
              asChild
              isActive={isActive(link.href)}
              tooltip={{
                children: (
                  <div className="max-w-64">
                    <p className="font-medium">{link.label}</p>
                    <p className="text-xs text-muted-foreground">{link.description}</p>
                  </div>
                ),
              }}
            >
              <Link href={link.href}>
                <link.icon className="size-5" />
                <span>{link.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
      {isAdmin && (
        <SidebarGroup>
          <SidebarGroupLabel>Administração</SidebarGroupLabel>
          <SidebarMenu>
            {visibleAdminLinks.map((link) => (
              <SidebarMenuItem key={link.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(link.href)}
                  tooltip={{
                    children: (
                      <div className="max-w-64">
                        <p className="font-medium">{link.label}</p>
                        <p className="text-xs text-muted-foreground">{link.description}</p>
                      </div>
                    ),
                  }}
                >
                  <Link href={link.href}>
                    <link.icon className="size-5" />
                    <span>{link.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      )}
      <SidebarFooter className="mt-auto">
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
