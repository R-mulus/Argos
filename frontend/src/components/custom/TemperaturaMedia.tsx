import { Thermometer } from "lucide-react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export type TemperaturaMediaDados = {
  temperaturaCelsius: number
  /** Identificador do animal já sinalizado pela API como tendo temperatura alterada. */
  idAnimalComTemperaturaAlterada: string | number | null
}

export type TemperaturaMediaProps = {
  /** Dados recebidos da API. Na ausência deles, utiliza os valores do Figma. */
  dados?: TemperaturaMediaDados
  className?: string
}

const dadosSimulados: TemperaturaMediaDados = {
  temperaturaCelsius: 26,
  idAnimalComTemperaturaAlterada: 234,
}

function descreverAlerta(idAnimal: string | number | null): string {
  if (idAnimal === null || String(idAnimal).trim() === "") {
    return "Nenhum animal com temperatura alterada"
  }

  return `Animal ${idAnimal} com Temperatura Alterada`
}

export function TemperaturaMedia({
  dados = dadosSimulados,
  className = "",
}: TemperaturaMediaProps) {
  const temperaturaValida = Number.isFinite(dados.temperaturaCelsius)
  const temperatura = temperaturaValida
    ? `${dados.temperaturaCelsius.toLocaleString("pt-BR", {
        maximumFractionDigits: 1,
      })}°C`
    : "—"

  return (
    <Card
      className={`@container relative w-full min-w-0 min-h-[155px] gap-0 overflow-hidden py-0 @min-[360px]:min-h-[200px] ${className}`}
    >
      {/* Decoração verde do Figma; não representa, por si só, um status clínico. */}
      <div
        aria-hidden="true"
        className="absolute top-0 right-0 h-7 w-1/4 rounded-bl-[24px] bg-[#00A64A] @min-[360px]:h-[38px] @min-[360px]:w-[30%]"
      />

      <CardHeader className="relative z-10 px-3 pt-3 pr-[27%] @min-[360px]:px-4 @min-[360px]:pt-4 @min-[360px]:pr-[32%]">
        <CardTitle className="flex min-w-0 items-start gap-2 font-normal leading-tight text-base @min-[300px]:text-lg @min-[400px]:text-2xl">
          <Thermometer
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 @min-[300px]:size-5 @min-[400px]:size-6"
          />
          <h3 className="min-w-0 break-words">Temperatura Média</h3>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex min-w-0 flex-1 flex-col px-0">
        <p className="mt-4 px-4 text-[32px] leading-none font-normal tracking-tight tabular-nums @min-[300px]:text-[38px] @min-[360px]:mt-6 @min-[360px]:px-12 @min-[400px]:text-[44px]">
          {temperatura}
        </p>
        <p className="mt-auto px-3 pt-4 pb-3 text-xs leading-snug @min-[300px]:text-sm @min-[360px]:px-4 @min-[400px]:pb-4 @min-[400px]:text-base">
          {descreverAlerta(dados.idAnimalComTemperaturaAlterada)}
        </p>
      </CardContent>
    </Card>
  )
}
