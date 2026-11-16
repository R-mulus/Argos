import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export type OpcaoPilula<T extends string> = { value: T; label: string; contagem?: number }

type SeletorPilulasProps<T extends string> = {
  opcoes: OpcaoPilula<T>[]
  value: T
  onChange: (value: T) => void
  rotulo: string
  className?: string
}

/** Grupo de pílulas no padrão Dia/Semana/Mês do Figma, para abas e filtros. */
export function SeletorPilulas<T extends string>({ opcoes, value, onChange, rotulo, className = "" }: SeletorPilulasProps<T>) {
  return (
    <ToggleGroup
      aria-label={rotulo}
      value={[value]}
      onValueChange={(valores: string[]) => {
        const proximo = opcoes.find(o => o.value === valores[0])
        if (proximo) onChange(proximo.value)
      }}
      multiple={false}
      variant="outline"
      spacing={2}
      className={`flex flex-wrap gap-2 ${className}`}
    >
      {opcoes.map(opcao => (
        <ToggleGroupItem
          key={opcao.value}
          value={opcao.value}
          className="h-10 min-w-0 cursor-pointer gap-1.5 rounded-full! border-2! border-border! bg-card! px-4 text-sm text-card-foreground! shadow-sm transition-colors hover:bg-accent! data-pressed:border-primary! data-pressed:bg-primary! data-pressed:text-white!"
        >
          {opcao.label}
          {opcao.contagem != null && <span className="tabular-nums opacity-75">{opcao.contagem}</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
