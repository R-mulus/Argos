import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import type { FonteCadastros } from "@/lib/cadastros";

export const chaveCadastros = (origem: string, ...partes: string[]) => ["cadastros", origem, ...partes];

/** Listas usadas pelos cadastros; as abas compartilham o cache (ex.: zonas mostram o código do receptor). */
export function useListasCadastro(fonte: FonteCadastros, origem: string) {
  return {
    dispositivos: useQuery({ queryKey: chaveCadastros(origem, "dispositivos"), queryFn: ({ signal }) => fonte.dispositivos(signal) }),
    zonas: useQuery({ queryKey: chaveCadastros(origem, "zonas"), queryFn: ({ signal }) => fonte.zonas(signal) }),
    animais: useQuery({ queryKey: chaveCadastros(origem, "animais"), queryFn: ({ signal }) => fonte.animais(signal) }),
    vinculos: useQuery({ queryKey: chaveCadastros(origem, "vinculos"), queryFn: ({ signal }) => fonte.vinculos(signal) }),
  };
}

/**
 * Mutação de cadastro: avisa sucesso ou falha e atualiza os cadastros e as telas de monitoramento,
 * que também usam zonas, receptores e vínculos.
 */
export function useMutacaoCadastro<V, R>(origem: string, executar: (variaveis: V) => Promise<R>, sucesso: (resultado: R, variaveis: V) => string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: executar,
    onSuccess: (resultado, variaveis) => toast.add({ type: "success", title: sucesso(resultado, variaveis) }),
    onError: erro => toast.add({ type: "error", title: "Não foi possível salvar", description: erro.message }),
    onSettled: () => Promise.all([
      cliente.invalidateQueries({ queryKey: ["cadastros", origem] }),
      cliente.invalidateQueries({ queryKey: ["inicio"] }),
    ]),
  });
}

/** Texto vazio vira `null` nos campos opcionais da API. */
export const opcional = (valor: string) => (valor.trim() ? valor.trim() : null);
