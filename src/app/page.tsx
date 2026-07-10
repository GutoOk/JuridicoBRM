"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Gavel, Loader2, Eye, EyeOff, TriangleAlert, ShieldCheck, ClipboardList, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth, authErrorMessage } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { APP_NAME } from "@/lib/constants";
import { HelpTip } from "@/components/shared/page-shell";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { fbUser, loading, login, loginWithGoogle, resetPassword } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && fbUser) router.replace("/dashboard");
  }, [loading, fbUser, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(authErrorMessage(err));
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      router.replace("/dashboard");
    } catch (err) {
      const msg = authErrorMessage(err);
      if (msg) setError(msg); // silencia cancelled-popup-request
      setGoogleLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!email.trim()) {
      setError("Digite seu e-mail para receber o link de redefinição de senha.");
      return;
    }
    try {
      await resetPassword(email);
      toast({
        title: "E-mail enviado",
        description: "Verifique sua caixa de entrada para redefinir a senha.",
      });
    } catch (err) {
      setError(authErrorMessage(err));
    }
  };

  return (
    <div className="grid min-h-screen bg-background p-3 md:grid-cols-[0.95fr_1.05fr] md:p-4">
      <section className="hidden min-h-[calc(100vh-2rem)] flex-col justify-between rounded-md border bg-primary/95 p-5 text-primary-foreground shadow-sm md:flex">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-2.5 py-1.5 text-sm">
            <Gavel className="size-5 text-sidebar-primary" />
            <span className="font-semibold">{APP_NAME}</span>
          </div>
          <div className="mt-12 max-w-xl">
            <p className="text-xs font-medium text-sidebar-primary">
              Operação jurídica
            </p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight">
              Cadastro, cobrança e checklist no mesmo lugar.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-primary-foreground/72">
              Feito para trabalhar rápido: localizar cliente, ver pendências, registrar contato e deixar a próxima ação clara para a equipe.
            </p>
          </div>
        </div>
        <div className="grid gap-2 text-xs text-primary-foreground/75">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-4 text-sidebar-primary" />
            Acesso por perfil: operador ou administrador.
          </div>
          <div className="flex items-center gap-3">
            <ClipboardList className="size-4 text-sidebar-primary" />
            Checklists indicam o que falta antes do protocolo.
          </div>
          <div className="flex items-center gap-3">
            <MessageCircle className="size-4 text-sidebar-primary" />
            Mensagens padrão ajudam no atendimento diário.
          </div>
        </div>
      </section>

      <section className="flex min-h-[calc(100vh-1.5rem)] items-center justify-center p-2 md:min-h-[calc(100vh-2rem)] md:p-5">
      <Card className="surface mx-auto w-full max-w-sm shadow-lg">
        <CardHeader>
          <div className="mb-2 flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-lg bg-primary">
              <Gavel className="size-6 text-primary-foreground" />
            </div>
            <div>
              <CardTitle className="text-xl font-semibold">{APP_NAME}</CardTitle>
              <CardDescription>Entre para continuar a operação</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Botão Google */}
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              disabled={googleLoading || submitting}
              onClick={handleGoogleLogin}
            >
              {googleLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <GoogleIcon className="size-5" />
              )}
              Entrar com Google
            </Button>

            {/* Separador */}
            <div className="relative flex items-center">
              <div className="flex-1 border-t" />
              <span className="mx-3 text-xs text-muted-foreground">ou</span>
              <div className="flex-1 border-t" />
            </div>

            {/* Formulário e-mail/senha */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute inset-y-0 right-0 h-full w-10 text-muted-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    <HelpTip label={showPassword ? "Ocultar a senha digitada." : "Mostrar a senha digitada."}>
                      <span>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</span>
                    </HelpTip>
                  </Button>
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <TriangleAlert className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={submitting || googleLoading}>
                {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                Entrar
              </Button>
              <button
                type="button"
                onClick={handleForgot}
                className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Esqueci minha senha
              </button>
            </form>
          </div>
        </CardContent>
      </Card>
      </section>
    </div>
  );
}
