"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { searchable } from "@/lib/normalize";
import type { Process } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, FilterChip, HelpTip, PageHeader, SearchBox, Toolbar } from "@/components/shared/page-shell";
import { ProcessFormDialog } from "@/components/shared/process-form";

const STATUS_FILTERS = ["Ativo", "Suspenso", "Arquivado", "Extinto"] as const;

export default function ProcessesPage() {
  const { isAdmin } = useAuth();
  const { data: processes } = useCollection<Process>("processes");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Process | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const rows = useMemo(() => {
    let out = (processes ?? []).filter((p) => showDeleted ? p.deleted : !p.deleted);
    if (statusFilter) out = out.filter((p) => p.status === statusFilter);
    const q = search.trim();
    if (q) {
      const qs = searchable(q);
      out = out.filter(
        (p) =>
          p.processNumber.toLowerCase().includes(q.toLowerCase()) ||
          (p.clientNames ?? []).some((n) => searchable(n).includes(qs)) ||
          searchable(p.actionType).includes(qs) ||
          searchable(p.parteContraria).includes(qs)
      );
    }
    return out.sort((a, b) => a.processNumber.localeCompare(b.processNumber));
  }, [processes, search, statusFilter, showDeleted]);
  const deletedCount = (processes ?? []).filter((process) => process.deleted).length;

  if (!processes) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="judicial"
        title="Processos"
        description={`${rows.length} processo(s). Um processo pode ter vários clientes vinculados — clique no número para abrir a página do processo com andamentos.`}
      >
        <HelpTip label="Cadastra um processo com clientes vinculados, polo, parte contrária e demais dados. Dá para preencher colando a capa do processo no botão de IA.">
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" /> Novo processo
          </Button>
        </HelpTip>
      </PageHeader>

      <Toolbar>
        <SearchBox
          placeholder="Buscar por número, cliente, parte contrária ou tipo de ação..."
          value={search}
          onChange={setSearch}
        />
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <FilterChip
              key={s}
              active={statusFilter === s}
              onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            >
              {s} {(processes ?? []).filter((p) => !p.deleted && p.status === s).length}
            </FilterChip>
          ))}
        </div>
        {isAdmin && deletedCount > 0 && (
          <FilterChip active={showDeleted} onClick={() => setShowDeleted((current) => !current)}>
            <Trash2 className="size-3" /> {showDeleted ? "Ver ativos" : `Ver apagados (${deletedCount})`}
          </FilterChip>
        )}
      </Toolbar>

      <div className="work-table">
        <Table className="column-dividers table-fixed">
          <TableHeader>
            <TableRow className="ledger-header">
              <TableHead className="w-[230px]">Número</TableHead>
              <TableHead>Cliente(s)</TableHead>
              <TableHead className="hidden w-36 lg:table-cell">Tipo de ação</TableHead>
              <TableHead className="hidden w-40 xl:table-cell">Parte contrária</TableHead>
              <TableHead className="hidden w-16 md:table-cell">
                <HelpTip label="Ativo: cliente é autor. Passivo: cliente é réu.">
                  <span className="cursor-help underline decoration-dotted underline-offset-2">Polo</span>
                </HelpTip>
              </TableHead>
              <TableHead className="w-[90px]">Status</TableHead>
              <TableHead className="w-14 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="truncate font-code text-[13px]">
                  <Link
                    href={`/dashboard/processes/${p.id}`}
                    className="block truncate text-primary underline-offset-2 hover:underline"
                    title={`${p.processNumber} — abrir a página do processo`}
                  >
                    {p.processNumber}
                  </Link>
                </TableCell>
                <TableCell className="truncate text-[13px]">
                  {(p.clientIds ?? []).length > 0 && p.clientIds[0] ? (
                    <Link
                      href={`/dashboard/clients/${p.mainClientId ?? p.clientIds[0]}`}
                      className="hover:underline"
                      title={(p.clientNames ?? []).join(", ")}
                    >
                      {(p.clientNames ?? []).join(", ") || "—"}
                    </Link>
                  ) : (
                    (p.clientNames ?? []).join(", ") || "—"
                  )}
                </TableCell>
                <TableCell className="hidden truncate text-[13px] lg:table-cell">
                  {p.actionType || "—"}
                </TableCell>
                <TableCell className="hidden truncate text-[13px] xl:table-cell">
                  {p.parteContraria || "—"}
                </TableCell>
                <TableCell className="hidden text-[13px] md:table-cell">{p.polo || "—"}</TableCell>
                <TableCell>
                  <Badge variant={p.status === "Ativo" ? "secondary" : "outline"}>{p.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <HelpTip label="Edita número, clientes vinculados, polo, parte contrária e demais dados." side="left">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(p);
                        setDialogOpen(true);
                      }}
                    >
                      Editar
                    </Button>
                  </HelpTip>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  <EmptyState
                    title="Nenhum processo encontrado"
                    description="Cadastre um novo processo ou ajuste a busca atual."
                    className="border-0 bg-transparent"
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ProcessFormDialog open={dialogOpen} onOpenChange={setDialogOpen} process={editing} />
    </div>
  );
}
