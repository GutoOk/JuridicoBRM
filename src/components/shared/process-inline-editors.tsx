"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Process } from "@/lib/types";

/**
 * Edição campo a campo do processo, no mesmo espírito da ficha do cliente: em vez de um
 * botão "Editar" que abre o formulário inteiro, cada dado tem seu próprio lápis. O
 * formulário completo continua existindo para cadastro e para alterações em lote.
 */
export type ProcessFieldKind =
  | "processNumber"
  | "status"
  | "polo"
  | "parteContraria"
  | "actionType"
  | "classe"
  | "assunto"
  | "foro"
  | "vara"
  | "juiz"
  | "instancia"
  | "notes";

type FieldConfig = {
  label: string;
  description: string;
  /** Campos de texto livre ganham sugestões dos valores já usados na base. */
  suggestFrom?: keyof Process;
  options?: readonly string[];
  multiline?: boolean;
};

const FIELDS: Record<ProcessFieldKind, FieldConfig> = {
  processNumber: {
    label: "Número do processo",
    description: "Identificador oficial. A linha do tempo também agrupa andamentos por este número.",
  },
  status: {
    label: "Status",
    description: "Situação atual do processo.",
    options: ["Ativo", "Arquivado", "Suspenso", "Extinto"],
  },
  polo: {
    label: "Polo do cliente",
    description: "Posição dos clientes vinculados neste processo.",
    options: ["Ativo", "Passivo"],
  },
  parteContraria: { label: "Parte contrária", description: "Quem está do outro lado." },
  actionType: { label: "Tipo de ação", description: "Natureza da ação.", suggestFrom: "actionType" },
  classe: { label: "Classe", description: "Classe processual.", suggestFrom: "classe" },
  assunto: { label: "Assunto", description: "Assunto processual.", suggestFrom: "assunto" },
  foro: { label: "Foro", description: "Foro onde tramita.", suggestFrom: "foro" },
  vara: { label: "Vara", description: "Vara onde tramita.", suggestFrom: "vara" },
  juiz: { label: "Juiz", description: "Magistrado responsável.", suggestFrom: "juiz" },
  instancia: { label: "Instância", description: "Instância atual.", suggestFrom: "instancia" },
  notes: { label: "Observações", description: "Anotações livres sobre o processo.", multiline: true },
};

export function processFieldLabel(kind: ProcessFieldKind): string {
  return FIELDS[kind].label;
}

export function ProcessFieldDialog({
  process,
  allProcesses,
  kind,
  onOpenChange,
}: {
  process: Process;
  allProcesses: Process[];
  kind: ProcessFieldKind | null;
  onOpenChange: (kind: ProcessFieldKind | null) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const open = !!kind;
  const config = kind ? FIELDS[kind] : null;

  useEffect(() => {
    if (!open || !kind) return;
    setValue(String(process[kind] ?? ""));
  }, [open, kind, process]);

  // Valores já usados na base, para não reinventar a grafia de foro, vara e afins.
  const suggestions = useMemo(() => {
    if (!config?.suggestFrom) return [];
    const field = config.suggestFrom;
    const seen = new Set<string>();
    allProcesses.forEach((item) => {
      const raw = item[field];
      if (typeof raw === "string" && raw.trim()) seen.add(raw.trim());
    });
    return [...seen].sort((first, second) => first.localeCompare(second, "pt-BR")).slice(0, 40);
  }, [allProcesses, config?.suggestFrom]);

  const persist = async () => {
    if (!user || !kind) return;
    const clean = value.trim();
    if (kind === "processNumber" && !clean) {
      toast({ variant: "destructive", title: "Informe o número do processo" });
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, "processes", process.id), {
        [kind]: clean,
        updatedAt: serverTimestamp(),
        updatedBy: user.name,
      });
      toast({ title: `${FIELDS[kind].label} atualizado` });
      onOpenChange(null);
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Não foi possível atualizar",
        description: "Confira os dados e tente novamente.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onOpenChange(null); }}>
      <DialogContent className="sm:max-w-md">
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void persist(); }}>
          <DialogHeader>
            <DialogTitle className="text-base">Editar {config?.label.toLocaleLowerCase("pt-BR")}</DialogTitle>
            <DialogDescription>{config?.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="process-field-value" className="text-xs">{config?.label}</Label>
            {config?.options ? (
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger id="process-field-value"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {config.options.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : config?.multiline ? (
              <Textarea
                id="process-field-value"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                rows={5}
                autoFocus
              />
            ) : (
              <>
                <Input
                  id="process-field-value"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  list={suggestions.length ? "process-field-suggestions" : undefined}
                  autoFocus
                />
                {suggestions.length > 0 && (
                  <datalist id="process-field-suggestions">
                    {suggestions.map((item) => <option key={item} value={item} />)}
                  </datalist>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(null)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
