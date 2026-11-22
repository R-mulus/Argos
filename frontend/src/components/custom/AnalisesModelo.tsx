import { ArrowUpRight, Camera } from "lucide-react"
import { useNavigate } from "react-router"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export type ModelAnalysisData = {
  model: string
  framework: string
  lastUpdated: string
  accuracyPercent: number
  recordsPerDay: number
  parametersMillions: number
  cpuOnmxMs: number
  processingTimeMinutes: number
  secondProcessingTimeMinutes: number
  a100TensorRtMs: number
  flopsBillions: number
  lastFeedback: {
    accuracyPercent: number
    processingTimeMinutes: number
    cpuMs: number
  }
}

type AnalisesModeloProps = {
  /** Rota existente para a página de detalhes do modelo; sem ela, a seta é apenas decorativa. */
  detailsPath?: string
  /** Quando a API estiver pronta, passar os dados retornados por ela. */
  data?: ModelAnalysisData
}

// Dados simulados, seguindo os valores exibidos no Figma.
const mockAnalysis: ModelAnalysisData = {
  model: "GRU",
  framework: "TensorFlow",
  lastUpdated: "19/09/2026 16:19",
  accuracyPercent: 97,
  recordsPerDay: 48,
  parametersMillions: 28.9,
  cpuOnmxMs: 234.7,
  processingTimeMinutes: 15,
  secondProcessingTimeMinutes: 15,
  a100TensorRtMs: 1.83,
  flopsBillions: 78.9,
  lastFeedback: {
    accuracyPercent: 97,
    processingTimeMinutes: 5,
    cpuMs: 234.7,
  },
}

export function AnalisesModelo({
  detailsPath,
  data = mockAnalysis,
}: AnalisesModeloProps) {
  const navigate = useNavigate()

  const metrics = [
    { id: "accuracy", label: "Acurácia", value: `${data.accuracyPercent}%` },
    { id: "records", label: "Registros Per/Dia", value: data.recordsPerDay.toString() },
    { id: "parameters", label: "Parâmetros", value: `${data.parametersMillions.toFixed(1)} M` },
    { id: "cpu", label: "Velocidade CPU ONMX", value: `${data.cpuOnmxMs.toFixed(1)} ms` },
    { id: "processing-1", label: "Tempo de Processamento", value: `${data.processingTimeMinutes} min` },
    { id: "processing-2", label: "Tempo de Processamento", value: `${data.secondProcessingTimeMinutes} min` },
    { id: "a100", label: "Velocidade A100 TensorRT", value: `${data.a100TensorRtMs.toFixed(2)} ms` },
    { id: "flops", label: "FLOPs", value: `${data.flopsBillions.toFixed(1)} B` },
  ]

  const feedbackMetrics = [
    { id: "feedback-accuracy", label: "Acurácia", value: `${data.lastFeedback.accuracyPercent}%` },
    { id: "feedback-time", label: "Tempo de Processamento", value: `${data.lastFeedback.processingTimeMinutes} min` },
    { id: "feedback-cpu", label: "Velocidade CPU", value: `${data.lastFeedback.cpuMs.toFixed(1)} ms` },
  ]

  return (
    <Card className="@container w-full min-w-0 gap-0 overflow-hidden py-0">
      <CardHeader className="flex flex-col gap-0 px-0 @min-[620px]:flex-row @min-[620px]:items-start @min-[620px]:justify-between">
        <CardTitle className="flex min-h-12 min-w-0 items-center gap-1.5 px-3 py-3 text-base leading-tight font-normal @min-[400px]:min-h-14 @min-[400px]:gap-2 @min-[400px]:px-4 @min-[400px]:text-xl @min-[620px]:min-h-[74px] @min-[620px]:gap-3 @min-[620px]:px-7 @min-[620px]:py-5 @min-[620px]:text-[clamp(1.35rem,3.6cqw,1.875rem)]">
          <Camera aria-hidden="true" className="size-4 shrink-0 @min-[400px]:size-5 @min-[620px]:size-7" />
          Análises do Modelo
        </CardTitle>

        <div className="flex min-h-12 w-full items-center justify-end gap-2 rounded-bl-2xl bg-primary px-3 py-2 text-white @min-[400px]:min-h-14 @min-[400px]:gap-3 @min-[400px]:px-4 @min-[620px]:min-h-[74px] @min-[620px]:w-[346px] @min-[620px]:shrink-0 @min-[620px]:rounded-bl-3xl @min-[620px]:px-5 @min-[620px]:py-3">
          <div className="min-w-0 text-right text-[10px] leading-tight @min-[400px]:text-xs">
            <p>Última Atualização:</p>
            <p className="font-semibold">{data.lastUpdated}</p>
          </div>
          {detailsPath ? (
            <Button
              type="button"
              size="icon-lg"
              variant="ghost"
              aria-label="Abrir detalhes das análises do modelo"
              title="Ver detalhes do modelo"
              onClick={() => navigate(detailsPath)}
              className="size-8 shrink-0 rounded-lg text-white hover:bg-white/15 hover:text-white focus-visible:ring-white/70 @min-[400px]:size-9 @min-[620px]:size-11"
            >
              <ArrowUpRight aria-hidden="true" className="size-6! stroke-[2.5] @min-[400px]:size-8! @min-[620px]:size-10!" />
            </Button>
          ) : (
            <ArrowUpRight aria-hidden="true" className="size-6 shrink-0 stroke-[2.5] @min-[400px]:size-8 @min-[620px]:size-10" />
          )}
        </div>
      </CardHeader>

      <CardContent className="px-3 pt-4 pb-5 @min-[400px]:px-4 @min-[400px]:pt-6 @min-[620px]:px-7 @min-[620px]:pt-9 @min-[620px]:pb-12">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-4 @min-[340px]:grid-cols-2 @min-[620px]:grid-cols-4 @min-[620px]:gap-x-8 @min-[620px]:gap-y-7">
          <div className="min-w-0">
            <dt className="text-xs leading-4 @min-[400px]:text-sm @min-[620px]:text-base @min-[620px]:leading-5">Modelo</dt>
            <dd className="mt-1 break-words text-2xl leading-none font-semibold @min-[400px]:text-3xl @min-[620px]:mt-2 @min-[620px]:text-4xl">{data.model}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs leading-4 @min-[400px]:text-sm @min-[620px]:text-base @min-[620px]:leading-5">Empresa</dt>
            <dd className="mt-1 break-words text-lg leading-tight font-semibold @min-[400px]:text-xl @min-[620px]:mt-2 @min-[620px]:text-2xl">{data.framework}</dd>
          </div>
        </dl>

        <dl className="mt-7 grid grid-cols-1 gap-x-3 gap-y-4 @min-[340px]:grid-cols-2 @min-[400px]:mt-10 @min-[620px]:mt-[64px] @min-[620px]:grid-cols-4 @min-[620px]:gap-x-5 @min-[620px]:gap-y-[64px]">
          {metrics.map((metric) => (
            <div key={metric.id} className="min-w-0">
              <dt className="text-xs leading-4 @min-[400px]:text-sm @min-[620px]:text-base @min-[620px]:leading-5">{metric.label}</dt>
              <dd className="mt-1 break-words text-lg leading-tight font-semibold @min-[400px]:text-xl @min-[620px]:text-[24px]">{metric.value}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="latest-feedback-title" className="mt-8 @min-[400px]:mt-11 @min-[620px]:mt-[78px]">
          <h3 id="latest-feedback-title" className="text-lg leading-tight font-semibold @min-[400px]:text-xl @min-[620px]:text-2xl">
            Feedback Último Dado Processado
          </h3>

          <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 rounded-xl border-2 border-border px-3 py-3 @min-[400px]:mt-4 @min-[400px]:grid-cols-2 @min-[400px]:px-4 @min-[640px]:grid-cols-3 @min-[620px]:mt-6 @min-[620px]:gap-x-6 @min-[620px]:gap-y-5 @min-[620px]:px-9 @min-[620px]:py-5">
            {feedbackMetrics.map((metric) => (
              <div key={metric.id} className="min-w-0">
                <dt className="text-xs leading-4 @min-[400px]:text-sm @min-[620px]:text-base @min-[620px]:leading-5">{metric.label}</dt>
                <dd className="mt-1 break-words text-lg leading-tight font-semibold @min-[400px]:text-xl @min-[620px]:text-[24px]">{metric.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </CardContent>
    </Card>
  )
}
