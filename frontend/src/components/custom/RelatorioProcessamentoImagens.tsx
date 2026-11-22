import { Camera } from "lucide-react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type ImageProcessingReport = {
  model: string
  photosInDatabase: number
  photoIntervalHours: number
  photosPerWeek: number
  imageSizePx: number
  mapVal: number
  cpuOnmxMs: number
  a100TensorRtMs: number
  trainableParametersMillions: number
  flopsBillions: number
}

// Dados temporários. Futuramente, substituir pela resposta da API Argos.
const mockReport: ImageProcessingReport = {
  model: "YOLOv8m",
  photosInDatabase: 10253,
  photoIntervalHours: 6,
  photosPerWeek: 28,
  imageSizePx: 640,
  mapVal: 50.2,
  cpuOnmxMs: 234.7,
  a100TensorRtMs: 1.83,
  trainableParametersMillions: 28.9,
  flopsBillions: 78.9,
}

export function RelatorioProcessamentoImagens() {
  const metrics = [
    {
      label: "Modelo",
      value: mockReport.model,
      description: `Intervalo de ${mockReport.photoIntervalHours} horas por foto`,
    },
    {
      label: "Qnt. de Fotos no Database",
      value: mockReport.photosInDatabase.toLocaleString("pt-BR"),
      description: `${mockReport.photosPerWeek} fotos por semana`,
    },
    {
      label: "Tamanho",
      value: `${mockReport.imageSizePx} px`,
      description: `${mockReport.photosPerWeek} fotos por semana`,
    },
    {
      label: "Previsão Média",
      value: (
        <>
          {mockReport.mapVal.toFixed(1)} mAP
          <sup className="text-[0.5em] align-super">val</sup>
        </>
      ),
      description: "Previsão ideal: 50-95",
    },
    {
      label: "Velocidade CPU ONMX",
      value: `${mockReport.cpuOnmxMs.toFixed(1)} ms`,
      description: "Velocidade de processamento ideal",
    },
    {
      label: "Velocidade A100 TensorRT",
      value: `${mockReport.a100TensorRtMs.toFixed(2)} ms`,
      description: "Velocidade de processamento ideal",
    },
    {
      label: "Parâmetros",
      value: `${mockReport.trainableParametersMillions.toFixed(1)} M`,
      description: "Qnt. de Parâmetros treináveis Ideal",
    },
    {
      label: "FLOPs",
      value: `${mockReport.flopsBillions.toFixed(1)} B`,
      description: "Floating Points Operations",
    },
  ]

  return (
    <Card className="@container w-full min-w-0 gap-3 py-3 @min-[420px]:gap-4 @min-[420px]:py-4 @min-[700px]:gap-6 @min-[700px]:py-6">
      <CardHeader className="px-3 @min-[420px]:px-4 @min-[700px]:px-6">
        <CardTitle className="flex min-w-0 items-start gap-1.5 text-base leading-snug font-normal @min-[420px]:gap-2 @min-[420px]:text-lg @min-[700px]:text-[23px]">
          <Camera aria-hidden="true" className="mt-0.5 size-4 shrink-0 @min-[420px]:size-5 @min-[700px]:size-6" />
          Relatório do Processamento de Imagens
        </CardTitle>
      </CardHeader>

      <CardContent className="px-3 pt-1 pb-4 @min-[420px]:px-4 @min-[420px]:pt-2 @min-[700px]:px-6 @min-[700px]:pb-10">
        <dl className="grid grid-cols-1 gap-x-5 gap-y-6 @min-[420px]:gap-y-8 @min-[560px]:grid-cols-2 @min-[700px]:gap-x-8 @min-[700px]:gap-y-[72px]">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0">
              <dt className="text-xs leading-4 @min-[420px]:text-sm @min-[700px]:text-base @min-[700px]:leading-6">{metric.label}</dt>
              <dd className="mt-1 @min-[700px]:mt-2">
                <div className="break-words text-[clamp(1.45rem,5.5cqw,3rem)] leading-tight font-normal tracking-tight tabular-nums">
                  {metric.value}
                </div>
                <p className="mt-2 break-words text-xs leading-4 @min-[420px]:mt-3 @min-[420px]:text-sm @min-[420px]:leading-5 @min-[700px]:mt-6">{metric.description}</p>
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
