"use client";

import { useMemo, useState } from "react";
import { arrayUnion, collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Sparkles } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { aiErrorMessage, mapTemporaryBaronColumns, type TemporaryImportColumnMapping } from "@/lib/ai";
import { namesAreSimilar } from "@/lib/client-deduplication";
import { activeChecklistItems } from "@/lib/checklist";
import { caseFileId } from "@/lib/db-actions";
import { exportCsv, readSpreadsheet } from "@/lib/export";
import {
  digitsOnly,
  formatCpfCnpj,
  isValidCode,
  isValidCpfCnpj,
  normalizeCode,
  normalizePhone,
  searchable,
} from "@/lib/normalize";
import type { CaseFile, Client, ClientType, ItemStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ClientField = "code" | "name" | "cpfCnpj" | "phone" | "whatsapp" | "email" | "addressLine" | "city" | "state" | "zipCode" | "notes" | "nextAction";
type Step = "file" | "review";

type ReviewValue = {
  sourceIndex: number;
  header: string;
  label: string;
  target: "client" | "checklist" | "caseField" | "review";
  targetKey?: string;
  value: string;
  oldValue: string;
  include: boolean;
  conflict: boolean;
  confidence: "alta" | "media" | "baixa";
  reason: string;
};

type ReviewRow = {
  id: number;
  sourceRow: string[];
  enabled: boolean;
  matchId: string;
  candidateIds: string[];
  issues: string[];
  values: ReviewValue[];
};

const CLIENT_LABELS: Record<ClientField, string> = {
  code: "Código",
  name: "Nome",
  cpfCnpj: "CPF/CNPJ",
  phone: "Telefone",
  whatsapp: "WhatsApp",
  email: "E-mail",
  addressLine: "Endereço",
  city: "Cidade",
  state: "UF",
  zipCode: "CEP",
  notes: "Observações",
  nextAction: "Próxima ação",
};

function cleanHeader(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sameValue(field: string, first: string, second: string): boolean {
  if (["cpfCnpj", "phone", "whatsapp", "zipCode"].includes(field)) return digitsOnly(first) === digitsOnly(second);
  if (field === "code") return normalizeCode(first) === normalizeCode(second);
  return searchable(first) === searchable(second);
}

function clientValue(client: Client | undefined, field: ClientField): string {
  if (!client) return "";
  if (field === "phone") return client.phone || client.phones?.find((phone) => phone.isPrimary)?.number || client.phones?.[0]?.number || "";
  if (field === "email") return client.email || client.emails?.[0]?.address || "";
  return String(client[field] ?? "");
}

function checklistState(value: string): { status: ItemStatus; note?: string } {
  const normalized = searchable(value);
  if (["sim", "ok", "conferido", "assinado", "recebido"].includes(normalized)) return { status: "conferido" };
  if (["nao se aplica", "n/a", "na"].includes(normalized)) return { status: "nao_se_aplica", note: value };
  return { status: "pendente", note: value };
}

function forcedClientField(header: string): ClientField | null {
  const normalized = searchable(cleanHeader(header));
  if (["n", "no", "numero", "codigo", "cod"].includes(normalized)) return "code";
  if (normalized.includes("cliente") && normalized.includes("nome")) return "name";
  if (normalized === "nome" || normalized === "nome completo") return "name";
  if (normalized.includes("cpf") || normalized.includes("cnpj")) return "cpfCnpj";
  if (normalized.includes("telefone") || normalized === "fone") return "phone";
  if (normalized.includes("whatsapp")) return "whatsapp";
  if (normalized.includes("email")) return "email";
  return null;
}

function splitPhones(value: string): { phone: string; whatsapp?: string } {
  const parts = value.split(/[\/;,|]+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return { phone: value.trim() };
  const firstDigits = digitsOnly(parts[0]);
  const secondDigits = digitsOnly(parts[1]);
  const whatsapp = secondDigits.length <= 9 && firstDigits.length >= 10
    ? `${firstDigits.slice(0, 2)}${secondDigits}`
    : secondDigits;
  return { phone: parts[0], whatsapp };
}

export function TemporaryBaronImportDialog({
  open,
  onOpenChange,
  clients,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: types } = useCollection<ClientType>(open ? "clientTypes" : null);
  const { data: caseFiles } = useCollection<CaseFile>(open ? "caseFiles" : null);
  const [step, setStep] = useState<Step>("file");
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);

  const baronType = useMemo(
    () => (types ?? []).find((type) => !type.archived && (type.id === "barao-de-maua" || searchable(type.name).includes("barao de maua"))) ?? null,
    [types]
  );
  const clientMap = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const caseFileMap = useMemo(() => new Map((caseFiles ?? []).map((item) => [item.id, item])), [caseFiles]);

  const reset = () => {
    setStep("file");
    setFilename("");
    setHeaders([]);
    setRows([]);
  };

  const reconcile = (values: ReviewValue[], matchId: string): ReviewValue[] => {
    const match = clientMap.get(matchId);
    const caseFile = match && baronType ? caseFileMap.get(caseFileId(match.id, baronType.id)) : undefined;
    return values.map((value) => {
      let oldValue = "";
      if (value.target === "client" && value.targetKey) oldValue = clientValue(match, value.targetKey as ClientField);
      if (value.target === "caseField" && value.targetKey) oldValue = caseFile?.fields?.[value.targetKey] ?? "";
      if (value.target === "checklist" && value.targetKey) {
        const state = caseFile?.items?.[value.targetKey];
        oldValue = state ? state.note || state.status : "";
      }
      const checklistConflict = value.target === "checklist" && value.targetKey && caseFile?.items?.[value.targetKey]
        ? checklistState(value.value).status !== caseFile.items[value.targetKey].status
        : false;
      const conflict = !!oldValue && (value.target === "checklist" ? checklistConflict : !sameValue(value.targetKey ?? "", value.value, oldValue));
      return { ...value, oldValue, conflict, include: conflict ? false : value.target !== "review" };
    });
  };

  const findCandidates = (values: ReviewValue[]) => {
    const valueOf = (field: ClientField) => values.find((value) => value.target === "client" && value.targetKey === field)?.value ?? "";
    const code = normalizeCode(valueOf("code"));
    const cpf = digitsOnly(valueOf("cpfCnpj"));
    const name = valueOf("name");
    const exact = clients.filter((client) =>
      (code && normalizeCode(client.code) === code) ||
      (cpf && digitsOnly(client.cpfCnpjDigits || client.cpfCnpj) === cpf) ||
      (name && searchable(client.name) === searchable(name))
    );
    if (exact.length) return { candidates: exact, similar: false };
    const similar = name ? clients.filter((client) => !client.deleted && namesAreSimilar(client.name, name)).slice(0, 5) : [];
    return { candidates: similar, similar: similar.length > 0 };
  };

  const analyzeFile = async (file: File) => {
    if (!baronType) {
      toast({ variant: "destructive", title: "Operação Barão de Mauá não encontrada" });
      return;
    }
    setAnalyzing(true);
    try {
      const matrix = await readSpreadsheet(file);
      const nonEmpty = matrix.filter((row) => row.some((cell) => cell.trim()));
      if (nonEmpty.length < 2) throw new Error("A planilha não possui linhas de dados.");
      const cleanHeaders = nonEmpty[0].map(cleanHeader);
      const checklist = activeChecklistItems(baronType).map((item) => ({ id: item.id, name: item.name, description: item.description }));
      const caseFields = (baronType.caseFields ?? []).filter((field) => !field.deleted).map((field) => ({ id: field.id, label: field.label, description: field.description }));
      const aiMappings = await mapTemporaryBaronColumns(cleanHeaders, checklist, caseFields);
      const mappingByIndex = new Map(aiMappings.map((mapping) => [mapping.sourceIndex, mapping]));
      const validChecklistIds = new Set(checklist.map((item) => item.id));
      const validFieldIds = new Set(caseFields.map((field) => field.id));
      const finalMappings = cleanHeaders.map((header, sourceIndex): TemporaryImportColumnMapping => {
        const forced = forcedClientField(header);
        if (forced) return { sourceIndex, target: "client", targetKey: forced, confidence: "alta", reason: "Cabeçalho cadastral reconhecido diretamente." };
        const mapped = mappingByIndex.get(sourceIndex);
        if (!mapped || mapped.confidence === "baixa") return { sourceIndex, target: "review", confidence: mapped?.confidence ?? "baixa", reason: mapped?.reason ?? "Sem encaixe seguro." };
        if (mapped.target === "client" && mapped.targetKey && mapped.targetKey in CLIENT_LABELS) return mapped;
        if (mapped.target === "checklist" && mapped.targetKey && validChecklistIds.has(mapped.targetKey)) return mapped;
        if (mapped.target === "caseField" && mapped.targetKey && validFieldIds.has(mapped.targetKey)) return mapped;
        return { sourceIndex, target: "review", confidence: "baixa", reason: "Destino sugerido pela IA não existe mais na operação." };
      });

      const reviewRows = nonEmpty.slice(1).map((sourceRow, rowIndex): ReviewRow => {
        let values: ReviewValue[] = finalMappings.flatMap((mapping) => {
          const raw = sourceRow[mapping.sourceIndex]?.trim() ?? "";
          if (!raw) return [];
          const header = cleanHeaders[mapping.sourceIndex];
          const targetKey = mapping.targetKey;
          const targetDef = mapping.target === "checklist"
            ? checklist.find((item) => item.id === targetKey)?.name
            : mapping.target === "caseField"
              ? caseFields.find((field) => field.id === targetKey)?.label
              : mapping.target === "client" && targetKey
                ? CLIENT_LABELS[targetKey as ClientField]
                : header;
          return [{
            sourceIndex: mapping.sourceIndex,
            header,
            label: targetDef || header,
            target: mapping.target,
            targetKey,
            value: mapping.target === "client" && targetKey === "code" ? normalizeCode(raw) : raw,
            oldValue: "",
            include: mapping.target !== "review",
            conflict: false,
            confidence: mapping.confidence,
            reason: mapping.reason,
          }];
        });
        const phoneEntry = values.find((value) => value.target === "client" && value.targetKey === "phone");
        if (phoneEntry) {
          const phones = splitPhones(phoneEntry.value);
          phoneEntry.value = phones.phone;
          if (phones.whatsapp && !values.some((value) => value.target === "client" && value.targetKey === "whatsapp")) {
            values.push({ ...phoneEntry, sourceIndex: phoneEntry.sourceIndex, label: "WhatsApp/segundo telefone", targetKey: "whatsapp", value: phones.whatsapp });
          }
        }
        const found = findCandidates(values);
        const exactIds = found.candidates.map((client) => client.id);
        const exactSignals = new Set(found.candidates.map((client) => client.id));
        const ambiguous = exactSignals.size > 1;
        const matchId = !ambiguous && !found.similar && found.candidates.length === 1 ? found.candidates[0].id : "";
        values = reconcile(values, matchId);
        const issues: string[] = [];
        const code = values.find((value) => value.targetKey === "code")?.value ?? "";
        const name = values.find((value) => value.targetKey === "name")?.value ?? "";
        const cpf = values.find((value) => value.targetKey === "cpfCnpj")?.value ?? "";
        if (!name) issues.push("sem nome para criar cliente");
        if (code && !isValidCode(code)) issues.push("código inválido");
        if (cpf && !isValidCpfCnpj(cpf)) issues.push("CPF/CNPJ inválido");
        if (ambiguous) issues.push("código, CPF ou nome apontam para clientes diferentes");
        if (found.similar) issues.push("nome semelhante encontrado; escolha o destino antes de importar");
        if (found.candidates.some((client) => client.deleted)) issues.push("cadastro correspondente está ocultado");
        return {
          id: rowIndex,
          sourceRow,
          enabled: issues.length === 0,
          matchId,
          candidateIds: exactIds,
          issues,
          values,
        };
      });

      setFilename(file.name);
      setHeaders(cleanHeaders);
      setRows(reviewRows);
      setStep("review");
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Não foi possível analisar a planilha", description: error instanceof Error && !/AI/i.test(error.message) ? error.message : aiErrorMessage(error) });
    } finally {
      setAnalyzing(false);
    }
  };

  const updateValue = (rowId: number, sourceIndex: number, targetKey: string | undefined, patch: Partial<ReviewValue>) => {
    setRows((current) => current.map((row) => row.id === rowId
      ? { ...row, values: row.values.map((value) => value.sourceIndex === sourceIndex && value.targetKey === targetKey ? { ...value, ...patch } : value) }
      : row));
  };

  const changeDestination = (rowId: number, destination: string) => {
    setRows((current) => current.map((row) => {
      if (row.id !== rowId) return row;
      const matchId = destination === "__new" ? "" : destination;
      const issues = row.issues.filter((issue) => !issue.includes("escolha o destino") && !issue.includes("apontam para clientes diferentes"));
      return { ...row, matchId, enabled: issues.length === 0, issues, values: reconcile(row.values, matchId) };
    }));
  };

  const rejectedRows = () => rows.flatMap((row) => {
    const excluded = row.enabled ? row.values.filter((value) => !value.include) : row.values;
    if (excluded.length === 0) return [];
    const output: Record<string, unknown> = {
      Linha: row.id + 2,
      Código: row.values.find((value) => value.targetKey === "code")?.value ?? "",
      Cliente: row.values.find((value) => value.targetKey === "name")?.value ?? "",
      Motivo: row.enabled ? "Campos desmarcados ou sem destino seguro" : row.issues.join("; ") || "Linha desmarcada",
    };
    excluded.forEach((value) => { output[value.header] = value.value; });
    return [output];
  });

  const importRows = async () => {
    if (!user || !baronType) return;
    const selectedRows = rows.filter((row) => row.enabled);
    if (!selectedRows.length) return;

    const activeClients = clients.filter((client) => !client.deleted);
    const createdCodes = new Set<string>();
    const createdCpfs = new Set<string>();
    for (const row of selectedRows) {
      const existing = clientMap.get(row.matchId);
      if (existing?.deleted) {
        toast({ variant: "destructive", title: "Cadastro ocultado não pode ser atualizado", description: `${existing.name}: restaure o cadastro antes de importar.` });
        return;
      }
      const name = row.values.find((value) => value.targetKey === "name")?.value ?? "";
      const includedName = row.values.find((value) => value.targetKey === "name" && value.include)?.value ?? "";
      const code = normalizeCode(row.values.find((value) => value.targetKey === "code" && value.include)?.value);
      const cpf = digitsOnly(row.values.find((value) => value.targetKey === "cpfCnpj" && value.include)?.value);
      if (!existing && !includedName.trim()) {
        toast({ variant: "destructive", title: "Linha sem nome", description: `A linha ${row.id + 2} não pode criar um cliente sem nome.` });
        return;
      }
      if (code && !isValidCode(code)) {
        toast({ variant: "destructive", title: "Código inválido", description: `${name}: corrija ou desmarque o código antes de importar.` });
        return;
      }
      if (cpf && !isValidCpfCnpj(cpf)) {
        toast({ variant: "destructive", title: "CPF/CNPJ inválido", description: `${name}: corrija ou desmarque o documento antes de importar.` });
        return;
      }
      if (code && (createdCodes.has(code) || activeClients.some((client) => client.id !== existing?.id && normalizeCode(client.code) === code))) {
        toast({ variant: "destructive", title: "Código duplicado", description: `${name}: selecione o cadastro existente ou deixe a linha para o CSV manual.` });
        return;
      }
      if (cpf && (createdCpfs.has(cpf) || activeClients.some((client) => client.id !== existing?.id && digitsOnly(client.cpfCnpjDigits || client.cpfCnpj) === cpf))) {
        toast({ variant: "destructive", title: "CPF/CNPJ duplicado", description: `${name}: selecione o cadastro existente ou deixe a linha para o CSV manual.` });
        return;
      }
      if (!existing && activeClients.some((client) => searchable(client.name) === searchable(name) || namesAreSimilar(client.name, name))) {
        toast({ variant: "destructive", title: "Importação bloqueada por possível duplicata", description: `${name}: escolha um cliente existente ou desmarque a linha.` });
        return;
      }
      if (!existing && code) createdCodes.add(code);
      if (!existing && cpf) createdCpfs.add(cpf);
    }

    setImporting(true);
    try {
      let created = 0;
      let updated = 0;
      for (let start = 0; start < selectedRows.length; start += 200) {
        const batch = writeBatch(db);
        selectedRows.slice(start, start + 200).forEach((row) => {
          const existing = clientMap.get(row.matchId);
          const clientRef = existing ? doc(db, "clients", existing.id) : doc(collection(db, "clients"));
          const included = row.values.filter((value) => value.include);
          const patch: Record<string, unknown> = {};
          included.filter((value) => value.target === "client").forEach((value) => {
            const key = value.targetKey as ClientField;
            if (key === "code") patch.code = normalizeCode(value.value);
            else if (key === "name") { patch.name = value.value; patch.nameLower = searchable(value.value); }
            else if (key === "cpfCnpj") { patch.cpfCnpj = formatCpfCnpj(value.value); patch.cpfCnpjDigits = digitsOnly(value.value); }
            else if (key === "phone") { patch.phone = value.value; patch.phoneDigits = normalizePhone(value.value); }
            else if (key === "whatsapp") { patch.whatsapp = value.value; patch.whatsappDigits = normalizePhone(value.value); }
            else patch[key] = value.value;
          });
          const reviewNotes = included.filter((value) => value.target === "review").map((value) => `${value.header}: ${value.value}`);
          if (reviewNotes.length) patch.notes = [existing?.notes, ...reviewNotes].filter(Boolean).join("\n");

          if (existing) {
            batch.update(clientRef, { ...patch, typeIds: arrayUnion(baronType.id), updatedAt: serverTimestamp(), updatedBy: user.name });
            updated++;
          } else {
            batch.set(clientRef, {
              type: digitsOnly(String(patch.cpfCnpj)).length === 14 ? "Pessoa Jurídica" : "Pessoa Física",
              typeIds: [baronType.id],
              processIds: [],
              createdAt: serverTimestamp(),
              createdBy: user.name,
              updatedAt: serverTimestamp(),
              updatedBy: user.name,
              deleted: false,
              deletedAt: null,
              deletedBy: null,
              ...patch,
            });
            created++;
          }

          const fields: Record<string, string> = {};
          const items: Record<string, { status: ItemStatus; note?: string; updatedAt: string; updatedBy: string }> = {};
          included.forEach((value) => {
            if (value.target === "caseField" && value.targetKey) fields[value.targetKey] = value.value;
            if (value.target === "checklist" && value.targetKey) {
              items[value.targetKey] = { ...checklistState(value.value), updatedAt: new Date().toISOString(), updatedBy: user.name };
            }
          });
          if (Object.keys(fields).length || Object.keys(items).length) {
            const cfRef = doc(db, "caseFiles", caseFileId(clientRef.id, baronType.id));
            batch.set(cfRef, {
              clientId: clientRef.id,
              typeId: baronType.id,
              ...(Object.keys(fields).length ? { fields } : {}),
              ...(Object.keys(items).length ? { items } : {}),
              updatedAt: serverTimestamp(),
              updatedBy: user.name,
            }, { merge: true });
          }
        });
        await batch.commit();
      }

      const rejected = rejectedRows();
      if (rejected.length) exportCsv(rejected, `revisao-manual-barao-${new Date().toISOString().slice(0, 10)}.csv`);
      toast({ title: "Importação temporária concluída", description: `${created} criado(s), ${updated} atualizado(s) e ${rejected.length} linha(s) no CSV de revisão.` });
      reset();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao importar", description: error instanceof Error ? error.message : "Nenhum dado foi apagado." });
    } finally {
      setImporting(false);
    }
  };

  const counts = useMemo(() => ({
    selected: rows.filter((row) => row.enabled).length,
    conflicts: rows.reduce((sum, row) => sum + row.values.filter((value) => value.conflict).length, 0),
    review: rows.reduce((sum, row) => sum + row.values.filter((value) => value.target === "review").length, 0),
  }), [rows]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !analyzing && !importing && onOpenChange(nextOpen)}>
      <DialogContent className="flex max-h-[94vh] flex-col overflow-hidden sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="size-4" /> Importação temporária: Barão de Mauá</DialogTitle>
          <DialogDescription>
            {step === "file"
              ? "Escolha a planilha. A IA mapeará os cabeçalhos aos itens atuais da operação; nada será gravado antes da sua revisão."
              : `${filename}: revise destinos, conflitos e checks. Desmarcados serão enviados ao CSV de revisão manual.`}
          </DialogDescription>
        </DialogHeader>

        {step === "file" ? (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 p-8 text-center">
            <Sparkles className="mb-3 size-8 text-muted-foreground" />
            <p className="text-sm font-medium">Planilha específica da operação Barão de Mauá</p>
            <p className="mt-1 max-w-xl text-xs text-muted-foreground">Aceita CSV ou Excel. Código, CPF e nomes semelhantes serão comparados com toda a base, inclusive cadastros ocultados.</p>
            <Label className="mt-5 cursor-pointer">
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="sr-only"
                disabled={analyzing || !baronType}
                onChange={(event) => event.target.files?.[0] && analyzeFile(event.target.files[0])}
              />
              <span className={cn("inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground", (analyzing || !baronType) && "opacity-50")}>
                {analyzing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileSpreadsheet className="mr-2 size-4" />}
                {analyzing ? "Analisando com IA" : "Escolher planilha"}
              </span>
            </Label>
            {!baronType && types && <p className="mt-3 text-xs text-destructive">A operação Barão de Mauá não foi encontrada.</p>}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">{rows.length} linhas</Badge>
              <Badge variant="outline" className="border-emerald-300 text-emerald-700">{counts.selected} selecionadas</Badge>
              {counts.conflicts > 0 && <Badge variant="outline" className="border-red-300 text-red-700">{counts.conflicts} conflitos</Badge>}
              {counts.review > 0 && <Badge variant="outline" className="border-amber-300 text-amber-800">{counts.review} dados em Rever</Badge>}
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {rows.map((row) => {
                const clientValues = row.values.filter((value) => value.target === "client");
                const operationValues = row.values.filter((value) => value.target === "checklist" || value.target === "caseField");
                const reviewValues = row.values.filter((value) => value.target === "review");
                const destinationOptions = Array.from(new Set(row.candidateIds)).map((id) => clientMap.get(id)).filter((client): client is Client => !!client);
                return (
                  <section key={row.id} className={cn("rounded-lg border p-3", !row.enabled && "bg-muted/30 opacity-75")}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Checkbox checked={row.enabled} onCheckedChange={(checked) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, enabled: checked === true } : item))} />
                      <span className="text-xs font-medium">Linha {row.id + 2}</span>
                      <Select value={row.matchId || "__new"} onValueChange={(value) => changeDestination(row.id, value)}>
                        <SelectTrigger className="h-7 w-64 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__new">Criar novo cliente</SelectItem>
                          {destinationOptions.map((client) => <SelectItem key={client.id} value={client.id}>{client.code ? `${client.code} — ` : ""}{client.name}{client.deleted ? " (apagado)" : ""}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {row.matchId && <Badge variant="secondary">incrementar cadastro existente</Badge>}
                      {row.issues.map((issue) => <span key={issue} className="inline-flex items-center gap-1 text-[11px] text-destructive"><AlertTriangle className="size-3" />{issue}</span>)}
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[1.15fr_1.35fr_1fr]">
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-muted-foreground">Cadastro</p>
                        {clientValues.map((value) => (
                          <label key={`${value.sourceIndex}:${value.targetKey}`} className={cn("grid grid-cols-[18px_82px_1fr] items-center gap-1.5 rounded p-1", value.conflict && "bg-red-50 text-red-900")} title={value.reason}>
                            <Checkbox checked={value.include} onCheckedChange={(checked) => updateValue(row.id, value.sourceIndex, value.targetKey, { include: checked === true })} />
                            <span className="truncate text-[11px]">{value.label}</span>
                            <Input className="h-7 text-xs" value={value.value} onChange={(event) => updateValue(row.id, value.sourceIndex, value.targetKey, { value: event.target.value })} />
                            {value.conflict && <span className="col-start-3 text-[10px]">Atual: {value.oldValue}</span>}
                          </label>
                        ))}
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-muted-foreground">Dados da operação</p>
                        {operationValues.map((value) => (
                          <label key={`${value.sourceIndex}:${value.targetKey}`} className={cn("grid grid-cols-[18px_1fr_1fr] items-center gap-1.5 rounded p-1", value.conflict && "bg-red-50 text-red-900")} title={`${value.reason} Confiança: ${value.confidence}.`}>
                            <Checkbox checked={value.include} onCheckedChange={(checked) => updateValue(row.id, value.sourceIndex, value.targetKey, { include: checked === true })} />
                            <span className="truncate text-[11px]">{value.label}</span>
                            <Input className="h-7 text-xs" value={value.value} onChange={(event) => updateValue(row.id, value.sourceIndex, value.targetKey, { value: event.target.value })} />
                            {value.conflict && <span className="col-start-3 text-[10px]">Atual: {value.oldValue}</span>}
                          </label>
                        ))}
                        {operationValues.length === 0 && <p className="rounded bg-muted/30 p-2 text-xs text-muted-foreground">Nenhum dado operacional identificado.</p>}
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-muted-foreground">Rever</p>
                        {reviewValues.map((value) => (
                          <label key={value.sourceIndex} className="grid grid-cols-[18px_1fr] gap-1.5 rounded bg-amber-50 p-1.5 text-amber-950" title={value.reason}>
                            <Checkbox checked={value.include} onCheckedChange={(checked) => updateValue(row.id, value.sourceIndex, value.targetKey, { include: checked === true })} />
                            <span className="text-[11px]">{value.header}</span>
                            <Input className="col-start-2 h-7 text-xs" value={value.value} onChange={(event) => updateValue(row.id, value.sourceIndex, value.targetKey, { value: event.target.value })} />
                            <span className="col-start-2 text-[10px]">Marcado: acrescenta às observações. Desmarcado: vai para o CSV.</span>
                          </label>
                        ))}
                        {reviewValues.length === 0 && <p className="flex items-center gap-1 rounded bg-emerald-50 p-2 text-xs text-emerald-800"><CheckCircle2 className="size-3.5" />Tudo encontrou destino.</p>}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>

            <DialogFooter className="shrink-0 border-t pt-3 sm:justify-between">
              <Button variant="outline" onClick={() => { setStep("file"); setRows([]); }}>Escolher outro arquivo</Button>
              <Button onClick={importRows} disabled={importing || counts.selected === 0}>
                {importing && <Loader2 className="mr-2 size-4 animate-spin" />}
                Importar selecionados e gerar CSV
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
