import { useState } from "react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export type PeriodoVisualizacao = "dia" | "semana" | "mes"

type SeletorPeriodoProps = {
  value?: PeriodoVisualizacao
  defaultValue?: PeriodoVisualizacao
  onChange?: (value: PeriodoVisualizacao) => void
  className?: string
}

const periodos: Array<{ value: PeriodoVisualizacao; label: string }> = [
  { value: "dia", label: "Dia" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
]

export function SeletorPeriodo({
  value,
  defaultValue = "dia",
  onChange,
  className = "",
}: SeletorPeriodoProps) {
  const [internalValue, setInternalValue] = useState<PeriodoVisualizacao>(defaultValue)
  const selected = value ?? internalValue

  function handleChange(values: string[]) {
    // Impede que o grupo fique sem nenhuma opção selecionada.
    const next = values[0] as PeriodoVisualizacao | undefined
    if (!next || !periodos.some((periodo) => periodo.value === next)) return
    if (value === undefined) setInternalValue(next)
    onChange?.(next)
  }

  return (
    <div className={`@container w-full max-w-[291px] min-w-0 ${className}`}>
      <ToggleGroup
        aria-label="Período de visualização"
        value={[selected]}
        onValueChange={handleChange}
        multiple={false}
        variant="outline"
        spacing={2}
        className="grid w-full grid-cols-3 gap-1 @min-[260px]:gap-2"
      >
        {periodos.map((periodo) => (
          <ToggleGroupItem
            key={periodo.value}
            value={periodo.value}
            aria-label={`Visualizar por ${periodo.label.toLowerCase()}`}
            className="h-8 min-w-0 cursor-pointer rounded-full! border-2! border-border! bg-card! px-1.5 text-xs text-card-foreground! shadow-sm transition-colors hover:bg-accent! data-pressed:border-primary! data-pressed:bg-primary! data-pressed:text-white! @min-[260px]:h-10 @min-[260px]:px-3 @min-[260px]:text-sm"
          >
            {periodo.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

export type { SeletorPeriodoProps }
