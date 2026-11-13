import { Icon } from "lucide-react"
import { cowHead } from "@lucide/lab"
import { Cell, Pie, PieChart } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"

export type SetorCabecas = {
  /** Identificador único do setor na propriedade. */
  id: string
  /** Nome exibido na legenda e no tooltip. */
  nome: string
  /** Quantidade de animais atribuídos a este setor. */
  quantidade: number
  /** Cor opcional do setor (ex.: "#EE8A1B"). */
  cor?: string
}

export type QuantidadeCabecasProps = {
  /** Quantidade por setor, preparada para futura resposta da API. */
  dados: SetorCabecas[]
  recentesSemZona?: number
  className?: string
}

// Valores de demonstração reproduzidos do Figma.
export const setoresSimulados: SetorCabecas[] = [
  { id: "curral-3", nome: "Curral 3", quantidade: 1232 },
  { id: "bebedouro", nome: "Bebedouro", quantidade: 890 },
  { id: "curral-1", nome: "Curral 1", quantidade: 425 },
  { id: "quintal", nome: "Quintal da casa", quantidade: 810 },
]

// Primeiras quatro cores inspiradas no Figma; demais cores para outros setores.
const CORES_SETORES = [
  "#C48135",
  "#503723",
  "#D4C7B4",
  "#946D52",
  "#EE8A1B",
  "#755640",
  "#B49B83",
  "#A8582B",
]

const configuracaoGrafico = {
  quantidade: { label: "Cabeças" },
} satisfies ChartConfig

const formatarQuantidade = (valor: number) =>
  valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 })

type SetorExibido = SetorCabecas & { corExibida: string }

/**
 * Rótulos desenhados como SVG sobre o gráfico. São ocultados por uma container
 * query quando o card é estreito; os valores continuam na legenda e no tooltip.
 */
function RotuloDaFatia({
  cx,
  cy,
  midAngle,
  outerRadius,
  value,
}: {
  cx?: string | number
  cy?: string | number
  midAngle?: number
  outerRadius?: number
  value?: number | string
}) {
  const quantidade = Number(value)

  if (
    !Number.isFinite(quantidade) ||
    midAngle === undefined ||
    outerRadius === undefined
  ) {
    return null
  }

  const radianos = (Math.PI / 180) * midAngle
  const deslocamento = outerRadius + 13
  const x = Number(cx) + Math.cos(-radianos) * deslocamento
  const y = Number(cy) + Math.sin(-radianos) * deslocamento
  const texto = formatarQuantidade(quantidade)
  const largura = Math.max(42, texto.length * 9 + 16)
  const altura = 28

  return (
    <g className="hidden @min-[430px]:block" aria-hidden="true">
      <rect
        x={x - largura / 2}
        y={y - altura / 2}
        width={largura}
        height={altura}
        rx={5}
        fill="#E1E1E1"
      />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#171717"
        fontSize={15}
      >
        {texto}
      </text>
    </g>
  )
}

export function QuantidadeCabecas({
  dados,
  recentesSemZona = 0,
  className,
}: QuantidadeCabecasProps) {
  // A API deve enviar cada animal atribuído a um único setor por contabilização.
  const distribuicao = recentesSemZona > 0
    ? [...dados, { id: "sem-zona", nome: "Sem zona", quantidade: recentesSemZona }]
    : dados
  const setores: SetorExibido[] = distribuicao.map((setor, indice) => ({
    ...setor,
    // Evita números negativos, fracionários ou não finitos no gráfico.
    quantidade: Number.isFinite(setor.quantidade)
      ? Math.max(0, Math.trunc(setor.quantidade))
      : 0,
    corExibida: setor.cor || CORES_SETORES[indice % CORES_SETORES.length],
  }))

  const total = setores.reduce((soma, setor) => soma + setor.quantidade, 0)
  const quantidadeSetoresComAnimais = setores.filter(
    (setor) => setor.quantidade > 0
  ).length

  // Se houver muitos setores, os rótulos externos ficariam sobrepostos.
  // A legenda continua mostrando os valores de todos os setores.
  const mostrarRotulos = quantidadeSetoresComAnimais <= 5

  return (
    <Card
      className={`@container w-full min-w-0 gap-2 py-4 @min-[500px]:gap-4 @min-[500px]:py-5 ${className ?? ""}`}
    >
      <CardHeader className="px-4 @min-[500px]:px-6">
        <CardTitle className="text-base leading-tight font-normal @min-[430px]:text-xl @min-[700px]:text-2xl">
          Quantidade de Cabeças
        </CardTitle>
      </CardHeader>

      <CardContent className="min-w-0 px-3 @min-[500px]:px-6">
        <div className="grid min-w-0 grid-cols-1 items-center gap-3 @min-[700px]:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] @min-[700px]:gap-6">
          <div
            role="region"
            aria-label={`Distribuição de ${formatarQuantidade(total)} animais entre ${setores.length} setores`}
            className="flex min-w-0 justify-center"
          >
            {total > 0 ? (
              <ChartContainer
                config={configuracaoGrafico}
                className="aspect-square! h-[220px] w-[220px] shrink-0 @min-[340px]:h-[255px] @min-[340px]:w-[255px] @min-[430px]:h-[300px] @min-[430px]:w-[300px] @min-[700px]:h-[320px] @min-[700px]:w-[320px]"
              >
                <PieChart margin={{ top: 18, right: 18, bottom: 18, left: 18 }}>
                  <Pie
                    data={setores}
                    dataKey="quantidade"
                    nameKey="nome"
                    cx="50%"
                    cy="50%"
                    innerRadius="51%"
                    outerRadius="78%"
                    startAngle={78}
                    endAngle={-282}
                    stroke="none"
                    isAnimationActive={false}
                    labelLine={false}
                    label={mostrarRotulos ? RotuloDaFatia : false}
                  >
                    {setores.map((setor) => (
                      <Cell key={setor.id} fill={setor.corExibida} />
                    ))}
                  </Pie>
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const registro = payload[0]?.payload as
                        | SetorExibido
                        | undefined
                      if (!registro) return null

                      const percentual =
                        total > 0 ? (registro.quantidade / total) * 100 : 0

                      return (
                        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-card-foreground shadow-md">
                          <p className="font-medium">{registro.nome}</p>
                          <p>{formatarQuantidade(registro.quantidade)} animais</p>
                          <p>{percentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total</p>
                        </div>
                      )
                    }}
                  />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="flex size-[220px] items-center justify-center rounded-full border border-dashed border-border text-center text-xs text-muted-foreground @min-[430px]:size-[300px]">
                Nenhum animal contabilizado
              </div>
            )}
          </div>

          <div className="min-w-0 pb-2 @min-[700px]:pb-0">
            <div className="flex items-center gap-3">
              <strong className="min-w-0 text-[clamp(2.25rem,10cqw,3.75rem)] leading-none font-normal tracking-tight tabular-nums">
                {formatarQuantidade(total)}
              </strong>
              <Icon
                iconNode={cowHead}
                aria-hidden="true"
                className="size-6 shrink-0 @min-[700px]:size-9"
              />
            </div>

            <h3 className="mt-5 text-sm font-normal @min-[430px]:text-base @min-[700px]:mt-7">
              Divisão por Setores
            </h3>
            <ul className="mt-3 grid gap-2 text-xs @min-[430px]:text-sm @min-[700px]:mt-4 @min-[700px]:gap-3">
              {setores.map((setor) => (
                <li key={setor.id} className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="size-4 shrink-0 rounded-[4px] @min-[430px]:size-6 @min-[700px]:size-7"
                    style={{ backgroundColor: setor.corExibida }}
                  />
                  <span className="min-w-0 flex-1 break-words">
                    {setor.nome}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatarQuantidade(setor.quantidade)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
