"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Users, Crosshair, CheckSquare, PhoneMissed, AlertTriangle, ArrowRight, type LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { caseGrade } from "@/lib/readiness";
import { caseFileId } from "@/lib/db-actions";
import { daysSince, formatPhone } from "@/lib/normalize";
import { effectiveClientTypeIds } from "@/lib/client-nesting";
import type { CaseFile, Client, ClientType, Update } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, MetricCard, PageHeader } from "@/components/shared/page-shell";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CodeBadge } from "@/components/shared/badges";

type OperationQuickList = {
  title: string;
  description: string;
  clients: Client[];
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: clients } = useCollection<Client>("clients");
  const { data: types } = useCollection<ClientType>("clientTypes");
  const { data: caseFiles } = useCollection<CaseFile>("caseFiles");
  const { data: tasks } = useCollection<Update>("updates", { where: [["type", "==", "Tarefa"]] });
  const [quickList, setQuickList] = useState<OperationQuickList | null>(null);

  const stats = useMemo(() => {
    if (!clients || !types || !caseFiles) return null;
    const active = clients.filter((c) => !c.deleted);
    const cfMap = new Map(caseFiles.map((cf) => [cf.id, cf]));
    const activeTypes = types.filter((t) => !t.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const perType = activeTypes.map((t) => {
      const typedClients = active.filter((c) => effectiveClientTypeIds(c, active).includes(t.id));
      const withGrades = typedClients.map((client) => ({
        client,
        grade: caseGrade(cfMap.get(caseFileId(client.id, t.id))),
      }));
      return {
        type: t,
        total: typedClients.length,
        readyClients: withGrades.filter((item) => item.grade === "A").map((item) => item.client),
        riskClients: withGrades.filter((item) => item.grade === "C" || item.grade === "D").map((item) => item.client),
        filedClients: withGrades.filter((item) => item.grade === "P").map((item) => item.client),
      };
    });

    const noRecentContact = active.filter((c) => {
      const d = daysSince(c.lastContactAt);
      return (d === null || d >= 7) && effectiveClientTypeIds(c, active).length > 0;
    }).length;

    const myTasks = (tasks ?? []).filter(
      (t) =>
        !t.deleted &&
        t.status !== "Concluída" &&
        (t.responsibleIds?.includes(user?.id ?? "") || t.responsibleId === user?.id || t.responsible === user?.name || t.responsible === "Todos")
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
          value={stats.perType.reduce((sum, item) => sum + item.riskClients.length, 0)}
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
            .map(({ type, total, readyClients, riskClients, filedClients }) => (
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
                    <button
                      type="button"
                      className="rounded-md border bg-muted/20 px-2 py-1 font-medium text-foreground hover:bg-muted"
                      onClick={() => setQuickList({ title: `${type.name}: prontos`, description: "Clientes classificados como Redondo.", clients: readyClients })}
                    >
                      {readyClients.length} prontos
                    </button>
                    <button
                      type="button"
                      className="rounded-md border bg-muted/20 px-2 py-1 font-medium text-foreground hover:bg-muted"
                      onClick={() => setQuickList({ title: `${type.name}: risco`, description: "Clientes classificados como Alto risco ou Não protocolar.", clients: riskClients })}
                    >
                      {riskClients.length} risco
                    </button>
                    <button
                      type="button"
                      className="rounded-md border bg-muted/20 px-2 py-1 font-medium text-foreground hover:bg-muted"
                      onClick={() => setQuickList({ title: `${type.name}: protocolo`, description: "Clientes classificados como Protocolado.", clients: filedClients })}
                    >
                      {filedClients.length} protocolo
                    </button>
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

      <Sheet open={!!quickList} onOpenChange={(open) => !open && setQuickList(null)}>
        <SheetContent className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <SheetHeader className="shrink-0 border-b p-4 pr-12">
            <SheetTitle>{quickList?.title}</SheetTitle>
            <SheetDescription>{quickList?.description}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="space-y-1">
              {(quickList?.clients ?? []).map((client) => (
                <Link
                  key={client.id}
                  href={`/dashboard/clients/${client.id}`}
                  className="flex items-center gap-2 rounded-md border border-transparent px-2.5 py-2 hover:border-border hover:bg-muted/45"
                >
                  <CodeBadge code={client.code} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{client.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatPhone(client.phone || client.phones?.[0]?.number)}</span>
                </Link>
              ))}
              {quickList && quickList.clients.length === 0 && (
                <EmptyState title="Nenhum cliente nesta lista" description="A contagem será atualizada quando a equipe classificar clientes nesta operação." />
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
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
