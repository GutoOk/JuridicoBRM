"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, History, RotateCcw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { setCaseField, setLegacyFieldHidden } from "@/lib/db-actions";
import { activeCaseFields } from "@/lib/checklist";
import type { CaseFieldDef, CaseFile, ClientType } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpTip } from "@/components/shared/page-shell";
import { cn } from "@/lib/utils";

/** Campos atuais do caso e, em seção separada, campos antigos preservados. */
export function CaseFieldsPanel({
  clientId,
  type,
  caseFile,
}: {
  clientId: string;
  type: ClientType;
  caseFile: CaseFile | null | undefined;
}) {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const fields = activeCaseFields(type);
  const values = caseFile?.fields ?? {};
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    setDraft({});
  }, [clientId, type.id]);

  const currentIds = useMemo(() => new Set(fields.map((field) => field.id)), [fields]);
  const definitionById = useMemo(
    () => new Map((type.caseFields ?? []).map((field) => [field.id, field])),
    [type.caseFields]
  );
  const hiddenIds = new Set(caseFile?.hiddenLegacyFieldIds ?? []);
  const legacyIds = Array.from(
    new Set([
      ...(caseFile?.legacyFieldIds ?? []),
      ...Object.keys(values).filter((id) => !currentIds.has(id)),
    ])
  ).filter((id) => !currentIds.has(id));
  const legacyFields = legacyIds.map(
    (id): CaseFieldDef =>
      definitionById.get(id) ?? {
        id,
        label: `Campo antigo (${id})`,
        type: "text",
        deleted: true,
      }
  );
  const visibleLegacy = legacyFields.filter((field) => !hiddenIds.has(field.id));
  const hiddenLegacy = legacyFields.filter((field) => hiddenIds.has(field.id));

  const save = async (fieldId: string, value: string) => {
    if (!user || (values[fieldId] ?? "") === value) return;
    try {
      await setCaseField(clientId, type.id, fieldId, value, user);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao salvar campo" });
    }
  };

  const setHidden = async (fieldId: string, hidden: boolean) => {
    if (!user) return;
    try {
      await setLegacyFieldHidden(clientId, type.id, fieldId, hidden, user);
      toast({ title: hidden ? "Campo antigo ocultado" : "Campo antigo restaurado" });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao alterar a visibilidade" });
    }
  };

  const valueOf = (id: string) => draft[id] ?? values[id] ?? "";
  const renderField = (field: CaseFieldDef, legacy = false, hidden = false) => (
    <div
      key={field.id}
      className={cn(
        field.width === "full" || field.type === "textarea" ? "sm:col-span-2" : "",
        legacy && "rounded-md border border-dashed p-2",
        hidden && "bg-muted/40 opacity-75"
      )}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground">
          {field.label}{field.required && !legacy ? " *" : ""}
        </Label>
        {legacy && <Badge variant="outline" className="px-1 py-0 text-[9px]">antigo</Badge>}
        {legacy && (
          <HelpTip label={hidden ? "Restaura a exibição deste campo antigo." : "Oculta este campo sem apagar o valor salvo."}>
            <Button variant="ghost" size="icon" className="ml-auto size-6" onClick={() => setHidden(field.id, !hidden)}>
              {hidden ? <RotateCcw className="size-3.5" /> : <EyeOff className="size-3.5" />}
            </Button>
          </HelpTip>
        )}
      </div>
      {field.description && <p className="mb-1 text-[11px] text-muted-foreground">{field.description}</p>}
      <FieldControl
        field={field}
        value={valueOf(field.id)}
        onChange={(value) => setDraft((current) => ({ ...current, [field.id]: value }))}
        onSave={(value) => save(field.id, value)}
      />
    </div>
  );

  if (fields.length === 0 && visibleLegacy.length === 0 && (!isAdmin || hiddenLegacy.length === 0)) {
    return <p className="py-2 text-sm text-muted-foreground">Este tipo não tem campos operacionais configurados.</p>;
  }

  return (
    <div className="space-y-3">
      {fields.length > 0 && (
        <>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            Campos salvos automaticamente ao sair do campo.
            <HelpTip label="Depois de digitar, clique fora do campo para salvar. Listas salvam assim que você escolhe uma opção." />
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{fields.map((field) => renderField(field))}</div>
        </>
      )}

      {visibleLegacy.length > 0 && (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-2 dark:border-amber-900 dark:bg-amber-950/10">
          <div className="mb-2 flex items-start gap-2">
            <History className="mt-0.5 size-4 text-amber-700" />
            <div>
              <h4 className="text-xs font-medium text-amber-900 dark:text-amber-200">Campos antigos desta ficha</h4>
              <p className="text-[11px] text-muted-foreground">Valores preservados após mudanças no modelo do caso.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {visibleLegacy.map((field) => renderField(field, true))}
          </div>
        </div>
      )}

      {isAdmin && hiddenLegacy.length > 0 && (
        <div className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => setShowHidden((value) => !value)}>
            <Eye className="mr-1.5 size-3.5" />
            {showHidden ? "Esconder ocultos" : `Ver ocultos (${hiddenLegacy.length})`}
          </Button>
          {showHidden && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {hiddenLegacy.map((field) => renderField(field, true, true))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FieldControl({
  field,
  value,
  onChange,
  onSave,
}: {
  field: CaseFieldDef;
  value: string;
  onChange: (value: string) => void;
  onSave: (value: string) => void;
}) {
  if (field.type === "select") {
    const choices = Array.from(new Set([...(field.options ?? []), ...(value ? [value] : [])]));
    return (
      <Select
        value={value || undefined}
        onValueChange={(nextValue) => {
          onChange(nextValue);
          onSave(nextValue);
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={field.placeholder || "—"} />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice} value={choice}>{choice}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "textarea") {
    return (
      <Textarea
        value={value}
        rows={2}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onSave(event.target.value.trim())}
      />
    );
  }
  return (
    <Input
      type={field.type === "date" ? "date" : "text"}
      className="h-8 text-xs"
      value={value}
      placeholder={field.placeholder}
      onChange={(event) => onChange(event.target.value)}
      onBlur={(event) => onSave(event.target.value.trim())}
    />
  );
}
