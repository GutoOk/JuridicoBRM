"use client";

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { Loader2, KeyRound } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth, authErrorMessage } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTip, PageHeader } from "@/components/shared/page-shell";

export default function ProfilePage() {
  const { user, isAdmin, resetPassword } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const saveName = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.id), { name: name.trim() });
      toast({ title: "Nome atualizado" });
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  };

  const sendReset = async () => {
    try {
      await resetPassword(user.email);
      toast({ title: "E-mail enviado", description: "Verifique sua caixa de entrada para trocar a senha." });
    } catch (err) {
      toast({ variant: "destructive", title: "Erro", description: authErrorMessage(err) });
    }
  };

  return (
    <div className="page-shell max-w-2xl">
      <PageHeader
        eyebrow="conta"
        title="Meu perfil"
        description={`${user.email} - ${isAdmin ? "Administrador" : "Operador"}`}
      />
      <Card className="surface">
        <CardHeader>
          <CardTitle className="font-headline text-xl">Nome de exibição</CardTitle>
          <CardDescription>Aparece nos registros de contato, tarefas e alterações.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          <HelpTip label="Atualiza como seu nome aparece nos registros do sistema.">
          <Button onClick={saveName} disabled={saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Salvar
          </Button>
          </HelpTip>
        </CardContent>
      </Card>
      <Card className="surface">
        <CardHeader>
          <CardTitle className="font-headline text-xl">Senha</CardTitle>
          <CardDescription>Enviaremos um link de troca de senha para o seu e-mail.</CardDescription>
        </CardHeader>
        <CardContent>
          <HelpTip label="Envia um e-mail seguro para você definir uma nova senha.">
          <Button variant="outline" onClick={sendReset}>
            <KeyRound className="mr-2 size-4" /> Trocar senha por e-mail
          </Button>
          </HelpTip>
        </CardContent>
      </Card>
    </div>
  );
}
