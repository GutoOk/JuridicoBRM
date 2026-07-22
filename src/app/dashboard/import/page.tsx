"use client";

import { useMemo, useRef, useState } from "react";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { Loader2, Upload, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { readSpreadsheet } from "@/lib/export";
import {
  normalizeCode,
  isValidCode,
  digitsOnly,
  isValidCpfCnpj,
  formatCpfCnpj,
  normalizePhone,
  searchable,
} from "@/lib/normalize";
import type { Client, ClientType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { EmptyState, FilterChip, HelpTip, PageHeader } from "@/components/shared/page-shell";
import { clientTypeSelectedStyle } from "@/lib/client-type-style";

const TARGETS = [
  { id: "code", label: "Código (X9999)" },
  { id: "name", label: "Nome" },
  { id: "cpfCnpj", label: "CPF/CNPJ" },
  { id: "phone", label: "Telefone" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "email", label: "E-mail" },
  { id: "addressLine", label: "Endereço" },
  { id: "city", label: "Cidade" },
  { id: "state", label: "UF" },
  { id: "zipCode", label: "CEP" },
  { id: "origin", label: "Origem" },
  { id: "notes", label: "Observações" },
] as const;

type TargetId = (typeof TARGETS)[number]["id"];

function guessTarget(header: string): TargetId | "" {
  const h = searchable(header);
  if (/cod/.test(h)) return "code";
  if (/nome|cliente/.test(h)) return "name";
  if (/cpf|cnpj|doc/.test(h)) return "cpfCnpj";
  if (/whats|zap/.test(h)) return "whatsapp";
  if (/tel|fone|celular|contato/.test(h)) return "phone";
  if (/mail/.test(h)) return "email";
  if (/ender|rua|logradouro/.test(h)) return "addressLine";
  if (/cidade|municipio/.test(h)) return "city";
  if (/\buf\b|estado/.test(h)) return "state";
  if (/cep/.test(h)) return "zipCode";
  if (/orig|indica/.test(h)) return "origin";
  if (/obs|nota/.test(h)) return "notes";
  return "";
}

type PreviewRow = {
  index: number;
  values: Partial<Record<TargetId, string>>;
  problems: string[];
  action: "criar" | "atualizar" | "pular";
  existingId?: string;
  existingName?: string;
};

export default function ImportPage() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const { data: clients } = useCollection<Client>("clients");
  const { data: types } = useCollection<ClientType>("clientTypes");
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [raw, setRaw] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Record<number, TargetId | "">>({});
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const [linkingCodes, setLinkingCodes] = useState(false);
  const [linkResult, setLinkResult] = useState<{ barao: number; aurelio: number; skipped: number } | null>(null);

  const activeTypes = (types ?? []).filter((t) => !t.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const headers = hasHeader ? (raw[0] ?? []) : (raw[0] ?? []).map((_, i) => `Coluna ${i + 1}`);
  const dataRows = hasHeader ? raw.slice(1) : raw;

  const handleFile = async (file: File) => {
    try {
      const rows = await readSpreadsheet(file);
      const nonEmpty = rows.filter((r) => r.some((c) => c !== ""));
      if (nonEmpty.length === 0) {
        toast({ variant: "destructive", title: "Planilha vazia" });
        return;
      }
      setRaw(nonEmpty);
      setFileName(file.name);
      setResult(null);
      // auto-mapeia pelas cabeceiras
      const map: Record<number, TargetId | ""> = {};
      const used = new Set<string>();
      (nonEmpty[0] ?? []).forEach((h, i) => {
        const guess = guessTarget(h);
        if (guess && !used.has(guess)) {
          map[i] = guess;
          used.add(guess);
        } else {
          map[i] = "";
        }
      });
      setMapping(map);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Não foi possível ler o arquivo" });
    }
  };

  // ---- prévia com validação e deduplicação ----
  const preview: PreviewRow[] = useMemo(() => {
    if (dataRows.length === 0 || !clients) return [];
    const activeClients = clients.filter((c) => !c.deleted);
    const byCode = new Map(clients.filter((c) => c.code).map((c) => [c.code!, c]));
    const byCpf = new Map(
      clients
        .map((c) => [c.cpfCnpjDigits || digitsOnly(c.cpfCnpj), c] as const)
        .filter(([d]) => !!d)
    );
    const seenCodes = new Set<string>();
    const seenCpfs = new Set<string>();

    return dataRows.map((row, index) => {
      const values: Partial<Record<TargetId, string>> = {};
      Object.entries(mapping).forEach(([colStr, target]) => {
        if (!target) return;
        const v = (row[Number(colStr)] ?? "").trim();
        if (v) values[target] = v;
      });

      const problems: string[] = [];
      let action: PreviewRow["action"] = "criar";
      let existingId: string | undefined;
      let existingName: string | undefined;

      const code = normalizeCode(values.code);
      if (values.code && !isValidCode(code)) problems.push("código inválido");
      const cpfDigits = digitsOnly(values.cpfCnpj);
      if (values.cpfCnpj && !isValidCpfCnpj(values.cpfCnpj)) problems.push("CPF/CNPJ inválido");
      if (!values.name && !code) problems.push("sem nome e sem código");

      if (code && seenCodes.has(code)) problems.push("código repetido na planilha");
      if (code) seenCodes.add(code);
      if (cpfDigits && seenCpfs.has(cpfDigits)) problems.push("CPF repetido na planilha");
      if (cpfDigits) seenCpfs.add(cpfDigits);

      const existing = (code && byCode.get(code)) || (cpfDigits && byCpf.get(cpfDigits)) || null;
      if (existing) {
        existingId = existing.id;
        existingName = existing.name;
        action = updateExisting ? "atualizar" : "pular";
        if (existing.deleted) {
          problems.push("código ou CPF pertence a cadastro ocultado — restaure-o antes");
          action = "pular";
        }
      }
      if (problems.includes("sem nome e sem código") || problems.includes("código repetido na planilha")) {
        action = "pular";
      }

      return { index, values, problems, action, existingId, existingName };
    });
  }, [dataRows, mapping, clients, updateExisting]);

  const counts = useMemo(() => {
    const c = { criar: 0, atualizar: 0, pular: 0 };
    preview.forEach((p) => c[p.action]++);
    return c;
  }, [preview]);

  // ---- executa a importação ----
  const runImport = async () => {
    if (!user) return;
    setImporting(true);
    try {
      let created = 0;
      let updated = 0;
      let skipped = 0;
      const rows = preview.filter((p) => p.action !== "pular");
      // Firestore aceita até 500 operações por batch
      for (let i = 0; i < rows.length; i += 400) {
        const chunk = rows.slice(i, i + 400);
        const batch = writeBatch(db);
        for (const p of chunk) {
          const v = p.values;
          const code = isValidCode(v.code) ? normalizeCode(v.code) : "";
          const phone = v.phone ?? "";
          const whatsapp = v.whatsapp ?? "";
          const base: Record<string, unknown> = {
            updatedAt: serverTimestamp(),
            updatedBy: user.name,
          };
          if (v.name) {
            base.name = v.name;
            base.nameLower = searchable(v.name);
          }
          if (code) base.code = code;
          if (v.cpfCnpj && isValidCpfCnpj(v.cpfCnpj)) {
            base.cpfCnpj = formatCpfCnpj(v.cpfCnpj);
            base.cpfCnpjDigits = digitsOnly(v.cpfCnpj);
          }
          if (phone) {
            base.phone = phone;
            base.phoneDigits = normalizePhone(phone);
          }
          if (whatsapp || phone) {
            if (whatsapp) base.whatsapp = whatsapp;
            base.whatsappDigits = normalizePhone(whatsapp || phone);
          }
          if (v.email) base.email = v.email;
          if (v.addressLine) base.addressLine = v.addressLine;
          if (v.city) base.city = v.city;
          if (v.state) base.state = v.state.toUpperCase();
          if (v.zipCode) base.zipCode = v.zipCode;
          if (v.origin) base.origin = v.origin;
          if (v.notes) base.notes = v.notes;

          if (p.action === "atualizar" && p.existingId) {
            const existing = clients?.find((c) => c.id === p.existingId);
            const mergedTypes = Array.from(new Set([...(existing?.typeIds ?? []), ...typeIds]));
            batch.update(doc(db, "clients", p.existingId), { ...base, typeIds: mergedTypes });
            updated++;
          } else {
            const ref = doc(collection(db, "clients"));
            batch.set(ref, {
              name: v.name ?? code,
              nameLower: searchable(v.name ?? code),
              type: "Pessoa Física",
              typeIds,
              processIds: [],
              createdAt: serverTimestamp(),
              createdBy: user.name,
              deleted: false,
              deletedAt: null,
              deletedBy: null,
              ...base,
            });
            created++;
          }
        }
        await batch.commit();
      }
      skipped = preview.length - rows.length;
      setResult({ created, updated, skipped });
      toast({
        title: "Importação concluída",
        description: `${created} criados, ${updated} atualizados, ${skipped} pulados.`,
      });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro na importação", description: String(e) });
    } finally {
      setImporting(false);
    }
  };

  const runTemporaryCodeLink = async () => {
    if (!user || !clients) return;
    const confirmed = window.confirm(
      "Isso vai apenas adicionar vínculos de operação aos clientes existentes, sem alterar outros campos. Continuar?"
    );
    if (!confirmed) return;

    setLinkingCodes(true);
    try {
      const activeClients = clients.filter((c) => !c.deleted);
      const targets = activeClients.filter((c) => {
        const code = (c.code ?? "").trim().toUpperCase();
        return code.startsWith("N") || code.startsWith("A");
      });

      const baraoId = activeTypes.find((t) => t.id === "barao-de-maua")?.id;
      const aurelioId = activeTypes.find((t) => t.id === "cliente-antigo")?.id;
      if (!baraoId || !aurelioId) {
        toast({
          variant: "destructive",
          title: "Tipos não encontrados",
          description: "Os tipos Barão de Mauá e Cliente antigo precisam existir para executar essa ação.",
        });
        return;
      }

      let barao = 0;
      let aurelio = 0;
      let skipped = 0;

      for (let i = 0; i < targets.length; i += 400) {
        const chunk = targets.slice(i, i + 400);
        const batch = writeBatch(db);

        for (const client of chunk) {
          const code = (client.code ?? "").trim().toUpperCase();
          const merged = new Set(client.typeIds ?? []);
          let changed = false;

          if (code.startsWith("N") && !merged.has(baraoId)) {
            merged.add(baraoId);
            barao++;
            changed = true;
          }
          if (code.startsWith("A") && !merged.has(aurelioId)) {
            merged.add(aurelioId);
            aurelio++;
            changed = true;
          }

          if (!changed) {
            skipped++;
            continue;
          }

          batch.update(doc(db, "clients", client.id), {
            typeIds: Array.from(merged),
            updatedAt: serverTimestamp(),
            updatedBy: user.name,
          });
        }

        await batch.commit();
      }

      setLinkResult({ barao, aurelio, skipped });
      toast({
        title: "Vínculos aplicados",
        description: `${barao} clientes ligados ao Barão de Mauá e ${aurelio} ao Cliente antigo.`,
      });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao vincular clientes", description: String(e) });
    } finally {
      setLinkingCodes(false);
    }
  };

  const mappedTargets = new Set(Object.values(mapping).filter(Boolean));

  if (!isAdmin) {
    return (
      <div className="page-shell">
        <EmptyState
          title="Acesso restrito"
          description="Somente administradores podem importar planilhas."
        />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="importação"
        title="Importar clientes"
        description="Suba uma planilha Excel ou CSV, confira o mapeamento das colunas e revise a prévia antes de gravar. Clientes existentes são localizados pelo código ou CPF."
        badge={<span className="kbd-hint">não altera tabelas</span>}
      />

      {/* Passo 1: arquivo */}
      <Card className="surface">
        <CardHeader className="pb-3">
          <CardTitle>1. Arquivo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <HelpTip label="Escolha uma planilha .xlsx, .xls ou .csv para o sistema ler as colunas.">
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-2 size-4" /> Escolher planilha
          </Button>
          </HelpTip>
          {fileName && (
            <Badge variant="secondary">
              {fileName} — {dataRows.length} linha(s)
            </Badge>
          )}
          {raw.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={hasHeader} onCheckedChange={(v) => setHasHeader(!!v)} />
              Primeira linha é cabeçalho
            </label>
          )}
        </CardContent>
      </Card>

      {raw.length > 0 && (
        <>
          {/* Passo 2: mapeamento */}
          <Card className="surface">
            <CardHeader className="pb-3">
              <CardTitle>2. Mapear colunas</CardTitle>
              <CardDescription>Diga qual coluna da planilha corresponde a cada campo.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border p-2">
                  <span className="min-w-0 flex-1 truncate text-sm" title={h}>
                    {h || `Coluna ${i + 1}`}
                    <span className="block truncate text-xs text-muted-foreground">
                      ex.: {dataRows[0]?.[i] || "—"}
                    </span>
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                  <Select
                    value={mapping[i] || "ignorar"}
                    onValueChange={(v) => setMapping({ ...mapping, [i]: v === "ignorar" ? "" : (v as TargetId) })}
                  >
                    <SelectTrigger className="h-8 w-[150px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ignorar">— ignorar —</SelectItem>
                      {TARGETS.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Passo 3: opções */}
          <Card className="surface">
            <CardHeader className="pb-3">
              <CardTitle>3. Opções</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="mb-1.5 text-sm font-medium">Adicionar tipo(s) aos clientes importados:</p>
                <div className="flex flex-wrap gap-1.5">
                  {activeTypes.map((t) => {
                    const on = typeIds.includes(t.id);
                    return (
                      <FilterChip
                        key={t.id}
                        type="button"
                        onClick={() =>
                          setTypeIds(on ? typeIds.filter((x) => x !== t.id) : [...typeIds, t.id])
                        }
                        active={on}
                        style={on ? clientTypeSelectedStyle(t) : undefined}
                      >
                        {t.name}
                      </FilterChip>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={updateExisting} onCheckedChange={(v) => setUpdateExisting(!!v)} />
                Atualizar clientes existentes (localizados por código ou CPF) com os dados da planilha
              </label>
            </CardContent>
          </Card>

          {/* Passo 4: prévia */}
          <Card className="surface">
            <CardHeader className="pb-3">
              <CardTitle>4. Prévia</CardTitle>
              <CardDescription>
                <span className="mr-3 text-emerald-600">{counts.criar} a criar</span>
                <span className="mr-3 text-sky-600">{counts.atualizar} a atualizar</span>
                <span className="text-muted-foreground">{counts.pular} pulados</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-80 overflow-y-auto overflow-x-hidden rounded-lg border bg-card">
                <table className="w-full table-fixed text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left">
                      <th>Ação</th>
                      <th>Código</th>
                      <th>Nome</th>
                      <th>CPF/CNPJ</th>
                      <th>Telefone</th>
                      <th>Avisos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 300).map((p) => (
                      <tr key={p.index} className={cn("border-t", p.action === "pular" && "opacity-50")}>
                        <td className="px-2 py-1">
                          <Badge
                            variant="outline"
                            className={cn(
                              p.action === "criar" && "border-emerald-500 text-emerald-600",
                              p.action === "atualizar" && "border-sky-500 text-sky-600"
                            )}
                          >
                            {p.action}
                            {p.action === "atualizar" && p.existingName ? `: ${p.existingName}` : ""}
                          </Badge>
                        </td>
                        <td className="px-2 py-1 font-mono">{normalizeCode(p.values.code) || "—"}</td>
                        <td className="px-2 py-1">{p.values.name || "—"}</td>
                        <td className="px-2 py-1">{p.values.cpfCnpj || "—"}</td>
                        <td className="px-2 py-1">{p.values.phone || p.values.whatsapp || "—"}</td>
                        <td className="px-2 py-1 text-amber-600">
                          {p.problems.length > 0 && (
                            <span className="flex items-center gap-1">
                              <AlertTriangle className="size-3" /> {p.problems.join("; ")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 300 && (
                  <p className="p-2 text-center text-xs text-muted-foreground">
                    … e mais {preview.length - 300} linha(s)
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <HelpTip label="Grava somente as linhas marcadas como criar ou atualizar. Linhas puladas não entram no banco.">
                <Button onClick={runImport} disabled={importing || counts.criar + counts.atualizar === 0 || !mappedTargets.size}>
                  {importing ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 size-4" />
                  )}
                  Importar {counts.criar + counts.atualizar} cliente(s)
                </Button>
                </HelpTip>
                {result && (
                  <p className="text-sm text-emerald-600">
                    Concluído: {result.created} criados, {result.updated} atualizados, {result.skipped} pulados.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
