import type { ReactNode } from "react";
import { format } from "date-fns";
import { AvisoEstado } from "@/components/custom/AvisoEstado";
import { Card } from "@/components/ui/card";

/** Sem atualização concluída há mais de 90 s (três ciclos de 30 s), os dados são tratados como antigos. */
const LIMITE_ANTIGO_MS = 90_000;

/** Subconjunto do resultado do TanStack Query usado pelos estados de consulta. */
export type ConsultaExibida = {
  data?: unknown;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  error: Error | null;
  dataUpdatedAt: number;
  refetch: () => unknown;
};

/** Carregamento ou erro de um bloco que ainda não tem dados. Não renderiza nada quando há dados. */
export function EstadoBloco({ consulta, nome, className = "" }: { consulta: ConsultaExibida; nome: string; className?: string }) {
  if (consulta.data !== undefined) return null;
  if (consulta.isError) {
    return (
      <AvisoEstado
        tom="erro"
        titulo={`Não foi possível carregar ${nome}`}
        acao={{ rotulo: "Tentar novamente", aoClicar: () => void consulta.refetch(), desabilitada: consulta.isFetching }}
        className={className}
      >
        {consulta.error?.message}
      </AvisoEstado>
    );
  }
  return <Card className={`p-6 ${className}`}><p role="status" className="text-muted-foreground">Carregando {nome}…</p></Card>;
}

/** Aviso exibido somente quando os dados na tela pertencem a uma consulta antiga ou que falhou ao atualizar. */
export function AvisoAntigo({ consultas, agora, limiteMs = LIMITE_ANTIGO_MS }: { consultas: ConsultaExibida[]; agora: number; limiteMs?: number }) {
  const antigas = consultas.filter(c => c.data !== undefined && (c.isError || agora - c.dataUpdatedAt > limiteMs));
  if (!antigas.length) return null;
  const desde = Math.min(...antigas.map(c => c.dataUpdatedAt));
  return (
    <p role="alert" className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
      Dados desatualizados: a última atualização concluída foi às {format(desde, "HH:mm")}.
      <button type="button" className="font-medium underline underline-offset-4" onClick={() => antigas.forEach(c => void c.refetch())}>Tentar novamente</button>
    </p>
  );
}

/** Seção com o título no padrão do Figma (30 px) e conteúdo opcional à direita. */
export function Secao({ titulo, id, extra, children, className = "" }: { titulo: string; id: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={className}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 lg:mb-[54px]">
        <h2 id={id} className="text-2xl leading-tight font-medium lg:text-[30px]">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}
