import type { ReactNode } from "react"
import { cn } from "cn"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export type ColunaCadastro<T> = {
  titulo: string
  celula: (item: T) => ReactNode
  className?: string
}

type TabelaCadastroProps<T> = {
  titulo: string
  /** Botões ou filtros à direita do título. */
  acoes?: ReactNode
  colunas: ColunaCadastro<T>[]
  itens: T[]
  chave: (item: T) => string
  /** Ações por linha (Editar, Ativar...), na última coluna. */
  acoesLinha?: (item: T) => ReactNode
  vazio: ReactNode
  rodape?: ReactNode
  className?: string
}

/** Tabela de cadastro no visual do Histórico de Leitura do Figma: linhas listradas e rolagem horizontal. */
export function TabelaCadastro<T>({ titulo, acoes, colunas, itens, chave, acoesLinha, vazio, rodape, className }: TabelaCadastroProps<T>) {
  return (
    <Card className={cn("@container w-full min-w-0 gap-3 py-4 @min-[630px]:gap-4 @min-[630px]:py-5", className)}>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 px-4 @min-[630px]:px-6">
        <CardTitle className="text-lg leading-tight font-normal @min-[630px]:text-2xl">{titulo}</CardTitle>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </CardHeader>
      <CardContent className="space-y-3 px-4 @min-[630px]:px-6">
        <div className="border-t border-foreground/80 pt-2">
          {itens.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{vazio}</p>
          ) : (
            <Table className="min-w-[760px] text-xs @min-[700px]:text-sm">
              <TableHeader>
                <TableRow className="border-b border-border/70 hover:bg-transparent">
                  {colunas.map(coluna => (
                    <TableHead key={coluna.titulo} className={cn("h-9 px-3 font-normal text-foreground", coluna.className)}>{coluna.titulo}</TableHead>
                  ))}
                  {acoesLinha && <TableHead className="h-9 px-3 text-right font-normal text-foreground">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((item, indice) => (
                  <TableRow key={chave(item)} className={cn("border-b-0 hover:bg-accent/70", indice % 2 === 0 ? "bg-muted/70" : "bg-card")}>
                    {colunas.map(coluna => (
                      <TableCell key={coluna.titulo} className={cn("h-11 px-3 py-1.5", coluna.className)}>{coluna.celula(item)}</TableCell>
                    ))}
                    {acoesLinha && <TableCell className="h-11 px-3 py-1.5"><div className="flex justify-end gap-2">{acoesLinha(item)}</div></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        {rodape}
      </CardContent>
    </Card>
  )
}
