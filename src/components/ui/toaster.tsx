
"use client"

import * as React from "react"
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
    // Enhanced to handle React nodes by extracting text content
    const getReactNodeText = (node: React.ReactNode): string => {
        if (typeof node === 'string') return node;
        if (typeof node === 'number') return String(node);
        if (Array.isArray(node)) return node.map(getReactNodeText).join('');
        if (React.isValidElement(node) && node.props.children) {
            return getReactNodeText(node.props.children);
        }
        return '';
    };

    const titleText = title ? `${getReactNodeText(title)}: ` : '';
    const descriptionText = description ? getReactNodeText(description) : '';
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
             <div className="flex flex-col gap-2 w-full">
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
                            className="h-8 gap-1.5 border-destructive-foreground/60 bg-destructive-foreground text-xs text-destructive hover:border-destructive-foreground hover:bg-destructive-foreground/90 hover:text-destructive focus-visible:ring-destructive-foreground"
                            onClick={() => handleCopy(title, description)}
                        >
                            <Copy className="h-3 w-3" />
                            Copiar Erro
                        </Button>
                    )}
                    {action}
                </div>
            </div>
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
