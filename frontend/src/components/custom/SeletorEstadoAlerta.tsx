import type { Alerta } from "@argos/shared"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export type FiltroEstadoAlerta = Alerta["estado"] | "todos"

const opcoes: { value: FiltroEstadoAlerta; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "novo", label: "Novos" },
  { value: "lido", label: "Lidos" },
  { value: "resolvido", label: "Resolvidos" },
]

type SeletorEstadoAlertaProps = {
  value: FiltroEstadoAlerta
  onChange: (value: FiltroEstadoAlerta) => void
  /** Quantidade por estado, exibida ao lado do rótulo quando conhecida. */
  contagens?: Partial<Record<FiltroEstadoAlerta, number>>
  className?: string
}

/** Filtro por estado no mesmo padrão de pílulas do seletor Dia/Semana/Mês. */
export function SeletorEstadoAlerta({ value, onChange, contagens, className = "" }: SeletorEstadoAlertaProps) {
  return (
    <div className={`@container w-full max-w-[460px] min-w-0 ${className}`}>
      <ToggleGroup
        aria-label="Filtrar avisos por estado"
        value={[value]}
        onValueChange={(valores: string[]) => {
          const proximo = valores[0] as FiltroEstadoAlerta | undefined
          if (proximo && opcoes.some(o => o.value === proximo)) onChange(proximo)
        }}
        multiple={false}
        variant="outline"
        spacing={2}
        className="grid w-full grid-cols-2 gap-2 @min-[400px]:grid-cols-4"
      >
        {opcoes.map(opcao => (
          <ToggleGroupItem
            key={opcao.value}
            value={opcao.value}
            className="h-10 min-w-0 cursor-pointer gap-1.5 rounded-full! border-2! border-border! bg-card! px-3 text-sm text-card-foreground! shadow-sm transition-colors hover:bg-accent! data-pressed:border-primary! data-pressed:bg-primary! data-pressed:text-white!"
          >
            {opcao.label}
            {contagens?.[opcao.value] != null && <span className="tabular-nums opacity-75">{contagens[opcao.value]}</span>}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
