"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Download, Sparkles } from "lucide-react";
import { useCollection } from "@/hooks/use-collection";
import {
  searchable,
  digitsOnly,
  formatPhone,
  formatRelative,
} from "@/lib/normalize";
import { exportXlsx } from "@/lib/export";
import type { Client, ClientType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CodeBadge, TypeChip } from "@/components/shared/badges";
import { EmptyState, FilterChip, HelpTip, PageHeader, SearchBox, Toolbar } from "@/components/shared/page-shell";
import { AiImportDialog } from "@/components/shared/ai-import-dialog";

export default function ClientsPage() {
  const { data: clients } = useCollection<Client>("clients");
  const { data: types } = useCollection<ClientType>("clientTypes");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const activeTypes = (types ?? []).filter((t) => !t.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const typeMap = new Map(activeTypes.map((t) => [t.id, t]));

  const rows = useMemo(() => {
    let out = (clients ?? []).filter((c) => !c.deleted);
    if (typeFilter) out = out.filter((c) => (c.typeIds ?? []).includes(typeFilter));
    const q = search.trim();
    if (q) {
      const qs = searchable(q);
      const qd = digitsOnly(q);
      out = out.filter(
        (c) =>
          searchable(c.name).includes(qs) ||
          (c.code ?? "").toLowerCase().includes(q.toLowerCase()) ||
          (qd.length >= 3 && (c.cpfCnpjDigits ?? digitsOnly(c.cpfCnpj)).includes(qd)) ||
          (qd.length >= 4 &&
            ((c.phoneDigits ?? digitsOnly(c.phone)).includes(qd) ||
              (c.phones ?? []).some((p) => digitsOnly(p.number).includes(qd))))
      );
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [clients, search, typeFilter]);

  const exportList = () => {
    exportXlsx(
      rows.map((c) => ({
        "Código": c.code ?? "",
        "Nome": c.name,
        "CPF/CNPJ": c.cpfCnpj ?? "",
        "Telefone": formatPhone(c.phone || c.phones?.[0]?.number),
        "E-mail": c.email ?? "",
        "Tipos": (c.typeIds ?? []).map((t) => typeMap.get(t)?.name ?? t).join(", "),
        "Status": c.generalStatus ?? "",
        "Responsável": c.responsibleName ?? "",
        "Último contato": c.lastContactAt ? formatRelative(c.lastContactAt) : "nunca",
      })),
      "clientes"
    );
  };

  if (!clients) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="cadastro"
        title="Clientes"
        description={`${rows.length} cliente(s) na lista atual. Cada pessoa deve existir uma única vez; os tipos indicam em quais operações ela aparece.`}
      >
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <HelpTip label="Cria um cadastro único de cliente e já permite vincular às operações.">
          <Button asChild>
            <Link href="/dashboard/clients/new">
              <Plus className="mr-2 size-4" /> Novo cliente
            </Link>
          </Button>
        </HelpTip>
        <div className="flex gap-2">
          <HelpTip label="Cole qualquer tabela ou lista de dados: a IA organiza, mostra conflitos com o cadastro atual em vermelho e grava vários clientes de uma vez.">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Sparkles className="mr-2 size-4" /> Importar
            </Button>
          </HelpTip>
          <HelpTip label="Exporta a lista atual em Excel, respeitando busca e filtros aplicados.">
            <Button variant="outline" onClick={exportList}>
              <Download className="mr-2 size-4" /> Exportar
            </Button>
          </HelpTip>
        </div>
      </div>

      <Toolbar>
        <SearchBox
          placeholder="Buscar por código, nome, CPF/CNPJ ou telefone..."
          value={search}
          onChange={setSearch}
        />
        <div className="flex flex-wrap gap-1.5">
          {activeTypes.map((t) => (
            <FilterChip
              key={t.id}
              onClick={() => setTypeFilter(typeFilter === t.id ? null : t.id)}
              active={typeFilter === t.id}
              style={typeFilter === t.id ? undefined : { borderColor: t.color, color: t.color }}
            >
              {t.name}
            </FilterChip>
          ))}
        </div>
      </Toolbar>

      <div className="work-table">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="ledger-header">
              <TableHead className="w-[86px]">Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="hidden w-32 lg:table-cell">CPF/CNPJ</TableHead>
              <TableHead className="w-[128px]">Telefone</TableHead>
              <TableHead className="hidden md:table-cell">Tipos</TableHead>
              <TableHead className="hidden w-24 xl:table-cell">Status</TableHead>
              <TableHead className="hidden w-20 md:table-cell">Últ. contato</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => {
              const phone = c.phone || c.phones?.find((p) => p.isPrimary)?.number || c.phones?.[0]?.number;
              return (
                <TableRow key={c.id} className="[&>td]:py-1">
                  <TableCell>
                    <CodeBadge code={c.code} />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/dashboard/clients/${c.id}`}
                      className="block truncate text-[13px] font-medium hover:underline"
                      title={`${c.name} — abrir ficha completa`}
                    >
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-[13px] lg:table-cell">
                    {c.cpfCnpj || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[13px]">
                    {phone ? formatPhone(phone) : <span className="text-destructive">sem telefone</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="flex flex-wrap gap-1">
                      {(c.typeIds ?? []).map((tid) => {
                        const t = typeMap.get(tid);
                        return t ? <TypeChip key={tid} type={t} small /> : null;
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    {c.generalStatus ? (
                      <span className="whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                        {c.generalStatus}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">
                    {formatRelative(c.lastContactAt)}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  <EmptyState
                    title="Nenhum cliente encontrado"
                    description="Ajuste a busca ou remova o filtro de tipo para ampliar a lista."
                    className="border-0 bg-transparent"
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AiImportDialog open={importOpen} onOpenChange={setImportOpen} clients={clients ?? []} />
    </div>
  );
}
