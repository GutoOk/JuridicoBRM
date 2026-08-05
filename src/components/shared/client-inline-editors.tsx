"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Star,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { aiErrorMessage, extractClientText, type ExtractedClient } from "@/lib/ai";
import { effectiveClientTypeIds, parentClientsOf } from "@/lib/client-nesting";
import { clientTypeSelectedStyle } from "@/lib/client-type-style";
import { updateClient } from "@/lib/db-actions";
import {
  digitsOnly,
  formatCpfCnpj,
  isValidCode,
  isValidCpfCnpj,
  normalizeCode,
  normalizePhone,
  searchable,
} from "@/lib/normalize";
import type { Address, Client, ClientType, Email, Phone } from "@/lib/types";
import { cn } from "@/lib/utils";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

type ScalarEditorKind =
  | "name"
  | "code"
  | "cpfCnpj"
  | "personType"
  | "priority"
  | "origin"
  | "rg"
  | "motherName"
  | "nationality"
  | "profession"
  | "maritalStatus";

export type ClientInlineEditorKind =
  | ScalarEditorKind
  | "phones"
  | "emails"
  | "addresses"
  | "operations"
  | "ai";

type EditorProps = {
  client: Client;
  allClients: Client[];
  types: ClientType[];
  kind: ClientInlineEditorKind | null;
  onOpenChange: (kind: ClientInlineEditorKind | null) => void;
};

const scalarConfig: Record<
  ScalarEditorKind,
  { title: string; description: string; label: string; placeholder?: string }
> = {
  name: {
    title: "Editar nome",
    description: "Altere somente o nome completo deste cliente.",
    label: "Nome completo",
  },
  code: {
    title: "Editar código",
    description: "O código continua único em toda a base, inclusive entre registros excluídos.",
    label: "Código",
    placeholder: "N0001",
  },
  cpfCnpj: {
    title: "Editar CPF/CNPJ",
    description: "O sistema confere os dígitos e impede duplicidade.",
    label: "CPF/CNPJ",
    placeholder: "000.000.000-00",
  },
  personType: {
    title: "Editar tipo de pessoa",
    description: "Defina se o cadastro pertence a uma pessoa física ou jurídica.",
    label: "Tipo de pessoa",
  },
  priority: {
    title: "Editar prioridade",
    description: "Altere somente a prioridade operacional deste cliente.",
    label: "Prioridade",
  },
  origin: {
    title: "Editar origem do contato",
    description: "Informe como este cliente chegou ao escritório.",
    label: "Origem do contato",
    placeholder: "Indicação, campanha, mutirão…",
  },
  rg: {
    title: "Editar RG",
    description: "Atualize o número e o órgão emissor juntos.",
    label: "RG",
  },
  motherName: {
    title: "Editar nome da mãe",
    description: "Altere somente o nome da mãe.",
    label: "Nome da mãe",
  },
  nationality: {
    title: "Editar nacionalidade",
    description: "Altere somente a nacionalidade usada na qualificação.",
    label: "Nacionalidade",
    placeholder: "Brasileira",
  },
  profession: {
    title: "Editar profissão",
    description: "Altere somente a profissão usada na qualificação.",
    label: "Profissão",
  },
  maritalStatus: {
    title: "Editar estado civil",
    description: "Altere somente o estado civil usado na qualificação.",
    label: "Estado civil",
    placeholder: "Casada, solteiro…",
  },
};

function isScalarKind(kind: ClientInlineEditorKind | null): kind is ScalarEditorKind {
  return !!kind && kind in scalarConfig;
}

function emptyPhone(): Phone {
  return { number: "", description: "", isPrimary: true };
}

function emptyEmail(): Email {
  return { address: "", description: "", isPrimary: true };
}

function emptyAddress(): Address {
  return { description: "", isPrimary: true };
}

function onePrimary<T extends { isPrimary: boolean }>(items: T[]): T[] {
  const primaryIndex = items.findIndex((item) => item.isPrimary);
  return items.map((item, index) => ({
    ...item,
    isPrimary: index === (primaryIndex >= 0 ? primaryIndex : 0),
  }));
}

function initialPhones(client: Client): Phone[] {
  const items = (client.phones ?? [])
    .filter((item) => item.number?.trim())
    .map((item) => ({ ...item }));
  const canonical = client.phone?.trim();
  if (canonical) {
    const match = items.findIndex(
      (item) => normalizePhone(item.number) === normalizePhone(canonical)
    );
    if (match >= 0) items[match] = { ...items[match], number: canonical, isPrimary: true };
    else items.unshift({ number: canonical, description: "", isPrimary: true });
  }
  return items.length ? onePrimary(items) : [emptyPhone()];
}

function initialEmails(client: Client): Email[] {
  const items = (client.emails ?? [])
    .filter((item) => item.address?.trim())
    .map((item) => ({ ...item }));
  const canonical = client.email?.trim();
  if (canonical) {
    const match = items.findIndex(
      (item) => item.address?.trim().toLocaleLowerCase("pt-BR") === canonical.toLocaleLowerCase("pt-BR")
    );
    if (match >= 0) items[match] = { ...items[match], address: canonical, isPrimary: true };
    else items.unshift({ address: canonical, description: "", isPrimary: true });
  }
  return items.length ? onePrimary(items) : [emptyEmail()];
}

function initialAddresses(client: Client): Address[] {
  const items = (client.addresses ?? [])
    .filter((item) =>
      [
        item.street,
        item.number,
        item.complement,
        item.district,
        item.city,
        item.state,
        item.zipCode,
      ].some((value) => value?.trim())
    )
    .map((item) => ({ ...item }));
  if (!items.length && (client.addressLine || client.city || client.state || client.zipCode)) {
    items.push({
      street: client.addressLine ?? "",
      city: client.city ?? "",
      state: client.state ?? "",
      zipCode: client.zipCode ?? "",
      description: "",
      isPrimary: true,
    });
  }
  return items.length ? onePrimary(items) : [emptyAddress()];
}

function codePrefix(client: Client, allClients: Client[], types: ClientType[]): "A" | "N" {
  const typeIds = effectiveClientTypeIds(client, allClients);
  const names = types
    .filter((type) => typeIds.includes(type.id))
    .map((type) => searchable(type.name));
  return names.some((name) => name.includes("cliente antigo")) ? "A" : "N";
}

function codeDuplicate(client: Client, allClients: Client[], value: string): Client | undefined {
  return allClients.find((candidate) => {
    if (candidate.id === client.id || normalizeCode(candidate.code) !== value) return false;
    return !(
      (client.nestedClientIds ?? []).includes(candidate.id) ||
      (candidate.nestedClientIds ?? []).includes(client.id)
    );
  });
}

function cpfDuplicate(client: Client, allClients: Client[], value: string): Client | undefined {
  const digits = digitsOnly(value);
  return allClients.find(
    (candidate) =>
      candidate.id !== client.id &&
      digits &&
      (candidate.cpfCnpjDigits === digits || digitsOnly(candidate.cpfCnpj) === digits)
  );
}

function ScalarEditDialog({
  client,
  allClients,
  types,
  kind,
  onOpenChange,
}: EditorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const open = isScalarKind(kind);
  const config = open ? scalarConfig[kind] : scalarConfig.name;
  const [value, setValue] = useState("");
  const [secondaryValue, setSecondaryValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmCode, setConfirmCode] = useState(false);
  const [confirmName, setConfirmName] = useState<Client[] | null>(null);

  useEffect(() => {
    if (!open || !kind) return;
    const current =
      kind === "personType"
        ? client.type
        : kind === "priority"
          ? client.priority ?? ""
          : String(client[kind] ?? "");
    setValue(current);
    setSecondaryValue(kind === "rg" ? client.rgIssuer ?? "" : "");
    setConfirmCode(false);
    setConfirmName(null);
  }, [open, kind, client]);

  const persist = async () => {
    if (!user || !kind || !isScalarKind(kind)) return;
    setSaving(true);
    try {
      let patch: Record<string, unknown>;
      if (kind === "name") {
        const name = value.trim();
        if (!name) throw new Error("Informe o nome completo.");
        patch = { name, nameLower: searchable(name) };
      } else if (kind === "code") {
        const code = normalizeCode(value);
        if (code && !isValidCode(code)) throw new Error("Use 1 letra e 4 números, como N0001.");
        const duplicate = codeDuplicate(client, allClients, code);
        if (duplicate) throw new Error(`O código ${code} já pertence a ${duplicate.name}.`);
        patch = { code };
      } else if (kind === "cpfCnpj") {
        const cpfCnpj = value.trim() ? formatCpfCnpj(value) : "";
        if (cpfCnpj && !isValidCpfCnpj(cpfCnpj)) throw new Error("CPF/CNPJ inválido.");
        const duplicate = cpfDuplicate(client, allClients, cpfCnpj);
        if (duplicate) throw new Error(`Este CPF/CNPJ já pertence a ${duplicate.name}.`);
        patch = { cpfCnpj, cpfCnpjDigits: digitsOnly(cpfCnpj) };
      } else if (kind === "personType") {
        patch = { type: value };
      } else if (kind === "rg") {
        patch = { rg: value.trim(), rgIssuer: secondaryValue.trim() };
      } else {
        patch = { [kind]: value.trim() };
      }
      await updateClient(client, patch, user);
      toast({ title: `${config.label} atualizado` });
      onOpenChange(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Não foi possível atualizar",
        description: error instanceof Error ? error.message : "Confira os dados e tente novamente.",
      });
    } finally {
      setSaving(false);
    }
  };

  const requestSave = async () => {
    if (!kind || !isScalarKind(kind)) return;
    if (kind === "name") {
      const matches = allClients.filter(
        (candidate) =>
          candidate.id !== client.id &&
          !candidate.deleted &&
          searchable(candidate.name) === searchable(value)
      );
      if (matches.length) {
        setConfirmName(matches);
        return;
      }
    }
    if (kind === "code" && normalizeCode(value) !== normalizeCode(client.code)) {
      const normalized = normalizeCode(value);
      if (normalized && !isValidCode(normalized)) {
        toast({ variant: "destructive", title: "Código inválido", description: "Use 1 letra e 4 números, como N0001." });
        return;
      }
      const duplicate = codeDuplicate(client, allClients, normalized);
      if (duplicate) {
        toast({ variant: "destructive", title: "Código já utilizado", description: `${normalized} pertence a ${duplicate.name}.` });
        return;
      }
      setConfirmCode(true);
      return;
    }
    await persist();
  };

  const generateCode = () => {
    const prefix = codePrefix(client, allClients, types);
    const highest = allClients.reduce((current, candidate) => {
      const match = normalizeCode(candidate.code).match(new RegExp(`^${prefix}(\\d{4})$`));
      return match ? Math.max(current, Number(match[1])) : current;
    }, 0);
    if (highest >= 9999) {
      toast({ variant: "destructive", title: `Não há mais códigos ${prefix} disponíveis` });
      return;
    }
    setValue(`${prefix}${String(highest + 1).padStart(4, "0")}`);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !saving && !next && onOpenChange(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{config.title}</DialogTitle>
            <DialogDescription>{config.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">{config.label}</Label>
            {kind === "personType" ? (
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pessoa Física">Pessoa Física</SelectItem>
                  <SelectItem value="Pessoa Jurídica">Pessoa Jurídica</SelectItem>
                </SelectContent>
              </Select>
            ) : kind === "priority" ? (
              <Select value={value || "none"} onValueChange={(next) => setValue(next === "none" ? "" : next)}>
                <SelectTrigger><SelectValue placeholder="Sem prioridade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem prioridade</SelectItem>
                  <SelectItem value="Alta">Alta</SelectItem>
                  <SelectItem value="Média">Média</SelectItem>
                  <SelectItem value="Baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className={cn(kind === "code" && "flex gap-1.5")}>
                <Input
                  value={value}
                  onChange={(event) => setValue(kind === "code" ? event.target.value.toUpperCase() : event.target.value)}
                  placeholder={config.placeholder}
                  autoFocus
                />
                {kind === "code" && (
                  <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={generateCode} title="Gerar o próximo código disponível">
                    <RefreshCw className="size-3.5" />
                  </Button>
                )}
              </div>
            )}
            {kind === "rg" && (
              <>
                <Label className="text-xs">Órgão emissor</Label>
                <Input value={secondaryValue} onChange={(event) => setSecondaryValue(event.target.value)} placeholder="SSP/SP" />
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={requestSave} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCode} onOpenChange={setConfirmCode}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar código do cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              O código mudará de {client.code || "não cadastrado"} para {normalizeCode(value)}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={persist}>Alterar código</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmName} onOpenChange={(next) => !next && setConfirmName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Já existe cliente com este nome</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmName?.map((item) => `${item.name}${item.code ? ` (${item.code})` : ""}`).join(", ")}.
              Deseja salvar mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={persist}>Salvar mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PhonesDialog({ client, kind, onOpenChange }: EditorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const open = kind === "phones";
  const [items, setItems] = useState<Phone[]>([]);
  const [whatsappSame, setWhatsappSame] = useState(true);
  const [whatsapp, setWhatsapp] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setItems(initialPhones(client));
    setWhatsappSame(!client.whatsapp);
    setWhatsapp(client.whatsapp ?? "");
  }, [open, client]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const phones = onePrimary(
        items
          .filter((item) => item.number.trim())
          .map((item) => ({ ...item, number: item.number.trim(), description: item.description.trim() }))
      );
      const primary = phones.find((item) => item.isPrimary) ?? phones[0];
      const explicitWhatsapp = whatsappSame ? "" : whatsapp.trim();
      await updateClient(client, {
        phones,
        phone: primary?.number ?? "",
        phoneDigits: normalizePhone(primary?.number),
        whatsapp: explicitWhatsapp,
        whatsappDigits: normalizePhone(explicitWhatsapp || primary?.number),
      }, user);
      toast({ title: "Telefones atualizados" });
      onOpenChange(null);
    } catch {
      toast({ variant: "destructive", title: "Não foi possível atualizar os telefones" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && !next && onOpenChange(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Adicionar ou editar telefones</DialogTitle>
            <DialogDescription>Cadastre vários números e marque qual aparece como principal.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,.7fr)_auto] gap-1.5 rounded-md border p-2">
                <Input value={item.number} onChange={(event) => setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, number: event.target.value } : entry))} placeholder="(11) 99999-9999" aria-label={`Telefone ${index + 1}`} />
                <Input value={item.description} onChange={(event) => setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, description: event.target.value } : entry))} placeholder="Pessoal, trabalho…" aria-label={`Descrição do telefone ${index + 1}`} />
                <div className="flex">
                  <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => setItems((current) => current.map((entry, itemIndex) => ({ ...entry, isPrimary: itemIndex === index })))} title={item.isPrimary ? "Telefone principal" : "Definir como principal"}>
                    <Star className={cn("size-3.5", item.isPrimary && "fill-amber-400 text-amber-500")} />
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setItems((current) => [...current, { ...emptyPhone(), isPrimary: false }])}>
              <Plus className="mr-1 size-3.5" /> Adicionar telefone
            </Button>
            <div className="space-y-1.5 border-t pt-2">
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={whatsappSame} onCheckedChange={(checked) => setWhatsappSame(!!checked)} />
                WhatsApp usa o telefone principal
              </label>
              {!whatsappSame && <Input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} placeholder="Número do WhatsApp" />}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-1.5 size-4 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}

function EmailsDialog({ client, kind, onOpenChange }: EditorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const open = kind === "emails";
  const [items, setItems] = useState<Email[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setItems(initialEmails(client));
  }, [open, client]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const emails = onePrimary(
        items
          .filter((item) => item.address?.trim())
          .map((item) => ({ ...item, address: item.address?.trim() ?? "", description: item.description.trim() }))
      );
      const primary = emails.find((item) => item.isPrimary) ?? emails[0];
      await updateClient(client, { emails, email: primary?.address ?? "" }, user);
      toast({ title: "E-mails atualizados" });
      onOpenChange(null);
    } catch {
      toast({ variant: "destructive", title: "Não foi possível atualizar os e-mails" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && !next && onOpenChange(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Adicionar ou editar e-mails</DialogTitle>
            <DialogDescription>Cadastre vários endereços e marque qual aparece como principal.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,.7fr)_auto] gap-1.5 rounded-md border p-2">
                <Input type="email" value={item.address ?? ""} onChange={(event) => setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, address: event.target.value } : entry))} placeholder="nome@exemplo.com" aria-label={`E-mail ${index + 1}`} />
                <Input value={item.description} onChange={(event) => setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, description: event.target.value } : entry))} placeholder="Pessoal, trabalho…" aria-label={`Descrição do e-mail ${index + 1}`} />
                <div className="flex">
                  <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => setItems((current) => current.map((entry, itemIndex) => ({ ...entry, isPrimary: itemIndex === index })))} title={item.isPrimary ? "E-mail principal" : "Definir como principal"}>
                    <Star className={cn("size-3.5", item.isPrimary && "fill-amber-400 text-amber-500")} />
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setItems((current) => [...current, { ...emptyEmail(), isPrimary: false }])}>
              <Plus className="mr-1 size-3.5" /> Adicionar e-mail
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-1.5 size-4 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}

function AddressesDialog({ client, kind, onOpenChange }: EditorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const open = kind === "addresses";
  const [items, setItems] = useState<Address[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setItems(initialAddresses(client));
  }, [open, client]);

  const update = (index: number, patch: Partial<Address>) =>
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const addresses = onePrimary(
        items
          .filter((item) => [item.street, item.number, item.complement, item.district, item.city, item.state, item.zipCode].some((value) => value?.trim()))
          .map((item) => ({
            ...item,
            street: item.street?.trim() ?? "",
            number: item.number?.trim() ?? "",
            complement: item.complement?.trim() ?? "",
            district: item.district?.trim() ?? "",
            city: item.city?.trim() ?? "",
            state: item.state?.trim().toUpperCase() ?? "",
            zipCode: item.zipCode?.trim() ?? "",
            description: item.description.trim(),
          }))
      );
      const primary = addresses.find((item) => item.isPrimary) ?? addresses[0];
      await updateClient(client, {
        addresses,
        addressLine: primary ? [primary.street, primary.number, primary.district].filter(Boolean).join(", ") : "",
        city: primary?.city ?? "",
        state: primary?.state ?? "",
        zipCode: primary?.zipCode ?? "",
      }, user);
      toast({ title: "Endereços atualizados" });
      onOpenChange(null);
    } catch {
      toast({ variant: "destructive", title: "Não foi possível atualizar os endereços" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && !next && onOpenChange(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Adicionar ou editar endereços</DialogTitle>
            <DialogDescription>O endereço principal aparece no cabeçalho e na qualificação.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={index} className="rounded-md border bg-muted/15 p-2">
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-12">
                  <Input className="sm:col-span-3" value={item.description} onChange={(event) => update(index, { description: event.target.value })} placeholder="Descrição: casa, trabalho…" />
                  <Input className="col-span-2 sm:col-span-5" value={item.street ?? ""} onChange={(event) => update(index, { street: event.target.value })} placeholder="Logradouro" />
                  <Input className="sm:col-span-2" value={item.number ?? ""} onChange={(event) => update(index, { number: event.target.value })} placeholder="Número" />
                  <div className="flex justify-end sm:col-span-2">
                    <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => setItems((current) => current.map((entry, itemIndex) => ({ ...entry, isPrimary: itemIndex === index })))} title={item.isPrimary ? "Endereço principal" : "Definir como principal"}>
                      <Star className={cn("size-3.5", item.isPrimary && "fill-amber-400 text-amber-500")} />
                    </Button>
                  </div>
                  <Input className="sm:col-span-3" value={item.complement ?? ""} onChange={(event) => update(index, { complement: event.target.value })} placeholder="Complemento" />
                  <Input className="sm:col-span-3" value={item.district ?? ""} onChange={(event) => update(index, { district: event.target.value })} placeholder="Bairro" />
                  <Input className="sm:col-span-3" value={item.city ?? ""} onChange={(event) => update(index, { city: event.target.value })} placeholder="Cidade" />
                  <Input className="sm:col-span-1" value={item.state ?? ""} onChange={(event) => update(index, { state: event.target.value })} placeholder="UF" maxLength={2} />
                  <Input className="sm:col-span-2" value={item.zipCode ?? ""} onChange={(event) => update(index, { zipCode: event.target.value })} placeholder="CEP" />
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setItems((current) => [...current, { ...emptyAddress(), isPrimary: false }])}>
              <Plus className="mr-1 size-3.5" /> Adicionar endereço
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-1.5 size-4 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}

function OperationsDialog({ client, allClients, types, kind, onOpenChange }: EditorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const open = kind === "operations";
  const parents = useMemo(() => parentClientsOf(client.id, allClients), [client.id, allClients]);
  const activeTypes = useMemo(
    () => types.filter((type) => !type.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [types]
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [pendingType, setPendingType] = useState<ClientType | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setSelected(client.typeIds ?? []);
  }, [open, client]);

  const save = async () => {
    if (!user || parents.length) return;
    setSaving(true);
    try {
      const activeIds = new Set(activeTypes.map((type) => type.id));
      const preservedArchived = (client.typeIds ?? []).filter((id) => !activeIds.has(id));
      await updateClient(client, { typeIds: [...new Set([...preservedArchived, ...selected])] }, user);
      toast({ title: "Operações atualizadas" });
      onOpenChange(null);
    } catch {
      toast({ variant: "destructive", title: "Não foi possível atualizar as operações" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !saving && !next && onOpenChange(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar operações do cliente</DialogTitle>
            <DialogDescription>
              {parents.length
                ? `As operações deste cliente são herdadas de ${parents.map((item) => item.name).join(", ")}. Edite a ficha do cliente principal para alterá-las.`
                : "Adicionar ou remover cada operação exige confirmação."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {activeTypes.map((type) => {
              const inherited = parents.length > 0 && effectiveClientTypeIds(client, allClients).includes(type.id);
              const checked = inherited || selected.includes(type.id);
              return (
                <button
                  key={type.id}
                  type="button"
                  disabled={parents.length > 0}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    !checked && "border-border bg-background text-muted-foreground",
                    parents.length > 0 && "cursor-not-allowed opacity-70"
                  )}
                  style={checked ? clientTypeSelectedStyle(type) : undefined}
                  onClick={() => setPendingType(type)}
                  title={inherited ? `Operação herdada de ${parents.map((item) => item.name).join(", ")}` : checked ? "Remover operação" : "Adicionar operação"}
                >
                  {type.name}{inherited ? " · herdada" : ""}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(null)}>Fechar</Button>
            {!parents.length && <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-1.5 size-4 animate-spin" />} Salvar</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!pendingType} onOpenChange={(next) => !next && setPendingType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingType && selected.includes(pendingType.id) ? "Remover operação?" : "Adicionar operação?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingType && selected.includes(pendingType.id)
                ? `Deseja remover ${pendingType.name} de ${client.name}?`
                : `Deseja adicionar ${pendingType?.name ?? "esta operação"} a ${client.name}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingType) return;
                setSelected((current) =>
                  current.includes(pendingType.id)
                    ? current.filter((id) => id !== pendingType.id)
                    : [...current, pendingType.id]
                );
                setPendingType(null);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type AiFieldKey = keyof ExtractedClient;

const aiFieldLabels: Partial<Record<AiFieldKey, string>> = {
  name: "Nome completo",
  cpfCnpj: "CPF/CNPJ",
  personType: "Tipo de pessoa",
  phone: "Telefone principal",
  whatsapp: "WhatsApp",
  email: "E-mail principal",
  addressLine: "Logradouro",
  addressNumber: "Número",
  addressComplement: "Complemento",
  district: "Bairro",
  city: "Cidade",
  state: "UF",
  zipCode: "CEP",
  rg: "RG",
  rgIssuer: "Órgão emissor",
  motherName: "Nome da mãe",
  nationality: "Nacionalidade",
  profession: "Profissão",
  maritalStatus: "Estado civil",
  notes: "Informações gerais",
};

function currentAiValue(client: Client, key: AiFieldKey): string {
  const primaryAddress = initialAddresses(client).find((item) => item.isPrimary) ?? initialAddresses(client)[0];
  if (key === "phone") return client.phone ?? "";
  if (key === "email") return client.email ?? "";
  if (key === "personType") return client.type;
  if (key === "addressLine") return primaryAddress?.street ?? client.addressLine ?? "";
  if (key === "addressNumber") return primaryAddress?.number ?? "";
  if (key === "addressComplement") return primaryAddress?.complement ?? "";
  if (key === "district") return primaryAddress?.district ?? "";
  if (key === "city") return primaryAddress?.city ?? client.city ?? "";
  if (key === "state") return primaryAddress?.state ?? client.state ?? "";
  if (key === "zipCode") return primaryAddress?.zipCode ?? client.zipCode ?? "";
  return String(client[key as keyof Client] ?? "");
}

function AiFillDialog({ client, allClients, kind, onOpenChange }: EditorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const open = kind === "ai";
  const [text, setText] = useState("");
  const [detected, setDetected] = useState<ExtractedClient | null>(null);
  const [selected, setSelected] = useState<Set<AiFieldKey>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setText("");
    setDetected(null);
    setSelected(new Set());
  }, [open]);

  const entries = useMemo(
    () =>
      (Object.entries(detected ?? {}) as [AiFieldKey, unknown][])
        .filter(([key, value]) => aiFieldLabels[key] && String(value ?? "").trim())
        .map(([key, value]) => ({ key, value: String(value) })),
    [detected]
  );

  const analyze = async () => {
    if (!text.trim()) return;
    setAnalyzing(true);
    try {
      const result = await extractClientText(text.trim());
      const keys = (Object.entries(result) as [AiFieldKey, unknown][])
        .filter(([key, value]) => aiFieldLabels[key] && String(value ?? "").trim())
        .map(([key]) => key);
      setDetected(result);
      setSelected(new Set(keys));
    } catch (error) {
      toast({ variant: "destructive", title: "Erro na análise", description: aiErrorMessage(error) });
    } finally {
      setAnalyzing(false);
    }
  };

  const save = async () => {
    if (!user || !detected || selected.size === 0) return;
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      const scalarKeys: AiFieldKey[] = [
        "name", "personType", "rg", "rgIssuer", "motherName", "nationality",
        "profession", "maritalStatus",
      ];
      scalarKeys.forEach((key) => {
        if (!selected.has(key) || !detected[key]) return;
        if (key === "personType") patch.type = detected.personType;
        else patch[key] = String(detected[key]).trim();
      });
      if (selected.has("name") && detected.name) patch.nameLower = searchable(detected.name);
      if (selected.has("name") && detected.name) {
        const duplicateName = allClients.find(
          (candidate) =>
            candidate.id !== client.id &&
            !candidate.deleted &&
            searchable(candidate.name) === searchable(detected.name)
        );
        if (duplicateName) {
          throw new Error(
            `O nome detectado já pertence a ${duplicateName.name}${duplicateName.code ? ` (${duplicateName.code})` : ""}. Desmarque o nome para cadastrar os demais dados.`
          );
        }
      }

      if (selected.has("cpfCnpj") && detected.cpfCnpj) {
        const cpfCnpj = formatCpfCnpj(detected.cpfCnpj);
        if (!isValidCpfCnpj(cpfCnpj)) throw new Error("O CPF/CNPJ detectado é inválido.");
        const duplicate = cpfDuplicate(client, allClients, cpfCnpj);
        if (duplicate) throw new Error(`O CPF/CNPJ detectado já pertence a ${duplicate.name}.`);
        patch.cpfCnpj = cpfCnpj;
        patch.cpfCnpjDigits = digitsOnly(cpfCnpj);
      }

      if (selected.has("phone") && detected.phone) {
        const phones = initialPhones(client);
        const primaryIndex = Math.max(0, phones.findIndex((item) => item.isPrimary));
        phones[primaryIndex] = { ...phones[primaryIndex], number: detected.phone };
        patch.phones = onePrimary(phones);
        patch.phone = detected.phone;
        patch.phoneDigits = normalizePhone(detected.phone);
        if (!client.whatsapp && !selected.has("whatsapp")) {
          patch.whatsappDigits = normalizePhone(detected.phone);
        }
      }
      if (selected.has("whatsapp") && detected.whatsapp) {
        patch.whatsapp = detected.whatsapp;
        patch.whatsappDigits = normalizePhone(detected.whatsapp);
      }
      if (selected.has("email") && detected.email) {
        const emails = initialEmails(client);
        const primaryIndex = Math.max(0, emails.findIndex((item) => item.isPrimary));
        emails[primaryIndex] = { ...emails[primaryIndex], address: detected.email };
        patch.emails = onePrimary(emails);
        patch.email = detected.email;
      }

      const addressKeys: AiFieldKey[] = [
        "addressLine", "addressNumber", "addressComplement", "district", "city", "state", "zipCode",
      ];
      if (addressKeys.some((key) => selected.has(key) && detected[key])) {
        const addresses = initialAddresses(client);
        const primaryIndex = Math.max(0, addresses.findIndex((item) => item.isPrimary));
        const primary = { ...addresses[primaryIndex] };
        if (selected.has("addressLine") && detected.addressLine) primary.street = detected.addressLine;
        if (selected.has("addressNumber") && detected.addressNumber) primary.number = detected.addressNumber;
        if (selected.has("addressComplement") && detected.addressComplement) primary.complement = detected.addressComplement;
        if (selected.has("district") && detected.district) primary.district = detected.district;
        if (selected.has("city") && detected.city) primary.city = detected.city;
        if (selected.has("state") && detected.state) primary.state = detected.state.toUpperCase();
        if (selected.has("zipCode") && detected.zipCode) primary.zipCode = detected.zipCode;
        addresses[primaryIndex] = primary;
        patch.addresses = onePrimary(addresses);
        patch.addressLine = [primary.street, primary.number, primary.district].filter(Boolean).join(", ");
        patch.city = primary.city ?? "";
        patch.state = primary.state ?? "";
        patch.zipCode = primary.zipCode ?? "";
      }

      if (selected.has("notes") && detected.notes) {
        patch.notes = client.notes ? `${client.notes}\n${detected.notes}` : detected.notes;
      }

      await updateClient(client, patch, user);
      toast({ title: "Dados selecionados cadastrados" });
      onOpenChange(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Não foi possível cadastrar os dados",
        description: error instanceof Error ? error.message : "Confira os campos selecionados.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !analyzing && !saving && !next && onOpenChange(null)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4" /> Preencher dados com IA</DialogTitle>
          <DialogDescription>Cole o texto, analise e escolha exatamente quais dados serão cadastrados.</DialogDescription>
        </DialogHeader>
        {!detected ? (
          <div className="space-y-2">
            <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={10} placeholder="Cole ficha, documento, procuração ou mensagem do cliente…" disabled={analyzing} />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(null)} disabled={analyzing}>Cancelar</Button>
              <Button onClick={analyze} disabled={analyzing || !text.trim()}>
                {analyzing ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Sparkles className="mr-1.5 size-4" />} Analisar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.length ? (
              <div className="overflow-hidden rounded-md border">
                <div className="grid grid-cols-[2rem_minmax(0,.8fr)_minmax(0,1fr)_minmax(0,1fr)] border-b bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
                  <span />
                  <span>Campo</span>
                  <span>Atual</span>
                  <span>Detectado</span>
                </div>
                {entries.map((entry) => (
                  <label key={entry.key} className="grid cursor-pointer grid-cols-[2rem_minmax(0,.8fr)_minmax(0,1fr)_minmax(0,1fr)] items-center border-b px-2 py-1.5 text-xs last:border-b-0 hover:bg-muted/20">
                    <Checkbox checked={selected.has(entry.key)} onCheckedChange={(checked) => setSelected((current) => {
                      const next = new Set(current);
                      if (checked) next.add(entry.key); else next.delete(entry.key);
                      return next;
                    })} />
                    <span className="font-medium">{aiFieldLabels[entry.key]}</span>
                    <span className="truncate text-muted-foreground">{currentAiValue(client, entry.key) || "Não cadastrado"}</span>
                    <span className="truncate">{entry.value}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhum dado cadastral foi detectado.</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDetected(null); setSelected(new Set()); }}>
                <RotateCcw className="mr-1.5 size-4" /> Analisar outro texto
              </Button>
              <Button onClick={save} disabled={saving || selected.size === 0}>
                {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />} Cadastrar selecionados
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ClientInlineEditors(props: EditorProps) {
  return (
    <>
      <ScalarEditDialog {...props} />
      <PhonesDialog {...props} />
      <EmailsDialog {...props} />
      <AddressesDialog {...props} />
      <OperationsDialog {...props} />
      <AiFillDialog {...props} />
    </>
  );
}
