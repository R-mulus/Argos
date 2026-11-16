import { ResumoCurral, type AlertaCurral } from "@/components/custom/ResumoCurral"
import { SeloSimulado } from "@/components/custom/SeloSimulado"

type ResumoZonaProps = {
  nome: string
  animaisAtivos: number
  receptoresAtivos: number | null
  totalReceptores: number | null
  coleirasAtivas: number | null
  animalDestaqueId?: string
  atualizadoEm: string
  alertas?: AlertaCurral[]
  aoAtualizar: () => Promise<void>
}

/**
 * Banner da zona (ResumoCurral do Figma) com os dados reais disponíveis.
 * Intervalo entre dados e Precisão não têm fonte e ficam simulados, com selo.
 */
export function ResumoZona({ nome, animaisAtivos, receptoresAtivos, totalReceptores, coleirasAtivas, animalDestaqueId, atualizadoEm, alertas, aoAtualizar }: ResumoZonaProps) {
  return (
    <div className="relative">
      <ResumoCurral
        imagemFundo={`${import.meta.env.BASE_URL}lavoura.jpeg`}
        aoAtualizar={aoAtualizar}
        dados={{
          nome,
          animaisAtivos,
          receptoresAtivos: receptoresAtivos ?? undefined,
          totalReceptores: totalReceptores ?? undefined,
          coleirasAtivas: coleirasAtivas ?? undefined,
          intervaloDadosMinutos: 38,
          precisaoPercentual: 94.6,
          animalDestaqueId,
          ultimaAtualizacao: atualizadoEm,
          alertas,
        }}
      />
      <SeloSimulado
        className="absolute top-[68px] right-4 z-30 sm:top-auto sm:bottom-4"
        descricao="Intervalo entre dados e Precisão são simulados. O cadastro não tem nome de animal; os demais valores vêm da API."
      />
    </div>
  )
}
