"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  Trash2,
  FileSpreadsheet,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useLatestAttendances } from "@/hooks/use-latest-attendances";
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
import { clientMapOf, effectiveClientTypeIds, nestedClientsOf } from "@/lib/client-nesting";
import type { Client, ClientType, Update } from "@/lib/types";
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
import { ContactDialog } from "@/components/shared/contact-dialog";
import { ClientAttendanceMenu } from "@/components/shared/client-attendance-menu";
import { TemporaryBaronImportDialog } from "@/components/shared/temporary-baron-import-dialog";
import { cn } from "@/lib/utils";
import { clientTypeSelectedStyle, clientTypeVisual } from "@/lib/client-type-style";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type SortKey = "codigo" | "nome" | "cpf" | "telefone" | "tipos" | "proximaAcao" | "contato";

export default function ClientsPage() {
  const { isAdmin } = useAuth();
  const searchParams = useSearchParams();
  const showDeleted = isAdmin && searchParams.get("deleted") === "1";
  const { data: clients } = useCollection<Client>("clients");
  const { data: types } = useCollection<ClientType>("clientTypes");
  const { byClientId: latestAttendances } = useLatestAttendances();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [temporaryBaronImportOpen, setTemporaryBaronImportOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("nome");
  const [sortDesc, setSortDesc] = useState(false);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [attendanceClient, setAttendanceClient] = useState<Client | null>(null);

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
    const activeClients = (clients ?? []).filter((c) => showDeleted ? c.deleted : !c.deleted);
    const nestedIds = new Set(activeClients.flatMap((c) => c.nestedClientIds ?? []));
    let out = activeClients
      .filter((c) => !nestedIds.has(c.id))
      .map((c) => ({ ...c, typeIds: effectiveClientTypeIds(c, clients ?? []) }));
    if (typeFilter) out = out.filter((c) => (c.typeIds ?? []).includes(typeFilter));
    const q = search.trim();
    if (q) {
      const qs = searchable(q);
      const qd = digitsOnly(q);
      out = out.filter((c) => [c, ...nestedClientsOf(c, clientMap)].some((candidate) =>
        searchable(candidate.name).includes(qs) ||
        (candidate.code ?? "").toLowerCase().includes(q.toLowerCase()) ||
        (qd.length >= 3 && (candidate.cpfCnpjDigits ?? digitsOnly(candidate.cpfCnpj)).includes(qd)) ||
        (qd.length >= 4 &&
          ((candidate.phoneDigits ?? digitsOnly(candidate.phone)).includes(qd) ||
            (candidate.phones ?? []).some((p) => digitsOnly(p.number).includes(qd))))
      ));
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
        case "proximaAcao":
          return text(a.nextAction).localeCompare(text(b.nextAction), "pt-BR") * direction;
        case "contato":
          return (
            dateMillis(latestAttendances.get(a.id)?.createdAt ?? latestAttendances.get(a.id)?.updateDate ?? a.lastContactAt) -
            dateMillis(latestAttendances.get(b.id)?.createdAt ?? latestAttendances.get(b.id)?.updateDate ?? b.lastContactAt)
          ) * direction;
      }
    });
  }, [clients, search, typeFilter, sort, sortDesc, typeMap, clientMap, showDeleted, latestAttendances]);

  const deletedCount = (clients ?? []).filter((client) => client.deleted).length;

  const exportList = () => {
    exportXlsx(
      rows.map((c) => ({
        "Código": c.code ?? "",
        "Nome": c.name,
        "CPF/CNPJ": c.cpfCnpj ?? "",
        "Telefone": formatPhone(c.phone || c.phones?.[0]?.number),
        "E-mail": c.email ?? "",
        "Tipos": (c.typeIds ?? []).map((t) => typeMap.get(t)?.name ?? t).join(", "),
        "Próxima ação": c.nextAction ?? "",
        "Último contato": formatRelative(latestAttendances.get(c.id)?.createdAt ?? latestAttendances.get(c.id)?.updateDate ?? c.lastContactAt),
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
          {isAdmin && (
            <HelpTip label="Importação temporária da planilha manual de Barão de Mauá, com IA, revisão de conflitos e CSV de pendências.">
              <Button variant="outline" className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100" onClick={() => setTemporaryBaronImportOpen(true)}>
                <FileSpreadsheet className="mr-2 size-4" /> Importar Barão (temporário)
              </Button>
            </HelpTip>
          )}
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
              style={typeFilter === t.id ? clientTypeSelectedStyle(t) : undefined}
            >
              {t.name}
            </FilterChip>
          ))}
        </div>
        {isAdmin && deletedCount > 0 && (
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
            <Link href={showDeleted ? "/dashboard/clients" : "/dashboard/clients?deleted=1"}>
              <Trash2 className="mr-1 size-3.5" /> {showDeleted ? "Ver ativos" : `Ver apagados (${deletedCount})`}
            </Link>
          </Button>
        )}
      </Toolbar>

      <div className="work-table">
        <Table className="column-dividers table-fixed">
          <TableHeader>
            <TableRow className="ledger-header">
              <SortableHead label="Código" sortKey="codigo" sort={sort} sortDesc={sortDesc} onSort={handleSort} className="w-[86px]" />
              <SortableHead label="Nome" sortKey="nome" sort={sort} sortDesc={sortDesc} onSort={handleSort} />
              <SortableHead label="CPF/CNPJ" sortKey="cpf" sort={sort} sortDesc={sortDesc} onSort={handleSort} align="right" className="hidden w-32 lg:table-cell" />
              <SortableHead label="Telefone" sortKey="telefone" sort={sort} sortDesc={sortDesc} onSort={handleSort} align="right" className="w-[150px]" />
              <SortableHead label="Tipos" sortKey="tipos" sort={sort} sortDesc={sortDesc} onSort={handleSort} align="right" className="hidden md:table-cell" />
              <SortableHead label="Próxima ação" sortKey="proximaAcao" sort={sort} sortDesc={sortDesc} onSort={handleSort} className="hidden w-32 xl:table-cell" />
              <SortableHead label="Últ. contato" sortKey="contato" sort={sort} sortDesc={sortDesc} onSort={handleSort} align="right" className="hidden w-24 lg:table-cell" />
              <TableHead className="w-9"><span className="sr-only">Ações</span></TableHead>
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
                    onRegisterAttendance={setAttendanceClient}
                    latestAttendance={latestAttendances.get(c.id)}
                  />
                  {expanded && nestedClients.map((nested) => (
                    <ClientListRow
                      key={`${c.id}:${nested.id}`}
                      client={nested}
                      activeTypes={activeTypes}
                      typeMap={typeMap}
                      nested
                      principalCode={c.code}
                      principalTypeIds={c.typeIds}
                      nestedRelationship={c.nestedClientRelationships?.[nested.id]}
                      onRegisterAttendance={setAttendanceClient}
                      latestAttendance={latestAttendances.get(nested.id)}
                    />
                  ))}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
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
      <TemporaryBaronImportDialog open={temporaryBaronImportOpen} onOpenChange={setTemporaryBaronImportOpen} clients={clients ?? []} />
      <ContactDialog client={attendanceClient} open={Boolean(attendanceClient)} onOpenChange={(nextOpen) => !nextOpen && setAttendanceClient(null)} />
    </div>
  );
}

function ClientListRow({
  client,
  activeTypes,
  typeMap,
  nested = false,
  principalCode,
  principalTypeIds,
  nestedRelationship,
  nestedCount = 0,
  expanded = false,
  onToggle,
  onRegisterAttendance,
  latestAttendance,
}: {
  client: Client;
  activeTypes: ClientType[];
  typeMap: Map<string, ClientType>;
  nested?: boolean;
  principalCode?: string;
  principalTypeIds?: string[];
  nestedRelationship?: string;
  nestedCount?: number;
  expanded?: boolean;
  onToggle?: () => void;
  onRegisterAttendance: (client: Client) => void;
  latestAttendance?: Update;
}) {
  const phone = client.phone || client.phones?.find((item) => item.isPrimary)?.number || client.phones?.[0]?.number;
  return (
    <TableRow className={cn("[&>td]:min-w-0 [&>td]:overflow-hidden [&>td]:py-1", nested && "bg-amber-50/70 hover:bg-amber-50 dark:bg-amber-950/15 dark:hover:bg-amber-950/20")}>
      <TableCell>
        <CodeBadge code={nested ? principalCode : client.code} />
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
          {nested && <span className="max-w-24 shrink-0 truncate text-[10px] text-muted-foreground">{nestedRelationship || "aninhado"}</span>}
        </span>
      </TableCell>
      <TableCell className="hidden whitespace-nowrap text-right text-[13px] lg:table-cell">
        {client.cpfCnpj || "—"}
      </TableCell>
      <ClientPhoneCell client={client} phone={phone} />
      <TableCell className="hidden text-right md:table-cell">
        <ClientTypesCell client={nested && principalTypeIds ? { ...client, typeIds: principalTypeIds } : client} activeTypes={activeTypes} typeMap={typeMap} />
      </TableCell>
      <TableCell className="hidden truncate text-xs text-muted-foreground xl:table-cell" title={client.nextAction}>
        {client.nextAction || "—"}
      </TableCell>
      <TableCell className="hidden whitespace-nowrap text-right text-xs text-muted-foreground lg:table-cell">
        {formatRelative(latestAttendance?.createdAt ?? latestAttendance?.updateDate ?? client.lastContactAt)}
      </TableCell>
      <TableCell className="px-1 text-right">
        <ClientAttendanceMenu client={client} onRegister={onRegisterAttendance} />
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
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  sort: SortKey;
  sortDesc: boolean;
  onSort: (key: SortKey) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sort === sortKey;
  return (
    <TableHead className={cn(className, align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex w-full items-center text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
          align === "right" ? "justify-end text-right" : "justify-between text-left"
        )}
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
    <TableCell className="text-right text-[13px]">
      <span className="flex min-w-0 items-center justify-end gap-1 whitespace-nowrap">
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
  const [pendingTypeChange, setPendingTypeChange] = useState<{ type: ClientType; adding: boolean } | null>(null);
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
    <span className="flex min-w-0 items-center justify-end gap-1">
      <span className="flex min-w-0 flex-wrap justify-end gap-1 overflow-hidden">
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
            {activeTypes.map((type) => {
              const checked = draftIds.has(type.id);
              return (
              <label
                key={type.id}
                className="flex cursor-pointer items-center gap-2 rounded border border-transparent px-2 py-1.5 text-xs hover:bg-muted/60"
                style={checked ? clientTypeSelectedStyle(type) : undefined}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => setPendingTypeChange({ type, adding: !checked })}
                />
                <span
                  className="size-2 rounded-full bg-muted-foreground/45"
                  style={checked ? { backgroundColor: clientTypeVisual(type).dotColor } : undefined}
                />
                <span className="truncate">{type.name}</span>
              </label>
            );})}
          </div>
          <div className="flex justify-end border-t p-2">
            <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Salvar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <AlertDialog open={!!pendingTypeChange} onOpenChange={(nextOpen) => !nextOpen && setPendingTypeChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingTypeChange?.adding ? "Adicionar tipo ao cliente?" : "Remover tipo do cliente?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTypeChange?.adding ? "Adicionar" : "Remover"} <strong>{pendingTypeChange?.type.name}</strong>{" "}
              {pendingTypeChange?.adding ? "a" : "de"} <strong>{client.name}</strong>?
              {!pendingTypeChange?.adding && " O cliente deixará de aparecer nessa operação depois que você salvar."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingTypeChange) return;
                const next = new Set(draftIds);
                if (pendingTypeChange.adding) next.add(pendingTypeChange.type.id);
                else next.delete(pendingTypeChange.type.id);
                setDraftIds(next);
                setPendingTypeChange(null);
              }}
            >
              {pendingTypeChange?.adding ? "Adicionar tipo" : "Remover tipo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
  );
}
