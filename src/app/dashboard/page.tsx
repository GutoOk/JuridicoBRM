"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Loader2, Users, Crosshair, CheckSquare, PhoneMissed, AlertTriangle, ArrowRight, type LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { computeReadiness } from "@/lib/readiness";
import { caseFileId } from "@/lib/db-actions";
import { daysSince } from "@/lib/normalize";
import type { CaseFile, Client, ClientType, Update } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, MetricCard, PageHeader } from "@/components/shared/page-shell";

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: clients } = useCollection<Client>("clients");
  const { data: types } = useCollection<ClientType>("clientTypes");
  const { data: caseFiles } = useCollection<CaseFile>("caseFiles");
  const { data: tasks } = useCollection<Update>("updates", { where: [["type", "==", "Tarefa"]] });

  const stats = useMemo(() => {
    if (!clients || !types || !caseFiles) return null;
    const active = clients.filter((c) => !c.deleted);
    const cfMap = new Map(caseFiles.map((cf) => [cf.id, cf]));
    const activeTypes = types.filter((t) => !t.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const perType = activeTypes.map((t) => {
      const rows = active
        .filter((c) => (c.typeIds ?? []).includes(t.id))
        .map((c) => computeReadiness(t, cfMap.get(caseFileId(c.id, t.id)), c));
      return {
        type: t,
        total: rows.length,
        ready: rows.filter((r) => r.grade === "A").length,
        risk: rows.filter((r) => r.grade === "C" || r.grade === "D").length,
        filed: rows.filter((r) => r.grade === "P").length,
      };
    });

    const noRecentContact = active.filter((c) => {
      const d = daysSince(c.lastContactAt);
      return (d === null || d >= 7) && (c.typeIds ?? []).length > 0;
    }).length;

    const myTasks = (tasks ?? []).filter(
      (t) =>
        !t.deleted &&
        t.status !== "Concluída" &&
        (t.responsibleId === user?.id || t.responsible === user?.name || t.responsible === "Todos")
    ).length;

    return { total: active.length, perType, noRecentContact, myTasks };
  }, [clients, types, caseFiles, tasks, user]);

  if (!stats) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="painel"
        title={`Olá, ${user?.name?.split(" ")[0] ?? "equipe"}!`}
        description="Comece pelos riscos, contatos atrasados e tarefas pendentes. Os cartões abaixo são atalhos para agir, não apenas indicadores."
      >
        <Button asChild>
          <Link href="/dashboard/operacao">
            <Crosshair className="size-4" /> Abrir operação
          </Link>
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Users} label="Clientes ativos" value={stats.total} href="/dashboard/clients" />
        <StatCard icon={CheckSquare} label="Minhas tarefas pendentes" value={stats.myTasks} href="/dashboard/tasks" />
        <StatCard
          icon={PhoneMissed}
          label="Sem contato há 7+ dias"
          value={stats.noRecentContact}
          href="/dashboard/operacao"
        />
        <StatCard
          icon={AlertTriangle}
          label="Alto risco (todas operações)"
          value={stats.perType.reduce((s, t) => s + t.risk, 0)}
          href="/dashboard/operacao"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Operações</h2>
          <p className="text-xs text-muted-foreground">Clique para abrir a fila de trabalho do tipo.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {stats.perType
            .filter((t) => t.total > 0 || (t.type.checklist ?? []).length > 0)
            .map(({ type, total, ready, risk, filed }) => (
              <Card key={type.id} className="surface relative overflow-hidden">
                <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: type.color }} />
                <CardHeader className="pb-2 pl-5">
                  <CardTitle className="flex items-center justify-between text-base">
                    {type.name}
                    <span className="text-xl font-semibold">{total}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pl-5">
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <span className="rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-700">{ready} prontos</span>
                    <span className="rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-700">{risk} risco</span>
                    <span className="rounded-md bg-violet-50 px-2 py-1 font-medium text-violet-700">{filed} protocolo</span>
                  </div>
                  <Button size="sm" variant="outline" className="w-full" asChild>
                    <Link href="/dashboard/operacao">
                      <Crosshair className="mr-2 size-4" /> Abrir operação
                      <ArrowRight className="ml-auto size-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          {stats.perType.filter((t) => t.total > 0 || (t.type.checklist ?? []).length > 0).length === 0 && (
            <EmptyState
              title="Nenhuma operação configurada"
              description="Instale ou crie tipos de cliente em Administração para liberar as filas operacionais."
              className="md:col-span-2 lg:col-span-3"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link href={href}>
      <MetricCard icon={Icon} label={label} value={value} />
    </Link>
  );
}
