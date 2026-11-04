import { useState } from "react"
import { ptBR } from "date-fns/locale"
import { ChevronDown, ChevronUp } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { Calendar } from "@/components/ui/calendar"

export type IntervaloDatas = DateRange

export const intervaloSimulado: IntervaloDatas = {
  from: new Date(2026, 8, 3),
  to: new Date(2026, 8, 8),
}

type CalendarioIntervaloProps = {
  value?: IntervaloDatas
  defaultValue?: IntervaloDatas
  onChange?: (value: IntervaloDatas | undefined) => void
  className?: string
}

export function CalendarioIntervalo({
  value,
  defaultValue = intervaloSimulado,
  onChange,
  className = "",
}: CalendarioIntervaloProps) {
  const [internalValue, setInternalValue] = useState<IntervaloDatas | undefined>(defaultValue)
  const [mesVisivel, setMesVisivel] = useState<Date>(
    () => value?.from ?? defaultValue?.from ?? new Date(2026, 8, 1),
  )

  const selected = value === undefined ? internalValue : value

  function handleSelect(next: IntervaloDatas | undefined) {
    if (value === undefined) setInternalValue(next)
    onChange?.(next)
  }

  return (
    <div className={`w-fit max-w-full rounded-xl border border-border bg-card p-1 shadow-sm ${className}`}>
      <Calendar
        mode="range"
        selected={selected}
        onSelect={handleSelect}
        month={mesVisivel}
        onMonthChange={setMesVisivel}
        locale={ptBR}
        weekStartsOn={0}
        numberOfMonths={1}
        showOutsideDays={false}
        className="w-fit bg-card p-1 [--cell-size:1.75rem] sm:[--cell-size:2rem] [&_.rdp-caption_label]:capitalize [&_.rdp-weekday]:text-foreground [&_.rdp-weekday]:text-xs [&_[data-range-middle=true]]:bg-accent [&_[data-range-middle=true]]:text-foreground"
        classNames={{
          // Mantém o mês à esquerda e as duas setas agrupadas à direita.
          month_caption: "relative flex h-(--cell-size) w-full items-center justify-start pl-2 pr-16",
          caption_label: "text-sm font-medium capitalize",
          nav: "absolute right-1 top-1 z-20 flex w-auto items-center justify-end gap-0.5",
          button_previous: "flex size-7 items-center justify-center rounded-md p-0 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40",
          button_next: "flex size-7 items-center justify-center rounded-md p-0 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40",
        }}
        components={{
          Chevron: ({ orientation, className: chevronClassName }) =>
            orientation === "left" ? (
              <ChevronUp aria-hidden="true" className={chevronClassName} />
            ) : (
              <ChevronDown aria-hidden="true" className={chevronClassName} />
            ),
        }}
      />
    </div>
  )
}

export type { CalendarioIntervaloProps }
