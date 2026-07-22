"use client";

import { useState } from "react";
import { doc, setDoc, updateDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { Loader2, Plus, KeyRound, Trash2, ShieldCheck, UserX, UserCheck } from "lucide-react";
import { db, auth, createAuthUser } from "@/lib/firebase";
import { useAuth, authErrorMessage } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile, LegacyUser, Role } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { EmptyState, HelpTip, PageHeader } from "@/components/shared/page-shell";

type UserDoc = UserProfile & LegacyUser;

export default function UsersPage() {
  const { user: me, isAdmin } = useAuth();
  const { data: users } = useCollection<UserDoc>("users");
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserDoc | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "operator" as Role });
  const [saving, setSaving] = useState(false);
  const [confirmLegacyClean, setConfirmLegacyClean] = useState(false);
  const [showHiddenLegacy, setShowHiddenLegacy] = useState(false);

  if (!isAdmin) {
    return (
      <div className="page-shell">
        <EmptyState
          title="Acesso restrito"
          description="Somente administradores podem gerenciar usuários."
        />
      </div>
    );
  }

  const realUsers = (users ?? []).filter((u) => !!u.email);
  const allLegacyUsers = (users ?? []).filter((u) => !u.email);
  const legacyUsers = allLegacyUsers.filter((u) => !u.deleted);
  const hiddenLegacyUsers = allLegacyUsers.filter((u) => u.deleted);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", email: "", password: "", role: "operator" });
    setDialogOpen(true);
  };

  const openEdit = (u: UserDoc) => {
    setEditing(u);
    setForm({
      name: u.name ?? "",
      email: u.email ?? "",
      password: "",
      role: u.role === "admin" ? "admin" : "operator",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, "users", editing.id), { name: form.name.trim(), role: form.role });
        toast({ title: "Usuário atualizado" });
      } else {
        if (!form.email.trim() || form.password.length < 6) {
          toast({
            variant: "destructive",
            title: "Dados incompletos",
            description: "Informe e-mail e uma senha de pelo menos 6 caracteres.",
          });
          setSaving(false);
          return;
        }
        const uid = await createAuthUser(form.email, form.password);
        await setDoc(doc(db, "users", uid), {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          role: form.role,
          active: true,
          createdAt: serverTimestamp(),
        });
        toast({ title: "Usuário criado", description: `${form.name} já pode entrar com o e-mail cadastrado.` });
      }
      setDialogOpen(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Erro", description: authErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: UserDoc) => {
    try {
      await updateDoc(doc(db, "users", u.id), { active: u.active === false });
      toast({ title: u.active === false ? "Usuário reativado" : "Usuário desativado" });
    } catch {
      toast({ variant: "destructive", title: "Erro ao alterar status" });
    }
  };

  const sendReset = async (u: UserDoc) => {
    if (!u.email) return;
    try {
      await sendPasswordResetEmail(auth, u.email);
      toast({ title: "E-mail de redefinição enviado", description: u.email });
    } catch (err) {
      toast({ variant: "destructive", title: "Erro", description: authErrorMessage(err) });
    }
  };

  const cleanLegacy = async () => {
    if (!me) return;
    try {
      const batch = writeBatch(db);
      legacyUsers.forEach((u) => batch.update(doc(db, "users", u.id), {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: me.name,
      }));
      await batch.commit();
      toast({ title: "Contas antigas ocultadas", description: `${legacyUsers.length} registros preservados para auditoria.` });
    } catch {
      toast({ variant: "destructive", title: "Erro ao ocultar contas antigas" });
    }
    setConfirmLegacyClean(false);
  };

  const restoreLegacy = async () => {
    try {
      const batch = writeBatch(db);
      hiddenLegacyUsers.forEach((u) => batch.update(doc(db, "users", u.id), {
        deleted: false,
        deletedAt: null,
        deletedBy: null,
      }));
      await batch.commit();
      toast({ title: "Contas antigas restauradas", description: `${hiddenLegacyUsers.length} registro(s) visível(is) novamente.` });
    } catch {
      toast({ variant: "destructive", title: "Erro ao restaurar contas antigas" });
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="administração"
        title="Usuários"
        description="Contas de acesso ao sistema. Operadores atualizam cadastros e checklists; administradores também gerenciam configurações e importações."
      >
        <HelpTip label="Cria um acesso por e-mail e senha provisória para novo integrante da equipe.">
        <Button onClick={openNew}>
          <Plus className="mr-2 size-4" /> Novo usuário
        </Button>
        </HelpTip>
      </PageHeader>

      {hiddenLegacyUsers.length > 0 && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setShowHiddenLegacy((current) => !current)}>
            <Trash2 className="mr-1 size-3.5" /> {showHiddenLegacy ? "Ocultar apagados" : `Ver apagados (${hiddenLegacyUsers.length})`}
          </Button>
        </div>
      )}

      <Card className="surface">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="ledger-header">
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users === null && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}
              {realUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    {u.role === "admin" ? (
                      <Badge className="gap-1">
                        <ShieldCheck className="size-3" /> Administrador
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Operador</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.active === false ? (
                      <Badge variant="destructive">Desativado</Badge>
                    ) : (
                      <Badge variant="outline" className="border-emerald-500 text-emerald-600">
                        Ativo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="flex justify-end gap-1 text-right">
                    <HelpTip label="Altera nome e papel do usuário." side="left">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                      Editar
                    </Button>
                    </HelpTip>
                    <HelpTip label="Envia e-mail para a pessoa criar uma nova senha." side="left">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => sendReset(u)}
                    >
                      <KeyRound className="size-4" />
                    </Button>
                    </HelpTip>
                    {u.id !== me?.id && (
                      <HelpTip label={u.active === false ? "Reativa o acesso deste usuário." : "Desativa o acesso sem apagar o cadastro."} side="left">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive(u)}
                      >
                        {u.active === false ? (
                          <UserCheck className="size-4" />
                        ) : (
                          <UserX className="size-4 text-destructive" />
                        )}
                      </Button>
                      </HelpTip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {users !== null && realUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    <EmptyState
                      title="Nenhum usuário cadastrado ainda"
                      description="Crie o primeiro acesso para liberar o trabalho da equipe."
                      className="border-0 bg-transparent"
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {legacyUsers.length > 0 && (
        <Card className="surface border-amber-400">
          <CardHeader>
            <CardTitle className="text-base">Contas do sistema antigo ({legacyUsers.length})</CardTitle>
            <CardDescription>
              Estas contas usavam senha sem criptografia e não funcionam mais para login. Você pode ocultá-las sem apagar o histórico:{" "}
              {legacyUsers.map((u) => u.name).filter(Boolean).join(", ")}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" size="sm" onClick={() => setConfirmLegacyClean(true)}>
              <Trash2 className="mr-2 size-4" /> Ocultar contas antigas
            </Button>
          </CardContent>
        </Card>
      )}

      {showHiddenLegacy && hiddenLegacyUsers.length > 0 && (
        <Card className="surface">
          <CardHeader>
            <CardTitle className="text-base">Contas antigas ocultadas ({hiddenLegacyUsers.length})</CardTitle>
            <CardDescription>Os registros permanecem armazenados para auditoria e podem ser restaurados.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={restoreLegacy}>
              <UserCheck className="mr-2 size-4" /> Restaurar contas antigas
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar usuário" : "Novo usuário"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Altere o nome ou o papel. Para trocar a senha, use o botão de redefinição."
                : "O funcionário entrará com este e-mail e senha."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nome do funcionário"
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                disabled={!!editing}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="funcionario@email.com"
              />
            </div>
            {!editing && (
              <div className="space-y-2">
                <Label>Senha inicial (mín. 6 caracteres)</Label>
                <Input
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Senha provisória"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operator">Operador — cadastra e atualiza clientes</SelectItem>
                  <SelectItem value="admin">Administrador — gerencia tudo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmLegacyClean} onOpenChange={setConfirmLegacyClean}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ocultar contas antigas?</AlertDialogTitle>
            <AlertDialogDescription>
              Serão ocultados {legacyUsers.length} registros do sistema de login antigo. Eles permanecerão
              armazenados para auditoria e poderão ser restaurados. Os usuários com e-mail não serão afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={cleanLegacy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ocultar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
