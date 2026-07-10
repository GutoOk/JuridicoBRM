"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import {
  normalizeCode,
  isValidCode,
  digitsOnly,
  isValidCpfCnpj,
  formatCpfCnpj,
  normalizePhone,
  searchable,
} from "@/lib/normalize";
import {
  GENERAL_STATUSES,
  PRIORITIES,
  type Client,
  type ClientType,
  type Priority,
  type UserProfile,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { HelpTip } from "@/components/shared/page-shell";
import { AiExtractButton } from "@/components/shared/ai-extract-dialog";
import { extractClientText } from "@/lib/ai";

type FormState = {
  name: string;
  code: string;
  cpfCnpj: string;
  personType: "Pessoa Física" | "Pessoa Jurídica";
  phone: string;
  whatsapp: string;
  whatsappSame: boolean;
  email: string;
  addressLine: string;
  city: string;
  state: string;
  zipCode: string;
  typeIds: string[];
  generalStatus: string;
  responsibleId: string;
  priority: Priority | "";
  origin: string;
  nextAction: string;
  notes: string;
  // Dados pessoais complementares
  motherName: string;
  nationality: string;
  profession: string;
  maritalStatus: string;
  rg: string;
  rgIssuer: string;
};

function initialForm(c?: Client | null): FormState {
  const legacyPhone = c?.phones?.find((p) => p.isPrimary)?.number || c?.phones?.[0]?.number || "";
  const legacyEmail = c?.emails?.find((e) => e.isPrimary)?.address || c?.emails?.[0]?.address || "";
  const legacyAddr = c?.addresses?.find((a) => a.isPrimary) || c?.addresses?.[0];
  const legacyAddrLine = legacyAddr
    ? [legacyAddr.street, legacyAddr.number, legacyAddr.district].filter(Boolean).join(", ")
    : "";
  return {
    name: c?.name ?? "",
    code: c?.code ?? "",
    cpfCnpj: c?.cpfCnpj ?? "",
    personType: c?.type ?? "Pessoa Física",
    phone: c?.phone ?? legacyPhone,
    whatsapp: c?.whatsapp ?? "",
    whatsappSame: !c?.whatsapp,
    email: c?.email ?? legacyEmail,
    addressLine: c?.addressLine ?? legacyAddrLine,
    city: c?.city ?? legacyAddr?.city ?? "",
    state: c?.state ?? legacyAddr?.state ?? "",
    zipCode: c?.zipCode ?? legacyAddr?.zipCode ?? "",
    typeIds: c?.typeIds ?? [],
    generalStatus: c?.generalStatus ?? "Pré-cliente",
    responsibleId: c?.responsibleId ?? "",
    priority: c?.priority ?? "",
    origin: c?.origin ?? "",
    nextAction: c?.nextAction ?? "",
    notes: c?.notes ?? "",
    motherName: c?.motherName ?? "",
    nationality: c?.nationality ?? "",
    profession: c?.profession ?? "",
    maritalStatus: c?.maritalStatus ?? "",
    rg: c?.rg ?? "",
    rgIssuer: c?.rgIssuer ?? "",
  };
}

/** Formulário de cliente (novo/edição) com validação e deduplicação de código e CPF/CNPJ. */
export function ClientForm({ client }: { client?: Client | null }) {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { data: types } = useCollection<ClientType>("clientTypes");
  const { data: users } = useCollection<UserProfile>("users");

  const [form, setForm] = useState<FormState>(() => initialForm(client));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmCodeChange, setConfirmCodeChange] = useState(false);
  const [nameWarning, setNameWarning] = useState<Client[] | null>(null);

  const activeTypes = (types ?? []).filter((t) => !t.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const activeUsers = (users ?? []).filter((u) => u.email && u.active !== false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Nome é obrigatório.";
    if (form.code && !isValidCode(form.code)) errs.code = "Formato: 1 letra + 4 números (ex.: X9999).";
    if (form.cpfCnpj && !isValidCpfCnpj(form.cpfCnpj)) errs.cpfCnpj = "CPF/CNPJ inválido (confira os dígitos).";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const checkDuplicates = async (): Promise<string | null> => {
    const code = normalizeCode(form.code);
    if (code) {
      const snap = await getDocs(query(collection(db, "clients"), where("code", "==", code)));
      const dup = snap.docs.find((d) => d.id !== client?.id && d.data().deleted !== true);
      if (dup) return `O código ${code} já está em uso por "${dup.data().name}".`;
    }
    const cpfDigits = digitsOnly(form.cpfCnpj);
    if (cpfDigits) {
      const snap = await getDocs(query(collection(db, "clients"), where("cpfCnpjDigits", "==", cpfDigits)));
      const dup = snap.docs.find((d) => d.id !== client?.id && d.data().deleted !== true);
      if (dup) return `Já existe cliente com este CPF/CNPJ: "${dup.data().name}".`;
      // compatibilidade: dados antigos sem campo normalizado
      const snapLegacy = await getDocs(
        query(collection(db, "clients"), where("cpfCnpj", "==", formatCpfCnpj(form.cpfCnpj)))
      );
      const dupLegacy = snapLegacy.docs.find((d) => d.id !== client?.id && d.data().deleted !== true);
      if (dupLegacy) return `Já existe cliente com este CPF/CNPJ: "${dupLegacy.data().name}".`;
    }
    return null;
  };

  const buildPayload = () => {
    const code = normalizeCode(form.code);
    const phone = form.phone.trim();
    const whatsapp = form.whatsappSame ? "" : form.whatsapp.trim();
    return {
      name: form.name.trim(),
      nameLower: searchable(form.name),
      code: code || "",
      cpfCnpj: form.cpfCnpj ? formatCpfCnpj(form.cpfCnpj) : "",
      cpfCnpjDigits: digitsOnly(form.cpfCnpj),
      type: form.personType,
      phone,
      phoneDigits: normalizePhone(phone),
      whatsapp,
      whatsappDigits: normalizePhone(whatsapp || phone),
      email: form.email.trim(),
      addressLine: form.addressLine.trim(),
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      zipCode: form.zipCode.trim(),
      typeIds: form.typeIds,
      generalStatus: form.generalStatus,
      responsibleId: form.responsibleId,
      responsibleName: activeUsers.find((u) => u.id === form.responsibleId)?.name ?? "",
      priority: form.priority || "",
      origin: form.origin.trim(),
      nextAction: form.nextAction.trim(),
      notes: form.notes.trim(),
      motherName: form.motherName.trim(),
      nationality: form.nationality.trim(),
      profession: form.profession.trim(),
      maritalStatus: form.maritalStatus.trim(),
      rg: form.rg.trim(),
      rgIssuer: form.rgIssuer.trim(),
    };
  };

  /** Preenche o formulário a partir de texto solto analisado pela IA. */
  const fillFromAi = async (text: string) => {
    const d = await extractClientText(text);
    setForm((f) => ({
      ...f,
      name: d.name || f.name,
      cpfCnpj: d.cpfCnpj ? formatCpfCnpj(d.cpfCnpj) : f.cpfCnpj,
      personType: d.personType ?? f.personType,
      phone: d.phone || f.phone,
      whatsapp: d.whatsapp || f.whatsapp,
      whatsappSame: d.whatsapp ? false : f.whatsappSame,
      email: d.email || f.email,
      addressLine: d.addressLine || f.addressLine,
      city: d.city || f.city,
      state: d.state || f.state,
      zipCode: d.zipCode || f.zipCode,
      notes: d.notes ? (f.notes ? `${f.notes}\n${d.notes}` : d.notes) : f.notes,
      motherName: d.motherName || f.motherName,
      nationality: d.nationality || f.nationality,
      profession: d.profession || f.profession,
      maritalStatus: d.maritalStatus || f.maritalStatus,
      rg: d.rg || f.rg,
      rgIssuer: d.rgIssuer || f.rgIssuer,
    }));
  };

  const doSave = async (skipNameCheck = false) => {
    if (!user) return;
    setSaving(true);
    try {
      const dupError = await checkDuplicates();
      if (dupError) {
        toast({ variant: "destructive", title: "Duplicidade", description: dupError });
        setSaving(false);
        return;
      }

      if (!client && !skipNameCheck && form.name.trim()) {
        // busca por nome normalizado (novos) e nome exato (dados antigos sem nameLower)
        const [snapLower, snapExact] = await Promise.all([
          getDocs(query(collection(db, "clients"), where("nameLower", "==", searchable(form.name)))),
          getDocs(query(collection(db, "clients"), where("name", "==", form.name.trim()))),
        ]);
        const seen = new Map<string, Client>();
        [...snapLower.docs, ...snapExact.docs].forEach((d) =>
          seen.set(d.id, { id: d.id, ...d.data() } as Client)
        );
        const sameName = [...seen.values()].filter((c) => !c.deleted);
        if (sameName.length > 0) {
          setNameWarning(sameName);
          setSaving(false);
          return;
        }
      }

      const payload = buildPayload();
      if (client) {
        await updateDoc(doc(db, "clients", client.id), {
          ...payload,
          updatedAt: serverTimestamp(),
          updatedBy: user.name,
        });
        toast({ title: "Cliente atualizado" });
        router.push(`/dashboard/clients/${client.id}`);
      } else {
        const ref = await addDoc(collection(db, "clients"), {
          ...payload,
          processIds: [],
          createdAt: serverTimestamp(),
          createdBy: user.name,
          updatedAt: serverTimestamp(),
          updatedBy: user.name,
          deleted: false,
          deletedAt: null,
          deletedBy: null,
        });
        toast({ title: "Cliente cadastrado", description: payload.code || payload.name });
        router.push(`/dashboard/clients/${ref.id}`);
      }
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao salvar cliente" });
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    // Edição de código exige confirmação explícita
    if (client?.code && normalizeCode(form.code) !== client.code) {
      setConfirmCodeChange(true);
      return;
    }
    await doSave();
  };

  const toggleType = (typeId: string) => {
    set(
      "typeIds",
      form.typeIds.includes(typeId) ? form.typeIds.filter((t) => t !== typeId) : [...form.typeIds, typeId]
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Card className="surface">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Identificação e contato</CardTitle>
          <AiExtractButton
            title="Extrair dados do cliente"
            description="Cole um texto qualquer com os dados (ficha, documento, mensagem do cliente) e a IA preenche o cadastro para você conferir."
            placeholder="Cole aqui o texto com nome, CPF, telefone, endereço…"
            onAnalyze={fillFromAi}
          />
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-2 gap-y-2 sm:grid-cols-12">
          <div className="sm:col-span-2">
            <Label className="mb-0.5 flex items-center gap-1 text-xs">
              Código
              <HelpTip label="Código interno (1 letra + 4 números, ex.: X9999) usado em planilhas, pastas e buscas rápidas." />
            </Label>
            <Input
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              placeholder="X9999"
              maxLength={5}
              className={cn("font-code font-semibold uppercase", errors.code && "border-destructive")}
            />
            {errors.code && <p className="mt-0.5 text-xs text-destructive">{errors.code}</p>}
          </div>
          <div className="sm:col-span-6">
            <Label className="mb-0.5 block text-xs">Nome completo *</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={cn(errors.name && "border-destructive")}
            />
            {errors.name && <p className="mt-0.5 text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="sm:col-span-4">
            <Label className="mb-0.5 flex items-center gap-1 text-xs">
              CPF/CNPJ
              <HelpTip label="Ajuda a evitar cadastro duplicado. O sistema confere os dígitos quando preenchido." />
            </Label>
            <Input
              value={form.cpfCnpj}
              onChange={(e) => set("cpfCnpj", e.target.value)}
              onBlur={() => form.cpfCnpj && set("cpfCnpj", formatCpfCnpj(form.cpfCnpj))}
              placeholder="000.000.000-00"
              className={cn(errors.cpfCnpj && "border-destructive")}
            />
            {errors.cpfCnpj && <p className="mt-0.5 text-xs text-destructive">{errors.cpfCnpj}</p>}
          </div>

          <div className="sm:col-span-3">
            <Label className="mb-0.5 block text-xs">Telefone principal</Label>
            <Input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </div>
          <div className="sm:col-span-3">
            {form.whatsappSame ? (
              <>
                <Label className="mb-0.5 block text-xs">WhatsApp</Label>
                <label className="flex h-8 items-center gap-2 rounded-md border border-dashed px-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={form.whatsappSame}
                    onCheckedChange={(v) => set("whatsappSame", !!v)}
                  />
                  mesmo número do telefone
                </label>
              </>
            ) : (
              <>
                <Label className="mb-0.5 flex items-center justify-between gap-1 text-xs">
                  WhatsApp
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => set("whatsappSame", true)}
                    title="Voltar a usar o mesmo número do telefone"
                  >
                    usar o telefone
                  </button>
                </Label>
                <Input
                  value={form.whatsapp}
                  onChange={(e) => set("whatsapp", e.target.value)}
                  placeholder="(11) 99999-9999"
                />
              </>
            )}
          </div>
          <div className="sm:col-span-3">
            <Label className="mb-0.5 block text-xs">E-mail</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <Label className="mb-0.5 flex items-center gap-1 text-xs">
              Origem do contato
              <HelpTip label="De onde veio o cliente: indicação, mutirão, telefone, campanha…" />
            </Label>
            <Input value={form.origin} onChange={(e) => set("origin", e.target.value)} placeholder="Indicação…" />
          </div>

          <div className="sm:col-span-5">
            <Label className="mb-0.5 block text-xs">Endereço</Label>
            <Input
              value={form.addressLine}
              onChange={(e) => set("addressLine", e.target.value)}
              placeholder="Rua, número, bairro"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-0.5 block text-xs">Cidade</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="sm:col-span-1">
            <Label className="mb-0.5 block text-xs">UF</Label>
            <Input value={form.state} onChange={(e) => set("state", e.target.value)} maxLength={2} />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-0.5 block text-xs">CEP</Label>
            <Input value={form.zipCode} onChange={(e) => set("zipCode", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-0.5 block text-xs">Tipo de pessoa</Label>
            <Select value={form.personType} onValueChange={(v) => set("personType", v as FormState["personType"])}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pessoa Física">Pessoa Física</SelectItem>
                <SelectItem value="Pessoa Jurídica">Pessoa Jurídica</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="surface">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1">
            Dados pessoais complementares
            <HelpTip label="Usados na procuração e na petição inicial: RG, filiação, nacionalidade, profissão e estado civil. O botão de IA também preenche estes campos." />
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-2 gap-y-2 sm:grid-cols-12">
          <div className="sm:col-span-2">
            <Label className="mb-0.5 block text-xs">RG</Label>
            <Input value={form.rg} onChange={(e) => set("rg", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-0.5 block text-xs">Órgão emissor</Label>
            <Input value={form.rgIssuer} onChange={(e) => set("rgIssuer", e.target.value)} />
          </div>
          <div className="sm:col-span-4">
            <Label className="mb-0.5 block text-xs">Nome da mãe</Label>
            <Input value={form.motherName} onChange={(e) => set("motherName", e.target.value)} />
          </div>
          <div className="sm:col-span-4">
            <Label className="mb-0.5 block text-xs">Nacionalidade</Label>
            <Input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} placeholder="Brasileira" />
          </div>
          <div className="sm:col-span-6">
            <Label className="mb-0.5 block text-xs">Profissão</Label>
            <Input value={form.profession} onChange={(e) => set("profession", e.target.value)} />
          </div>
          <div className="sm:col-span-6">
            <Label className="mb-0.5 block text-xs">Estado civil</Label>
            <Input value={form.maritalStatus} onChange={(e) => set("maritalStatus", e.target.value)} placeholder="Casado(a), solteiro(a)…" />
          </div>
        </CardContent>
      </Card>

      <Card className="surface">
        <CardHeader className="pb-2">
          <CardTitle>Gestão operacional</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <Label className="mb-1 flex items-center gap-1 text-xs">
              Tipos de cliente (operações)
              <HelpTip label="Escolha em quais filas de operação este cliente aparece. Um cliente pode participar de mais de uma operação." />
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {activeTypes.map((t) => {
                const on = form.typeIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleType(t.id)}
                    title={t.description || t.name}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors",
                      on ? "font-medium" : "border-border text-foreground hover:bg-muted"
                    )}
                    style={on ? { backgroundColor: `${t.color}1a`, borderColor: t.color, color: t.color } : undefined}
                  >
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </button>
                );
              })}
              {activeTypes.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum tipo configurado ainda.</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-2 sm:grid-cols-4">
            <div>
              <Label className="mb-0.5 flex items-center gap-1 text-xs">
                Status geral
                <HelpTip label="Estado amplo do cliente, independente dos checklists de cada operação." />
              </Label>
              <Select value={form.generalStatus} onValueChange={(v) => set("generalStatus", v)}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GENERAL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-0.5 flex items-center gap-1 text-xs">
                Responsável interno
                <HelpTip label="Pessoa da equipe que deve acompanhar este cliente no dia a dia." />
              </Label>
              <Select value={form.responsibleId || undefined} onValueChange={(v) => set("responsibleId", v)}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {activeUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-0.5 flex items-center gap-1 text-xs">
                Prioridade
                <HelpTip label="Use Alta para casos que precisam aparecer na frente da fila operacional." />
              </Label>
              <Select value={form.priority || undefined} onValueChange={(v) => set("priority", v as Priority)}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-0.5 flex items-center gap-1 text-xs">
                Próxima ação
                <HelpTip label="Escreva o próximo passo concreto: ligar, cobrar documento, aguardar retorno ou revisar minuta." />
              </Label>
              <Input
                value={form.nextAction}
                onChange={(e) => set("nextAction", e.target.value)}
                placeholder="Ex.: ligar para confirmar"
              />
            </div>
          </div>
          <div>
            <Label className="mb-0.5 block text-xs">Observações</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>
        </CardContent>
      </Card>

      <div className="surface sticky bottom-3 z-10 flex justify-end gap-2 p-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <HelpTip label={client ? "Salva as alterações e volta para a ficha do cliente." : "Cria o cliente e abre a ficha para continuar o trabalho."}>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
          {client ? "Salvar alterações" : "Cadastrar cliente"}
        </Button>
        </HelpTip>
      </div>

      {/* Confirmação de mudança de código */}
      <AlertDialog open={confirmCodeChange} onOpenChange={setConfirmCodeChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar o código do cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              O código passará de <strong>{client?.code}</strong> para{" "}
              <strong>{normalizeCode(form.code) || "(vazio)"}</strong>. O código identifica o cliente nas
              planilhas e pastas do escritório — altere apenas se tiver certeza.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmCodeChange(false);
                doSave();
              }}
            >
              Alterar código
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Aviso de nome repetido */}
      <AlertDialog open={!!nameWarning} onOpenChange={(o) => !o && setNameWarning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Já existe cliente com este nome</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-2">Encontrado(s):</p>
                <ul className="list-disc pl-4">
                  {(nameWarning ?? []).map((c) => (
                    <li key={c.id}>
                      {c.name} {c.code ? `(${c.code})` : ""} {c.cpfCnpj ? `— ${c.cpfCnpj}` : ""}
                    </li>
                  ))}
                </ul>
                <p className="mt-2">Deseja cadastrar mesmo assim (pessoa diferente com o mesmo nome)?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setNameWarning(null);
                doSave(true);
              }}
            >
              Cadastrar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
