"use client";

import { useMemo, useState } from "react";
import { Loader2, Download } from "lucide-react";
import { useCollection } from "@/hooks/use-collection";
import { caseGrade, pendingItems, GRADES, GRADE_META, type Grade } from "@/lib/readiness";
import { activeChecklistItems, displayStatus } from "@/lib/checklist";
import { caseFileId } from "@/lib/db-actions";
import { daysSince, dateMillis, formatPhone, formatRelative } from "@/lib/normalize";
import { exportXlsx } from "@/lib/export";
import { effectiveClientTypeIds } from "@/lib/client-nesting";
import type { CaseFile, Client, ClientType, Update } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EmptyState, FilterChip, HelpTip, PageHeader } from "@/components/shared/page-shell";
import { clientTypeSelectedStyle } from "@/lib/client-type-style";

export default function ReportsPage() {
  const { data: clients } = useCollection<Client>("clients");
  const { data: types } = useCollection<ClientType>("clientTypes");
  const { data: caseFiles } = useCollection<CaseFile>("caseFiles");
  const { data: updates } = useCollection<Update>("updates", {
    orderBy: [["createdAt", "desc"]],
    limit: 2000,
  });

  const activeTypes = useMemo(
    () => (types ?? []).filter((t) => !t.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [types]
  );
  const [typeId, setTypeId] = useState<string | null>(null);
  const selectedTypeId = typeId ?? activeTypes.find((t) => t.id === "barao-de-maua")?.id ?? activeTypes[0]?.id;
  const selectedType = activeTypes.find((t) => t.id === selectedTypeId) ?? null;

  const activeClients = useMemo(() => (clients ?? []).filter((c) => !c.deleted), [clients]);

  // ---- por tipo ----
  const typeCounts = activeTypes.map((t) => ({
    type: t,
    count: activeClients.filter((c) => effectiveClientTypeIds(c, activeClients).includes(t.id)).length,
  }));

  // ---- análise do tipo selecionado ----
  const analysis = useMemo(() => {
    if (!selectedType || !caseFiles) return null;
    const cfMap = new Map(caseFiles.map((cf) => [cf.id, cf]));
    const rows = activeClients
      .filter((c) => effectiveClientTypeIds(c, activeClients).includes(selectedType.id))
      .map((client) => {
        const cf = cfMap.get(caseFileId(client.id, selectedType.id));
        return { client, cf, grade: caseGrade(cf), pending: pendingItems(selectedType, cf) };
      });

    // Prontidão é classificação MANUAL da equipe; "none" = ainda sem classificação.
    const grades: Record<Grade | "none", number> = { A: 0, B: 0, C: 0, D: 0, P: 0, none: 0 };
    rows.forEach((r) => grades[r.grade ?? "none"]++);

    const missingByItem = activeChecklistItems(selectedType)
      .map((item) => ({
        item,
        missing: rows.filter(
          (r) => r.grade !== "P" && displayStatus(r.cf?.items?.[item.id]?.status) !== "conferido"
        ).length,
      }))
      .filter((x) => x.missing > 0)
      .sort((a, b) => b.missing - a.missing);

    const needCall = rows.filter(
      (r) =>
        r.grade !== "P" &&
        r.pending.length > 0 &&
        ((r.client.lastContactAt ? daysSince(r.client.lastContactAt) ?? 999 : 999) >= 7)
    );
    const highRisk = rows.filter((r) => r.grade === "C" || r.grade === "D");
    const ready = rows.filter((r) => r.grade === "A");

    return { rows, grades, missingByItem, needCall, highRisk, ready };
  }, [selectedType, activeClients, caseFiles]);

  // ---- produtividade 30 dias ----
  const productivity = useMemo(() => {
    if (!updates) return [];
    const cutoff = Date.now() - 30 * 86400000;
    const byUser = new Map<string, { contacts: number; tasksDone: number }>();
    updates.forEach((u) => {
      if (u.deleted) return;
      if (u.type === "Atendimento" && dateMillis(u.createdAt) >= cutoff) {
        const e = byUser.get(u.author) ?? { contacts: 0, tasksDone: 0 };
        e.contacts++;
        byUser.set(u.author, e);
      }
      if (u.type === "Tarefa" && u.completedBy && dateMillis(u.completedAt) >= cutoff) {
        const e = byUser.get(u.completedBy) ?? { contacts: 0, tasksDone: 0 };
        e.tasksDone++;
        byUser.set(u.completedBy, e);
      }
    });
    return [...byUser.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.contacts + b.tasksDone - (a.contacts + a.tasksDone));
  }, [updates]);

  const exportList = (rows: NonNullable<typeof analysis>["rows"], name: string) => {
    exportXlsx(
      rows.map((r) => ({
        "Código": r.client.code ?? "",
        "Nome": r.client.name,
        "Telefone": formatPhone(r.client.phone || r.client.phones?.[0]?.number),
        "Prontidão": r.grade ? GRADE_META[r.grade].label : "",
        "Pendências": r.pending.map((p) => p.name).join("; "),
        "Último contato": r.client.lastContactAt ? formatRelative(r.client.lastContactAt) : "nunca",
      })),
      name
    );
  };

  if (!clients || !types || !caseFiles) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const total = activeClients.length;

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="gestão"
        title="Relatórios"
        description={`${total} clientes ativos no total. Use os blocos para descobrir gargalos, priorizar ligações e exportar listas prontas para a equipe.`}
      />

      {/* Clientes por tipo */}
      <Card className="surface">
        <CardHeader className="pb-3">
          <CardTitle>Clientes por tipo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {typeCounts.map(({ type, count }) => (
            <div key={type.id} className="flex items-center gap-2">
              <span className="w-48 truncate text-sm">{type.name}</span>
              <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${total ? Math.max((count / total) * 100, count > 0 ? 2 : 0) : 0}%`,
                    backgroundColor: type.color,
                  }}
                />
              </div>
              <span className="w-10 text-right text-sm font-semibold">{count}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Análise por tipo */}
      <div className="flex flex-wrap gap-1.5">
        {activeTypes.map((t) => (
          <FilterChip
            key={t.id}
            onClick={() => setTypeId(t.id)}
            active={selectedTypeId === t.id}
            style={selectedTypeId === t.id ? clientTypeSelectedStyle(t) : undefined}
          >
            {t.name}
          </FilterChip>
        ))}
      </div>

      {selectedType && analysis && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {GRADES.map((g) => (
              <Card key={g} className="surface">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md text-sm font-semibold",
                        GRADE_META[g].className
                      )}
                    >
                      {g}
                    </span>
                    <span className="text-xl font-semibold">{analysis.grades[g]}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {GRADE_META[g].label.replace(/^[A-Z] — /, "")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="surface">
              <CardHeader className="pb-3">
                <CardTitle>O que mais falta ({selectedType.name})</CardTitle>
                <CardDescription>Clientes sem o item resolvido (excluindo protocolados).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {analysis.missingByItem.slice(0, 12).map(({ item, missing }) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                    <div className="h-4 w-32 overflow-hidden rounded bg-muted">
                      <div
                        className="h-full rounded bg-amber-500"
                        style={{ width: `${(missing / Math.max(analysis.rows.length, 1)) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-sm font-semibold">{missing}</span>
                  </div>
                ))}
                {analysis.missingByItem.length === 0 && (
                  <EmptyState
                    title="Nada pendente neste recorte"
                    description="Os itens-chave deste tipo estão resolvidos para os clientes listados."
                    className="border-0 bg-transparent"
                  />
                )}
              </CardContent>
            </Card>

            <Card className="surface">
              <CardHeader className="pb-3">
                <CardTitle>Exportações rápidas</CardTitle>
                <CardDescription>Listas prontas para trabalhar.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <HelpTip label="Gera uma planilha com clientes que têm pendências e estão há 7 dias ou mais sem contato.">
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => exportList(analysis.needCall, `ligacoes-${selectedType.name}`)}
                >
                  Lista para ligação (com pendência, sem contato 7+ dias)
                  <span className="flex items-center gap-2 font-semibold">
                    {analysis.needCall.length} <Download className="size-4" />
                  </span>
                </Button>
                </HelpTip>
                <HelpTip label="Gera uma planilha com clientes classificados como prontos para protocolo.">
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => exportList(analysis.ready, `prontos-${selectedType.name}`)}
                >
                  Prontos para protocolo (A)
                  <span className="flex items-center gap-2 font-semibold">
                    {analysis.ready.length} <Download className="size-4" />
                  </span>
                </Button>
                </HelpTip>
                <HelpTip label="Gera uma planilha com clientes que exigem decisão ou ação urgente.">
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => exportList(analysis.highRisk, `alto-risco-${selectedType.name}`)}
                >
                  Alto risco (C e D)
                  <span className="flex items-center gap-2 font-semibold">
                    {analysis.highRisk.length} <Download className="size-4" />
                  </span>
                </Button>
                </HelpTip>
                <HelpTip label="Gera uma planilha com todos os clientes vinculados a este tipo.">
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => exportList(analysis.rows, `todos-${selectedType.name}`)}
                >
                  Todos deste tipo
                  <span className="flex items-center gap-2 font-semibold">
                    {analysis.rows.length} <Download className="size-4" />
                  </span>
                </Button>
                </HelpTip>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Produtividade */}
      <Card className="surface">
        <CardHeader className="pb-3">
          <CardTitle>Produtividade por usuário (últimos 30 dias)</CardTitle>
          <CardDescription>Contatos registrados e tarefas concluídas.</CardDescription>
        </CardHeader>
        <CardContent>
          {productivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem registros nos últimos 30 dias.</p>
          ) : (
            <div className="space-y-1.5">
              {productivity.map((p) => (
                <div key={p.name} className="flex items-center gap-3 text-sm">
                  <span className="w-40 truncate font-medium">{p.name}</span>
                  <span className="text-muted-foreground">
                    {p.contacts} contato(s) · {p.tasksDone} tarefa(s) concluída(s)
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
