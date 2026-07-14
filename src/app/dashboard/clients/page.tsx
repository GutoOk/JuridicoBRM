"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Plus,
  Download,
  Sparkles,
  Pencil,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  Minus,
  CornerDownRight,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import {
  searchable,
  digitsOnly,
  formatPhone,
  formatRelative,
  normalizePhone,
  dateMillis,
} from "@/lib/normalize";
import { exportXlsx } from "@/lib/export";
import { updateClient } from "@/lib/db-actions";
import { clientMapOf, nestedClientsOf } from "@/lib/client-nesting";
import type { Client, ClientType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { cn } from "@/lib/utils";

type SortKey = "codigo" | "nome" | "cpf" | "telefone" | "tipos" | "status" | "contato";

export default function ClientsPage() {
  const { data: clients } = useCollection<Client>("clients");
  const { data: types } = useCollection<ClientType>("clientTypes");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("nome");
  const [sortDesc, setSortDesc] = useState(false);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  const activeTypes = useMemo(
    () => (types ?? []).filter((t) => !t.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [types]
  );
  const typeMap = useMemo(() => new Map(activeTypes.map((t) => [t.id, t])), [activeTypes]);
  const clientMap = useMemo(() => clientMapOf(clients ?? []), [clients]);

  const handleSort = (key: SortKey) => {
    if (sort === key) setSortDesc((current) => !current);
    else {
      setSort(key);
      setSortDesc(false);
    }
  };

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
    const direction = sortDesc ? -1 : 1;
    const text = (value: string | undefined) => searchable(value) || "\uffff";
    return [...out].sort((a, b) => {
      switch (sort) {
        case "codigo":
          return text(a.code).localeCompare(text(b.code), "pt-BR") * direction;
        case "nome":
          return a.name.localeCompare(b.name, "pt-BR") * direction;
        case "cpf":
          return ((a.cpfCnpjDigits ?? digitsOnly(a.cpfCnpj)) || "\uffff").localeCompare(
            (b.cpfCnpjDigits ?? digitsOnly(b.cpfCnpj)) || "\uffff"
          ) * direction;
        case "telefone":
          return ((a.phoneDigits ?? normalizePhone(a.phone || a.phones?.[0]?.number)) || "\uffff").localeCompare(
            (b.phoneDigits ?? normalizePhone(b.phone || b.phones?.[0]?.number)) || "\uffff"
          ) * direction;
        case "tipos": {
          const aTypes = (a.typeIds ?? []).map((id) => typeMap.get(id)?.name ?? id).join(" ");
          const bTypes = (b.typeIds ?? []).map((id) => typeMap.get(id)?.name ?? id).join(" ");
          return text(aTypes).localeCompare(text(bTypes), "pt-BR") * direction;
        }
        case "status":
          return text(a.generalStatus).localeCompare(text(b.generalStatus), "pt-BR") * direction;
        case "contato":
          return (dateMillis(a.lastContactAt) - dateMillis(b.lastContactAt)) * direction;
      }
    });
  }, [clients, search, typeFilter, sort, sortDesc, typeMap]);

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
              <SortableHead label="Código" sortKey="codigo" sort={sort} sortDesc={sortDesc} onSort={handleSort} className="w-[86px]" />
              <SortableHead label="Nome" sortKey="nome" sort={sort} sortDesc={sortDesc} onSort={handleSort} />
              <SortableHead label="CPF/CNPJ" sortKey="cpf" sort={sort} sortDesc={sortDesc} onSort={handleSort} className="hidden w-32 lg:table-cell" />
              <SortableHead label="Telefone" sortKey="telefone" sort={sort} sortDesc={sortDesc} onSort={handleSort} className="w-[150px]" />
              <SortableHead label="Tipos" sortKey="tipos" sort={sort} sortDesc={sortDesc} onSort={handleSort} className="hidden md:table-cell" />
              <SortableHead label="Status" sortKey="status" sort={sort} sortDesc={sortDesc} onSort={handleSort} className="hidden w-24 xl:table-cell" />
              <SortableHead label="Últ. contato" sortKey="contato" sort={sort} sortDesc={sortDesc} onSort={handleSort} className="hidden w-20 md:table-cell" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => {
              const nestedClients = nestedClientsOf(c, clientMap);
              const expanded = expandedClients.has(c.id);
              return (
                <Fragment key={c.id}>
                  <ClientListRow
                    client={c}
                    activeTypes={activeTypes}
                    typeMap={typeMap}
                    nestedCount={nestedClients.length}
                    expanded={expanded}
                    onToggle={() => {
                      const next = new Set(expandedClients);
                      if (expanded) next.delete(c.id);
                      else next.add(c.id);
                      setExpandedClients(next);
                    }}
                  />
                  {expanded && nestedClients.map((nested) => (
                    <ClientListRow
                      key={`${c.id}:${nested.id}`}
                      client={nested}
                      activeTypes={activeTypes}
                      typeMap={typeMap}
                      nested
                    />
                  ))}
                </Fragment>
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

function ClientListRow({
  client,
  activeTypes,
  typeMap,
  nested = false,
  nestedCount = 0,
  expanded = false,
  onToggle,
}: {
  client: Client;
  activeTypes: ClientType[];
  typeMap: Map<string, ClientType>;
  nested?: boolean;
  nestedCount?: number;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const phone = client.phone || client.phones?.find((item) => item.isPrimary)?.number || client.phones?.[0]?.number;
  return (
    <TableRow className={cn("[&>td]:py-1", nested && "bg-muted/25 hover:bg-muted/40")}>
      <TableCell>
        <CodeBadge code={client.code} />
      </TableCell>
      <TableCell>
        <span className={cn("flex min-w-0 items-center gap-1", nested && "pl-5")}>
          {nested ? (
            <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" />
          ) : nestedCount > 0 ? (
            <HelpTip label={expanded ? "Recolhe os clientes aninhados." : `Exibe ${nestedCount} cliente(s) aninhado(s).`}>
              <button
                type="button"
                onClick={onToggle}
                className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground hover:bg-accent/15 hover:text-accent"
                aria-label={expanded ? "Recolher clientes aninhados" : "Exibir clientes aninhados"}
              >
                {expanded ? <Minus className="size-3" /> : <Plus className="size-3" />}
              </button>
            </HelpTip>
          ) : (
            <span className="size-5 shrink-0" />
          )}
          <Link
            href={`/dashboard/clients/${client.id}`}
            className="min-w-0 truncate text-[13px] font-medium hover:underline"
            title={`${client.name} — abrir ficha completa`}
          >
            {client.name}
          </Link>
          {nested && <span className="shrink-0 text-[10px] text-muted-foreground">aninhado</span>}
        </span>
      </TableCell>
      <TableCell className="hidden whitespace-nowrap text-[13px] lg:table-cell">
        {client.cpfCnpj || "—"}
      </TableCell>
      <ClientPhoneCell client={client} phone={phone} />
      <TableCell className="hidden md:table-cell">
        <ClientTypesCell client={client} activeTypes={activeTypes} typeMap={typeMap} />
      </TableCell>
      <TableCell className="hidden xl:table-cell">
        {client.generalStatus ? (
          <span className="whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
            {client.generalStatus}
          </span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">
        {formatRelative(client.lastContactAt)}
      </TableCell>
    </TableRow>
  );
}

function SortableHead({
  label,
  sortKey,
  sort,
  sortDesc,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortKey;
  sortDesc: boolean;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort === sortKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex w-full items-center justify-between text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        title={`Ordenar por ${label.toLowerCase()}`}
      >
        <span>{label}</span>
        {active ? (
          sortDesc ? <ChevronDown className="ml-1 size-3.5 shrink-0" /> : <ChevronUp className="ml-1 size-3.5 shrink-0" />
        ) : (
          <ChevronsUpDown className="ml-1 size-3.5 shrink-0 opacity-60" />
        )}
      </button>
    </TableHead>
  );
}

function ClientPhoneCell({ client, phone }: { client: Client; phone?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const addPhone = async () => {
    const raw = draft.trim();
    if (!raw || !user) return;
    const digits = normalizePhone(raw);
    if (!digits) return;
    const currentNumbers = [client.phone, ...(client.phones ?? []).map((item) => item.number)];
    if (currentNumbers.some((number) => normalizePhone(number) === digits)) {
      toast({ title: "Este telefone já está cadastrado" });
      return;
    }

    const nextPhones = [...(client.phones ?? [])];
    if (!nextPhones.length && client.phone) {
      nextPhones.push({ number: client.phone, description: "", isPrimary: true });
    }
    nextPhones.push({
      number: raw,
      description: "",
      isPrimary: !(client.phone || nextPhones.length > 0),
    });

    const patch: Record<string, unknown> = { phones: nextPhones };
    if (!client.phone) {
      patch.phone = raw;
      patch.phoneDigits = digits;
    }

    setSaving(true);
    try {
      await updateClient(client.id, patch, user);
      toast({ title: "Telefone adicionado" });
      setDraft("");
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao adicionar telefone" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <TableCell className="text-[13px]">
      <span className="flex min-w-0 items-center gap-1 whitespace-nowrap">
        <span className={cn("truncate", !phone && "text-destructive")}>
          {phone ? formatPhone(phone) : "sem telefone"}
        </span>
        <Popover open={open} onOpenChange={setOpen}>
          <HelpTip label="Adiciona outro telefone para esta pessoa.">
            <PopoverTrigger asChild>
              <button
                type="button"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setDraft("")}
              >
                <Plus className="size-3.5" />
              </button>
            </PopoverTrigger>
          </HelpTip>
          <PopoverContent className="w-64 space-y-2 p-3" align="start">
            <p className="text-xs font-medium">Novo telefone</p>
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="(11) 99999-9999"
              onKeyDown={(event) => event.key === "Enter" && addPhone()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                cancelar
              </Button>
              <Button type="button" size="sm" onClick={addPhone} disabled={saving || !draft.trim()}>
                {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                adicionar
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </span>
    </TableCell>
  );
}

function ClientTypesCell({
  client,
  activeTypes,
  typeMap,
}: {
  client: Client;
  activeTypes: ClientType[];
  typeMap: Map<string, ClientType>;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<Set<string>>(new Set(client.typeIds ?? []));
  const [saving, setSaving] = useState(false);

  const handleOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) setDraftIds(new Set(client.typeIds ?? []));
  };

  const save = async () => {
    if (!user) return;
    const activeIds = new Set(activeTypes.map((type) => type.id));
    const preservedIds = (client.typeIds ?? []).filter((id) => !activeIds.has(id));
    const selectedActiveIds = activeTypes.filter((type) => draftIds.has(type.id)).map((type) => type.id);
    setSaving(true);
    try {
      await updateClient(client.id, { typeIds: [...preservedIds, ...selectedActiveIds] }, user);
      toast({ title: "Tipos atualizados" });
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao atualizar tipos" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="flex min-w-0 flex-wrap gap-1 overflow-hidden">
        {(client.typeIds ?? []).map((typeId) => {
          const type = typeMap.get(typeId);
          return type ? <TypeChip key={typeId} type={type} small /> : null;
        })}
      </span>
      <Popover open={open} onOpenChange={handleOpen}>
        <HelpTip label="Edita as operações vinculadas a esta pessoa.">
          <PopoverTrigger asChild>
            <button
              type="button"
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil className="size-3" />
            </button>
          </PopoverTrigger>
        </HelpTip>
        <PopoverContent className="w-72 p-0" align="end">
          <div className="border-b px-3 py-2.5">
            <p className="text-sm font-medium">Tipos de {client.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Escolha em quais operações esta pessoa aparece.</p>
          </div>
          <div className="max-h-64 space-y-0.5 overflow-y-auto p-2">
            {activeTypes.map((type) => (
              <label key={type.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted/60">
                <Checkbox
                  checked={draftIds.has(type.id)}
                  onCheckedChange={(checked) => {
                    const next = new Set(draftIds);
                    if (checked === true) next.add(type.id);
                    else next.delete(type.id);
                    setDraftIds(next);
                  }}
                />
                <span className="size-2 rounded-full" style={{ backgroundColor: type.color }} />
                <span className="truncate">{type.name}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end border-t p-2">
            <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Salvar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}
