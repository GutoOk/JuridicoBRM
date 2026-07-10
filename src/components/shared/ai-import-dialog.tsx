"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { ArrowLeft, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { extractClientsBatchText, aiErrorMessage, type ExtractedClientRow } from "@/lib/ai";
import {
  digitsOnly,
  formatCpfCnpj,
  isValidCode,
  isValidCpfCnpj,
  normalizeCode,
  normalizePhone,
  searchable,
} from "@/lib/normalize";
import type { Client } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";

/**
 * Importação em lote com IA (tela de Clientes):
 * 1. Cola-se qualquer texto/planilha na caixa;
 * 2. A IA organiza em uma tabela de clientes e campos identificados;
 * 3. Linhas são casadas com clientes existentes (código → CPF → nome);
 *    células em VERMELHO indicam conflito com o dado atual — clique alterna
 *    entre manter o valor novo ou o atual;
 * 4. "Inserir dados" grava tudo de uma vez (criações + atualizações em lote).
 */

// Campos que a importação pode preencher, na ordem de exibição.
const FIELDS = [
  "code",
  "name",
  "cpfCnpj",
  "phone",
  "whatsapp",
  "email",
  "addressLine",
  "city",
  "state",
  "zipCode",
  "rg",
  "rgIssuer",
  "motherName",
  "nationality",
  "profession",
  "maritalStatus",
  "notes",
] as const;
type FieldKey = (typeof FIELDS)[number];

const FIELD_LABELS: Record<FieldKey, string> = {
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
  rg: "RG",
  rgIssuer: "Órgão RG",
  motherName: "Nome da mãe",
  nationality: "Nacionalidade",
  profession: "Profissão",
  maritalStatus: "Estado civil",
  notes: "Observações",
};

type Cell = {
  newValue: string;
  oldValue: string;
  /** valores diferentes e ambos preenchidos → precisa de revisão */
  conflict: boolean;
  /** qual valor será gravado */
  choice: "new" | "old";
};

type RowAction = "criar" | "atualizar" | "pular";

type ReviewRow = {
  key: number;
  extracted: ExtractedClientRow;
  match: Client | null;
  action: RowAction;
  problems: string[];
  cells: Partial<Record<FieldKey, Cell>>;
};

/** Compara valores normalizando pontuação de CPF/telefone e caixa/acentos. */
function sameValue(field: FieldKey, a: string, b: string): boolean {
  if (field === "cpfCnpj" || field === "phone" || field === "whatsapp" || field === "zipCode") {
    return digitsOnly(a) === digitsOnly(b);
  }
  if (field === "code") return normalizeCode(a) === normalizeCode(b);
  return searchable(a.trim()) === searchable(b.trim());
}

function existingValue(client: Client, field: FieldKey): string {
  switch (field) {
    case "code":
      return client.code ?? "";
    case "phone":
      return client.phone || client.phones?.find((p) => p.isPrimary)?.number || client.phones?.[0]?.number || "";
    case "whatsapp":
      return client.whatsapp ?? "";
    case "email":
      return client.email || client.emails?.[0]?.address || "";
    default:
      return (client[field as keyof Client] as string | undefined) ?? "";
  }
}

export function AiImportDialog({
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

  const [step, setStep] = useState<"paste" | "review">("paste");
  const [text, setText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [inserting, setInserting] = useState(false);

  const activeClients = useMemo(() => clients.filter((c) => !c.deleted), [clients]);

  // Colunas exibidas: só os campos que apareceram em alguma linha.
  const visibleFields = useMemo(
    () => FIELDS.filter((f) => rows.some((r) => r.cells[f])),
    [rows]
  );

  const buildRows = (extractedRows: ExtractedClientRow[]): ReviewRow[] => {
    const byCode = new Map(activeClients.filter((c) => c.code).map((c) => [c.code!, c]));
    const byCpf = new Map(
      activeClients
        .map((c) => [c.cpfCnpjDigits || digitsOnly(c.cpfCnpj), c] as const)
        .filter(([d]) => !!d)
    );
    const byName = new Map(activeClients.map((c) => [searchable(c.name), c]));
    const seen = new Set<string>();

    return extractedRows.map((ex, i) => {
      const problems: string[] = [];
      const code = normalizeCode(ex.code);
      if (ex.code && !isValidCode(code)) problems.push("código fora do padrão X9999");
      const cpfDigits = digitsOnly(ex.cpfCnpj);
      if (ex.cpfCnpj && !isValidCpfCnpj(ex.cpfCnpj)) problems.push("CPF/CNPJ inválido");

      // Casa com cliente existente: código → CPF → nome exato
      const match =
        (isValidCode(code) ? byCode.get(code) : undefined) ??
        (cpfDigits ? byCpf.get(cpfDigits) : undefined) ??
        (ex.name ? byName.get(searchable(ex.name)) : undefined) ??
        null;

      let action: RowAction = match ? "atualizar" : "criar";
      if (!ex.name && !match) {
        problems.push("sem nome — não dá para criar");
        action = "pular";
      }
      const dupKey = isValidCode(code) ? `c:${code}` : cpfDigits ? `d:${cpfDigits}` : ex.name ? `n:${searchable(ex.name)}` : `i:${i}`;
      if (seen.has(dupKey)) {
        problems.push("repetido no texto colado");
        action = "pular";
      }
      seen.add(dupKey);

      const cells: Partial<Record<FieldKey, Cell>> = {};
      for (const field of FIELDS) {
        const raw =
          field === "code"
            ? (isValidCode(code) ? code : "")
            : ((ex[field as keyof ExtractedClientRow] as string | undefined) ?? "").trim();
        if (!raw) continue;
        const newValue = field === "cpfCnpj" ? formatCpfCnpj(raw) : raw;
        const oldValue = match ? existingValue(match, field) : "";
        const equal = !!oldValue && sameValue(field, newValue, oldValue);
        if (match && equal) continue; // nada a fazer neste campo
        cells[field] = {
          newValue,
          oldValue,
          conflict: !!match && !!oldValue && !equal,
          choice: "new",
        };
      }
      if (match && Object.keys(cells).length === 0) {
        problems.push("nenhum dado novo");
        action = "pular";
      }

      return { key: i, extracted: ex, match, action, problems, cells };
    });
  };

  const analyze = async () => {
    if (!text.trim()) return;
    setAnalyzing(true);
    try {
      const extracted = await extractClientsBatchText(text);
      if (extracted.length === 0) {
        toast({
          variant: "destructive",
          title: "Nada identificado",
          description: "A IA não encontrou dados de clientes no texto. Confira o conteúdo colado.",
        });
        return;
      }
      setRows(buildRows(extracted));
      setStep("review");
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Erro na análise", description: aiErrorMessage(err) });
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleCell = (rowKey: number, field: FieldKey) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== rowKey) return r;
        const cell = r.cells[field];
        if (!cell || !cell.conflict) return r;
        return {
          ...r,
          cells: { ...r.cells, [field]: { ...cell, choice: cell.choice === "new" ? "old" : "new" } },
        };
      })
    );
  };

  const setAction = (rowKey: number, action: RowAction) => {
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, action } : r)));
  };

  const counts = useMemo(() => {
    const active = rows.filter((r) => r.action !== "pular");
    return {
      criar: rows.filter((r) => r.action === "criar").length,
      atualizar: rows.filter((r) => r.action === "atualizar").length,
      pular: rows.filter((r) => r.action === "pular").length,
      conflitos: active.reduce(
        (sum, r) => sum + Object.values(r.cells).filter((c) => c?.conflict).length,
        0
      ),
    };
  }, [rows]);

  /** Monta o patch do Firestore a partir das células escolhidas como "nova". */
  const buildPatch = (row: ReviewRow): Record<string, any> => {
    const patch: Record<string, any> = {};
    for (const [field, cell] of Object.entries(row.cells) as [FieldKey, Cell][]) {
      if (!cell || cell.choice !== "new") continue;
      const v = cell.newValue;
      switch (field) {
        case "code":
          patch.code = normalizeCode(v);
          break;
        case "name":
          patch.name = v;
          patch.nameLower = searchable(v);
          break;
        case "cpfCnpj":
          patch.cpfCnpj = formatCpfCnpj(v);
          patch.cpfCnpjDigits = digitsOnly(v);
          break;
        case "phone":
          patch.phone = v;
          patch.phoneDigits = normalizePhone(v);
          break;
        case "whatsapp":
          patch.whatsapp = v;
          patch.whatsappDigits = normalizePhone(v);
          break;
        case "state":
          patch.state = v.toUpperCase();
          break;
        default:
          patch[field] = v;
      }
    }
    // WhatsApp segue o telefone quando só o telefone veio
    if (patch.phone && !patch.whatsapp && !(row.match?.whatsapp)) {
      patch.whatsappDigits = normalizePhone(patch.phone as string);
    }
    return patch;
  };

  const insert = async () => {
    if (!user) return;
    const work = rows.filter((r) => r.action !== "pular");
    if (work.length === 0) return;
    setInserting(true);
    try {
      let created = 0;
      let updated = 0;
      for (let i = 0; i < work.length; i += 400) {
        const chunk = work.slice(i, i + 400);
        const batch = writeBatch(db);
        for (const row of chunk) {
          const patch = buildPatch(row);
          if (row.action === "atualizar" && row.match) {
            batch.update(doc(db, "clients", row.match.id), {
              ...patch,
              updatedAt: serverTimestamp(),
              updatedBy: user.name,
            });
            updated++;
          } else {
            const ref = doc(collection(db, "clients"));
            batch.set(ref, {
              type: row.extracted.personType ?? "Pessoa Física",
              typeIds: [],
              generalStatus: "Pré-cliente",
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
        }
        await batch.commit();
      }
      toast({
        title: "Importação concluída",
        description: `${created} cliente(s) criados e ${updated} atualizados.`,
      });
      reset();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao gravar os dados", description: String(e) });
    } finally {
      setInserting(false);
    }
  };

  const reset = () => {
    setStep("paste");
    setText("");
    setRows([]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!analyzing && !inserting) onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" /> Importar dados com IA
          </DialogTitle>
          <DialogDescription>
            {step === "paste"
              ? "Cole abaixo o conteúdo da sua tabela ou lista (pode copiar direto do Excel). A IA identifica os clientes e organiza os dados para revisão — nada é gravado antes de você confirmar."
              : "Revise a tabela. Células em vermelho têm conflito com o dado já cadastrado — clique nelas para alternar entre o valor novo e o atual. Depois clique em Inserir dados."}
          </DialogDescription>
        </DialogHeader>

        {step === "paste" && (
          <>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                "Cole aqui os dados… Exemplos aceitos:\n\nX1234\tMaria da Silva\t(11) 98888-7777\nX1235\tJoão Souza\t123.456.789-00\n\nou texto corrido: 'Maria da Silva, CPF 123.456.789-00, tel (11) 98888-7777, Rua A, 10…'"
              }
              rows={14}
              disabled={analyzing}
              className="font-code text-xs leading-relaxed"
            />
            <DialogFooter className="flex-row items-center justify-between sm:justify-between">
              <Link
                href="/dashboard/import"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => onOpenChange(false)}
                title="Alternativa sem IA: sobe o arquivo Excel/CSV e mapeia as colunas manualmente"
              >
                Prefere subir o arquivo? Importação por planilha
              </Link>
              <Button onClick={analyze} disabled={analyzing || !text.trim()}>
                {analyzing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                Analisar com IA
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "review" && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="border-emerald-400 text-emerald-700">
                {counts.criar} a criar
              </Badge>
              <Badge variant="outline" className="border-sky-400 text-sky-700">
                {counts.atualizar} a atualizar
              </Badge>
              {counts.pular > 0 && <Badge variant="outline">{counts.pular} pulados</Badge>}
              {counts.conflitos > 0 && (
                <Badge variant="outline" className="border-red-400 text-red-700">
                  {counts.conflitos} conflito(s) — clique nas células vermelhas para escolher
                </Badge>
              )}
            </div>

            <div className="max-h-[55vh] overflow-y-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
                    <th className="w-[130px]">Ação</th>
                    {visibleFields.map((f) => (
                      <th key={f}>{FIELD_LABELS[f]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className={cn("border-t align-top", row.action === "pular" && "opacity-45")}>
                      <td className="px-2 py-1.5">
                        <Select value={row.action} onValueChange={(v) => setAction(row.key, v as RowAction)}>
                          <SelectTrigger className="h-6 w-[118px] text-[11px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="criar" disabled={!row.extracted.name && !row.match}>
                              Criar novo
                            </SelectItem>
                            <SelectItem value="atualizar" disabled={!row.match}>
                              Atualizar
                            </SelectItem>
                            <SelectItem value="pular">Pular</SelectItem>
                          </SelectContent>
                        </Select>
                        {row.match && (
                          <p className="mt-0.5 max-w-[120px] truncate text-[10px] text-muted-foreground" title={`Cliente existente: ${row.match.name}`}>
                            → {row.match.code ? `[${row.match.code}] ` : ""}{row.match.name}
                          </p>
                        )}
                        {row.problems.length > 0 && (
                          <p className="mt-0.5 max-w-[120px] text-[10px] text-amber-600" title={row.problems.join("; ")}>
                            {row.problems.join("; ")}
                          </p>
                        )}
                      </td>
                      {visibleFields.map((f) => {
                        const cell = row.cells[f];
                        if (!cell) {
                          return (
                            <td key={f} className="px-2 py-1.5 text-muted-foreground/40">
                              —
                            </td>
                          );
                        }
                        const chosen = cell.choice === "new" ? cell.newValue : cell.oldValue;
                        return (
                          <td key={f} className="px-1 py-1">
                            {cell.conflict && row.action === "atualizar" ? (
                              <HelpTip
                                label={
                                  <span>
                                    Conflito — clique para alternar.
                                    <br />
                                    Novo (colado): <strong>{cell.newValue}</strong>
                                    <br />
                                    Atual (sistema): <strong>{cell.oldValue}</strong>
                                  </span>
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleCell(row.key, f)}
                                  className={cn(
                                    "block w-full rounded border px-1.5 py-0.5 text-left",
                                    cell.choice === "new"
                                      ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                                      : "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                  )}
                                >
                                  <span className="block truncate font-medium">{chosen}</span>
                                  <span className="text-[10px] opacity-70">
                                    {cell.choice === "new" ? "usar novo" : "manter atual"}
                                  </span>
                                </button>
                              </HelpTip>
                            ) : (
                              <span
                                className={cn(
                                  "block truncate px-1 py-0.5",
                                  row.action === "criar" || !cell.oldValue
                                    ? "text-emerald-800 dark:text-emerald-300"
                                    : ""
                                )}
                                title={cell.newValue}
                              >
                                {cell.newValue}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DialogFooter className="flex-row items-center justify-between sm:justify-between">
              <Button variant="ghost" size="sm" onClick={reset} disabled={inserting}>
                <ArrowLeft className="mr-1.5 size-3.5" /> Voltar e colar de novo
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={inserting}>
                  Cancelar
                </Button>
                <HelpTip label="Grava tudo de uma vez: cria os clientes novos e atualiza os existentes com os valores escolhidos. Conflitos em vermelho usam o valor que estiver selecionado na célula.">
                  <Button onClick={insert} disabled={inserting || counts.criar + counts.atualizar === 0}>
                    {inserting ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 size-4" />
                    )}
                    Inserir dados ({counts.criar + counts.atualizar})
                  </Button>
                </HelpTip>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
