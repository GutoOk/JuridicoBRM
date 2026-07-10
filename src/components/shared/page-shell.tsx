"use client";

import type { ReactNode } from "react";
import { HelpCircle, Search, Inbox, LucideIcon } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  eyebrow,
  badge,
  children,
}: {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="case-spine surface px-3 py-2.5 pl-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {eyebrow && (
              <span className="text-xs font-medium text-accent">
                {eyebrow}
              </span>
            )}
            {badge}
          </div>
          <h1 className="text-xl font-semibold leading-tight text-foreground">
            {title}
          </h1>
          {description && (
            <div className="max-w-3xl text-sm leading-snug text-muted-foreground">
              {description}
            </div>
          )}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </section>
  );
}

export function HelpTip({
  label,
  children,
  side = "top",
  className,
}: {
  label: ReactNode;
  children?: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={180}>
      <Tooltip>
        <TooltipTrigger asChild>
          {children ?? (
            <button
              type="button"
              className={cn(
                "inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                className
              )}
              aria-label="Ajuda"
            >
              <HelpCircle className="size-3.5" />
            </button>
          )}
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs text-xs leading-relaxed">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function TooltipButton({
  tooltip,
  children,
  side = "top",
  ...props
}: ButtonProps & {
  tooltip: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <HelpTip label={tooltip} side={side}>
      <Button {...props}>{children}</Button>
    </HelpTip>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full max-w-md", className)}>
      <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 bg-card pl-8"
      />
    </div>
  );
}

export function Toolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("surface flex flex-wrap items-center gap-2 p-2", className)}>
      {children}
    </div>
  );
}

export function FilterChip({
  active,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-card text-foreground hover:border-accent hover:bg-accent/10",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-28 flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 p-4 text-center",
        className
      )}
    >
      <Icon className="mb-2 size-6 text-muted-foreground" />
      <p className="font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("surface case-spine p-3 pl-4 transition-colors hover:bg-muted/20", className)}>
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xl font-semibold leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
        </div>
      </div>
    </div>
  );
}
