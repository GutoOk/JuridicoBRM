"use client";

import { useMemo, useState } from "react";
import { arrayUnion, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Link2Off, Loader2, Plus, Search, UserPlus } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { useCollection } from "@/hooks/use-collection";
import { db } from "@/lib/firebase";
import { ensurePrivateClientType } from "@/lib/private-cases";
import {
  applyLinkDecision,
  clearLinkDecision,
  findProcessByNumber,
  publicationLinkStatus,
  searchClientsByTerm,
  suggestClientsForPublication,
} from "@/lib/publication-links";
import {
  createClientFromPublication,
  createProcessFromPublication,
} from "@/lib/publication-actions";
import type { Client, ClientType, Process, Publication, UserProfile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, FilterChip, HelpTip } from "@/components/shared/page-shell";

/**
 * Vínculo da publicação com o acervo do escritório.
 *
 * A decisão vale para o **número do processo**, não para a intimação isolada:
 * uma vez resolvido, tudo que aquele processo publicar já entra vinculado. Por
 * isso nada aqui é automático — o sistema sugere e a pessoa confirma.
 */
export function PublicationLinkDialog({
  publication,
  clients,
  processes,
  users,
  user,
  open,
  onOpenChange,
}: {
  publication: Publication | null;
  clients: Client[];
  processes: Process[];
  users: UserProfile[];
  user: UserProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [criandoCliente, setCriandoCliente] = useState(false);
  const [novoCliente, setNovoCliente] = useState({
    name: "",
    cpfCnpj: "",
    type: "Pessoa Física" as Client["type"],
  });
  const [donoParticular, setDonoParticular] = useState("");
  const [titularidade, setTitularidade] = useState<"sociedade" | "particular">("sociedade");
  const [salvando, setSalvando] = useState(false);
  const { data: clientTypes } = useCollection<ClientType>("clientTypes");

  const processoEncontrado = useMemo(
    () => (publication ? findProcessByNumber(publication.numeroProcessoDigits, processes) : null),
    [publication, processes]
  );

  const sugestoes = useMemo(
    () => (publication ? suggestClientsForPublication(publication, clients) : []),
    [publication, clients]
  );

  const resultadosBusca = useMemo(
    () => searchClientsByTerm(clients, busca),
    [busca, clients]
  );

  const clientMap = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const selecionados = selectedClientIds
    .map((id) => clientMap.get(id))
    .filter((client): client is Client => !!client);

  const advogados = users.filter((usuario) => usuario.active && usuario.role === "admin");

  const fechar = () => {
    setSelectedClientIds([]);
    setBusca("");
    setCriandoCliente(false);
    setNovoCliente({ name: "", cpfCnpj: "", type: "Pessoa Física" });
    setDonoParticular("");
    setTitularidade("sociedade");
    onOpenChange(false);
  };

  const alternarCliente = (id: string) =>
    setSelectedClientIds((atual) =>
      atual.includes(id) ? atual.filter((outro) => outro !== id) : [...atual, id]
    );

  const confirmarProcessoExistente = async () => {
    if (!publication || !processoEncontrado) return;
    setSalvando(true);
    try {
      const total = await applyLinkDecision(
        publication.numeroProcessoDigits ?? "",
        {
          kind: "escritorio",
          processId: processoEncontrado.id,
          processNumber: processoEncontrado.processNumber,
          clientIds: processoEncontrado.clientIds ?? [],
          clientNames: processoEncontrado.clientNames ?? [],
        },
        user
      );
      toast({
        title: "Publicação vinculada",
        description: `${total} publicação(ões) deste processo passaram a aparecer nos andamentos dele.`,
      });
      fechar();
    } catch (erro) {
      toast({
        variant: "destructive",
        title: "Não foi possível vincular",
        description: erro instanceof Error ? erro.message : undefined,
      });
    } finally {
      setSalvando(false);
    }
  };

  const criarCliente = async () => {
    setSalvando(true);
    try {
      const dono = advogados.find((advogado) => advogado.id === donoParticular);
      const typeIds =
        titularidade === "particular" && dono
          ? [await ensurePrivateClientType({ id: dono.id, name: dono.name }, clientTypes ?? [], user)]
          : [];
      const criado = await createClientFromPublication({ ...novoCliente, typeIds }, clients, user);
      setSelectedClientIds((atual) => [...atual, criado.id]);
      setCriandoCliente(false);
      setNovoCliente({ name: "", cpfCnpj: "", type: "Pessoa Física" });
      toast({ title: "Cliente cadastrado", description: criado.name });
    } catch (erro) {
      toast({
        variant: "destructive",
        title: "Não foi possível cadastrar",
        description: erro instanceof Error ? erro.message : undefined,
      });
    } finally {
      setSalvando(false);
    }
  };

  const criarProcessoEVincular = async () => {
    if (!publication) return;
    const dono = advogados.find((advogado) => advogado.id === donoParticular);
    if (titularidade === "particular" && !dono) {
      toast({ variant: "destructive", title: "Escolha o advogado dono do processo particular." });
      return;
    }
    setSalvando(true);
    try {
      if (dono && titularidade === "particular") {
        // Cliente particular entra pela operação do próprio advogado, o que o
        // mantém fora das filas da sociedade na Operação.
        const typeId = await ensurePrivateClientType(
          { id: dono.id, name: dono.name },
          clientTypes ?? [],
          user
        );
        for (const client of selecionados) {
          if ((client.typeIds ?? []).includes(typeId)) continue;
          await updateDoc(doc(db, "clients", client.id), {
            typeIds: arrayUnion(typeId),
            updatedAt: serverTimestamp(),
            updatedBy: user.name,
          });
        }
      }

      const criado = await createProcessFromPublication(
        publication,
        selecionados.map((client) => ({ id: client.id, name: client.name })),
        user,
        titularidade === "particular" && dono
          ? { ownership: "particular", owner: { id: dono.id, name: dono.name } }
          : { ownership: "sociedade" }
      );
      // Mesmo particular, o processo cadastrado recebe a publicação: é o que faz
      // ela aparecer nos andamentos dele. O cinza da lista vem da titularidade
      // do processo, não do estado do vínculo.
      const total = await applyLinkDecision(
        publication.numeroProcessoDigits ?? "",
        {
          kind: "escritorio",
          processId: criado.id,
          processNumber: criado.processNumber,
          clientIds: selecionados.map((client) => client.id),
          clientNames: selecionados.map((client) => client.name),
        },
        user
      );
      toast({
        title:
          titularidade === "particular"
            ? "Processo particular cadastrado e vinculado"
            : "Processo cadastrado e vinculado",
        description: `${criado.processNumber} — ${total} publicação(ões) vinculada(s).`,
      });
      fechar();
    } catch (erro) {
      toast({
        variant: "destructive",
        title: "Não foi possível cadastrar o processo",
        description: erro instanceof Error ? erro.message : undefined,
      });
    } finally {
      setSalvando(false);
    }
  };

  const marcarParticular = async () => {
    if (!publication || !donoParticular) return;
    const dono = advogados.find((advogado) => advogado.id === donoParticular);
    if (!dono) return;
    setSalvando(true);
    try {
      const total = await applyLinkDecision(
        publication.numeroProcessoDigits ?? "",
        { kind: "particular", ownerUserId: dono.id, ownerUserName: dono.name },
        user
      );
      toast({
        title: "Processo marcado como particular",
        description: `${total} publicação(ões) atribuída(s) a ${dono.name}.`,
      });
      fechar();
    } catch (erro) {
      toast({
        variant: "destructive",
        title: "Não foi possível marcar",
        description: erro instanceof Error ? erro.message : undefined,
      });
    } finally {
      setSalvando(false);
    }
  };

  const desfazer = async () => {
    if (!publication) return;
    setSalvando(true);
    try {
      const total = await clearLinkDecision(publication.numeroProcessoDigits ?? "", user);
      toast({
        title: "Vínculo desfeito",
        description: `${total} publicação(ões) voltaram para a fila sem vínculo.`,
      });
      fechar();
    } catch (erro) {
      toast({
        variant: "destructive",
        title: "Não foi possível desfazer",
        description: erro instanceof Error ? erro.message : undefined,
      });
    } finally {
      setSalvando(false);
    }
  };

  if (!publication) return null;

  const semNumero = !publication.numeroProcessoDigits;
  const jaResolvida = publicationLinkStatus(publication) !== "pendente";

  return (
    <Dialog open={open} onOpenChange={(aberto) => (aberto ? onOpenChange(true) : fechar())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            Vincular publicação — {publication.numeroProcessoMascara || "sem número"}
          </DialogTitle>
          <DialogDescription>
            A decisão vale para todas as publicações deste número de processo, inclusive as que
            chegarem depois.
          </DialogDescription>
        </DialogHeader>

        {semNumero ? (
          <EmptyState
            title="Publicação sem número de processo"
            description="O tribunal não informou o número, então não há como vincular por processo. Trate pela triagem."
          />
        ) : jaResolvida ? (
          <div className="space-y-3">
            <div className="surface p-3 text-[13px]">
              {publicationLinkStatus(publication) === "particular" ? (
                <p>
                  Processo particular de <strong>{publication.privateOwnerName}</strong>. As
                  publicações dele não entram no acervo da sociedade.
                </p>
              ) : (
                <p>
                  Vinculada ao processo <strong>{publication.processNumber}</strong>
                  {(publication.clientNames ?? []).length > 0 && (
                    <> — {(publication.clientNames ?? []).join(", ")}</>
                  )}
                  .
                </p>
              )}
            </div>
            <HelpTip label="Solta todas as publicações deste processo de volta para a fila sem vínculo.">
              <Button variant="outline" onClick={desfazer} disabled={salvando}>
                {salvando ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Link2Off className="mr-2 size-4" />
                )}
                Desfazer vínculo
              </Button>
            </HelpTip>
          </div>
        ) : (
          <div className="space-y-4">
            {processoEncontrado ? (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Processo já cadastrado</h3>
                <div className="surface p-3 text-[13px]">
                  <p className="font-code">{processoEncontrado.processNumber}</p>
                  <p className="text-muted-foreground">
                    {(processoEncontrado.clientNames ?? []).join(", ") || "sem cliente vinculado"}
                  </p>
                </div>
                <Button onClick={confirmarProcessoExistente} disabled={salvando}>
                  {salvando && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Confirmar vínculo
                </Button>
              </section>
            ) : (
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium">Nenhum processo com este número</h3>
                  <p className="text-xs text-muted-foreground">
                    Escolha o cliente e o sistema cadastra o processo com os dados da publicação.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>De quem é o processo</Label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <FilterChip
                      active={titularidade === "sociedade"}
                      onClick={() => setTitularidade("sociedade")}
                    >
                      Da sociedade
                    </FilterChip>
                    <HelpTip label="Caso pessoal do advogado, fora da sociedade. O processo entra no sistema marcado como particular e aparece sempre com fundo cinza.">
                      <FilterChip
                        active={titularidade === "particular"}
                        onClick={() => setTitularidade("particular")}
                      >
                        Particular
                      </FilterChip>
                    </HelpTip>
                    {titularidade === "particular" && (
                      <Select value={donoParticular} onValueChange={setDonoParticular}>
                        <SelectTrigger className="h-7 w-56">
                          <SelectValue placeholder="Advogado dono" />
                        </SelectTrigger>
                        <SelectContent>
                          {advogados.map((advogado) => (
                            <SelectItem key={advogado.id} value={advogado.id}>
                              {advogado.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  {titularidade === "particular" && (
                    <p className="text-xs text-muted-foreground">
                      O cliente recebe a operação particular do advogado, ficando fora das filas da
                      sociedade na Operação.
                    </p>
                  )}
                </div>

                {publication.destinatarios && publication.destinatarios.length > 0 && (
                  <p className="text-[13px]">
                    <span className="text-muted-foreground">Partes na publicação: </span>
                    {publication.destinatarios.join(", ")}
                  </p>
                )}

                {sugestoes.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Clientes que parecem ser a parte</Label>
                    {sugestoes.map((sugestao) => (
                      <label
                        key={sugestao.client.id}
                        className="flex cursor-pointer items-center gap-2 rounded border p-2 text-[13px]"
                      >
                        <Checkbox
                          checked={selectedClientIds.includes(sugestao.client.id)}
                          onCheckedChange={() => alternarCliente(sugestao.client.id)}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {sugestao.client.name}
                          {sugestao.client.code && (
                            <span className="text-muted-foreground"> · {sugestao.client.code}</span>
                          )}
                        </span>
                        <span
                          className={
                            sugestao.match === "exato"
                              ? "rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800"
                              : "rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800"
                          }
                        >
                          {sugestao.match === "exato" ? "nome igual" : "parecido — confira"}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Procurar outro cliente já cadastrado</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Nome, código ou CPF/CNPJ"
                      className="h-8 pl-8"
                    />
                  </div>
                  {resultadosBusca.map((client) => (
                    <label
                      key={client.id}
                      className="flex cursor-pointer items-center gap-2 rounded border p-2 text-[13px]"
                    >
                      <Checkbox
                        checked={selectedClientIds.includes(client.id)}
                        onCheckedChange={() => alternarCliente(client.id)}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {client.name}
                        {client.code && (
                          <span className="text-muted-foreground"> · {client.code}</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>

                {criandoCliente ? (
                  <div className="space-y-2 rounded border p-3">
                    <p className="text-[13px] text-muted-foreground">
                      A publicação não traz documento, então o CPF/CNPJ é obrigatório aqui — é ele
                      que evita cadastro duplicado.
                    </p>
                    <div className="space-y-1.5">
                      <Label>Nome</Label>
                      <Input
                        value={novoCliente.name}
                        onChange={(e) => setNovoCliente({ ...novoCliente, name: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-[1fr_170px] gap-2">
                      <div className="space-y-1.5">
                        <Label>CPF/CNPJ</Label>
                        <Input
                          value={novoCliente.cpfCnpj}
                          onChange={(e) =>
                            setNovoCliente({ ...novoCliente, cpfCnpj: e.target.value })
                          }
                          inputMode="numeric"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Tipo</Label>
                        <Select
                          value={novoCliente.type}
                          onValueChange={(value) =>
                            setNovoCliente({ ...novoCliente, type: value as Client["type"] })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Pessoa Física">Pessoa Física</SelectItem>
                            <SelectItem value="Pessoa Jurídica">Pessoa Jurídica</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={criarCliente}
                        disabled={salvando || !novoCliente.name.trim() || !novoCliente.cpfCnpj.trim()}
                      >
                        {salvando && <Loader2 className="mr-2 size-3.5 animate-spin" />}
                        Cadastrar e selecionar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setCriandoCliente(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCriandoCliente(true);
                      setNovoCliente({
                        name: publication.destinatarios?.[0] ?? "",
                        cpfCnpj: "",
                        type: "Pessoa Física",
                      });
                    }}
                  >
                    <UserPlus className="mr-2 size-3.5" /> Cadastrar cliente novo
                  </Button>
                )}

                {selecionados.length > 0 && (
                  <p className="text-[13px]">
                    <span className="text-muted-foreground">Cliente(s) do processo: </span>
                    {selecionados.map((client) => client.name).join(", ")}
                  </p>
                )}

                <HelpTip label="Cadastra o processo com número, classe, órgão e tribunal da publicação, vinculado aos clientes escolhidos.">
                  <Button
                    onClick={criarProcessoEVincular}
                    disabled={
                      salvando ||
                      selecionados.length === 0 ||
                      (titularidade === "particular" && !donoParticular)
                    }
                  >
                    {salvando ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 size-4" />
                    )}
                    {titularidade === "particular"
                      ? "Cadastrar processo particular e vincular"
                      : "Cadastrar processo e vincular"}
                  </Button>
                </HelpTip>
              </section>
            )}

            <section className="space-y-2 border-t pt-3">
              <h3 className="text-sm font-medium">Só marcar como particular</h3>
              <p className="text-xs text-muted-foreground">
                Atalho para quando o advogado não quer o processo cadastrado: a publicação sai da
                fila de pendências e fica registrada em nome dele, sem criar processo nem cliente.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-52 space-y-1.5">
                  <Label>Advogado responsável</Label>
                  <Select value={donoParticular} onValueChange={setDonoParticular}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {advogados.map((advogado) => (
                        <SelectItem key={advogado.id} value={advogado.id}>
                          {advogado.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" onClick={marcarParticular} disabled={salvando || !donoParticular}>
                  {salvando && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Marcar como particular
                </Button>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
