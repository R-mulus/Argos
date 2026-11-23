// Verificação rápida da tela inicial por renderização SSR com fixtures (não substitui o teste no navegador).
// Uso, na pasta frontend: node verificar-inicio.mjs
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { default: Monitoramento } = await server.ssrLoadModule('/src/pages/Monitoramento.tsx');
  const { cacheDesatualizado, resumoDemonstracao } = await server.ssrLoadModule('/src/lib/demonstracaoMonitoramento.ts');
  const { chaveMonitoramento } = await server.ssrLoadModule('/src/lib/fonteMonitoramento.ts');
  for (const cenario of ['preenchido', 'vazio', 'carregando', 'desatualizado', 'erro']) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
    const updatedAt = cenario === 'desatualizado' ? Date.now() - 10 * 60_000 : Date.now();
    if (cenario === 'erro') {
      try { await client.fetchQuery({ queryKey: chaveMonitoramento(cenario, 'resumo'), queryFn: () => { throw new Error('Falha simulada de conexão.'); } }); } catch { /* Estado de erro intencional. */ }
    } else if (cenario !== 'carregando') {
      const vazio = cenario === 'vazio';
      client.setQueryData(chaveMonitoramento(cenario, 'resumo'), vazio ? resumoDemonstracao(true) : cacheDesatualizado.resumo(), { updatedAt });
      client.setQueryData(chaveMonitoramento(cenario, 'receptores'), vazio ? { data: [], count: 0, limit: 100, offset: 0 } : cacheDesatualizado.receptores(), { updatedAt });
      client.setQueryData(chaveMonitoramento(cenario, 'zonas'), vazio ? { data: [], count: 0, limit: 100, offset: 0 } : cacheDesatualizado.zonas(), { updatedAt });
    }
    const markup = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(QueryClientProvider, { client }, React.createElement(Monitoramento, { demonstracao: cenario }))));
    assert.ok(!markup.includes('NaN'));
    // Nenhum card de exemplo do Figma nem métrica sem fonte na tela inicial.
    for (const removido of ['Temperatura', 'm/h', 'Dados Processados', 'Visão Geral', 'Análise Geral']) assert.ok(!markup.includes(removido), removido);
    for (const titulo of ['Resumo do Monitoramento', 'Monitoramento por Zonas', 'Contagem e Histórico do Rebanho', 'Status dos Receptores']) assert.ok(markup.includes(titulo), titulo);
    assert.ok(markup.includes('Aguardando dados reais de movimentação'), 'movimentação sem dados simulados');
    if (cenario === 'preenchido') {
      assert.ok(markup.includes('Simulado'), 'selo das métricas simuladas do destaque');
      assert.ok(markup.includes('Detectados recentemente') && markup.includes('de 80 cadastrados'));
      assert.ok(markup.includes('Receptores sem primeira leitura'));
      assert.ok(markup.includes('Sem zona'));
      assert.ok(markup.includes('Receptores Ativos'));
      assert.ok(markup.includes('1/1') && markup.includes('0/1'));
      assert.ok(markup.includes('href="/demonstracao/animais?zona='), 'cartões de zona apontam para a prévia');
    }
    if (cenario === 'vazio') {
      assert.ok(markup.includes('Nenhuma zona de monitoramento ativa') && markup.includes('Cadastrar zona'));
      assert.ok(markup.includes('Nenhum receptor cadastrado') && markup.includes('Cadastrar receptor'));
      assert.ok(markup.includes('href="/demonstracao/configuracoes?aba=dispositivos&amp;cenario=vazio"'));
      assert.ok(markup.includes('Nenhum animal detectado'));
    }
    if (cenario === 'carregando') { assert.ok(markup.includes('Carregando o monitoramento por zona')); assert.ok(markup.includes('Carregando…')); assert.ok(!/>0<\/p>/.test(markup), 'sem zeros durante o carregamento'); }
    if (cenario === 'desatualizado') assert.ok(markup.includes('Dados desatualizados'));
    if (cenario === 'erro') { assert.ok(markup.includes('Falha simulada')); assert.ok(markup.includes('Tentar novamente')); assert.ok(markup.includes('Indisponível')); }
    client.clear();
    console.log(`OK: ${cenario}`);
  }
} finally { await server.close(); }
