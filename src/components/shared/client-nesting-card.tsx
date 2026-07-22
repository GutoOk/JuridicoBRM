"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { CornerDownRight, Link2, Loader2, Plus, Unlink, UserRoundCheck } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { addNestedClient, removeNestedClient, updateNestedClientRelationship } from "@/lib/db-actions";
import { clientMapOf, nestedClientsOf, parentClientsOf, wouldCreateNestingCycle } from "@/lib/client-nesting";
import { digitsOnly, formatCpfCnpj, isValidCpfCnpj, normalizePhone, searchable } from "@/lib/normalize";
import type { Client } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CodeBadge } from "@/components/shared/badges";
import { HelpTip } from "@/components/shared/page-shell";

type LinkDirection = "nested" | "principal";
type PendingLink = { candidate: Client; direction: LinkDirection };

export function ClientNestingCard({ client, clients }: { client: Client; clients: Client[] }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null);
  const [relationship, setRelationship] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickRelationship, setQuickRelationship] = useState("");
  const [quickClient, setQuickClient] = useState({ name: "", cpfCnpj: "", phone: "" });

  const clientMap = useMemo(() => clientMapOf(clients), [clients]);
  const nestedClients = nestedClientsOf(client, clientMap).sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
  const parentClients = parentClientsOf(client.id, clients).sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
  const hasLinks = nestedClients.length > 0 || parentClients.length > 0;
  const normalizedSearch = searchable(search.trim());
  const candidates = normalizedSearch
    ? clients
        .filter((candidate) =>
          !candidate.deleted &&
          candidate.id !== client.id &&
          !(client.nestedClientIds ?? []).includes(candidate.id) &&
          !(candidate.nestedClientIds ?? []).includes(client.id) &&
          searchable(`${candidate.name} ${candidate.code ?? ""} ${candidate.cpfCnpj ?? ""}`).includes(normalizedSearch)
        )
        .sort((first, second) => first.name.localeCompare(second.name, "pt-BR"))
        .slice(0, 10)
    : [];

  const beginLink = (candidate: Client, direction: LinkDirection) => {
    const parentId = direction === "nested" ? client.id : candidate.id;
    const nestedId = direction === "nested" ? candidate.id : client.id;
    if (wouldCreateNestingCycle(parentId, nestedId, clientMap)) {
      toast({
        variant: "destructive",
        title: "Este vínculo criaria um ciclo",
        description: "Os clientes já estão ligados em uma cadeia incompatível com esta escolha.",
      });
      return;
    }
    setPendingLink({ candidate, direction });
    setRelationship("");
    setSearchOpen(false);
  };

  const confirmLink = async () => {
    if (!user || !pendingLink) return;
    const parent = pendingLink.direction === "nested" ? client : pendingLink.candidate;
    const nested = pendingLink.direction === "nested" ? pendingLink.candidate : client;
    setSavingId(pendingLink.candidate.id);
    try {
      await addNestedClient(parent.id, nested.id, user, relationship);
      toast({ title: "Vínculo criado", description: `${nested.name} foi vinculado abaixo de ${parent.name}.` });
      setPendingLink(null);
      setRelationship("");
      setSearch("");
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao criar vínculo" });
    } finally {
      setSavingId(null);
    }
  };

  const createAndLink = async () => {
    if (!user || !quickClient.name.trim()) return;
    const cpfCnpjDigits = digitsOnly(quickClient.cpfCnpj);
    if (cpfCnpjDigits && !isValidCpfCnpj(cpfCnpjDigits)) {
      toast({ variant: "destructive", title: "CPF ou CNPJ inválido" });
      return;
    }
    const duplicate = cpfCnpjDigits
      ? clients.find((item) => digitsOnly(item.cpfCnpjDigits || item.cpfCnpj || "") === cpfCnpjDigits)
      : undefined;
    if (duplicate) {
      toast({
        variant: "destructive",
        title: "CPF ou CNPJ já cadastrado",
        description: duplicate.deleted ? "O cadastro está ocultado e deve ser restaurado." : duplicate.name,
      });
      return;
    }

    setQuickSaving(true);
    try {
      const name = quickClient.name.trim();
      const phone = quickClient.phone.trim();
      const created = await addDoc(collection(db, "clients"), {
        name,
        nameLower: searchable(name),
        code: "",
        cpfCnpj: cpfCnpjDigits ? formatCpfCnpj(cpfCnpjDigits) : "",
        cpfCnpjDigits,
        type: cpfCnpjDigits.length === 14 ? "Pessoa Jurídica" : "Pessoa Física",
        phone,
        phoneDigits: normalizePhone(phone),
        phones: phone ? [{ number: phone, description: "", isPrimary: true }] : [],
        emails: [],
        addresses: [],
        typeIds: client.typeIds ?? [],
        processIds: [],
        createdAt: serverTimestamp(),
        createdBy: user.name,
        updatedAt: serverTimestamp(),
        updatedBy: user.name,
        deleted: false,
        deletedAt: null,
        deletedBy: null,
      });
      await addNestedClient(client.id, created.id, user, quickRelationship);
      setQuickClient({ name: "", cpfCnpj: "", phone: "" });
      setQuickRelationship("");
      setQuickOpen(false);
      toast({ title: "Cliente criado e vinculado", description: `${name} ficou abaixo de ${client.name}.` });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao criar o cliente" });
    } finally {
      setQuickSaving(false);
    }
  };

  const remove = async (nested: Client) => {
    if (!user) return;
    setRemovingId(nested.id);
    try {
      await removeNestedClient(client.id, nested.id, user);
      toast({ title: "Vínculo removido", description: nested.name });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao remover vínculo" });
    } finally {
      setRemovingId(null);
    }
  };

  const relationParent = pendingLink?.direction === "nested" ? client : pendingLink?.candidate;
  const relationNested = pendingLink?.direction === "nested" ? pendingLink?.candidate : client;

  return (
    <Card className="surface">
      <CardContent className="space-y-3 p-3">
        <div className={`flex items-center gap-2 ${hasLinks ? "justify-between" : "justify-end"}`}>
          {hasLinks && (
            <p className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="size-4 text-muted-foreground" /> Vínculos entre clientes
            </p>
          )}
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSearchOpen(true)}>
            <Plus className="mr-1 size-3.5" /> Vincular
          </Button>
        </div>

        {parentClients.length > 0 && (
          <section className="space-y-1.5">
            <p className="text-xs font-medium">Cliente principal</p>
            {parentClients.map((parent) => (
              <div key={parent.id} className="rounded-md border bg-muted/15 p-2">
                <Link href={`/dashboard/clients/${parent.id}`} className="flex items-center gap-2 text-xs font-medium hover:underline">
                  <CodeBadge code={parent.code} /> <span className="truncate">{parent.name}</span>
                </Link>
                <div className="mt-1 flex items-center gap-2 rounded bg-amber-50/70 px-2 py-1 text-[11px] dark:bg-amber-950/15">
                  <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {client.name} {parent.nestedClientRelationships?.[client.id] ? `é ${parent.nestedClientRelationships[client.id]} de ${parent.name}` : `está abaixo de ${parent.name}`}
                  </span>
                </div>
              </div>
            ))}
          </section>
        )}

        {nestedClients.length > 0 && (
          <section className="space-y-1.5">
            <p className="text-xs font-medium">Clientes aninhados</p>
            {nestedClients.map((nested) => (
              <div key={nested.id} className="flex items-center gap-2 rounded-md border border-amber-200/60 bg-amber-50/70 px-2 py-1.5 dark:border-amber-900/40 dark:bg-amber-950/15">
                <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" />
                <CodeBadge code={client.code} />
                <div className="min-w-0 flex-1">
                  <Link href={`/dashboard/clients/${nested.id}`} className="block truncate text-xs font-medium hover:underline">{nested.name}</Link>
                  <RelationshipInput
                    value={client.nestedClientRelationships?.[nested.id] ?? ""}
                    parentName={client.name}
                    nestedName={nested.name}
                    onSave={(value) => user ? updateNestedClientRelationship(client.id, nested.id, value, user).catch((error) => {
                      console.error(error);
                      toast({ variant: "destructive", title: "Erro ao salvar descrição do vínculo" });
                    }) : undefined}
                  />
                </div>
                <HelpTip label="Remove somente o vínculo; os dois cadastros permanecem.">
                  <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => remove(nested)} disabled={removingId === nested.id}>
                    {removingId === nested.id ? <Loader2 className="size-3.5 animate-spin" /> : <Unlink className="size-3.5" />}
                  </Button>
                </HelpTip>
              </div>
            ))}
          </section>
        )}
      </CardContent>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vincular cliente a {client.name}</DialogTitle>
          </DialogHeader>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, código ou CPF…" autoFocus />
          <div className="max-h-72 overflow-y-auto rounded-md border p-1">
            {candidates.map((candidate) => (
              <div key={candidate.id} className="flex flex-wrap items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted">
                <CodeBadge code={candidate.code} />
                <span className="min-w-36 flex-1 truncate font-medium">{candidate.name}</span>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => beginLink(candidate, "principal")}>
                  <UserRoundCheck className="mr-1 size-3.5" /> Tornar principal
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => beginLink(candidate, "nested")}>
                  <CornerDownRight className="mr-1 size-3.5" /> Vincular
                </Button>
              </div>
            ))}
            {!normalizedSearch && <p className="px-2 py-5 text-center text-xs text-muted-foreground">Digite para localizar uma pessoa.</p>}
            {normalizedSearch && candidates.length === 0 && <p className="px-2 py-5 text-center text-xs text-muted-foreground">Nenhum cliente disponível.</p>}
          </div>
          <DialogFooter className="justify-between sm:justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setSearchOpen(false); setQuickOpen(true); }}>
              <Plus className="mr-1 size-3.5" /> Novo cliente para vincular
            </Button>
            <Button type="button" variant="outline" onClick={() => setSearchOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingLink} onOpenChange={(open) => !open && setPendingLink(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Informar a relação</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">
              O que <span className="font-medium">{relationNested?.name}</span> é de <span className="font-medium">{relationParent?.name}</span>?
            </p>
            <Input value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder="Ex.: filho, cônjuge, sócio…" autoFocus />
            <p className="text-[11px] text-muted-foreground">A informação ficará junto de {relationNested?.name}, que é o cliente do nível de baixo.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingLink(null)}>Cancelar</Button>
            <Button type="button" onClick={confirmLink} disabled={!!savingId || !relationship.trim()}>
              {savingId && <Loader2 className="mr-1 size-3.5 animate-spin" />} Confirmar vínculo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Cadastro rápido para vincular</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">O novo cliente ficará abaixo de {client.name}. Complete os demais dados depois.</p>
          <div className="grid gap-3">
            <div><Label className="text-xs">Nome *</Label><Input value={quickClient.name} onChange={(event) => setQuickClient((current) => ({ ...current, name: event.target.value }))} autoFocus /></div>
            <div><Label className="text-xs">CPF ou CNPJ</Label><Input value={quickClient.cpfCnpj} onChange={(event) => setQuickClient((current) => ({ ...current, cpfCnpj: event.target.value }))} onBlur={() => setQuickClient((current) => ({ ...current, cpfCnpj: formatCpfCnpj(current.cpfCnpj) }))} /></div>
            <div><Label className="text-xs">Telefone</Label><Input value={quickClient.phone} onChange={(event) => setQuickClient((current) => ({ ...current, phone: event.target.value }))} /></div>
            <div><Label className="text-xs">O que {quickClient.name.trim() || "o novo cliente"} é de {client.name}?</Label><Input value={quickRelationship} onChange={(event) => setQuickRelationship(event.target.value)} placeholder="Ex.: filho, cônjuge, sócio…" /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setQuickOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={createAndLink} disabled={quickSaving || !quickClient.name.trim() || !quickRelationship.trim()}>{quickSaving && <Loader2 className="mr-1 size-3.5 animate-spin" />}Criar e vincular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function RelationshipInput({ value, parentName, nestedName, onSave }: { value: string; parentName: string; nestedName: string; onSave: (value: string) => Promise<void> | undefined }) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const next = draft.trim();
    if (next === value.trim()) return;
    if (!next) {
      setDraft(value);
      return;
    }
    setSaving(true);
    try { await onSave(next); } finally { setSaving(false); }
  };

  return (
    <div className="mt-0.5 flex items-center gap-1">
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
        placeholder={`O que ${nestedName} é de ${parentName}?`}
        className="h-6 border-transparent bg-transparent px-1 text-[11px] text-muted-foreground hover:border-border focus:bg-background"
        title={`O que ${nestedName} é de ${parentName}?`}
      />
      {saving && <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />}
    </div>
  );
}
