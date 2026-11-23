# Product backlog — consolidação ML

Atualização 22/11/2026: S3–S6 têm evidência técnica isolada; S7 entregue como migrations e RPC
testadas, aguardando revisão/implantação autorizada. IoT ganhou avisos duráveis e recuperação
NTP conservadora. S8 pertence ao integrador; S9/S10 ainda dependem de staging e aceite operacional.
Ver [entrega atual](ENTREGA_ML_SQL.md); a tabela abaixo preserva o estado inicial da auditoria.

Prioridade e dependências: S0 → S1 → S2 → S3 → S4 → S5; S6/S7 reutilizam S3; S8 integra S5/S7; S9/S10 encerram a entrega técnica.

| Sprint | História e tarefa técnica | Estado inicial |
|---|---|---|
| S0 | Como desenvolvedor, conhecer contratos, arquitetura e regressões; auditar e executar baseline | Concluída: 45 testes Python |
| S1 | Como operador, localizar beacons completos; consolidar validações e diagnóstico GET | Concluída tecnicamente; calibração de campo pendente |
| S2 | Como operador, persistir com segurança; bloquear calibração experimental, exclusão mútua, métricas e recuperação | Em implementação |
| S3 | Como engenheiro, exportar datasets reproduzíveis; origem, hash e referencial obrigatórios | Pendente |
| S4 | Como operador, prever posição; reusar GRU, reforçar integridade e avaliação | Pendente |
| S5 | Como operador, obter inferência automática; validar outbox e compatibilidade | Pendente |
| S6 | Como operador, distinguir movimento aparente e comportamento rotulado | Base funcional; consolidação pendente |
| S7 | Como operador, consultar KPIs cobertos e indisponibilidade explícita | Base funcional; integração pendente |
| S8 | Como operador, visualizar trajetória e previsão na tela de animais existente | Pendente |
| S9 | Como desenvolvedor, testar fluxo isolado e falhas sem tocar produção | Pendente |
| S10 | Como mantenedor, executar e revisar rollout | Pendente |

Bloqueios externos: calibração física, posições de referência, rótulos reais, autorização para migration de predição e ensaio autenticado em staging. Não impedem testes isolados nem integração de estados vazios.
