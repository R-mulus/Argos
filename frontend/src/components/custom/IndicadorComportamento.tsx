const TOTAL_SEGMENTOS = 15

export type IndicadorComportamentoProps = {
  label: string
  percentage: number
}

/** Exibe o percentual em 15 segmentos proporcionais ao valor recebido. */
export function IndicadorComportamento({
  label,
  percentage,
}: IndicadorComportamentoProps) {
  const porcentagemSegura = Number.isFinite(percentage)
    ? Math.min(100, Math.max(0, percentage))
    : 0
  const segmentosAtivos = Math.round((porcentagemSegura / 100) * TOTAL_SEGMENTOS)
  const porcentagemFormatada = porcentagemSegura.toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })

  return (
    <div className="@container/indicador min-w-0">
      <div className="flex min-w-0 flex-col gap-1.5 @min-[290px]/indicador:flex-row @min-[290px]/indicador:items-center @min-[290px]/indicador:gap-2">
        <div className="min-w-0 shrink-0 @min-[290px]/indicador:w-[86px] @min-[390px]/indicador:w-[98px]">
          <p className="break-words text-xs leading-4 @min-[320px]/indicador:text-sm @min-[390px]/indicador:text-base @min-[390px]/indicador:leading-5">
            {label}
          </p>
          <p className="mt-0.5 text-lg leading-5 font-bold tabular-nums @min-[320px]/indicador:text-xl @min-[390px]/indicador:text-2xl @min-[390px]/indicador:leading-7">
            {porcentagemFormatada}%
          </p>
        </div>

        <div
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={porcentagemSegura}
          aria-valuetext={`${porcentagemFormatada}%`}
          className="grid h-4 w-full max-w-[250px] min-w-0 grid-cols-15 gap-[2px] @min-[290px]/indicador:h-5 @min-[320px]/indicador:gap-[3px] @min-[390px]/indicador:h-[25px] @min-[390px]/indicador:gap-[5px]"
        >
          {Array.from({ length: TOTAL_SEGMENTOS }, (_, index) => (
            <span
              key={index}
              aria-hidden="true"
              className={`min-w-0 rounded-[3px] @min-[390px]/indicador:rounded-[5px] ${
                index < segmentosAtivos ? "bg-primary" : "bg-[#D9D9D9]"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
