"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { DashboardNav } from "@/components/dashboard-nav";
import { useAuth } from "@/hooks/use-auth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { fbUser, user, loading, noProfile, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !fbUser) router.replace("/");
  }, [loading, fbUser, router]);

  if (loading || (!fbUser && typeof window !== "undefined")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (noProfile || (user && !user.active)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-4 text-center">
        <div className="surface flex max-w-md flex-col items-center gap-3 p-4">
        <ShieldAlert className="size-12 text-destructive" />
        <h1 className="text-xl font-semibold">
          {noProfile ? "Conta sem perfil de acesso" : "Conta desativada"}
        </h1>
        <p className="max-w-md text-muted-foreground">
          {noProfile
            ? "Sua conta foi autenticada, mas ainda não tem perfil neste sistema. Peça ao administrador para criar seu acesso."
            : "Seu acesso foi desativado pelo administrador."}
        </p>
        <Button variant="outline" onClick={() => logout().then(() => router.replace("/"))}>
          Sair
        </Button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <DashboardNav />
        <SidebarInset className="flex flex-1 flex-col bg-transparent">
          <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b bg-card/85 px-3 backdrop-blur-sm md:hidden">
            <SidebarTrigger />
            <div className="flex-1" />
          </header>
          <main className="flex-1 overflow-y-auto p-3 sm:p-4">{children}</main>
        </SidebarInset>
        <SidebarRail />
      </div>
    </SidebarProvider>
  );
}
