
"use client"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { Button } from "./button"
import { Copy } from "lucide-react"

export function Toaster() {
  const { toasts, toast: showToast } = useToast()

  const handleCopy = (title?: React.ReactNode, description?: React.ReactNode) => {
    const titleText = title ? `${typeof title === 'string' ? title : String(title)}: ` : '';
    const descriptionText = description ? `${typeof description === 'string' ? description : String(description)}` : '';
    const textToCopy = `${titleText}${descriptionText}`;
    
    if (textToCopy) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast({
                title: "Copiado!",
                description: "A mensagem de erro foi copiada para a área de transferência.",
            })
        }, (err) => {
            console.error('Could not copy text: ', err);
             showToast({
                title: "Falha ao copiar",
                description: "Não foi possível copiar a mensagem de erro.",
                variant: "destructive"
            })
        });
    }
  };


  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            <div className="flex items-center gap-2">
                 {variant === 'destructive' && (
                    <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 gap-1.5 text-xs group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive"
                        onClick={() => handleCopy(title, description)}
                    >
                        <Copy className="h-3 w-3" />
                        Copiar
                    </Button>
                )}
                {action}
            </div>
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
