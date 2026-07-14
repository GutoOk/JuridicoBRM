"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import {
  Phone,
  MessageCircle,
  Download,
  X,
  PhoneCall,
  Plus,
  UserPlus,
  Loader2,
  Settings2,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  Minus,
  CornerDownRight,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { caseGrade, pendingItems, GRADES, GRADE_META, type Grade, type PendingItem } from "@/lib/readiness";
import { activeChecklistItems, displayStatus } from "@/lib/checklist";
import {
  searchable,
  digitsOnly,
  formatPhone,
  normalizePhone,
  telLink,
  waLink,
  formatRelative,
  daysSince,
} from "@/lib/normalize";
import { caseFileId, setCaseGrade, updateClient } from "@/lib/db-actions";
import { exportXlsx } from "@/lib/export";
import {
  PRIORITIES,
  GENERAL_STATUSES,
  type CaseFile,
  type ChecklistItemDef,
  type Client,
  type ClientType,
  type Priority,
  type UserProfile,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CodeBadge, GradeSelect } from "@/components/shared/badges";
import { ClientDrawer } from "@/components/shared/client-drawer";
import { ContactDialog } from "@/components/shared/contact-dialog";
import { TaskDialog, type TaskPrefill } from "@/components/shared/task-dialog";
import { cn } from "@/lib/utils";
import { doc, writeBatch, serverTimestamp, arrayUnion, arrayRemove, updateDoc, FieldPath } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { HelpTip, PageHeader, SearchBox, Toolbar } from "@/components/shared/page-shell";

type Row = {
  client: Client;
  caseFile: CaseFile | undefined;
  /** prontidão definida manualmente pela equipe (null = sem classificação) */
  grade: Grade | null;
  pending: PendingItem[];
  phone: string | undefined;
  whats: string | undefined;
  lastContactDays: number | null;
};

type SortKey = "urgencia" | "pendencias" | "contato" | "nome" | "codigo" | "telefone" | "prioridade";

const SORT_DEFAULT_DESC: Record<SortKey, boolean> = {
  urgencia: false,
  pendencias: true,
  contato: true,
  nome: false,
  codigo: false,
  telefone: false,
  prioridade: false,
};

export default function OperacaoPage() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();

  const { data: types } = useCollection<ClientType>("clientTypes");
  const { data: clients } = useCollection<Client>("clients");
  const { data: users } = useCollection<UserProfile>("users");

  const activeTypes = useMemo(
    () => (types ?? []).filter((t) => !t.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [types]
  );

  const [typeId, setTypeId] = useState<string | null>(null);
  const selectedTypeId = typeId ?? activeTypes.find((t) => t.id === "barao-de-maua")?.id ?? activeTypes[0]?.id ?? null;
  const selectedType = activeTypes.find((t) => t.id === selectedTypeId) ?? null;

  const { data: caseFiles } = useCollection<CaseFile>(
    selectedTypeId ? "caseFiles" : null,
    { where: [["typeId", "==", selectedTypeId ?? ""]] },
    [selectedTypeId]
  );

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("urgencia");
  const [sortDesc, setSortDesc] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerClientId, setDrawerClientId] = useState<string | null>(null);
  const [contactClient, setContactClient] = useState<Client | null>(null);
  const [taskPrefill, setTaskPrefill] = useState<TaskPrefill | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  const activeUsers = (users ?? []).filter((u) => u.email && u.active !== false);

  // ---- monta as linhas: cliente do tipo + ficha do caso + prontidão ----
  const allRows: Row[] = useMemo(() => {
    if (!selectedType || !clients) return [];
    const cfMap = new Map((caseFiles ?? []).map((cf) => [cf.id, cf]));
    return clients
      .filter((c) => !c.deleted && (c.typeIds ?? []).includes(selectedType.id))
      .map((client) => {
        const caseFile = cfMap.get(caseFileId(client.id, selectedType.id));
        const phone = client.phone || client.phones?.find((p) => p.isPrimary)?.number || client.phones?.[0]?.number;
        const whats = client.whatsapp || phone;
        return {
          client,
          caseFile,
          grade: caseGrade(caseFile),
          pending: pendingItems(selectedType, caseFile),
          phone,
          whats,
          lastContactDays: daysSince(client.lastContactAt),
        };
      });
  }, [clients, caseFiles, selectedType]);
  const allRowMap = useMemo(
    () => new Map(allRows.map((row) => [row.client.id, row])),
    [allRows]
  );

  // ---- filtros rápidos (tudo é filtro: situações operacionais + cada item do checklist) ----
  const checklistItems = activeChecklistItems(selectedType);

  const builtinFilters: { id: string; label: string; fn: (r: Row) => boolean }[] = [
    { id: "ligar", label: "precisa ligar", fn: (r) => r.pending.length > 0 && (r.lastContactDays === null || r.lastContactDays >= 7) && r.grade !== "P" },
    { id: "sem_contato", label: "sem contato 7+ dias", fn: (r) => r.lastContactDays === null || r.lastContactDays >= 7 },
    { id: "sem_telefone", label: "sem telefone", fn: (r) => !r.phone && !r.whats },
    { id: "sem_responsavel", label: "sem responsável", fn: (r) => !r.client.responsibleId },
    { id: "sem_codigo", label: "sem código", fn: (r) => !r.client.code },
    { id: "g_none", label: "sem prontidão", fn: (r) => r.grade === null },
    { id: "g_A", label: "prontos (A)", fn: (r) => r.grade === "A" },
    { id: "g_B", label: "protocoláveis (B)", fn: (r) => r.grade === "B" },
    { id: "g_C", label: "alto risco (C)", fn: (r) => r.grade === "C" },
    { id: "g_D", label: "não protocolar (D)", fn: (r) => r.grade === "D" },
    { id: "g_P", label: "protocolados (P)", fn: (r) => r.grade === "P" },
  ];

  const itemFilters = checklistItems.map((item) => ({
    id: `item:${item.id}`,
    label: `falta ${item.name.toLowerCase()}`,
    fn: (r: Row) => displayStatus(r.caseFile?.items?.[item.id]?.status) !== "conferido" && r.grade !== "P",
  }));

  const savedPendingItemIds = selectedTypeId
    ? user?.operationPendingItemIds?.[selectedTypeId]
    : undefined;
  const checklistItemIdSet = new Set(checklistItems.map((item) => item.id));
  const visiblePendingItemIds = (savedPendingItemIds ?? checklistItems.map((item) => item.id)).filter(
    (itemId) => checklistItemIdSet.has(itemId)
  );
  const visiblePendingItemIdSet = new Set(visiblePendingItemIds);
  const visibleItemFilters = itemFilters.filter((filterItem) =>
    visiblePendingItemIdSet.has(filterItem.id.slice("item:".length))
  );

  const allFilters = [...builtinFilters, ...visibleItemFilters];

  const savePendingItemPreferences = async (itemIds: string[]) => {
    if (!user || !selectedTypeId) return;
    try {
      await updateDoc(
        doc(db, "users", user.id),
        new FieldPath("operationPendingItemIds", selectedTypeId),
        itemIds
      );
      if (filter?.startsWith("item:") && !itemIds.includes(filter.slice("item:".length))) {
        setFilter(null);
      }
      toast({ title: "Exibição de pendências salva" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Não foi possível salvar a exibição",
        description: "Tente novamente em instantes.",
      });
      throw error;
    }
  };

  // ---- busca + filtro + ordenação ----
  const rows = useMemo(() => {
    let out = allRows;
    const q = search.trim();
    if (q) {
      const qs = searchable(q);
      const qd = digitsOnly(q);
      out = out.filter((r) => {
        const c = r.client;
        return (
          searchable(c.name).includes(qs) ||
          (c.code ?? "").toLowerCase().includes(q.toLowerCase()) ||
          (qd.length >= 3 && (c.cpfCnpjDigits ?? digitsOnly(c.cpfCnpj)).includes(qd)) ||
          (qd.length >= 4 &&
            ((c.phoneDigits ?? digitsOnly(c.phone)).includes(qd) ||
              (c.whatsappDigits ?? digitsOnly(c.whatsapp)).includes(qd) ||
              (c.phones ?? []).some((p) => digitsOnly(p.number).includes(qd))))
        );
      });
    }
    const f = allFilters.find((x) => x.id === filter);
    if (f) out = out.filter(f.fn);

    const sorted = [...out];
    const direction = sortDesc ? -1 : 1;
    switch (sort) {
      case "urgencia":
        // D > C > sem classificação > B > A, protocolados por último; empate: mais pendências
        sorted.sort(
          (a, b) =>
            (urgencyRank(a.grade) - urgencyRank(b.grade)) * direction ||
            (a.pending.length - b.pending.length) * direction
        );
        break;
      case "pendencias":
        sorted.sort((a, b) => (a.pending.length - b.pending.length) * direction);
        break;
      case "contato":
        sorted.sort((a, b) => ((a.lastContactDays ?? 99999) - (b.lastContactDays ?? 99999)) * direction);
        break;
      case "nome":
        sorted.sort((a, b) => a.client.name.localeCompare(b.client.name, "pt-BR") * direction);
        break;
      case "codigo":
        sorted.sort((a, b) => (a.client.code ?? "ZZZZZ").localeCompare(b.client.code ?? "ZZZZZ") * direction);
        break;
      case "telefone":
        sorted.sort((a, b) =>
          (digitsOnly(a.phone ?? a.whats ?? "") || "ZZZZZZZZZZZZZZ").localeCompare(
            digitsOnly(b.phone ?? b.whats ?? "") || "ZZZZZZZZZZZZZZ"
          ) * direction
        );
        break;
      case "prioridade":
        sorted.sort((a, b) => (priorityRank(a.client.priority) - priorityRank(b.client.priority)) * direction);
        break;
    }
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, search, filter, sort, sortDesc]);

  const gradeCounts = useMemo(() => {
    const counts: Record<Grade | "none", number> = { A: 0, B: 0, C: 0, D: 0, P: 0, none: 0 };
    allRows.forEach((r) => counts[r.grade ?? "none"]++);
    return counts;
  }, [allRows]);

  const drawerRow = allRows.find((r) => r.client.id === drawerClientId) ?? null;

  const handleSortChange = (next: SortKey) => {
    if (sort === next) {
      setSortDesc((value) => !value);
      return;
    }
    setSort(next);
    setSortDesc(SORT_DEFAULT_DESC[next]);
  };

  // ---- ações em lote ----
  const selectedRows = rows.filter((r) => selected.has(r.client.id));

  const batchUpdate = async (patch: Record<string, unknown>, label: string) => {
    if (!user || selectedRows.length === 0) return;
    try {
      const batch = writeBatch(db);
      selectedRows.forEach((r) => {
        batch.update(doc(db, "clients", r.client.id), {
          ...patch,
          updatedAt: serverTimestamp(),
          updatedBy: user.name,
        });
      });
      await batch.commit();
      toast({ title: `${label} — ${selectedRows.length} cliente(s) atualizados` });
      setSelected(new Set());
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro na ação em lote" });
    }
  };

  const batchType = async (addTypeId: string, remove: boolean) => {
    if (!user || selectedRows.length === 0) return;
    try {
      const batch = writeBatch(db);
      selectedRows.forEach((r) => {
        batch.update(doc(db, "clients", r.client.id), {
          typeIds: remove ? arrayRemove(addTypeId) : arrayUnion(addTypeId),
          updatedAt: serverTimestamp(),
          updatedBy: user.name,
        });
      });
      await batch.commit();
      toast({ title: `Tipo ${remove ? "removido de" : "adicionado a"} ${selectedRows.length} cliente(s)` });
      setSelected(new Set());
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro na ação em lote" });
    }
  };

  const exportRows = (which: Row[], name: string) => {
    exportXlsx(
      which.map((r) => ({
        "Código": r.client.code ?? "",
        "Nome": r.client.name,
        "Telefone": r.phone ? formatPhone(r.phone) : "",
        "WhatsApp": r.whats ? formatPhone(r.whats) : "",
        "CPF/CNPJ": r.client.cpfCnpj ?? "",
        "Prontidão": r.grade ? GRADE_META[r.grade].label.replace(/^[A-Z] — /, "") : "",
        "Pendências": r.pending.map((p) => p.name).join("; "),
        "Responsável": r.client.responsibleName ?? "",
        "Prioridade": r.client.priority ?? "",
        "Último contato": r.client.lastContactAt ? formatRelative(r.client.lastContactAt) : "nunca",
        "Resultado": r.client.lastContactResult ?? "",
        "Próxima ação": r.client.nextAction ?? "",
      })),
      name
    );
  };

  if (!types || !clients) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="fila de trabalho"
        title="Operação"
        description="Use esta tela para decidir quem precisa de contato, documento, responsável ou próxima ação. O nome do cliente abre o painel lateral sem tirar você da fila."
        badge={selectedType ? <span className="kbd-hint">{selectedType.name}</span> : undefined}
      >
        {isAdmin && (
          <HelpTip label="Abre o construtor administrativo desta operação, com grupos, perguntas, respostas e campos do caso.">
            <Button variant="outline" asChild>
              <Link href={`/dashboard/settings/types${selectedType ? `?tipo=${selectedType.id}` : ""}`}>
                <Settings2 className="mr-2 size-4" /> Editar operação
              </Link>
            </Button>
          </HelpTip>
        )}
      </PageHeader>

      {/* Cabeçalho: tipo + estatísticas */}
      <Toolbar>
        {activeTypes.map((t) => {
          const count = (clients ?? []).filter((c) => !c.deleted && (c.typeIds ?? []).includes(t.id)).length;
          return (
            <HelpTip key={t.id} label={t.description || `Abre a fila de trabalho de ${t.name}.`}>
              <button
                onClick={() => {
                  setTypeId(t.id);
                  setFilter(null);
                  setSelected(new Set());
                }}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors",
                  selectedTypeId === t.id
                    ? "font-medium"
                    : "border-border bg-background text-foreground hover:bg-muted"
                )}
                style={
                  selectedTypeId === t.id
                    ? { backgroundColor: `${t.color}1a`, borderColor: t.color, color: t.color }
                    : undefined
                }
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} />
                {t.name} <span className="opacity-60">{count}</span>
              </button>
            </HelpTip>
          );
        })}
        {activeTypes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma operação configurada ainda — o administrador pode instalar os padrões pelo botão
            Editar operação, acima.
          </p>
        )}
      </Toolbar>

      {selectedType && (
        <>
          {/* Estatísticas de prontidão */}
          <div className="surface flex flex-wrap gap-2 p-3">
            {GRADES.map((g) => (
              <HelpTip key={g} label={`${GRADE_META[g].description} Classificação manual: use o seletor da linha para definir.`}>
                <button
                  onClick={() => setFilter(filter === `g_${g}` ? null : `g_${g}`)}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors hover:bg-muted",
                    filter === `g_${g}`
                      ? cn("border-transparent", GRADE_META[g].className)
                      : "border-border bg-card"
                  )}
                >
                  <span className="text-xs font-medium">
                    {GRADE_META[g].label.replace(/^[A-Z] — /, "")}
                  </span>
                  <span className="text-xs opacity-70">{gradeCounts[g]}</span>
                </button>
              </HelpTip>
            ))}
            <HelpTip label="Clientes desta operação que a equipe ainda não classificou.">
              <button
                onClick={() => setFilter(filter === "g_none" ? null : "g_none")}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-md border px-3 text-xs transition-colors hover:bg-muted",
                  filter === "g_none"
                    ? "border-transparent bg-muted text-foreground"
                    : "border-border bg-card text-muted-foreground"
                )}
              >
                <span className="font-medium">sem classificação</span>
                <span className="opacity-70">{gradeCounts.none}</span>
              </button>
            </HelpTip>
            <div className="ml-auto flex items-center gap-2">
              <HelpTip label="Baixa a lista filtrada em Excel para trabalho fora do sistema.">
                <Button variant="outline" size="sm" onClick={() => exportRows(rows, `operacao-${selectedType.name}`)}>
                <Download className="mr-1.5 size-4" /> Exportar ({rows.length})
                </Button>
              </HelpTip>
            </div>
          </div>

          {/* Busca + filtros rápidos */}
          <Toolbar className="items-start">
            <div className="flex w-full items-center gap-2">
              <SearchBox
                placeholder="Buscar por código, nome, CPF ou telefone..."
                value={search}
                onChange={setSearch}
                className="min-w-0 flex-1"
              />
              <PendingDisplayPicker
                items={checklistItems}
                selectedIds={visiblePendingItemIds}
                onSave={savePendingItemPreferences}
              />
            </div>
            <div className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] leading-tight">
              {[...builtinFilters.filter((f) => !f.id.startsWith("g_")), ...visibleItemFilters].map((f) => {
                const count = allRows.filter(f.fn).length;
                if (count === 0 && filter !== f.id) return null;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFilter(filter === f.id ? null : f.id)}
                    title={`Mostra só os clientes: ${f.label}. Clique de novo para limpar.`}
                    className={cn(
                      "underline-offset-2 transition-colors hover:text-foreground hover:underline",
                      filter === f.id
                        ? "font-medium text-accent underline"
                        : "text-muted-foreground"
                    )}
                  >
                    {f.label} ({count})
                  </button>
                );
              })}
              {filter && (
                <button
                  onClick={() => setFilter(null)}
                  className="flex items-center gap-0.5 text-[11px] text-destructive underline-offset-2 hover:underline"
                >
                  <X className="size-3" /> limpar
                </button>
              )}
              <div className="ml-auto">
                  <Select value={sort} onValueChange={(v) => handleSortChange(v as SortKey)}>
                    <SelectTrigger className="h-7 w-[190px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgencia">Ordenar: urgência</SelectItem>
                      <SelectItem value="pendencias">Ordenar: mais pendências</SelectItem>
                      <SelectItem value="contato">Ordenar: contato mais antigo</SelectItem>
                      <SelectItem value="nome">Ordenar: nome</SelectItem>
                      <SelectItem value="codigo">Ordenar: código</SelectItem>
                      <SelectItem value="telefone">Ordenar: telefone</SelectItem>
                      <SelectItem value="prioridade">Ordenar: prioridade</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Toolbar>

          {/* Barra de ações em lote */}
          {selected.size > 0 && (
            <div className="surface case-spine flex flex-wrap items-center gap-2 p-3 pl-5">
              <Badge variant="secondary">{selected.size} selecionado(s)</Badge>
              <Select onValueChange={(uid) => {
                const u = activeUsers.find((x) => x.id === uid);
                if (u) batchUpdate({ responsibleId: u.id, responsibleName: u.name }, "Responsável atribuído");
              }}>
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue placeholder="Atribuir responsável" />
                </SelectTrigger>
                <SelectContent>
                  {activeUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select onValueChange={(p) => batchUpdate({ priority: p }, "Prioridade definida")}>
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select onValueChange={(s) => batchUpdate({ generalStatus: s }, "Status alterado")}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="Status geral" />
                </SelectTrigger>
                <SelectContent>
                  {GENERAL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select onValueChange={(tid) => batchType(tid, false)}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="Adicionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {activeTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select onValueChange={(tid) => batchType(tid, true)}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="Remover tipo" />
                </SelectTrigger>
                <SelectContent>
                  {activeTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => {
                  setTaskPrefill({
                    clients: selectedRows.map((r) => ({
                      id: r.client.id,
                      name: r.client.name,
                      code: r.client.code,
                    })),
                  });
                  setTaskOpen(true);
                }}
              >
                <UserPlus className="mr-1.5 size-3.5" /> Criar tarefa
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => exportRows(selectedRows, `selecao-${selectedType.name}`)}
              >
                <Download className="mr-1.5 size-3.5" /> Exportar
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelected(new Set())}>
                <X className="size-3.5" /> Limpar
              </Button>
            </div>
          )}

          {/* Tabela */}
          <div className="work-table">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="ledger-header">
                  <TableHead className="w-8">
                    <Checkbox
                      checked={rows.length > 0 && rows.every((r) => selected.has(r.client.id))}
                      onCheckedChange={(v) =>
                        setSelected(v ? new Set(rows.map((r) => r.client.id)) : new Set())
                      }
                      aria-label="Selecionar todos os clientes filtrados"
                    />
                  </TableHead>
                  <SortableHead
                    label="Código"
                    sortKey="codigo"
                    sort={sort}
                    sortDesc={sortDesc}
                    onSort={handleSortChange}
                    className="w-[70px]"
                  />
                  <SortableHead label="Nome" sortKey="nome" sort={sort} sortDesc={sortDesc} onSort={handleSortChange} />
                  <SortableHead
                    label="Telefone"
                    sortKey="telefone"
                    sort={sort}
                    sortDesc={sortDesc}
                    onSort={handleSortChange}
                    className="w-[170px]"
                  />
                  <SortableHead
                    label="Pront."
                    sortKey="urgencia"
                    sort={sort}
                    sortDesc={sortDesc}
                    onSort={handleSortChange}
                    className="w-28 text-center"
                    help="Classificação definida pela equipe: Redondo, Protocolável, Alto risco, Não protocolar ou Protocolado. Use o seletor da linha para classificar."
                  />
                  <SortableHead
                    label="Pendências"
                    sortKey="pendencias"
                    sort={sort}
                    sortDesc={sortDesc}
                    onSort={handleSortChange}
                  />
                  <SortableHead
                    label="Prior."
                    sortKey="prioridade"
                    sort={sort}
                    sortDesc={sortDesc}
                    onSort={handleSortChange}
                    className="hidden w-16 md:table-cell"
                  />
                  <SortableHead
                    label="Últ. contato"
                    sortKey="contato"
                    sort={sort}
                    sortDesc={sortDesc}
                    onSort={handleSortChange}
                    className="hidden w-24 lg:table-cell"
                  />
                  <TableHead className="hidden w-40 xl:table-cell">Próxima ação</TableHead>
                  <TableHead className="w-9" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const nestedRows = (r.client.nestedClientIds ?? [])
                    .map((clientId) => allRowMap.get(clientId))
                    .filter((nestedRow): nestedRow is Row => !!nestedRow);
                  const expanded = expandedClients.has(r.client.id);
                  const rowProps = (item: Row) => ({
                    row: item,
                    onGrade: (grade: Grade | null) => {
                      if (user && selectedType) {
                        setCaseGrade(item.client.id, selectedType.id, grade, user).catch(() =>
                          toast({ variant: "destructive", title: "Erro ao salvar prontidão" })
                        );
                      }
                    },
                    checked: selected.has(item.client.id),
                    onCheck: (checked: boolean) => {
                      const next = new Set(selected);
                      if (checked) next.add(item.client.id);
                      else next.delete(item.client.id);
                      setSelected(next);
                    },
                    onOpen: () => setDrawerClientId(item.client.id),
                    onContact: () => setContactClient(item.client),
                  });
                  return (
                    <Fragment key={r.client.id}>
                      <OperationRow
                        {...rowProps(r)}
                        nestedCount={nestedRows.length}
                        expanded={expanded}
                        onToggle={() => {
                          const next = new Set(expandedClients);
                          if (expanded) next.delete(r.client.id);
                          else next.add(r.client.id);
                          setExpandedClients(next);
                        }}
                      />
                      {expanded && nestedRows.map((nestedRow) => (
                        <OperationRow
                          key={`${r.client.id}:${nestedRow.client.id}`}
                          {...rowProps(nestedRow)}
                          nested
                        />
                      ))}
                    </Fragment>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                      {allRows.length === 0
                        ? "Nenhum cliente nesta operação ainda. Adicione o tipo aos clientes no cadastro ou pela importação."
                        : "Nenhum cliente encontrado com o filtro atual."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            {rows.length} de {allRows.length} cliente(s) — clique no nome para abrir o painel com checklist,
            contatos e mensagens.
          </p>
        </>
      )}

      <ClientDrawer
        client={drawerRow?.client ?? null}
        type={selectedType}
        caseFile={drawerRow?.caseFile}
        open={!!drawerClientId}
        onOpenChange={(o) => !o && setDrawerClientId(null)}
      />
      <ContactDialog
        client={contactClient}
        open={!!contactClient}
        onOpenChange={(o) => !o && setContactClient(null)}
      />
      <TaskDialog prefill={taskPrefill} open={taskOpen} onOpenChange={setTaskOpen} />
    </div>
  );
}

function PendingDisplayPicker({
  items,
  selectedIds,
  onSave,
}: {
  items: ChecklistItemDef[];
  selectedIds: string[];
  onSave: (itemIds: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<Set<string>>(new Set(selectedIds));
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) setDraftIds(new Set(selectedIds));
  };

  const toggleItem = (itemId: string, checked: boolean) => {
    const next = new Set(draftIds);
    if (checked) next.add(itemId);
    else next.delete(itemId);
    setDraftIds(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(items.filter((item) => draftIds.has(item.id)).map((item) => item.id));
      setOpen(false);
    } catch {
      // O toast de erro fica aqui para cobrir inclusive bloqueios das regras do perfil.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <HelpTip label="Escolha quais pendências aparecem como filtros nesta operação. A seleção fica salva no seu perfil.">
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 shrink-0 px-2.5 text-xs" disabled={items.length === 0}>
            <Settings2 className="mr-1.5 size-3.5" />
            <span className="hidden sm:inline">Personalizar pendências</span>
            <span className="sm:hidden">Pendências</span>
            <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1 text-[10px]">
              {selectedIds.length}
            </Badge>
          </Button>
        </PopoverTrigger>
      </HelpTip>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b px-3 py-2.5">
          <p className="text-sm font-medium">Pendências na listagem</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Marque os filtros que você quer ver abaixo da busca.
          </p>
        </div>
        <div className="max-h-72 space-y-0.5 overflow-y-auto p-2">
          {items.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted/60"
            >
              <Checkbox
                checked={draftIds.has(item.id)}
                onCheckedChange={(checked) => toggleItem(item.id, checked === true)}
                className="mt-0.5"
              />
              <span className="min-w-0 leading-snug">{item.name}</span>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setDraftIds(new Set(items.map((item) => item.id)))}
          >
            Marcar todas
          </Button>
          <Button size="sm" className="h-7 px-3 text-xs" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 size-3 animate-spin" />}
            Salvar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function urgencyRank(g: Grade | null): number {
  // D e C primeiro; sem classificação em seguida (precisa de triagem); protocolados por último
  const order: Record<Grade | "none", number> = { D: 0, C: 1, none: 2, B: 3, A: 4, P: 5 };
  return order[g ?? "none"];
}

function priorityRank(priority: string | undefined): number {
  const order: Record<string, number> = { Alta: 0, Média: 1, Baixa: 2, "": 3 };
  return order[priority ?? ""] ?? 3;
}

function SortableHead({
  label,
  sortKey,
  sort,
  sortDesc,
  onSort,
  className,
  help,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortKey;
  sortDesc: boolean;
  onSort: (key: SortKey) => void;
  className?: string;
  help?: string;
}) {
  const active = sort === sortKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex w-full items-center justify-between text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        title={help || `Ordenar por ${label.toLowerCase()}`}
      >
        <span className={cn(help && "cursor-help underline decoration-dotted underline-offset-2")}>{label}</span>
        {active ? (
          sortDesc ? (
            <ChevronDown className="ml-1 size-3.5 shrink-0 opacity-70" />
          ) : (
            <ChevronUp className="ml-1 size-3.5 shrink-0 opacity-70" />
          )
        ) : (
          <ChevronsUpDown className="ml-1 size-3.5 shrink-0 opacity-60" />
        )}
      </button>
    </TableHead>
  );
}

function OperationRow({
  row,
  onGrade,
  checked,
  onCheck,
  onOpen,
  onContact,
  nested = false,
  nestedCount = 0,
  expanded = false,
  onToggle,
}: {
  row: Row;
  onGrade: (g: Grade | null) => void;
  checked: boolean;
  onCheck: (v: boolean) => void;
  onOpen: () => void;
  onContact: () => void;
  nested?: boolean;
  nestedCount?: number;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const c = row.client;
  const tel = telLink(row.phone);
  const wa = waLink(row.whats);
  const pends = row.pending;
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");

  const patch = async (data: Record<string, unknown>) => {
    if (!user) return;
    try {
      await updateClient(c.id, data, user);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao salvar" });
    }
  };

  const addPhone = async () => {
    const raw = phoneDraft.trim();
    if (!raw) return;

    const nextPhones = [...(c.phones ?? [])];
    if (!c.phones?.length && c.phone) {
      nextPhones.push({ number: c.phone, description: "", isPrimary: true });
    }
    nextPhones.push({
      number: raw,
      description: "",
      isPrimary: !(c.phone || (c.phones ?? []).length > 0),
    });

    const patchData: Record<string, unknown> = { phones: nextPhones };
    if (!c.phone) {
      patchData.phone = raw;
      patchData.phoneDigits = normalizePhone(raw);
    }

    await patch(patchData);
    setPhoneOpen(false);
    setPhoneDraft("");
  };

  return (
    <TableRow className={cn("[&>td]:py-1", nested && "bg-muted/25 hover:bg-muted/40")}>
      <TableCell>
        <Checkbox checked={checked} onCheckedChange={(v) => onCheck(!!v)} />
      </TableCell>
      <TableCell>
        <CodeBadge code={c.code} />
      </TableCell>
      <TableCell>
        <span className={cn("flex min-w-0 items-center gap-1", nested && "pl-4")}>
          {nested ? (
            <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" />
          ) : nestedCount > 0 ? (
            <HelpTip label={expanded ? "Recolhe os clientes aninhados." : `Exibe ${nestedCount} cliente(s) aninhado(s) desta operação.`}>
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
          <button
            onClick={onOpen}
            className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
            title={`${c.name} — abrir painel com checklist, contatos e mensagens`}
          >
            {c.name}
          </button>
          {nested && <span className="shrink-0 text-[10px] text-muted-foreground">aninhado</span>}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <span className={cn("text-[13px]", !row.phone && "text-destructive")}>
          {row.phone ? formatPhone(row.phone) : "sem telefone"}
        </span>
        <span className="ml-1 inline-flex gap-0.5 align-middle">
          {tel && (
            <HelpTip label="Inicia uma ligação usando o aplicativo de telefone do computador ou celular.">
              <a href={tel} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <Phone className="size-3.5" />
              </a>
            </HelpTip>
          )}
          {wa && (
            <HelpTip label="Abre o WhatsApp do cliente em uma nova aba.">
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded p-1 text-emerald-600 hover:bg-muted"
              >
                <MessageCircle className="size-3.5" />
              </a>
            </HelpTip>
          )}
          <Popover open={phoneOpen} onOpenChange={setPhoneOpen}>
            <HelpTip label="Adiciona um novo telefone para esta pessoa.">
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setPhoneDraft("")}
                >
                  <Plus className="size-3.5" />
                </button>
              </PopoverTrigger>
            </HelpTip>
            <PopoverContent className="w-64 p-3" align="start">
              <div className="space-y-2">
                <p className="text-xs font-medium">Novo telefone</p>
                <Input
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  placeholder="(11) 99999-9999"
                  onKeyDown={(e) => e.key === "Enter" && addPhone()}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPhoneOpen(false)}>
                    cancelar
                  </Button>
                  <Button type="button" size="sm" onClick={addPhone}>
                    adicionar
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </span>
      </TableCell>
      <TableCell className="text-center">
        <GradeSelect grade={row.grade} onChange={onGrade} />
      </TableCell>
      <TableCell>
        {pends.length === 0 ? (
          <span className="text-xs text-emerald-600">✓ sem pendências</span>
        ) : (
          <button onClick={onOpen} className="text-left text-xs leading-tight hover:underline">
            <span className="block truncate">• {pends[0].name}</span>
            {pends.length > 1 && (
              <span className="text-muted-foreground">+{pends.length - 1} pendências</span>
            )}
          </button>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <Select value={c.priority ?? ""} onValueChange={(p) => patch({ priority: p })}>
          <SelectTrigger
            className={cn(
              "h-7 w-full border-0 bg-transparent px-1 text-xs shadow-none hover:bg-muted",
              c.priority === "Alta" && "font-semibold text-red-600",
              c.priority === "Média" && "text-amber-600",
              !c.priority && "text-muted-foreground"
            )}
          >
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p} className="text-xs">
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="hidden whitespace-nowrap text-xs lg:table-cell">
        <span className={cn((row.lastContactDays === null || row.lastContactDays >= 7) && "text-amber-600")}>
          {formatRelative(c.lastContactAt)}
        </span>
        {c.lastContactResult && (
          <span className="block truncate text-muted-foreground">{c.lastContactResult}</span>
        )}
      </TableCell>
      <TableCell className="hidden xl:table-cell">
        <NextActionCell value={c.nextAction ?? ""} onSave={(v) => patch({ nextAction: v })} />
      </TableCell>
      <TableCell>
        <HelpTip label="Registra canal, resultado, observação e próxima ação deste cliente." side="left">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onContact}
          >
            <PhoneCall className="size-4" />
            </Button>
          </HelpTip>
        </TableCell>
      </TableRow>
  );
}

function NextActionCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const save = () => {
    onSave(draft.trim());
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(value);
      }}
    >
      <PopoverTrigger asChild>
        <button
          className={cn(
            "block w-full truncate rounded px-1 py-0.5 text-left text-xs hover:bg-muted",
            !value && "text-muted-foreground/60"
          )}
          title={value || "Definir próxima ação"}
        >
          {value || "definir…"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2" align="start">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ex.: Ligar sexta para cobrar extrato"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={save}>
            Salvar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
