// Verificação do mapa no navegador (MapLibre + WebGL), sobre as prévias simuladas.
// Uso, com o servidor de desenvolvimento rodando (pnpm dev):
//   node verificar-mapa.mjs [http://127.0.0.1:5173/Argos/]
// Requer o pacote `playwright` resolvível a partir de frontend/ e o Chromium dele. Não é
// dependência do projeto: instale só na sua máquina, sem commitar package.json/lockfile, por exemplo
//   pnpm --dir frontend add -D playwright && pnpm --dir frontend exec playwright install chromium
// Leva cerca de um minuto: espera duas consultas de posições da prévia (15 s cada).
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = (process.argv[2] ?? 'http://127.0.0.1:5173/Argos/').replace(/\/?$/, '/');
const rota = (tela, extra = '') => `${base}#/demonstracao/${tela}?cenario=preenchido${extra}`;
const navegador = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ok = (msg) => console.log(`OK: ${msg}`);

async function abrir(pagina, url) {
  await pagina.goto(url);
  await pagina.locator('section[aria-labelledby^=mapa]').scrollIntoViewIfNeeded();
  await pagina.waitForFunction(() => {
    const m = window.__mapaArgos;
    return m && m.loaded() && m.getSource('animais') && m.isSourceLoaded('animais') && !m.isMoving();
  }, null, { timeout: 20000 });
  await pagina.waitForTimeout(1200);
}

/** Lado (px) do ícone do animal na tela, medido nos pixels brancos do círculo em volta do ponto. */
async function ladoIcone(pagina, id) {
  const centro = await pagina.evaluate((alvo) => {
    const m = window.__mapaArgos;
    const f = m.querySourceFeatures('animais').find(x => x.properties.id === alvo && !x.properties.cluster)
      ?? m.querySourceFeatures('animal-selecionado').find(x => x.properties.id === alvo);
    const p = m.project(f.geometry.coordinates);
    const r = m.getCanvas().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, id);
  const clip = { x: Math.round(centro.x - 40), y: Math.round(centro.y - 40), width: 80, height: 80 };
  const png = (await pagina.screenshot({ clip })).toString('base64');
  return pagina.evaluate(async (dados) => {
    const img = new Image();
    img.src = `data:image/png;base64,${dados}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let x0 = width, x1 = -1;
    // Só a linha central: outros ícones próximos não entram na medida.
    for (let y = Math.floor(height / 2) - 2; y <= Math.floor(height / 2) + 2; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] > 249 && data[i + 1] > 249 && data[i + 2] > 249) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    }
    return x1 < 0 ? 0 : (x1 - x0 + 1) / (img.width / 80);
  }, png);
}

try {
  const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
  const erros = [];
  pagina.on('pageerror', e => erros.push(String(e)));
  pagina.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  await abrir(pagina, rota('animais'));

  // Escolhe um animal fora de agrupamento e o seleciona (fica numa camada própria, sem agrupar).
  const animal = await pagina.evaluate(() => {
    const m = window.__mapaArgos;
    const { width, height } = m.getCanvas().getBoundingClientRect();
    const r = m.getCanvas().getBoundingClientRect();
    return m.queryRenderedFeatures({ layers: ['animais-icone'] }).find(f => {
      const p = m.project(f.geometry.coordinates);
      // Visível na janela e longe das bordas do mapa.
      return p.x > 60 && p.x < width - 60 && p.y > 60 && p.y < height - 60 && r.top + p.y > 60 && r.top + p.y < innerHeight - 60;
    })?.properties.id;
  });
  assert.ok(animal, 'deveria haver ao menos um animal com marcador individual');

  // 1. Zoom: o ícone mantém o mesmo tamanho em pixels.
  const ladoInicial = await ladoIcone(pagina, animal);
  assert.ok(ladoInicial >= 28 && ladoInicial <= 40, `ícone com ${ladoInicial}px`);
  await pagina.evaluate((alvo) => {
    const m = window.__mapaArgos;
    m.setMaxZoom(22);
    const f = m.querySourceFeatures('animais').find(x => x.properties.id === alvo);
    m.jumpTo({ center: f.geometry.coordinates, zoom: Math.min(21, m.getZoom() + 1.2) });
  }, animal);
  await pagina.waitForTimeout(800);
  const ladoAproximado = await ladoIcone(pagina, animal);
  assert.ok(Math.abs(ladoAproximado - ladoInicial) <= 2, `zoom alterou o ícone: ${ladoInicial} → ${ladoAproximado}`);
  await pagina.evaluate(() => window.__mapaArgos.jumpTo({ zoom: window.__mapaArgos.getZoom() - 1.2 }));
  await pagina.waitForTimeout(800);
  ok(`ícone constante no zoom (${ladoInicial}px → ${ladoAproximado}px)`);

  // 2. Pan e redimensionamento: marcadores DOM continuam sobre a coordenada correta.
  const antes = await pagina.evaluate((alvo) => {
    const m = window.__mapaArgos;
    const f = m.querySourceFeatures('animais').find(x => x.properties.id === alvo);
    return { lngLat: f.geometry.coordinates, px: m.project(f.geometry.coordinates) };
  }, animal);
  await pagina.evaluate(() => window.__mapaArgos.panBy([120, 60], { duration: 0 }));
  await pagina.waitForTimeout(400);
  const depois = await pagina.evaluate((ll) => window.__mapaArgos.project(ll), antes.lngLat);
  assert.ok(Math.abs(depois.x - (antes.px.x - 120)) < 1 && Math.abs(depois.y - (antes.px.y - 60)) < 1, 'pan deslocou o ponto de forma incorreta');
  ok('pan desloca os pontos exatamente o arrastado');

  const receptorAlinhado = () => pagina.evaluate(() => {
    const m = window.__mapaArgos;
    const r = m.getCanvas().getBoundingClientRect();
    const botoes = [...document.querySelectorAll('.maplibregl-marker > button[aria-pressed]')];
    // Cada marcador do MapLibre posiciona o elemento pelo centro: o centro do botão é a projeção.
    return botoes.map(b => {
      const caixa = b.getBoundingClientRect();
      return { x: caixa.left + caixa.width / 2 - r.left, y: caixa.top + caixa.height / 2 - r.top, rotulo: b.getAttribute('aria-label') };
    });
  });
  const centrosAntes = await receptorAlinhado();
  assert.ok(centrosAntes.length > 0, 'deveria haver receptores no mapa');
  await pagina.evaluate(() => window.__mapaArgos.panBy([-50, 30], { duration: 0 }));
  await pagina.waitForTimeout(300);
  const centrosDepois = await receptorAlinhado();
  centrosAntes.forEach((c, i) => {
    assert.ok(Math.abs(centrosDepois[i].x - (c.x + 50)) < 1.5 && Math.abs(centrosDepois[i].y - (c.y - 30)) < 1.5, `receptor ${c.rotulo} não acompanhou o pan`);
  });
  ok(`${centrosAntes.length} receptores acompanham o pan`);

  const idInstancia = await pagina.evaluate(() => (window.__mapaArgos.__argosId ??= Math.random()));
  await pagina.setViewportSize({ width: 390, height: 844 });
  await pagina.waitForTimeout(1200);
  const tamanhos = await pagina.evaluate(() => {
    const m = window.__mapaArgos;
    const c = m.getContainer().getBoundingClientRect();
    const canvas = m.getCanvas().getBoundingClientRect();
    return { container: Math.round(c.width), canvas: Math.round(canvas.width) };
  });
  assert.equal(tamanhos.canvas, tamanhos.container, 'canvas não acompanhou o contêiner');
  assert.equal(await pagina.evaluate(() => window.__mapaArgos.__argosId), idInstancia, 'redimensionar recriou o mapa');
  ok(`redimensionamento sem recriar o mapa (canvas ${tamanhos.canvas}px)`);
  await pagina.setViewportSize({ width: 1440, height: 900 });
  await pagina.waitForTimeout(800);

  // 3. Animais próximos: no zoom mínimo ficam agrupados e a soma confere com os animais posicionados.
  await pagina.evaluate(() => window.__mapaArgos.jumpTo({ zoom: window.__mapaArgos.getMinZoom() + 4 }));
  await pagina.waitForTimeout(1200);
  const grupos = await pagina.evaluate(() => {
    const m = window.__mapaArgos;
    const visiveis = m.querySourceFeatures('animais');
    const vistos = new Set();
    let total = 0;
    for (const f of visiveis) {
      const chave = f.properties.cluster ? `c${f.properties.cluster_id}` : f.properties.id;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      total += f.properties.cluster ? f.properties.point_count : 1;
    }
    const marcadores = [...document.querySelectorAll('.maplibregl-marker')].filter(e => /animais com posição próxima/.test(e.getAttribute('aria-label') ?? ''));
    return { total, marcadores: marcadores.length, botoesSomados: marcadores.reduce((s, e) => s + Number(e.textContent), 0) };
  });
  const posicionados = await pagina.locator('button:has-text("Posição")').count();
  assert.ok(grupos.marcadores > 0, 'deveria haver agrupamentos no zoom afastado');
  assert.ok(grupos.total >= posicionados, `agrupamentos somam ${grupos.total}`);
  ok(`agrupamento: ${grupos.marcadores} grupos, ${grupos.total} animais`);

  // 4. Nova estimativa move o marcador sem recriar o mapa; a mesma estimativa não move.
  const pos = () => pagina.evaluate(() => Object.fromEntries(window.__mapaArgos.querySourceFeatures('animais').filter(f => !f.properties.cluster).map(f => [f.properties.id, f.geometry.coordinates.join(',')])));
  await pagina.evaluate(() => window.__mapaArgos.jumpTo({ zoom: 20 }));
  await pagina.waitForTimeout(1000);
  const antesAtualizar = await pos();
  // Re-renderização do React (selecionar outro animal na lista) não pode mover os demais marcadores.
  await pagina.locator('button[aria-pressed]:has-text("Posição")').nth(1).click();
  await pagina.waitForTimeout(400);
  const semNovaEstimativa = await pos();
  const comuns = Object.keys(antesAtualizar).filter(k => k in semNovaEstimativa);
  assert.ok(comuns.length > 0 && comuns.every(k => antesAtualizar[k] === semNovaEstimativa[k]), 'marcador se moveu sem nova estimativa');
  ok('re-renderização não move marcadores');
  // A prévia gera um passo a cada 20 s e a consulta repete a cada 15 s.
  await pagina.waitForTimeout(36000);
  const depoisAtualizar = await pos();
  const movidos = Object.keys(antesAtualizar).filter(k => k in depoisAtualizar && antesAtualizar[k] !== depoisAtualizar[k]);
  assert.ok(movidos.length > 0, 'nenhum marcador se moveu após nova estimativa');
  assert.equal(await pagina.evaluate(() => window.__mapaArgos.__argosId), idInstancia, 'atualização recriou o mapa');
  ok(`nova estimativa moveu ${movidos.length} marcadores sem recriar o mapa`);

  // 5. Troca de zona: mesma instância, contorno em foco muda.
  const urlZona = rota('animais', '&zona=zona-1');
  await pagina.goto(urlZona);
  await pagina.waitForTimeout(2500);
  const foco = await pagina.evaluate(() => window.__mapaArgos.querySourceFeatures('zonas').filter(f => f.properties.foco).map(f => f.properties.id));
  assert.deepEqual([...new Set(foco)], ['zona-1'], 'zona em foco incorreta');
  ok('troca de zona destaca a zona escolhida');

  // 6. Desmontar e remontar sem acumular mapas.
  const anterior = await pagina.evaluateHandle(() => window.__mapaArgos);
  for (const tela of ['inicio', 'animais', 'receptores', 'animais']) {
    await pagina.goto(rota(tela));
    await pagina.waitForTimeout(1500);
  }
  await abrir(pagina, rota('animais'));
  const contagem = await pagina.evaluate((velho) => ({
    mapas: document.querySelectorAll('.maplibregl-map').length,
    canvases: document.querySelectorAll('canvas.maplibregl-canvas').length,
    removido: velho._removed === true,
  }), anterior);
  assert.deepEqual(contagem, { mapas: 1, canvases: 1, removido: true }, JSON.stringify(contagem));
  ok('remontagem mantém um único mapa e remove a instância anterior');

  // 7. Sem coordenadas: aviso e nenhum receptor no mapa.
  // O cenário da prévia é lido ao abrir a página: usa uma aba nova.
  const paginaVazia = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
  await paginaVazia.goto(`${base}#/demonstracao/receptores?cenario=vazio`);
  await paginaVazia.waitForTimeout(3000);
  assert.equal(await paginaVazia.locator('.maplibregl-marker > button[aria-pressed]').count(), 0, 'receptor sem coordenada no mapa');
  assert.ok(await paginaVazia.getByText('Nenhum receptor com coordenadas cadastradas.').isVisible(), 'aviso de coordenadas ausente');
  ok('cenário vazio sem marcadores inventados');

  // 8. Desenho de zona (Configurações › Mapa): desenhar, arrastar um vértice e salvar.
  await pagina.goto(rota('configuracoes', '&aba=mapa'));
  await pagina.waitForTimeout(2500);
  await pagina.getByRole('radio', { name: /Curral 01/ }).click();
  const editor = pagina.getByRole('application', { name: /contorno da zona/ });
  await editor.scrollIntoViewIfNeeded();
  await pagina.waitForTimeout(1500);
  await pagina.getByRole('button', { name: 'Desenhar de novo' }).click();
  const caixa = await editor.boundingBox();
  const [cx, cy] = [caixa.x + caixa.width / 2, caixa.y + caixa.height / 2];
  const vertices = [[cx - 150, cy - 90], [cx + 150, cy - 100], [cx + 170, cy + 90], [cx - 140, cy + 100]];
  for (const [x, y] of [...vertices, vertices[0]]) {
    await pagina.mouse.move(x, y);
    await pagina.waitForTimeout(120);
    await pagina.mouse.click(x, y);
    await pagina.waitForTimeout(250);
  }
  const situacao = () => pagina.locator('p[aria-live=polite]').innerText();
  assert.match(await situacao(), /^4 vértices/, 'desenho não fechou com 4 vértices');
  const areaAntes = await situacao();
  await pagina.mouse.move(vertices[1][0], vertices[1][1]);
  await pagina.mouse.down();
  await pagina.mouse.move(vertices[1][0] + 60, vertices[1][1] - 40, { steps: 8 });
  await pagina.mouse.up();
  await pagina.waitForTimeout(500);
  assert.notEqual(await situacao(), areaAntes, 'arrastar o vértice não mudou a área');
  await pagina.getByRole('button', { name: 'Salvar contorno' }).click();
  await pagina.waitForTimeout(1200);
  await pagina.getByText('Digitar vértices (alternativa sem mouse)').click();
  const vertSalvos = (await pagina.locator('textarea').nth(2).inputValue()).trim().split('\n');
  assert.equal(vertSalvos.length, 4, 'contorno salvo deveria ter 4 vértices');
  ok('desenho de zona: 4 vértices, edição por arraste e gravação em metros');

  // 9. Localização no satélite: ir para coordenadas, marcar origem e receptor, salvar.
  await pagina.goto(rota('configuracoes', '&aba=mapa'));
  await pagina.waitForTimeout(2500);
  await pagina.fill('#ref-busca', 'https://www.google.com/maps/@-18.5789,-46.5181,17z');
  await pagina.getByRole('button', { name: 'Ir', exact: true }).click();
  await pagina.waitForTimeout(1500);
  const satelite = pagina.locator('[role=application]').first();
  await satelite.scrollIntoViewIfNeeded();
  const area = await satelite.boundingBox();
  await pagina.mouse.click(area.x + area.width / 2 - 120, area.y + area.height / 2 + 80);
  await pagina.waitForTimeout(600);
  assert.match(await pagina.inputValue('#ref-latitude'), /^-18,57/, 'clique não marcou a origem');
  await pagina.getByRole('radio', { name: 'R03' }).click();
  await pagina.mouse.click(area.x + area.width / 2 + 60, area.y + area.height / 2 - 120);
  await pagina.waitForTimeout(400);
  assert.ok(await pagina.getByText('Receptores reposicionados').isVisible(), 'receptor não foi reposicionado');
  await pagina.getByRole('button', { name: 'Salvar localização' }).click();
  await pagina.waitForTimeout(2000);
  assert.ok(await pagina.locator("p:has-text('Modo atual: mapa de satélite')").count() > 0, 'referência geográfica não foi salva');
  ok('localização no satélite: origem e receptor marcados e salvos');

  assert.deepEqual(erros.filter(e => !/ERR_TUNNEL|Failed to load resource|GPU stall|arcgisonline|AJAXError/.test(e)), [], 'erros no console');
  ok('sem erros no console');
} finally {
  await navegador.close();
}
