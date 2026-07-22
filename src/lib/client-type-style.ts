import type { ClientType } from "@/lib/types";

export type ClientTypeVisual = {
  backgroundColor: string;
  borderColor: string;
  color: string;
  dotColor: string;
};

/** Aparência única dos tipos selecionados em cadastro, listas e Operação. */
export function clientTypeVisual(type: ClientType): ClientTypeVisual {
  const name = type.name.trim().toLocaleLowerCase("pt-BR");

  if (name.includes("pré-cliente") || name.includes("pre-cliente")) {
    return {
      backgroundColor: "#fef3c7",
      borderColor: "#f59e0b",
      color: "#92400e",
      dotColor: "#d97706",
    };
  }

  if (name.includes("arquivado")) {
    return {
      backgroundColor: "#d1d5db",
      borderColor: "#6b7280",
      color: "#374151",
      dotColor: "#4b5563",
    };
  }

  return {
    backgroundColor: `${type.color}1a`,
    borderColor: type.color,
    color: type.color,
    dotColor: type.color,
  };
}

export function clientTypeSelectedStyle(type: ClientType): React.CSSProperties {
  const visual = clientTypeVisual(type);
  return {
    backgroundColor: visual.backgroundColor,
    borderColor: visual.borderColor,
    color: visual.color,
  };
}
