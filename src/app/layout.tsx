import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from '@/hooks/use-auth';

export const metadata: Metadata = {
  title: 'JurídicoBRM',
  description: 'Gestão operacional de clientes jurídicos.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="font-body antialiased">
        <TooltipProvider delayDuration={180}>
          <AuthProvider>
            {children}
          </AuthProvider>
        </TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
