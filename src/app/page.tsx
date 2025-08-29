
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Gavel, TriangleAlert, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState('');
  const [masterPassword, setMasterPassword] = React.useState('');
  const [isMasterPasswordDialogOpen, setIsMasterPasswordDialogOpen] = React.useState(false);

  const router = useRouter();
  const { login } = useAuth();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const loggedIn = await login(username, password);
    if (loggedIn) {
      router.push('/dashboard');
    } else {
      setError('Usuário ou senha inválidos. Verifique os dados e tente novamente.');
    }
  };

  const handleMasterPasswordCheck = () => {
    if (masterPassword === 'SóEuSei2025!') {
      // Store a flag in sessionStorage to indicate master access
      sessionStorage.setItem('master-access', 'true');
      setIsMasterPasswordDialogOpen(false);
      setMasterPassword('');
      router.push('/dashboard/users');
    } else {
      toast({
        title: "Senha Mestra Incorreta",
        description: "A senha mestra que você inseriu está incorreta.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="mx-auto w-full max-w-sm shadow-2xl">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <Gavel className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Barão de Mauá</CardTitle>
          <CardDescription>Acesse sua conta para gerenciar seus processos.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Usuário</Label>
              <Input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
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
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </Button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                 <TriangleAlert className="h-4 w-4" />
                <AlertTitle>Erro de Acesso</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full bg-accent hover:bg-accent/90">
              Login
            </Button>
          </form>

          <div className="mt-4 text-center text-sm">
            <Dialog open={isMasterPasswordDialogOpen} onOpenChange={setIsMasterPasswordDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="link" className="text-muted-foreground">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Gerenciar Usuários
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Acesso Restrito</DialogTitle>
                  <DialogDescription>
                    Para gerenciar os usuários, por favor, insira a senha mestra.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-4">
                  <Label htmlFor="master-password">Senha Mestra</Label>
                  <Input
                    id="master-password"
                    type="password"
                    value={masterPassword}
                    onChange={(e) => setMasterPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleMasterPasswordCheck()}
                  />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">Cancelar</Button>
                  </DialogClose>
                  <Button type="button" onClick={handleMasterPasswordCheck}>Acessar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
