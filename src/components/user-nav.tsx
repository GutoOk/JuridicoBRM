
"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";


export function UserNav() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/");
  };
  
  if (!user) {
    return null; // ou um botão de login
  }

  const fallback = user.name.substring(0, 1).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-full justify-start gap-2 px-2">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.imageUrl} alt={user.name} />
            <AvatarFallback>{fallback}</AvatarFallback>
          </Avatar>
           <div className="flex flex-col items-start truncate">
                <span className="text-sm font-medium text-sidebar-foreground">{user.name}</span>
           </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
             <p className="text-xs leading-none text-muted-foreground">
              {user.isAdmin ? 'Administrador' : 'Usuário'}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/profile">Perfil & Configurações</Link>
          </DropdownMenuItem>
           {user.isAdmin && (
             <DropdownMenuItem asChild>
                <Link href="/dashboard/users" className="flex items-center">
                    <Shield className="mr-2 h-4 w-4" />
                    Gerenciar Usuários
                </Link>
             </DropdownMenuItem>
           )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
