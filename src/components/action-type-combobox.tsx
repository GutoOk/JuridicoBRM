
"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface ActionTypeComboboxProps {
    actionTypes: string[];
    value: string;
    onChange: (value: string) => void;
}

export function ActionTypeCombobox({ actionTypes, value, onChange }: ActionTypeComboboxProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {value
            ? actionTypes.find((type) => type.toLowerCase() === value.toLowerCase()) || value
            : "Selecione ou digite o tipo..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput 
            placeholder="Buscar ou criar tipo..."
            value={value}
            onValueChange={onChange}
           />
           <CommandList>
                <CommandEmpty>Nenhum tipo de ação encontrado.</CommandEmpty>
                <CommandGroup>
                    {actionTypes.map((type) => (
                    <CommandItem
                        key={type}
                        value={type}
                        onSelect={(currentValue) => {
                          onChange(currentValue.toLowerCase() === value.toLowerCase() ? "" : currentValue)
                          setOpen(false)
                        }}
                    >
                        <Check
                        className={cn(
                            "mr-2 h-4 w-4",
                            value.toLowerCase() === type.toLowerCase() ? "opacity-100" : "opacity-0"
                        )}
                        />
                        {type}
                    </CommandItem>
                    ))}
                </CommandGroup>
           </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
