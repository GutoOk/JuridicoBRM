"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { Loader2, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import { createClient, updateClient } from "@/lib/db-actions";
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
  PRIORITIES,
  type Client,
  type Address,
  type ClientType,
  type Email,
  type Phone,
  type Priority,
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
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { HelpTip } from "@/components/shared/page-shell";
import { AiExtractButton } from "@/components/shared/ai-extract-dialog";
import { extractClientText } from "@/lib/ai";
import { clientTypeSelectedStyle, clientTypeVisual } from "@/lib/client-type-style";

type FormState = {
  name: string;
  code: string;
  cpfCnpj: string;
  personType: "Pessoa Física" | "Pessoa Jurídica";
  phones: Phone[];
  whatsapp: string;
  whatsappSame: boolean;
  emails: Email[];
  addresses: Address[];
  typeIds: string[];
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

const emptyPhone = (): Phone => ({ number: "", description: "", isPrimary: true });
const emptyEmail = (): Email => ({ address: "", description: "", isPrimary: true });
const emptyAddress = (): Address => ({ description: "", isPrimary: true });

function withOnePrimary<T extends { isPrimary: boolean }>(items: T[]): T[] {
  const primaryIndex = items.findIndex((item) => item.isPrimary);
  return items.map((item, index) => ({ ...item, isPrimary: index === (primaryIndex >= 0 ? primaryIndex : 0) }));
}

function initialPhones(c?: Client | null): Phone[] {
  const legacy = (c?.phones ?? []).filter((p) => p.number?.trim()).map((p) => ({ ...p }));
  const canonical = c?.phone?.trim();
  if (canonical) {
    const match = legacy.findIndex((p) => normalizePhone(p.number) === normalizePhone(canonical));
    if (match >= 0) legacy[match] = { ...legacy[match], number: canonical, isPrimary: true };
    else legacy.unshift({ number: canonical, description: "", isPrimary: true });
    legacy.forEach((p, index) => { p.isPrimary = index === (match >= 0 ? match : 0); });
  }
  return legacy.length ? withOnePrimary(legacy) : [emptyPhone()];
}

function initialEmails(c?: Client | null): Email[] {
  const legacy = (c?.emails ?? []).filter((e) => e.address?.trim()).map((e) => ({ ...e }));
  const canonical = c?.email?.trim();
  if (canonical) {
    const match = legacy.findIndex((e) => e.address?.trim().toLowerCase() === canonical.toLowerCase());
    if (match >= 0) legacy[match] = { ...legacy[match], address: canonical, isPrimary: true };
    else legacy.unshift({ address: canonical, description: "", isPrimary: true });
    legacy.forEach((e, index) => { e.isPrimary = index === (match >= 0 ? match : 0); });
  }
  return legacy.length ? withOnePrimary(legacy) : [emptyEmail()];
}

function initialAddresses(c?: Client | null): Address[] {
  const legacy = (c?.addresses ?? []).filter((a) =>
    [a.street, a.number, a.complement, a.district, a.city, a.state, a.zipCode].some((v) => v?.trim())
  ).map((a) => ({ ...a }));
  if (c?.addressLine?.trim()) {
    const canonical: Address = {
      street: c.addressLine.trim(),
      city: c.city ?? "",
      state: c.state ?? "",
      zipCode: c.zipCode ?? "",
      description: "",
      isPrimary: true,
    };
    const canonicalLine = canonical.street?.toLowerCase();
    const match = legacy.findIndex((a) => {
      const legacyLine = [a.street, a.number, a.district].filter(Boolean).join(", ").trim().toLowerCase();
      return (a.street?.trim().toLowerCase() === canonicalLine || legacyLine === canonicalLine) &&
        (a.city ?? "").trim().toLowerCase() === (canonical.city ?? "").trim().toLowerCase();
    });
    if (match >= 0) {
      legacy[match] = {
        ...legacy[match],
        city: c.city ?? legacy[match].city,
        state: c.state ?? legacy[match].state,
        zipCode: c.zipCode ?? legacy[match].zipCode,
        isPrimary: true,
      };
    }
    else legacy.unshift(canonical);
    legacy.forEach((a, index) => { a.isPrimary = index === (match >= 0 ? match : 0); });
  }
  return legacy.length ? withOnePrimary(legacy) : [emptyAddress()];
}

function initialForm(c?: Client | null): FormState {
  return {
    name: c?.name ?? "",
    code: c?.code ?? "",
    cpfCnpj: c?.cpfCnpj ?? "",
    personType: c?.type ?? "Pessoa Física",
    phones: initialPhones(c),
    whatsapp: c?.whatsapp ?? "",
    whatsappSame: !c?.whatsapp,
    emails: initialEmails(c),
    addresses: initialAddresses(c),
    typeIds: c?.typeIds ?? [],
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

  const [form, setForm] = useState<FormState>(() => initialForm(client));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmCodeChange, setConfirmCodeChange] = useState(false);
  const [pendingTypeChange, setPendingTypeChange] = useState<{ type: ClientType; adding: boolean } | null>(null);
  const [nameWarning, setNameWarning] = useState<Client[] | null>(null);
  const [pendingListRemoval, setPendingListRemoval] = useState<{
    key: "phones" | "emails" | "addresses";
    index: number;
  } | null>(null);

  const activeTypes = (types ?? []).filter((t) => !t.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const updateListItem = <K extends "phones" | "emails" | "addresses">(
    key: K,
    index: number,
    patch: Partial<FormState[K][number]>
  ) => {
    setForm((current) => ({
      ...current,
      [key]: current[key].map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  };

  const setPrimary = (key: "phones" | "emails" | "addresses", index: number) => {
    setForm((current) => ({
      ...current,
      [key]: current[key].map((item, itemIndex) => ({ ...item, isPrimary: itemIndex === index })),
    }));
  };

  const removeListItem = (key: "phones" | "emails" | "addresses", index: number) => {
    setForm((current) => {
      const remaining = current[key].filter((_, itemIndex) => itemIndex !== index);
      const fallback = key === "phones" ? emptyPhone() : key === "emails" ? emptyEmail() : emptyAddress();
      return { ...current, [key]: remaining.length ? withOnePrimary(remaining) : [fallback] };
    });
  };

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
      const dup = snap.docs.find((d) => d.id !== client?.id);
      const allowedNestedDuplicate = !!dup && !!client && (
        (client.nestedClientIds ?? []).includes(dup.id) ||
        (dup.data().nestedClientIds ?? []).includes(client.id)
      );
      if (dup && !allowedNestedDuplicate) return `O código ${code} já pertence a "${dup.data().name}"${dup.data().deleted ? " (cadastro ocultado)" : ""}.`;
    }
    const cpfDigits = digitsOnly(form.cpfCnpj);
    if (cpfDigits) {
      const snap = await getDocs(query(collection(db, "clients"), where("cpfCnpjDigits", "==", cpfDigits)));
      const dup = snap.docs.find((d) => d.id !== client?.id);
      if (dup) return `Já existe cliente com este CPF/CNPJ: "${dup.data().name}"${dup.data().deleted ? " (cadastro ocultado)" : ""}.`;
      // compatibilidade: dados antigos sem campo normalizado
      const snapLegacy = await getDocs(
        query(collection(db, "clients"), where("cpfCnpj", "==", formatCpfCnpj(form.cpfCnpj)))
      );
      const dupLegacy = snapLegacy.docs.find((d) => d.id !== client?.id);
      if (dupLegacy) return `Já existe cliente com este CPF/CNPJ: "${dupLegacy.data().name}"${dupLegacy.data().deleted ? " (cadastro ocultado)" : ""}.`;
    }
    return null;
  };

  const buildPayload = () => {
    const code = normalizeCode(form.code);
    const phones = withOnePrimary(
      form.phones
        .filter((item) => item.number.trim())
        .map((item) => ({
          number: item.number.trim(),
          description: item.description.trim(),
          isPrimary: item.isPrimary,
        }))
    );
    const emails = withOnePrimary(
      form.emails
        .filter((item) => item.address?.trim())
        .map((item) => ({
          address: item.address?.trim() ?? "",
          description: item.description.trim(),
          isPrimary: item.isPrimary,
        }))
    );
    const addresses = withOnePrimary(
      form.addresses
        .filter((item) =>
          [item.street, item.number, item.complement, item.district, item.city, item.state, item.zipCode]
            .some((value) => value?.trim())
        )
        .map((item) => ({
          street: item.street?.trim() ?? "",
          number: item.number?.trim() ?? "",
          complement: item.complement?.trim() ?? "",
          district: item.district?.trim() ?? "",
          city: item.city?.trim() ?? "",
          state: item.state?.trim().toUpperCase() ?? "",
          zipCode: item.zipCode?.trim() ?? "",
          description: item.description.trim(),
          isPrimary: item.isPrimary,
        }))
    );
    const primaryPhone = phones.find((item) => item.isPrimary) ?? phones[0];
    const primaryEmail = emails.find((item) => item.isPrimary) ?? emails[0];
    const primaryAddress = addresses.find((item) => item.isPrimary) ?? addresses[0];
    const phone = primaryPhone?.number ?? "";
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
      phones,
      whatsapp,
      whatsappDigits: normalizePhone(whatsapp || phone),
      email: primaryEmail?.address ?? "",
      emails,
      addressLine: primaryAddress
        ? [primaryAddress.street, primaryAddress.number, primaryAddress.district].filter(Boolean).join(", ")
        : "",
      city: primaryAddress?.city ?? "",
      state: primaryAddress?.state ?? "",
      zipCode: primaryAddress?.zipCode ?? "",
      addresses,
      typeIds: form.typeIds,
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
      phones: d.phone
        ? f.phones.map((item) => item.isPrimary ? { ...item, number: d.phone! } : item)
        : f.phones,
      whatsapp: d.whatsapp || f.whatsapp,
      whatsappSame: d.whatsapp ? false : f.whatsappSame,
      emails: d.email
        ? f.emails.map((item) => item.isPrimary ? { ...item, address: d.email! } : item)
        : f.emails,
      addresses: f.addresses.map((item) => item.isPrimary ? {
        ...item,
        street: d.addressLine || item.street,
        city: d.city || item.city,
        state: d.state || item.state,
        zipCode: d.zipCode || item.zipCode,
      } : item),
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
        await updateClient(client, payload, user);
        toast({ title: "Cliente atualizado" });
        router.push(`/dashboard/clients/${client.id}`);
      } else {
        const clientId = await createClient(payload, user);
        toast({ title: "Cliente cadastrado", description: payload.code || payload.name });
        router.push(`/dashboard/clients/${clientId}`);
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

  const applyTypeChange = (typeId: string) => {
    set(
      "typeIds",
      form.typeIds.includes(typeId) ? form.typeIds.filter((t) => t !== typeId) : [...form.typeIds, typeId]
    );
  };

  const toggleType = (type: ClientType) => {
    if (!client) {
      applyTypeChange(type.id);
      return;
    }
    setPendingTypeChange({ type, adding: !form.typeIds.includes(type.id) });
  };

  const generateCode = async () => {
    const selectedNames = activeTypes
      .filter((type) => form.typeIds.includes(type.id))
      .map((type) => searchable(type.name));
    const prefix = selectedNames.some((name) => name.includes("cliente antigo")) ? "A" : "N";

    try {
      const snapshot = await getDocs(collection(db, "clients"));
      const highest = snapshot.docs.reduce((current, item) => {
        const code = normalizeCode(String(item.data().code ?? ""));
        const match = code.match(new RegExp(`^${prefix}(\\d{4})$`));
        return match ? Math.max(current, Number(match[1])) : current;
      }, 0);
      if (highest >= 9999) {
        toast({ variant: "destructive", title: `Não há mais códigos ${prefix} disponíveis` });
        return;
      }
      set("code", `${prefix}${String(highest + 1).padStart(4, "0")}`);
      setErrors((current) => ({ ...current, code: "" }));
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Não foi possível gerar o código" });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
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
            <div className="flex gap-1">
              <Input
                value={form.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                placeholder="N0001"
                maxLength={5}
                className={cn("font-code font-semibold uppercase", errors.code && "border-destructive")}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8 shrink-0"
                onClick={generateCode}
                title="Gerar o próximo código disponível conforme a operação selecionada"
              >
                <RefreshCw className="size-3.5" />
                <span className="sr-only">Gerar código</span>
              </Button>
            </div>
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

          <div className="col-span-2 border-t pt-2 sm:col-span-12">
            <div className="mb-1.5 flex items-center justify-between">
              <Label className="text-xs">Telefones</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => set("phones", [...form.phones, { ...emptyPhone(), isPrimary: false }])}
                title="Cadastrar outro telefone"
              >
                <Plus className="mr-1 size-3.5" /> Adicionar telefone
              </Button>
            </div>
            <div className="space-y-1.5">
              {form.phones.map((phone, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,.7fr)_auto] gap-1.5">
                  <Input
                    value={phone.number}
                    onChange={(e) => updateListItem("phones", index, { number: e.target.value })}
                    placeholder="(11) 99999-9999"
                    aria-label={`Telefone ${index + 1}`}
                  />
                  <Input
                    value={phone.description}
                    onChange={(e) => updateListItem("phones", index, { description: e.target.value })}
                    placeholder="Pessoal, trabalho…"
                    aria-label={`Descrição do telefone ${index + 1}`}
                  />
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => setPrimary("phones", index)}
                      title={phone.isPrimary ? "Telefone principal" : "Definir como telefone principal"}
                      aria-label={phone.isPrimary ? "Telefone principal" : "Definir como telefone principal"}
                    >
                      <Star className={cn("size-3.5", phone.isPrimary && "fill-amber-400 text-amber-500")} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setPendingListRemoval({ key: "phones", index })}
                      title="Remover telefone"
                      aria-label="Remover telefone"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1.5 max-w-sm">
              {form.whatsappSame ? (
                <label className="flex h-8 items-center gap-2 rounded-md border border-dashed px-2 text-xs text-muted-foreground">
                  <Checkbox checked onCheckedChange={(v) => set("whatsappSame", !!v)} />
                  WhatsApp usa o telefone principal
                </label>
              ) : (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
                  <Input
                    value={form.whatsapp}
                    onChange={(e) => set("whatsapp", e.target.value)}
                    placeholder="WhatsApp diferente"
                    aria-label="WhatsApp"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => set("whatsappSame", true)}
                    title="Usar o telefone principal no WhatsApp"
                  >
                    Usar principal
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="col-span-2 border-t pt-2 sm:col-span-12">
            <div className="mb-1.5 flex items-center justify-between">
              <Label className="text-xs">E-mails</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => set("emails", [...form.emails, { ...emptyEmail(), isPrimary: false }])}
                title="Cadastrar outro e-mail"
              >
                <Plus className="mr-1 size-3.5" /> Adicionar e-mail
              </Button>
            </div>
            <div className="space-y-1.5">
              {form.emails.map((email, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,.7fr)_auto] gap-1.5">
                  <Input
                    type="email"
                    value={email.address ?? ""}
                    onChange={(e) => updateListItem("emails", index, { address: e.target.value })}
                    placeholder="nome@exemplo.com"
                    aria-label={`E-mail ${index + 1}`}
                  />
                  <Input
                    value={email.description}
                    onChange={(e) => updateListItem("emails", index, { description: e.target.value })}
                    placeholder="Pessoal, trabalho…"
                    aria-label={`Descrição do e-mail ${index + 1}`}
                  />
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => setPrimary("emails", index)}
                      title={email.isPrimary ? "E-mail principal" : "Definir como e-mail principal"}
                      aria-label={email.isPrimary ? "E-mail principal" : "Definir como e-mail principal"}
                    >
                      <Star className={cn("size-3.5", email.isPrimary && "fill-amber-400 text-amber-500")} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setPendingListRemoval({ key: "emails", index })}
                      title="Remover e-mail"
                      aria-label="Remover e-mail"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="col-span-2 border-t pt-2 sm:col-span-12">
            <div className="mb-1.5 flex items-center justify-between">
              <Label className="text-xs">Endereços</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => set("addresses", [...form.addresses, { ...emptyAddress(), isPrimary: false }])}
                title="Cadastrar outro endereço"
              >
                <Plus className="mr-1 size-3.5" /> Adicionar endereço
              </Button>
            </div>
            <div className="space-y-2">
              {form.addresses.map((address, index) => (
                <div key={index} className="rounded-md border bg-muted/20 p-2">
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-12">
                    <Input
                      className="sm:col-span-3"
                      value={address.description}
                      onChange={(e) => updateListItem("addresses", index, { description: e.target.value })}
                      placeholder="Descrição: casa, trabalho…"
                      aria-label={`Descrição do endereço ${index + 1}`}
                    />
                    <Input
                      className="col-span-2 sm:col-span-5"
                      value={address.street ?? ""}
                      onChange={(e) => updateListItem("addresses", index, { street: e.target.value })}
                      placeholder="Logradouro"
                      aria-label={`Logradouro do endereço ${index + 1}`}
                    />
                    <Input
                      className="sm:col-span-2"
                      value={address.number ?? ""}
                      onChange={(e) => updateListItem("addresses", index, { number: e.target.value })}
                      placeholder="Número"
                      aria-label={`Número do endereço ${index + 1}`}
                    />
                    <div className="flex justify-end gap-1 sm:col-span-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8"
                        onClick={() => setPrimary("addresses", index)}
                        title={address.isPrimary ? "Endereço principal" : "Definir como endereço principal"}
                        aria-label={address.isPrimary ? "Endereço principal" : "Definir como endereço principal"}
                      >
                        <Star className={cn("size-3.5", address.isPrimary && "fill-amber-400 text-amber-500")} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setPendingListRemoval({ key: "addresses", index })}
                        title="Remover endereço"
                        aria-label="Remover endereço"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <Input
                      className="sm:col-span-3"
                      value={address.complement ?? ""}
                      onChange={(e) => updateListItem("addresses", index, { complement: e.target.value })}
                      placeholder="Complemento"
                      aria-label={`Complemento do endereço ${index + 1}`}
                    />
                    <Input
                      className="sm:col-span-3"
                      value={address.district ?? ""}
                      onChange={(e) => updateListItem("addresses", index, { district: e.target.value })}
                      placeholder="Bairro"
                      aria-label={`Bairro do endereço ${index + 1}`}
                    />
                    <Input
                      className="sm:col-span-3"
                      value={address.city ?? ""}
                      onChange={(e) => updateListItem("addresses", index, { city: e.target.value })}
                      placeholder="Cidade"
                      aria-label={`Cidade do endereço ${index + 1}`}
                    />
                    <Input
                      className="sm:col-span-1"
                      value={address.state ?? ""}
                      onChange={(e) => updateListItem("addresses", index, { state: e.target.value })}
                      placeholder="UF"
                      maxLength={2}
                      aria-label={`UF do endereço ${index + 1}`}
                    />
                    <Input
                      className="sm:col-span-2"
                      value={address.zipCode ?? ""}
                      onChange={(e) => updateListItem("addresses", index, { zipCode: e.target.value })}
                      placeholder="CEP"
                      aria-label={`CEP do endereço ${index + 1}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="sm:col-span-6">
            <Label className="mb-0.5 flex items-center gap-1 text-xs">
              Origem do contato
              <HelpTip label="De onde veio o cliente: indicação, mutirão, telefone, campanha…" />
            </Label>
            <Input value={form.origin} onChange={(e) => set("origin", e.target.value)} placeholder="Indicação…" />
          </div>
          <div className="sm:col-span-6">
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

      <Card className={cn("surface", !client && "order-first")}>
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
                    onClick={() => toggleType(t)}
                    title={t.description || t.name}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors",
                      on ? "font-medium" : "border-border text-foreground hover:bg-muted"
                    )}
                    style={on ? clientTypeSelectedStyle(t) : undefined}
                  >
                    <span
                      className="size-1.5 rounded-full bg-muted-foreground/45"
                      style={on ? { backgroundColor: clientTypeVisual(t).dotColor } : undefined}
                    />
                    {t.name}
                  </button>
                );
              })}
              {activeTypes.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum tipo configurado ainda.</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-2">
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
            <Label className="mb-0.5 block text-xs">Informações gerais</Label>
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

      <AlertDialog open={!!pendingTypeChange} onOpenChange={(open) => !open && setPendingTypeChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingTypeChange?.adding ? "Adicionar tipo ao cliente?" : "Remover tipo do cliente?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTypeChange?.adding ? "Adicionar" : "Remover"} <strong>{pendingTypeChange?.type.name}</strong>{" "}
              {pendingTypeChange?.adding ? "a" : "de"} <strong>{form.name || client?.name}</strong>?
              {!pendingTypeChange?.adding && " O cliente deixará de aparecer nessa operação após salvar as alterações."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingTypeChange) applyTypeChange(pendingTypeChange.type.id);
                setPendingTypeChange(null);
              }}
            >
              {pendingTypeChange?.adding ? "Adicionar tipo" : "Remover tipo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDeleteDialog
        open={!!pendingListRemoval}
        onOpenChange={(open) => !open && setPendingListRemoval(null)}
        title={`Excluir ${
          pendingListRemoval?.key === "phones"
            ? "telefone"
            : pendingListRemoval?.key === "emails"
              ? "e-mail"
              : "endereço"
        }?`}
        description={`Deseja excluir este ${
          pendingListRemoval?.key === "phones"
            ? "telefone"
            : pendingListRemoval?.key === "emails"
              ? "e-mail"
              : "endereço"
        }?`}
        onConfirm={() => {
          if (pendingListRemoval) {
            removeListItem(pendingListRemoval.key, pendingListRemoval.index);
          }
          setPendingListRemoval(null);
        }}
      />

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
