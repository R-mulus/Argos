import type { FormEvent, ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"

type PainelFormularioProps = {
  aberto: boolean
  aoFechar: () => void
  titulo: string
  descricao?: string
  /** Executado no envio; a validação local fica a cargo de quem usa o painel. */
  aoEnviar: () => void
  salvando: boolean
  /** Mensagem de erro do servidor, exibida acima dos botões. */
  erro?: string | null
  rotuloEnviar?: string
  children: ReactNode
}

/** Painel lateral para criar ou editar cadastros, com a faixa marrom do menu e o botão laranja de ação. */
export function PainelFormulario({ aberto, aoFechar, titulo, descricao, aoEnviar, salvando, erro, rotuloEnviar = "Salvar", children }: PainelFormularioProps) {
  function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (!salvando) aoEnviar()
  }
  return (
    <Sheet open={aberto} onOpenChange={aberto => { if (!aberto && !salvando) aoFechar() }}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="rounded-bl-[24px] bg-secondary px-6 py-5 text-secondary-foreground">
          <SheetTitle className="text-2xl font-normal text-secondary-foreground">{titulo}</SheetTitle>
          {descricao && <SheetDescription className="text-secondary-foreground/80">{descricao}</SheetDescription>}
        </SheetHeader>
        <form noValidate onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">{children}</div>
          <SheetFooter className="gap-3 border-t px-6 py-4">
            {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="h-10 rounded-full border-2 px-5" disabled={salvando} onClick={aoFechar}>Cancelar</Button>
              <Button type="submit" className="h-10 rounded-full px-5 text-white" disabled={salvando}>{salvando ? "Salvando…" : rotuloEnviar}</Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
