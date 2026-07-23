"use client";

import Link from "next/link";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { isToolsOwner } from "@/lib/constants";
import type { Client } from "@/lib/types";
import { PhoneQualityTool } from "@/components/shared/phone-quality-tool";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/shared/page-shell";

export default function PhoneToolsPage() {
  const { user, loading } = useAuth();
  const allowed = isToolsOwner(user?.email);
  const { data: clients } = useCollection<Client>(allowed ? "clients" : null);
  if (loading || (allowed && !clients)) return <div className="flex h-64 items-center justify-center"><Loader2 className="size-7 animate-spin text-muted-foreground" /></div>;
  if (!allowed) return <EmptyState icon={ShieldAlert} title="Ferramenta restrita" description="Esta área está disponível somente para Áttila." />;
  return <div className="page-shell"><PageHeader eyebrow="ferramentas" title="Revisar telefones" description="Números seguramente formatáveis começam selecionados. Casos com quantidade duvidosa ficam desmarcados."><Button asChild variant="outline" size="sm"><Link href="/dashboard/tools"><ArrowLeft className="mr-1.5 size-3.5" />Ferramentas</Link></Button></PageHeader><Card><CardContent className="pt-3"><PhoneQualityTool clients={clients ?? []} /></CardContent></Card></div>;
}
