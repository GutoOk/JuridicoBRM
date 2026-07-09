"use client";

import { useMemo, useState } from "react";
import {
  Phone,
  MessageCircle,
  Download,
  X,
  PhoneCall,
  Rows3,
  UserPlus,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { computeReadiness, GRADE_META, type Grade, type ReadinessResult } from "@/lib/readiness";
import { isOk } from "@/lib/checklist";
import {
  searchable,
  digitsOnly,
  formatPhone,
  telLink,
  waLink,
  formatRelative,
  daysSince,
} from "@/lib/normalize";
import { caseFileId, updateClient } from "@/lib/db-actions";
import { exportXlsx } from "@/lib/export";
import {
  PRIORITIES,
  GENERAL_STATUSES,
  type CaseFile,
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
import { CodeBadge, ReadinessBadge } from "@/components/shared/badges";
import { ClientDrawer } from "@/components/shared/client-drawer";
import { ContactDialog } from "@/components/shared/contact-dialog";
import { TaskDialog, type TaskPrefill } from "@/components/shared/task-dialog";
import { cn } from "@/lib/utils";
import { doc, writeBatch, serverTimestamp, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { FilterChip, HelpTip, PageHeader, SearchBox, Toolbar } from "@/components/shared/page-shell";

type Row = {
  client: Client;
  caseFile: CaseFile | undefined;
  readiness: ReadinessResult;
  phone: string | undefined;
  whats: string | undefined;
  lastContactDays: number | null;
};

type SortKey = "urgencia" | "pendencias" | "contato" | "nome" | "codigo";

export default function OperacaoPage() {
  const { user } = useAuth();
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
  const [compact, setCompact] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerClientId, setDrawerClientId] = useState<string | null>(null);
  const [contactClient, setContactClient] = useState<Client | null>(null);
  const [taskPrefill, setTaskPrefill] = useState<TaskPrefill | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);

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
          readiness: computeReadiness(selectedType, caseFile, client),
          phone,
          whats,
          lastContactDays: daysSince(client.lastContactAt),
        };
      });
  }, [clients, caseFiles, selectedType]);

  // ---- filtros rápidos ----
  const pinnedItems = (selectedType?.checklist ?? []).filter((i) => i.active && i.pinned);

  const builtinFilters: { id: string; label: string; fn: (r: Row) => boolean }[] = [
    { id: "ligar", label: "Precisa ligar", fn: (r) => r.readiness.pendencies.length > 0 && (r.lastContactDays === null || r.lastContactDays >= 7) && r.readiness.grade !== "P" },
    { id: "sem_contato", label: "Sem contato 7+ dias", fn: (r) => r.lastContactDays === null || r.lastContactDays >= 7 },
    { id: "sem_telefone", label: "Sem telefone", fn: (r) => !r.phone && !r.whats },
    { id: "sem_responsavel", label: "Sem responsável", fn: (r) => !r.client.responsibleId },
    { id: "sem_codigo", label: "Sem código", fn: (r) => !r.client.code },
    { id: "g_A", label: "Prontos (A)", fn: (r) => r.readiness.grade === "A" },
    { id: "g_C", label: "Alto risco (C)", fn: (r) => r.readiness.grade === "C" },
    { id: "g_D", label: "Bloqueados (D)", fn: (r) => r.readiness.grade === "D" },
    { id: "g_P", label: "Protocolados", fn: (r) => r.readiness.grade === "P" },
  ];

  const itemFilters = pinnedItems.map((item) => ({
    id: `item:${item.id}`,
    label: `Falta ${item.name.toLowerCase()}`,
    fn: (r: Row) => !isOk(r.caseFile?.items?.[item.id]?.status) && r.readiness.grade !== "P",
  }));

  const allFilters = [...builtinFilters, ...itemFilters];

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
    switch (sort) {
      case "urgencia":
        // D > C > B > A, protocolados por último; empate: mais pendências primeiro
        sorted.sort(
          (a, b) =>
            urgencyRank(a.readiness.grade) - urgencyRank(b.readiness.grade) ||
            b.readiness.pendencies.length - a.readiness.pendencies.length
        );
        break;
      case "pendencias":
        sorted.sort((a, b) => b.readiness.pendencies.length - a.readiness.pendencies.length);
        break;
      case "contato":
        sorted.sort((a, b) => (b.lastContactDays ?? 99999) - (a.lastContactDays ?? 99999));
        break;
      case "nome":
        sorted.sort((a, b) => a.client.name.localeCompare(b.client.name, "pt-BR"));
        break;
      case "codigo":
        sorted.sort((a, b) => (a.client.code ?? "ZZZZZ").localeCompare(b.client.code ?? "ZZZZZ"));
        break;
    }
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, search, filter, sort]);

  const gradeCounts = useMemo(() => {
    const counts: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, P: 0 };
    allRows.forEach((r) => counts[r.readiness.grade]++);
    return counts;
  }, [allRows]);

  const drawerRow = allRows.find((r) => r.client.id === drawerClientId) ?? null;

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
        "Prontidão": GRADE_META[r.readiness.grade].label,
        "Pendências": r.readiness.pendencies.map((p) => p.name).join("; "),
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
      />

      {/* Cabeçalho: tipo + estatísticas */}
      <Toolbar>
        {activeTypes.map((t) => {
          const count = (clients ?? []).filter((c) => !c.deleted && (c.typeIds ?? []).includes(t.id)).length;
          return (
            <button
              key={t.id}
              onClick={() => {
                setTypeId(t.id);
                setFilter(null);
                setSelected(new Set());
              }}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                selectedTypeId === t.id
                  ? "border-transparent text-white"
                  : "bg-background text-foreground hover:bg-muted"
              )}
              style={selectedTypeId === t.id ? { backgroundColor: t.color } : { borderColor: t.color }}
            >
              {t.name} <span className="opacity-70">({count})</span>
            </button>
          );
        })}
        {activeTypes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum tipo de cliente configurado ainda — peça ao administrador para instalar os padrões em
            Administração → Tipos & Checklists.
          </p>
        )}
      </Toolbar>

      {selectedType && (
        <>
          {/* Estatísticas de prontidão */}
          <div className="surface flex flex-wrap gap-2 p-3">
            {(Object.keys(GRADE_META) as Grade[]).map((g) => (
              <HelpTip key={g} label={GRADE_META[g].description}>
                <button
                  onClick={() => setFilter(filter === `g_${g}` ? null : `g_${g}`)}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm transition-colors hover:bg-muted",
                    filter === `g_${g}` && "border-primary ring-2 ring-ring"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded text-xs font-bold",
                      GRADE_META[g].className
                    )}
                  >
                    {g}
                  </span>
                  <span className="font-semibold">{gradeCounts[g]}</span>
                  <span className="hidden text-xs text-muted-foreground lg:inline">
                    {GRADE_META[g].label.replace(/^[A-Z] — /, "")}
                  </span>
                </button>
              </HelpTip>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <HelpTip label="Baixa a lista filtrada em Excel para trabalho fora do sistema.">
                <Button variant="outline" size="sm" onClick={() => exportRows(rows, `operacao-${selectedType.name}`)}>
                <Download className="mr-1.5 size-4" /> Exportar ({rows.length})
                </Button>
              </HelpTip>
              <HelpTip label="Alterna para linhas mais baixas quando você quer varrer muitos clientes de uma vez.">
                <Button
                  variant={compact ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCompact(!compact)}
                >
                  <Rows3 className="size-4" />
                </Button>
              </HelpTip>
            </div>
          </div>

          {/* Busca + filtros rápidos */}
          <Toolbar className="items-start">
            <SearchBox
              placeholder="Buscar por código, nome, CPF ou telefone..."
              value={search}
              onChange={setSearch}
            />
            <div className="flex flex-wrap gap-1.5">
              {[...builtinFilters.filter((f) => !f.id.startsWith("g_")), ...itemFilters].map((f) => {
                const count = allRows.filter(f.fn).length;
                if (count === 0 && filter !== f.id) return null;
                return (
                  <FilterChip
                    key={f.id}
                    onClick={() => setFilter(filter === f.id ? null : f.id)}
                    active={filter === f.id}
                  >
                    {f.label} <span className="opacity-70">{count}</span>
                  </FilterChip>
                );
              })}
              {filter && (
                <button
                  onClick={() => setFilter(null)}
                  className="flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                >
                  <X className="size-3" /> limpar filtro
                </button>
              )}
              <div className="ml-auto">
                <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                  <SelectTrigger className="h-7 w-[190px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgencia">Ordenar: urgência</SelectItem>
                    <SelectItem value="pendencias">Ordenar: mais pendências</SelectItem>
                    <SelectItem value="contato">Ordenar: contato mais antigo</SelectItem>
                    <SelectItem value="nome">Ordenar: nome</SelectItem>
                    <SelectItem value="codigo">Ordenar: código</SelectItem>
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
            <Table>
              <TableHeader>
                <TableRow className="ledger-header">
                  <TableHead className="w-8">
                    <Checkbox
                      checked={rows.length > 0 && rows.every((r) => selected.has(r.client.id))}
                      onCheckedChange={(v) =>
                        setSelected(v ? new Set(rows.map((r) => r.client.id)) : new Set())
                      }
                    />
                  </TableHead>
                  <TableHead className="w-16">Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead className="w-12 text-center">Pront.</TableHead>
                  <TableHead>Pendências</TableHead>
                  <TableHead className="w-32">Responsável</TableHead>
                  <TableHead className="w-20">Prior.</TableHead>
                  <TableHead className="w-32">Últ. contato</TableHead>
                  {!compact && <TableHead>Próxima ação</TableHead>}
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <OperationRow
                    key={r.client.id}
                    row={r}
                    compact={compact}
                    checked={selected.has(r.client.id)}
                    onCheck={(v) => {
                      const next = new Set(selected);
                      if (v) next.add(r.client.id);
                      else next.delete(r.client.id);
                      setSelected(next);
                    }}
                    onOpen={() => setDrawerClientId(r.client.id)}
                    onContact={() => setContactClient(r.client)}
                    users={activeUsers}
                  />
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={compact ? 10 : 11} className="h-24 text-center text-muted-foreground">
                      {allRows.length === 0
                        ? "Nenhum cliente neste tipo ainda. Adicione o tipo aos clientes no cadastro ou pela importação."
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

function urgencyRank(g: Grade): number {
  // D e C primeiro (precisam de decisão/ação), depois B, A e por fim protocolados
  const order: Record<Grade, number> = { D: 0, C: 1, B: 2, A: 3, P: 4 };
  return order[g];
}

function OperationRow({
  row,
  compact,
  checked,
  onCheck,
  onOpen,
  onContact,
  users,
}: {
  row: Row;
  compact: boolean;
  checked: boolean;
  onCheck: (v: boolean) => void;
  onOpen: () => void;
  onContact: () => void;
  users: UserProfile[];
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const c = row.client;
  const tel = telLink(row.phone);
  const wa = waLink(row.whats);
  const pends = row.readiness.pendencies;

  const patch = async (data: Record<string, unknown>) => {
    if (!user) return;
    try {
      await updateClient(c.id, data, user);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao salvar" });
    }
  };

  return (
    <TableRow className={cn(compact && "[&>td]:py-1")}>
      <TableCell>
        <Checkbox checked={checked} onCheckedChange={(v) => onCheck(!!v)} />
      </TableCell>
      <TableCell>
        <CodeBadge code={c.code} />
      </TableCell>
      <TableCell>
        <button onClick={onOpen} className="text-left font-medium hover:underline">
          {c.name}
        </button>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <span className={cn("text-sm", !row.phone && "text-destructive")}>
          {row.phone ? formatPhone(row.phone) : "sem telefone"}
        </span>
        <span className="ml-1.5 inline-flex gap-0.5 align-middle">
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
        </span>
      </TableCell>
      <TableCell className="text-center">
        <ReadinessBadge readiness={row.readiness} compact />
      </TableCell>
      <TableCell>
        {pends.length === 0 ? (
          <span className="text-xs text-emerald-600">✓ sem pendências</span>
        ) : (
          <button onClick={onOpen} className="text-left text-xs leading-tight hover:underline">
            {pends.slice(0, compact ? 1 : 2).map((p) => (
              <span key={p.itemId} className="block truncate">
                • {p.name}
              </span>
            ))}
            {pends.length > (compact ? 1 : 2) && (
              <span className="text-muted-foreground">+{pends.length - (compact ? 1 : 2)} pendências</span>
            )}
          </button>
        )}
      </TableCell>
      <TableCell>
        <Select
          value={c.responsibleId ?? ""}
          onValueChange={(uid) => {
            const u = users.find((x) => x.id === uid);
            patch({ responsibleId: uid, responsibleName: u?.name ?? "" });
          }}
        >
          <SelectTrigger
            className={cn(
              "h-7 w-full border-0 bg-transparent px-1 text-xs shadow-none hover:bg-muted",
              !c.responsibleId && "text-muted-foreground"
            )}
          >
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id} className="text-xs">
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
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
      <TableCell className="whitespace-nowrap text-xs">
        <span className={cn((row.lastContactDays === null || row.lastContactDays >= 7) && "text-amber-600")}>
          {formatRelative(c.lastContactAt)}
        </span>
        {c.lastContactResult && (
          <span className="block truncate text-muted-foreground">{c.lastContactResult}</span>
        )}
      </TableCell>
      {!compact && (
        <TableCell>
          <NextActionCell value={c.nextAction ?? ""} onSave={(v) => patch({ nextAction: v })} />
        </TableCell>
      )}
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
