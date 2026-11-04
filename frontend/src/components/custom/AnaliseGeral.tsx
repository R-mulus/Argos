import { ArrowUpRight, Camera } from "lucide-react"
import { Link } from "react-router"

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export type GeneralAnalysisData = {
  groupSize: number
  lastUpdated: string
  predominantBehavior: string
  nearbyAnimalsCount: number
  cohesionPercent: number
  distantAnimalsCount: number
}

type AnaliseGeralProps = {
  data?: GeneralAnalysisData
  detailsPath: string
}

// Dados simulados; futuramente, substituir pela resposta da API Argos.
const mockData: GeneralAnalysisData = {
  groupSize: 18,
  lastUpdated: "13:56",
  predominantBehavior: "Alimentação",
  nearbyAnimalsCount: 13,
  cohesionPercent: 89,
  distantAnimalsCount: 2,
}

function getDistantAnimalsMessage(count: number): string {
  if (count === 0) return "Nenhum animal distante do Grupo"
  if (count === 1) return "1 Animal distante do Grupo"

  return `${count.toLocaleString("pt-BR")} Animais distantes do Grupo`
}

export function AnaliseGeral({ data = mockData, detailsPath }: AnaliseGeralProps) {
  const metrics = [
    { label: "Tamanho do Grupo", value: data.groupSize.toLocaleString("pt-BR") },
    { label: "Última Atualização", value: data.lastUpdated },
    { label: "Comportamento Predominante", value: data.predominantBehavior },
    {
      label: "Animais Próximos",
      value: `${data.nearbyAnimalsCount.toLocaleString("pt-BR")}/${data.groupSize.toLocaleString("pt-BR")}`,
    },
    { label: "Coesão", value: `${data.cohesionPercent}%` },
  ]

  return (
    <Card className="@container relative w-full min-w-0 gap-0 py-0">
      <CardHeader className="min-w-0 px-3 pt-3 pr-[56px] pb-0 @min-[400px]:px-4 @min-[400px]:pt-4 @min-[400px]:pr-[80px] @min-[700px]:px-6 @min-[700px]:pt-5 @min-[700px]:pr-24">
        <CardTitle className="flex min-w-0 items-center gap-1.5 text-base font-normal @min-[400px]:gap-2 @min-[400px]:text-xl @min-[700px]:text-2xl">
          <Camera aria-hidden="true" className="size-4 shrink-0 @min-[400px]:size-5 @min-[700px]:size-6" />
          <span>Análise Geral</span>
        </CardTitle>
        <CardAction className="absolute top-0 right-0">
          <Link
            to={detailsPath}
            aria-label="Ver detalhes da análise geral"
            className="flex size-11 items-center justify-center rounded-bl-2xl bg-primary text-white transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ring @min-[400px]:size-14 @min-[700px]:size-[74px] @min-[700px]:rounded-bl-3xl"
          >
            <ArrowUpRight aria-hidden="true" className="size-6 stroke-[2.25] @min-[400px]:size-8 @min-[700px]:size-9" />
          </Link>
        </CardAction>
      </CardHeader>

      <CardContent className="min-w-0 px-3 pt-5 pb-4 @min-[400px]:px-4 @min-[400px]:pt-6 @min-[700px]:px-6 @min-[700px]:pt-8 @min-[700px]:pb-10">
        <dl className="grid max-w-[680px] grid-cols-1 gap-x-4 gap-y-4 @min-[400px]:grid-cols-2 @min-[400px]:gap-y-6 @min-[740px]:grid-cols-3 @min-[740px]:gap-y-8">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0">
              <dt className="text-xs leading-4 @min-[400px]:text-sm @min-[700px]:text-base @min-[700px]:leading-5">{metric.label}</dt>
              <dd className="mt-1 break-words text-lg leading-6 font-semibold @min-[400px]:text-xl @min-[700px]:text-2xl @min-[700px]:leading-7">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-5 break-words text-xs leading-4 @min-[400px]:mt-7 @min-[400px]:text-sm @min-[700px]:mt-10 @min-[700px]:text-base @min-[700px]:leading-6">
          {getDistantAnimalsMessage(data.distantAnimalsCount)}
        </p>
      </CardContent>
    </Card>
  )
}
