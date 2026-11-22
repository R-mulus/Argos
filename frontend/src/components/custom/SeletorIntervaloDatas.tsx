import { useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarDays } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  CalendarioIntervalo,
  intervaloSimulado,
  type IntervaloDatas,
} from "@/components/custom/CalendarioIntervalo"

type SeletorIntervaloDatasProps = {
  value?: IntervaloDatas
  defaultValue?: IntervaloDatas
  onChange?: (value: IntervaloDatas | undefined) => void
  className?: string
}

function formatarData(date: Date) {
  // Exemplo: 3 Set 2026 (sem o ponto da abreviação do date-fns).
  const texto = format(date, "d MMM yyyy", { locale: ptBR }).replace(/\./g, "")
  return texto.replace(/\b([a-zá-ú])/, (letra) => letra.toUpperCase())
}

function formatarIntervalo(intervalo: IntervaloDatas | undefined) {
  if (!intervalo?.from) return "Selecione um intervalo"
  if (!intervalo.to) return `${formatarData(intervalo.from)} – Escolha a data final`
  return `${formatarData(intervalo.from)} - ${formatarData(intervalo.to)}`
}

export function SeletorIntervaloDatas({
  value,
  defaultValue = intervaloSimulado,
  onChange,
  className = "",
}: SeletorIntervaloDatasProps) {
  const [internalValue, setInternalValue] = useState<IntervaloDatas | undefined>(defaultValue)
  const [open, setOpen] = useState(false)
  const selected = value === undefined ? internalValue : value

  function handleChange(next: IntervaloDatas | undefined) {
    if (value === undefined) setInternalValue(next)
    onChange?.(next)
    if (next?.from && next.to) setOpen(false)
  }

  return (
    <div className={`@container w-full max-w-[280px] min-w-0 ${className}`}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className="h-auto min-h-9 w-full min-w-0 rounded-full! border-border bg-card px-2 py-1.5 text-card-foreground shadow-sm hover:bg-muted @min-[230px]:px-3"
            />
          }
        >
          <CalendarDays className="size-4 shrink-0 @min-[230px]:size-5" aria-hidden="true" />
          <span className="min-w-0 truncate text-[11px] font-medium @min-[230px]:text-sm">
            {formatarIntervalo(selected)}
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-auto max-w-[calc(100vw-1rem)] border-border p-1">
          <CalendarioIntervalo value={selected} onChange={handleChange} className="border-0 shadow-none" />
        </PopoverContent>
      </Popover>
    </div>
  )
}

export type { SeletorIntervaloDatasProps }
