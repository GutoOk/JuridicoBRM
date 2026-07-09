"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { setCaseField } from "@/lib/db-actions";
import type { CaseFile, ClientType } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpTip } from "@/components/shared/page-shell";

/**
 * Campos operacionais específicos do tipo (ex.: bloco/lote do Barão de Mauá).
 * Salva ao sair do campo (blur), sem botão de salvar.
 */
export function CaseFieldsPanel({
  clientId,
  type,
  caseFile,
}: {
  clientId: string;
  type: ClientType;
  caseFile: CaseFile | null | undefined;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fields = type.caseFields ?? [];
  const values = caseFile?.fields ?? {};
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    setDraft({});
  }, [clientId, type.id]);

  if (fields.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Este tipo não tem campos operacionais configurados.
      </p>
    );
  }

  const save = async (fieldId: string, value: string) => {
    if (!user) return;
    if ((values[fieldId] ?? "") === value) return;
    try {
      await setCaseField(clientId, type.id, fieldId, value, user);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao salvar campo" });
    }
  };

  const valueOf = (id: string) => draft[id] ?? values[id] ?? "";

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        Campos salvos automaticamente ao sair do campo.
        <HelpTip label="Depois de digitar, clique fora do campo para salvar. Listas salvam assim que você escolhe uma opção." />
      </p>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.id} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
          <Label className="mb-1 block text-xs text-muted-foreground">{f.label}</Label>
          {f.type === "select" ? (
            <Select
              value={valueOf(f.id) || undefined}
              onValueChange={(v) => {
                setDraft((d) => ({ ...d, [f.id]: v }));
                save(f.id, v);
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {(f.options ?? []).map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : f.type === "textarea" ? (
            <Textarea
              value={valueOf(f.id)}
              rows={2}
              onChange={(e) => setDraft((d) => ({ ...d, [f.id]: e.target.value }))}
              onBlur={(e) => save(f.id, e.target.value.trim())}
            />
          ) : (
            <Input
              type={f.type === "date" ? "date" : "text"}
              className="h-8"
              value={valueOf(f.id)}
              onChange={(e) => setDraft((d) => ({ ...d, [f.id]: e.target.value }))}
              onBlur={(e) => save(f.id, e.target.value.trim())}
            />
          )}
        </div>
      ))}
    </div>
    </div>
  );
}
