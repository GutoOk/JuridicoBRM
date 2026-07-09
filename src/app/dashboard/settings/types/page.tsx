"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  Loader2,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Wand2,
  Archive,
  ArchiveRestore,
  GripVertical,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { installDefaults } from "@/lib/seed";
import { newItemId } from "@/lib/checklist";
import type { CaseFieldDef, ChecklistItemDef, ClientType, Requirement } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { EmptyState, HelpTip, PageHeader } from "@/components/shared/page-shell";

const COLOR_PRESETS = ["#0d9488", "#7c3aed", "#2563eb", "#dc2626", "#d97706", "#64748b", "#db2777", "#059669"];

export default function TypesSettingsPage() {
  const { user, isAdmin } = useAuth();
  const { data: types } = useCollection<ClientType>("clientTypes");
  const { toast } = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [typeForm, setTypeForm] = useState({ id: "", name: "", color: COLOR_PRESETS[0], description: "" });
  const [installing, setInstalling] = useState(false);

  const sorted = useMemo(
    () => (types ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [types]
  );
  const selected = sorted.find((t) => t.id === selectedId) ?? sorted.find((t) => !t.archived) ?? null;

  if (!isAdmin) {
    return (
      <div className="page-shell">
        <EmptyState
          title="Acesso restrito"
          description="Somente administradores podem configurar tipos e checklists."
        />
      </div>
    );
  }

  const install = async () => {
    if (!user) return;
    setInstalling(true);
    try {
      const res = await installDefaults(user.name);
      toast({
        title: "Padrões instalados",
        description: `${res.types} tipo(s) e ${res.templates} mensagem(ns) criados. Nada existente foi sobrescrito.`,
      });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao instalar padrões" });
    } finally {
      setInstalling(false);
    }
  };

  const openNewType = () => {
    setTypeForm({ id: "", name: "", color: COLOR_PRESETS[0], description: "" });
    setTypeDialogOpen(true);
  };

  const openEditType = (t: ClientType) => {
    setTypeForm({ id: t.id, name: t.name, color: t.color, description: t.description ?? "" });
    setTypeDialogOpen(true);
  };

  const saveType = async () => {
    if (!user || !typeForm.name.trim()) return;
    try {
      if (typeForm.id) {
        await updateDoc(doc(db, "clientTypes", typeForm.id), {
          name: typeForm.name.trim(),
          color: typeForm.color,
          description: typeForm.description.trim(),
          updatedAt: serverTimestamp(),
          updatedBy: user.name,
        });
      } else {
        const maxOrder = Math.max(0, ...sorted.map((t) => t.order ?? 0));
        const ref = await addDoc(collection(db, "clientTypes"), {
          name: typeForm.name.trim(),
          color: typeForm.color,
          description: typeForm.description.trim(),
          order: maxOrder + 1,
          archived: false,
          checklist: [],
          caseFields: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: user.name,
        });
        setSelectedId(ref.id);
      }
      toast({ title: "Tipo salvo" });
      setTypeDialogOpen(false);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao salvar tipo" });
    }
  };

  const moveType = async (t: ClientType, dir: -1 | 1) => {
    const idx = sorted.findIndex((x) => x.id === t.id);
    const other = sorted[idx + dir];
    if (!other) return;
    await Promise.all([
      updateDoc(doc(db, "clientTypes", t.id), { order: other.order ?? 0 }),
      updateDoc(doc(db, "clientTypes", other.id), { order: t.order ?? 0 }),
    ]);
  };

  const toggleArchive = async (t: ClientType) => {
    await updateDoc(doc(db, "clientTypes", t.id), { archived: !t.archived });
    toast({ title: t.archived ? "Tipo restaurado" : "Tipo arquivado" });
  };

  if (!types) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="configuração"
        title="Tipos & Checklists"
        description="Configure as operações, seus checklists e campos específicos do caso. Alterações aqui afetam a tela de Operação e a ficha do cliente."
      >
        <div className="flex gap-2">
          {sorted.length === 0 && (
            <HelpTip label="Cria tipos, checklists e mensagens padrão iniciais sem sobrescrever o que já existir.">
            <Button onClick={install} disabled={installing}>
              {installing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Wand2 className="mr-2 size-4" />}
              Instalar padrões (Barão de Mauá etc.)
            </Button>
            </HelpTip>
          )}
          {sorted.length > 0 && (
            <HelpTip label="Recria apenas padrões faltantes. Itens existentes não são sobrescritos.">
            <Button variant="outline" onClick={install} disabled={installing}>
              {installing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Wand2 className="mr-2 size-4" />}
              Reinstalar padrões faltantes
            </Button>
            </HelpTip>
          )}
          <HelpTip label="Cria uma nova operação/tipo de cliente para aparecer nos cadastros e filas.">
          <Button onClick={openNewType}>
            <Plus className="mr-2 size-4" /> Novo tipo
          </Button>
          </HelpTip>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        {/* Lista de tipos */}
        <Card className="surface h-fit">
          <CardContent className="space-y-1 p-2">
            {sorted.map((t, i) => (
              <div
                key={t.id}
                className={cn(
                  "flex items-center gap-1 rounded-md p-1.5",
                  selected?.id === t.id ? "bg-muted" : "hover:bg-muted/50",
                  t.archived && "opacity-50"
                )}
              >
                <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setSelectedId(t.id)}>
                  <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="truncate text-sm font-medium">{t.name}</span>
                  {t.archived && <Badge variant="outline" className="text-[10px]">arquivado</Badge>}
                </button>
                <HelpTip label="Sobe este tipo na ordem exibida no sistema.">
                <Button variant="ghost" size="icon" className="size-6" disabled={i === 0} onClick={() => moveType(t, -1)}>
                  <ArrowUp className="size-3" />
                </Button>
                </HelpTip>
                <HelpTip label="Desce este tipo na ordem exibida no sistema.">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  disabled={i === sorted.length - 1}
                  onClick={() => moveType(t, 1)}
                >
                  <ArrowDown className="size-3" />
                </Button>
                </HelpTip>
              </div>
            ))}
            {sorted.length === 0 && (
              <EmptyState
                title="Nenhum tipo ainda"
                description="Instale os padrões ou crie o primeiro tipo manualmente."
                className="border-0 bg-transparent"
              />
            )}
          </CardContent>
        </Card>

        {/* Editor do tipo selecionado */}
        {selected ? (
          <TypeEditor
            key={selected.id}
            type={selected}
            onEditMeta={() => openEditType(selected)}
            onToggleArchive={() => toggleArchive(selected)}
          />
        ) : (
          <EmptyState
            title="Selecione um tipo"
            description="Escolha uma operação à esquerda para editar checklist e campos."
          />
        )}
      </div>

      <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{typeForm.id ? "Editar tipo" : "Novo tipo de cliente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={typeForm.name}
                onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                placeholder="Ex.: Barão de Mauá"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cn(
                      "size-7 rounded-full border-2",
                      typeForm.color === c ? "border-foreground" : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setTypeForm({ ...typeForm, color: c })}
                  />
                ))}
                <Input
                  value={typeForm.color}
                  onChange={(e) => setTypeForm({ ...typeForm, color: e.target.value })}
                  className="w-24 font-mono text-xs"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                value={typeForm.description}
                onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveType} disabled={!typeForm.name.trim()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor de checklist e campos do caso (com rascunho + salvar)
// ---------------------------------------------------------------------------

function TypeEditor({
  type,
  onEditMeta,
  onToggleArchive,
}: {
  type: ClientType;
  onEditMeta: () => void;
  onToggleArchive: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<ChecklistItemDef[]>(type.checklist ?? []);
  const [fields, setFields] = useState<CaseFieldDef[]>(type.caseFields ?? []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setItems(type.checklist ?? []);
    setFields(type.caseFields ?? []);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type.id]);

  const mutateItems = (fn: (prev: ChecklistItemDef[]) => ChecklistItemDef[]) => {
    setItems(fn);
    setDirty(true);
  };
  const mutateFields = (fn: (prev: CaseFieldDef[]) => CaseFieldDef[]) => {
    setFields(fn);
    setDirty(true);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "clientTypes", type.id), {
        checklist: items,
        caseFields: fields,
        updatedAt: serverTimestamp(),
        updatedBy: user.name,
      });
      setDirty(false);
      toast({ title: "Checklist salvo" });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  };

  const setItem = (id: string, patch: Partial<ChecklistItemDef>) =>
    mutateItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const moveItem = (idx: number, dir: -1 | 1) =>
    mutateItems((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  const addItem = () =>
    mutateItems((prev) => [
      ...prev,
      {
        id: newItemId(),
        name: "Novo item",
        category: prev[prev.length - 1]?.category ?? "Geral",
        requirement: "recomendado",
        blocking: false,
        generatesPendency: true,
        pinned: false,
        active: true,
      },
    ]);

  const removeItem = (id: string) => mutateItems((prev) => prev.filter((i) => i.id !== id));

  return (
    <div className="space-y-3">
      <div className="surface case-spine flex flex-wrap items-center justify-between gap-2 p-3 pl-5">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full" style={{ backgroundColor: type.color }} />
          <h2 className="font-headline text-xl font-bold">{type.name}</h2>
          <HelpTip label="Altera o nome, cor e descrição deste tipo.">
          <Button variant="ghost" size="sm" onClick={onEditMeta}>
            editar nome/cor
          </Button>
          </HelpTip>
          <HelpTip label={type.archived ? "Restaura o tipo para voltar a aparecer nas telas." : "Arquiva o tipo sem apagar seus dados do banco."}>
          <Button variant="ghost" size="sm" onClick={onToggleArchive}>
            {type.archived ? (
              <>
                <ArchiveRestore className="mr-1 size-3.5" /> restaurar
              </>
            ) : (
              <>
                <Archive className="mr-1 size-3.5" /> arquivar
              </>
            )}
          </Button>
          </HelpTip>
        </div>
        <HelpTip label="Salva alterações de checklist e campos do caso neste tipo.">
        <Button onClick={save} disabled={!dirty || saving}>
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
          {dirty ? "Salvar alterações" : "Salvo"}
        </Button>
        </HelpTip>
      </div>

      <Tabs defaultValue="checklist">
        <TabsList>
          <TabsTrigger value="checklist">Itens do checklist ({items.length})</TabsTrigger>
          <TabsTrigger value="fields">Campos do caso ({fields.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="space-y-2">
          <p className="text-xs text-muted-foreground">
            <strong>Bloqueia</strong>: impede protocolo (prontidão C/D). <strong>Pendência</strong>: gera
            pendência automática. <strong>Filtro</strong>: vira botão de filtro rápido na Operação.{" "}
            <strong>Chave</strong>: liga o item às regras de prontidão (procuracao, contrato, termo_resp,
            ultimo_adq, ultimo_adq_prova, extrato, boletos, pagamentos_suficientes, planilha, minuta_revisada,
            protocolado…).
          </p>
          <div className="work-table">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="ledger-header text-xs">
                <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
                  <th className="w-14" />
                  <th className="min-w-[220px]">Item</th>
                  <th className="min-w-[150px]">Categoria</th>
                  <th>Exigência</th>
                  <th className="text-center">Bloqueia</th>
                  <th className="text-center">Pendência</th>
                  <th className="text-center">Filtro</th>
                  <th className="min-w-[120px]">Chave</th>
                  <th className="text-center">Ativo</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item.id} className={cn("border-t", !item.active && "opacity-50")}>
                    <td className="px-1">
                      <div className="flex items-center">
                        <HelpTip label="Sobe este item no checklist.">
                        <Button variant="ghost" size="icon" className="size-6" disabled={idx === 0} onClick={() => moveItem(idx, -1)}>
                          <ArrowUp className="size-3" />
                        </Button>
                        </HelpTip>
                        <HelpTip label="Desce este item no checklist.">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          disabled={idx === items.length - 1}
                          onClick={() => moveItem(idx, 1)}
                        >
                          <ArrowDown className="size-3" />
                        </Button>
                        </HelpTip>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        value={item.name}
                        onChange={(e) => setItem(item.id, { name: e.target.value })}
                        className="h-7 text-sm"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        value={item.category}
                        onChange={(e) => setItem(item.id, { category: e.target.value })}
                        className="h-7 text-sm"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Select
                        value={item.requirement}
                        onValueChange={(v) => setItem(item.id, { requirement: v as Requirement })}
                      >
                        <SelectTrigger className="h-7 w-[120px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="obrigatorio">Obrigatório</SelectItem>
                          <SelectItem value="recomendado">Recomendado</SelectItem>
                          <SelectItem value="opcional">Opcional</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 text-center">
                      <Checkbox
                        checked={item.blocking}
                        onCheckedChange={(v) => setItem(item.id, { blocking: !!v })}
                      />
                    </td>
                    <td className="px-2 text-center">
                      <Checkbox
                        checked={item.generatesPendency}
                        onCheckedChange={(v) => setItem(item.id, { generatesPendency: !!v })}
                      />
                    </td>
                    <td className="px-2 text-center">
                      <Checkbox
                        checked={!!item.pinned}
                        onCheckedChange={(v) => setItem(item.id, { pinned: !!v })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        value={item.key ?? ""}
                        onChange={(e) => setItem(item.id, { key: e.target.value.trim() || undefined })}
                        className="h-7 font-mono text-xs"
                        placeholder="—"
                      />
                    </td>
                    <td className="px-2 text-center">
                      <Switch
                        checked={item.active}
                        onCheckedChange={(v) => setItem(item.id, { active: v })}
                        className="scale-75"
                      />
                    </td>
                    <td className="px-1 text-center">
                      <HelpTip label="Remove o item da configuração. Status já marcados em clientes ficam guardados no banco." side="left">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-destructive"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                      </HelpTip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="mr-1.5 size-4" /> Adicionar item
          </Button>
        </TabsContent>

        <TabsContent value="fields" className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Campos específicos deste tipo, exibidos na aba “Caso” de cada cliente (ex.: bloco/lote, número do
            processo).
          </p>
          <div className="space-y-2">
            {fields.map((f, idx) => (
              <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                <GripVertical className="size-4 text-muted-foreground" />
                <Input
                  value={f.label}
                  onChange={(e) =>
                    mutateFields((prev) => prev.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)))
                  }
                  className="h-8 w-56"
                />
                <Select
                  value={f.type}
                  onValueChange={(v) =>
                    mutateFields((prev) =>
                      prev.map((x) => (x.id === f.id ? { ...x, type: v as CaseFieldDef["type"] } : x))
                    )
                  }
                >
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="textarea">Texto longo</SelectItem>
                    <SelectItem value="select">Lista</SelectItem>
                    <SelectItem value="date">Data</SelectItem>
                  </SelectContent>
                </Select>
                {f.type === "select" && (
                  <Input
                    value={(f.options ?? []).join("; ")}
                    onChange={(e) =>
                      mutateFields((prev) =>
                        prev.map((x) =>
                          x.id === f.id
                            ? { ...x, options: e.target.value.split(";").map((o) => o.trim()).filter(Boolean) }
                            : x
                        )
                      )
                    }
                    placeholder="Opção 1; Opção 2; Opção 3"
                    className="h-8 flex-1"
                  />
                )}
                <div className="ml-auto flex items-center">
                  <HelpTip label="Sobe este campo na ficha do caso.">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={idx === 0}
                    onClick={() =>
                      mutateFields((prev) => {
                        const next = [...prev];
                        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                        return next;
                      })
                    }
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  </HelpTip>
                  <HelpTip label="Desce este campo na ficha do caso.">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={idx === fields.length - 1}
                    onClick={() =>
                      mutateFields((prev) => {
                        const next = [...prev];
                        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                        return next;
                      })
                    }
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  </HelpTip>
                  <HelpTip label="Remove este campo da configuração do tipo." side="left">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive"
                    onClick={() => mutateFields((prev) => prev.filter((x) => x.id !== f.id))}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                  </HelpTip>
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              mutateFields((prev) => [...prev, { id: newItemId(), label: "Novo campo", type: "text" }])
            }
          >
            <Plus className="mr-1.5 size-4" /> Adicionar campo
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
