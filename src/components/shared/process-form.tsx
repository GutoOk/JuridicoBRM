"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Loader2, Star, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { extractProcessText } from "@/lib/ai";
import { searchable } from "@/lib/normalize";
import type { Client, Process } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpTip } from "@/components/shared/page-shell";
import { CodeBadge } from "@/components/shared/badges";
import { AiExtractButton } from "@/components/shared/ai-extract-dialog";
import { cn } from "@/lib/utils";

const STATUSES = ["Ativo", "Suspenso", "Arquivado", "Extinto"] as const;

type FormState = {
  processNumber: string;
  status: Process["status"];
  polo: "" | "Ativo" | "Passivo";
  parteContraria: string;
  actionType: string;
  classe: string;
  assunto: string;
  foro: string;
  vara: string;
  juiz: string;
  instancia: string;
  notes: string;
  clientIds: string[];
  mainClientId: string;
};

function initialForm(p?: Process | null, prefillClientId?: string): FormState {
  return {
    processNumber: p?.processNumber ?? "",
    status: p?.status ?? "Ativo",
    polo: p?.polo ?? "",
    parteContraria: p?.parteContraria ?? "",
    actionType: p?.actionType ?? "",
    classe: p?.classe ?? "",
    assunto: p?.assunto ?? "",
    foro: p?.foro ?? "",
    vara: p?.vara ?? "",
    juiz: p?.juiz ?? "",
    instancia: p?.instancia ?? "",
    notes: p?.notes ?? "",
    clientIds: p?.clientIds ?? (prefillClientId ? [prefillClientId] : []),
    mainClientId: p?.mainClientId ?? prefillClientId ?? "",
  };
}

/**
 * Formulário completo de processo (novo/edição), em diálogo.
 * - Vários clientes por processo, com um marcado como principal (estrela).
 * - Todos os campos judiciais: polo, parte contrária, tipo de ação, classe,
 *   assunto, foro, vara, juiz, instância, status e observações.
 * - Sugestões automáticas nos campos de texto a partir dos valores já usados.
 * - Botão "Preencher com IA" a partir de texto colado (capa do processo).
 * NUNCA sobrescreve os vínculos de clientes existentes sem intenção: a lista
 * completa clientIds/clientNames é preservada e editada explicitamente.
 */
export function ProcessFormDialog({
  open,
  onOpenChange,
  process,
  prefillClient,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  process?: Process | null;
  prefillClient?: { id: string; name: string } | null;
  onSaved?: (id: string) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: clients } = useCollection<Client>("clients");
  const { data: processes } = useCollection<Process>("processes");

  const [form, setForm] = useState<FormState>(() => initialForm(process, prefillClient?.id));
  const [clientSearch, setClientSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialForm(process, prefillClient?.id));
      setClientSearch("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, process?.id, prefillClient?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const activeClients = useMemo(() => (clients ?? []).filter((c) => !c.deleted), [clients]);
  const clientById = useMemo(() => new Map(activeClients.map((c) => [c.id, c])), [activeClients]);

  const selectedClients = form.clientIds
    .map((id) => clientById.get(id))
    .filter((c): c is Client => !!c);

  const matches = useMemo(() => {
    const q = searchable(clientSearch.trim());
    if (q.length < 2) return [];
    return activeClients
      .filter(
        (c) =>
          !form.clientIds.includes(c.id) &&
          (searchable(c.name).includes(q) || (c.code ?? "").toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [clientSearch, activeClients, form.clientIds]);

  const addClient = (c: Client) => {
    const ids = [...form.clientIds, c.id];
    setForm((f) => ({ ...f, clientIds: ids, mainClientId: f.mainClientId || c.id }));
    setClientSearch("");
  };

  const removeClient = (id: string) => {
    const ids = form.clientIds.filter((x) => x !== id);
    setForm((f) => ({
      ...f,
      clientIds: ids,
      mainClientId: f.mainClientId === id ? (ids[0] ?? "") : f.mainClientId,
    }));
  };

  // Sugestões a partir dos valores já usados em outros processos
  const suggestions = useMemo(() => {
    const list = (processes ?? []).filter((p) => !p.deleted);
    const uniq = (key: keyof Process) =>
      [...new Set(list.map((p) => p[key]).filter((v): v is string => typeof v === "string" && !!v))].sort();
    return {
      actionType: uniq("actionType"),
      classe: uniq("classe"),
      assunto: uniq("assunto"),
      foro: uniq("foro"),
      vara: uniq("vara"),
      juiz: uniq("juiz"),
    };
  }, [processes]);

  const fillFromAi = async (text: string) => {
    const d = await extractProcessText(text);
    setForm((f) => ({
      ...f,
      processNumber: d.processNumber || f.processNumber,
      actionType: d.actionType || f.actionType,
      classe: d.classe || f.classe,
      assunto: d.assunto || f.assunto,
      vara: d.vara || f.vara,
      foro: d.foro || f.foro,
      juiz: d.juiz || f.juiz,
      instancia: d.instancia || f.instancia,
      polo: d.polo || f.polo,
      parteContraria: d.parteContraria || f.parteContraria,
    }));
  };

  const handleSave = async () => {
    if (!user || !form.processNumber.trim()) return;
    if (form.clientIds.length === 0) {
      toast({ variant: "destructive", title: "Selecione ao menos um cliente" });
      return;
    }
    setSaving(true);
    try {
      // Nomes denormalizados na mesma ordem dos ids; nomes de clientes que não
      // carregaram (ex.: excluídos) são preservados a partir do doc antigo.
      const oldNameById = new Map(
        (process?.clientIds ?? []).map((id, i) => [id, process?.clientNames?.[i] ?? ""])
      );
      const clientNames = form.clientIds.map(
        (id) => clientById.get(id)?.name ?? oldNameById.get(id) ?? ""
      );
      const payload = {
        processNumber: form.processNumber.trim(),
        status: form.status,
        polo: form.polo || "Ativo",
        parteContraria: form.parteContraria.trim(),
        actionType: form.actionType.trim(),
        classe: form.classe.trim(),
        assunto: form.assunto.trim(),
        foro: form.foro.trim(),
        vara: form.vara.trim(),
        juiz: form.juiz.trim(),
        instancia: form.instancia,
        notes: form.notes.trim(),
        clientIds: form.clientIds,
        mainClientId: form.mainClientId || form.clientIds[0],
        clientNames,
        updatedAt: serverTimestamp(),
        lastUpdate: serverTimestamp(),
      };
      let id = process?.id ?? "";
      if (process) {
        await updateDoc(doc(db, "processes", process.id), payload);
        toast({ title: "Processo atualizado" });
      } else {
        const ref = await addDoc(collection(db, "processes"), {
          ...payload,
          createdAt: serverTimestamp(),
          deleted: false,
          deletedAt: null,
          deletedBy: null,
        });
        id = ref.id;
        toast({ title: "Processo cadastrado", description: payload.processNumber });
      }
      onOpenChange(false);
      onSaved?.(id);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao salvar processo" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <div>
              <DialogTitle>{process ? "Editar processo" : "Novo processo"}</DialogTitle>
              <DialogDescription>
                {process
                  ? "Altere os dados e salve. Os vínculos de clientes são mantidos como estão listados abaixo."
                  : "Preencha os dados ou cole a capa do processo no botão de IA."}
              </DialogDescription>
            </div>
            <AiExtractButton
              title="Extrair dados do processo"
              description="Cole o texto da capa do processo (número, classe, vara, partes…) e a IA preenche o formulário."
              placeholder="Cole aqui o texto com as informações do processo…"
              onAnalyze={fillFromAi}
            />
          </div>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <Label>Número do processo</Label>
              <Input
                value={form.processNumber}
                onChange={(e) => set("processNumber", e.target.value)}
                placeholder="0000000-00.0000.0.00.0000"
                className="font-code"
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v as Process["status"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Clientes vinculados */}
          <div className="space-y-1.5 rounded-md border p-2.5">
            <Label className="flex items-center gap-1">
              Clientes do processo
              <HelpTip label="Um processo pode ter vários clientes. A estrela marca o cliente principal, exibido em destaque nas listas." />
            </Label>
            {selectedClients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedClients.map((c) => {
                  const isMain = form.mainClientId === c.id;
                  return (
                    <span
                      key={c.id}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs",
                        isMain && "border-amber-400 bg-amber-50 dark:bg-amber-950/30"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => set("mainClientId", c.id)}
                        title={isMain ? "Cliente principal" : "Tornar cliente principal"}
                        className="text-muted-foreground hover:text-amber-500"
                      >
                        <Star className={cn("size-3", isMain && "fill-amber-400 text-amber-500")} />
                      </button>
                      <CodeBadge code={c.code} />
                      {c.name}
                      <button
                        type="button"
                        onClick={() => removeClient(c.id)}
                        title="Remover este cliente do processo"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <Input
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Buscar cliente por nome ou código para adicionar…"
              className="h-8"
            />
            {matches.length > 0 && (
              <div className="overflow-hidden rounded-md border">
                {matches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => addClient(c)}
                  >
                    <CodeBadge code={c.code} />
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                Polo do cliente
                <HelpTip label="Ativo: nosso cliente é autor/requerente. Passivo: nosso cliente é réu/requerido." />
              </Label>
              <Select value={form.polo || undefined} onValueChange={(v) => set("polo", v as FormState["polo"])}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ativo">Ativo (autor)</SelectItem>
                  <SelectItem value="Passivo">Passivo (réu)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Parte contrária</Label>
              <Input
                value={form.parteContraria}
                onChange={(e) => set("parteContraria", e.target.value)}
                placeholder="Nome da outra parte"
              />
            </div>
            <SuggestInput
              label="Tipo de ação"
              value={form.actionType}
              onChange={(v) => set("actionType", v)}
              options={suggestions.actionType}
              listId="sug-actionType"
            />
            <SuggestInput
              label="Classe"
              value={form.classe}
              onChange={(v) => set("classe", v)}
              options={suggestions.classe}
              listId="sug-classe"
            />
            <SuggestInput
              label="Assunto"
              value={form.assunto}
              onChange={(v) => set("assunto", v)}
              options={suggestions.assunto}
              listId="sug-assunto"
            />
            <SuggestInput
              label="Foro/Comarca"
              value={form.foro}
              onChange={(v) => set("foro", v)}
              options={suggestions.foro}
              listId="sug-foro"
            />
            <SuggestInput
              label="Vara"
              value={form.vara}
              onChange={(v) => set("vara", v)}
              options={suggestions.vara}
              listId="sug-vara"
            />
            <SuggestInput
              label="Juiz"
              value={form.juiz}
              onChange={(v) => set("juiz", v)}
              options={suggestions.juiz}
              listId="sug-juiz"
            />
            <div className="space-y-1">
              <Label>Instância</Label>
              <Select
                value={form.instancia || undefined}
                onValueChange={(v) => set("instancia", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1ª Instância">1ª Instância</SelectItem>
                  <SelectItem value="2ª Instância">2ª Instância</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !form.processNumber.trim()}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {process ? "Salvar alterações" : "Cadastrar processo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Campo de texto com sugestões dos valores já usados (datalist nativo). */
function SuggestInput({
  label,
  value,
  onChange,
  options,
  listId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  listId: string;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} list={listId} />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}
