// Jornada 2: navegar pelo menu. Duas voltas por execucao: a 1a baixa os pedacos, a 2a ja os tem.
// uso: node navegar.mjs <perfil> <N> <opcoesJSON> <sufixo>
import { abrir, URL0, sossegar, mediana, salvar, r0, r1 } from './lib.mjs';
import { interagir, linha } from './medir.mjs';
const nome = process.argv[2] || 'cel-medio';
const N = +(process.argv[3] || 3);
const extra = process.argv[4] ? JSON.parse(process.argv[4]) : {};
const suf = process.argv[5] || '';
const item = (r) => `.q-trilho .q-item[data-px-rota="${r}"]`;
const noMais = (t) => `.q-mais-fundo:not(.px-saindo) .q-tile:has-text("${t}")`;
const MAIS = '.q-trilho .q-mais-botao';
const tela = { modo: 'tela' };
const abreMais = { modo: 'aparece', seletor: '.q-mais-fundo:not(.px-saindo) .q-tile' };
function roteiro(celular) {
  /* A navegacao de 10/10/2026: no computador o trilho tem Inicio, Capturar, Interprete, Biblioteca, Cartoes e Jogar;
     no celular a barra tem Inicio, Praticar (Cartoes e Jogar), Capturar, Interprete e Mais. Estatisticas,
     Personalizar e Ajustes ficam no Mais nos dois. Biblioteca e Vocabulario sao so um aviso na edicao estatica. */
  const viaMais = (rot, texto) => [
    ['abrir Mais (p/ ' + rot + ')', MAIS, abreMais],
    [rot, noMais(texto), tela],
  ];
  return [
    ['Capturar', item('capture'), tela],
    ['Interprete', item('interprete'), tela],
    ...(celular ? [['Sair do Interprete', 'button[aria-label="Sair do modo intérprete"]', tela]] : []),
    ['Jogar', celular ? '.q-trilho .q-item[data-px-tambem="play"]' : item('play'), tela],
    ...viaMais('Estatisticas', 'Estatísticas'),
    ...viaMais('Personalizar', 'Personalizar'),
    ...viaMais('Ajustes', 'Ajustes'),
    ...(celular ? [] : [['Cartoes', item('cartoes'), tela]]),
    ['Inicio', item('hub'), tela],
  ];
}
const runs = [];
for (let i = 0; i < N; i++) {
  const s = await abrir(nome, { ...extra, storage: { ...(extra.storage ?? {}), 'babel.praticar': 'play', 'babel.fonte_da_pratica': '{"origem":"trilha","escopo":"todas"}' } });
  const voltas = [];
  try {
    await s.page.goto(URL0 + '/', { waitUntil: 'load', timeout: 90000 });
    await sossegar(s);
    for (const volta of [1, 2]) {
      const passos = [];
      for (const [rot, alvo, opc] of roteiro(s.P.toque)) {
        try {
          if (!s.P.toque && !(await s.page.locator(MAIS).isVisible())) {
            await s.page.locator('button[aria-label="Sair do modo intérprete"]').click({ timeout: 5000 }).catch(() => {});
            await s.page.waitForTimeout(2500);
          }
          const x = await interagir(s, rot, alvo, opc);
          passos.push(x);
          console.log(`${nome} r${i} v${volta} ${linha(x)}`);
        } catch (e) {
          console.log(`${nome} r${i} v${volta} ${rot} ERRO ${String(e).slice(0, 200)}`);
          passos.push({ rotulo: rot, erro: String(e).slice(0, 200) });
          /* se um painel ficou aberto, fecha */
          await s.page.keyboard.press('Escape').catch(() => {});
        }
        await s.page.waitForTimeout(700);
        if (rot === 'Jogar') {
          const fechar = s.page.locator('.q-mais-fundo button:has-text("Fechar sem mudar nada")').first();
          if (await fechar.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) {
            await s.page.waitForTimeout(1200);
            await fechar.click({ force: true }).catch(() => {});
            await s.page.waitForTimeout(1800);
          }
        }
      }
      voltas.push(passos);
    }
  } catch (e) {
    console.log(nome, i, 'ERRO', String(e).slice(0, 300));
  }
  runs.push(voltas);
  await s.browser.close();
}
const resumo = {};
for (const v of [0, 1]) {
  const rotulos = (runs[0]?.[v] ?? []).map((p) => p.rotulo);
  resumo['volta' + (v + 1)] = rotulos.map((rot, j) => {
    const xs = runs.map((r) => r[v]?.[j]).filter((x) => x && !x.erro);
    const m = (f) => mediana(xs.map(f));
    return {
      rotulo: rot,
      n: xs.length,
      troca: r0(m((x) => x.troca)),
      conteudo: r0(m((x) => x.conteudo)),
      pintou: r0(m((x) => x.pintou)),
      assentou: r0(m((x) => x.assentou)),
      inp: r0(m((x) => x.inp)),
      proc: r0(m((x) => x.proc)),
      nLt: m((x) => x.nLt),
      somaLt: r0(m((x) => x.somaLt)),
      maiorLt: r0(m((x) => x.maiorLt)),
      bloqueio: r0(m((x) => x.bloqueio)),
      fps: r1(m((x) => x.q.fps)),
      p95: r1(m((x) => x.q.p95)),
      maxQuadro: r1(m((x) => x.q.max)),
      acima50: m((x) => x.q.acima50),
      script: m((x) => x.cpu.script_ms),
      estilo: m((x) => x.cpu.estilo_ms),
      layout: m((x) => x.cpu.layout_ms),
      tarefa: m((x) => x.cpu.tarefa_ms),
      baixou: m((x) => x.baixou),
      baixouKb: r1(m((x) => x.baixouKb)),
      jsKb: r1(m((x) => x.jsKb)),
      ultimoRecurso: r0(m((x) => x.ultimoRecurso)),
      nos: m((x) => x.nos),
    };
  });
}
for (const k in resumo) for (const l of resumo[k]) console.log('MEDIANA', nome, k, JSON.stringify(l));
salvar(`navegar${suf}-${nome}.json`, { resumo, runs });
console.log('FIM');
