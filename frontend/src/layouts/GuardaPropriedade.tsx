import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { chaveCadastros } from "@/hooks/useCadastros";
import type { FonteCadastros } from "@/lib/cadastros";
import PrimeiroAcesso from "@/pages/PrimeiroAcesso";

/** Mostra o primeiro acesso enquanto a conta não tiver propriedade; depois, as telas do app. */
export default function GuardaPropriedade({ fonte, origem, email, children }: { fonte: FonteCadastros; origem: string; email?: string; children: ReactNode }) {
  const propriedade = useQuery({ queryKey: chaveCadastros(origem, "propriedade"), queryFn: ({ signal }) => fonte.propriedade(signal), staleTime: 5 * 60_000 });
  if (propriedade.isPending) return <p role="status" className="p-8 text-center text-muted-foreground">Verificando a propriedade…</p>;
  if (propriedade.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-card p-4">
        <Card className="max-w-md gap-3 p-6">
          <p role="alert">Não foi possível verificar a propriedade: {propriedade.error.message}</p>
          <Button variant="outline" className="self-start" onClick={() => void propriedade.refetch()}>Tentar novamente</Button>
        </Card>
      </div>
    );
  }
  if (propriedade.data === null) return <PrimeiroAcesso fonte={fonte} origem={origem} email={email} />;
  return <>{children}</>;
}
