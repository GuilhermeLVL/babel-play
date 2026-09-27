/**
 * SIMULAÇÃO DO RITMO DA ECONOMIA (recompensas v2, Task 2.4) — o que calibra os preços da Loja.
 *
 *   npx tsx scripts/economia/simular-ritmo.ts            # tabela dos 3 perfis × 30 dias
 *   npx tsx scripts/economia/simular-ritmo.ts --json     # a mesma coisa, em JSON
 *
 * TRÊS PERFIS, 30 DIAS CADA, com os pesos REAIS do core (`PESOS_SEEDS`, o teto de palavras, a meta
 * do dia, o baú de `decidirBau` com teto, garantia e repetido) e a maestria da onda 3
 * (`src/core/maestria.ts`: acertos × multiplicador de precisão + bônus de combo; limiares 30/100/
 * 220/400/600; 20 Seeds × nível). Nada por tempo: só revisões, rodadas e palavras salvas.
 *
 *   leve     10 revisões + 1 rodada por dia
 *   típico   25 revisões + 3 rodadas + 10 palavras salvas + meta do dia
 *   intenso  60 revisões + 8 rodadas + 30 palavras salvas + meta do dia
 *
 * A precisão varia por rodada (sorteio com semente fixa: a saída é reprodutível). A META de preço
 * (spec 7.1, decisão do dono): no perfil TÍPICO, um comum a cada 2–3 dias, um raro por semana e um
 * épico a cada 2–3 semanas, só com Seeds. O script imprime Seeds/dia e quantos dias cada faixa de
 * preço do catálogo custa, e a faixa-alvo por raridade que fecha essa conta.
 */
import {
  BAUS_POR_DIA,
  decidirBau,
  ESTRELAS_PARA_O_BAU,
  itensSorteaveisNoDrop,
  SEEDS_DO_DROP,
} from '../../src/core/economiaAutoridade';
import { META_DIARIA_ACERTOS, TETO_PALAVRAS_SALVAS_POR_DIA } from '../../src/core/learning/economia';
import { PESOS_SEEDS } from '../../src/core/learning/xp';
import { CATALOGO_DA_LOJA, type Raridade } from '../../src/core/loja';
import { nivelDeMaestria, pontosDeMaestria } from '../../src/core/maestria';
import { estrelasDaRodada } from '../../src/core/minigames/fases';

/* ── Maestria: a régua real da onda 3 (`src/core/maestria.ts`). ── */
const nivelDe = (pontos: number) => nivelDeMaestria(pontos).nivel;

/* ── Sorteio reprodutível (mulberry32). ── */
function semente(s: number) {
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Perfil {
  id: string;
  revisoes: number;
  rodadas: number;
  palavras: number;
  /** Precisão média nas revisões e nas rodadas. */
  precisao: number;
  itensPorRodada: number;
  /** Quantos jogos a pessoa alterna (a maestria sobe por jogo). */
  jogos: number;
}

export const PERFIS: Perfil[] = [
  { id: 'leve', revisoes: 10, rodadas: 1, palavras: 0, precisao: 0.8, itensPorRodada: 10, jogos: 2 },
  { id: 'tipico', revisoes: 25, rodadas: 3, palavras: 10, precisao: 0.85, itensPorRodada: 10, jogos: 3 },
  { id: 'intenso', revisoes: 60, rodadas: 8, palavras: 30, precisao: 0.9, itensPorRodada: 10, jogos: 4 },
];

export interface ResultadoDoPerfil {
  perfil: string;
  dias: number;
  seedsTotal: number;
  seedsPorDia: number;
  porFonte: Record<string, number>;
  baus: number;
  pecasDoBau: number;
}

export function simular(p: Perfil, dias = 30, seed = 42): ResultadoDoPerfil {
  const rnd = semente(seed);
  const fonte: Record<string, number> = {};
  const soma = (k: string, v: number) => (fonte[k] = (fonte[k] ?? 0) + v);
  const possui = new Set<string>();
  const maestria = new Array(p.jogos).fill(0);
  let semRaro = 0;
  let baus = 0;
  let pecas = 0;
  let sequencia = 0;
  let jogo = 0;

  for (let d = 0; d < dias; d++) {
    let acertosDoDia = 0;
    // Revisões: cada uma acerta com a precisão do perfil.
    for (let i = 0; i < p.revisoes; i++) {
      if (rnd() < p.precisao) {
        soma('revisaoCerta', PESOS_SEEDS.revisaoCerta);
        acertosDoDia++;
      }
    }
    // Palavras salvas da captura: 1 pela palavra (teto diário) + 1 pelo cartão criado.
    const salvas = Math.min(TETO_PALAVRAS_SALVAS_POR_DIA, p.palavras);
    soma('palavraSalva', salvas * PESOS_SEEDS.palavraSalva);
    soma('cartao', p.palavras * PESOS_SEEDS.cartao);
    // Rodadas.
    let bausHoje = 0;
    for (let r = 0; r < p.rodadas; r++) {
      const precisaoDaRodada = Math.min(1, Math.max(0.4, p.precisao + (rnd() - 0.5) * 0.3));
      let certos = 0;
      let combo = 0;
      let comboMax = 0;
      for (let i = 0; i < p.itensPorRodada; i++) {
        if (rnd() < precisaoDaRodada) {
          certos++;
          combo++;
          comboMax = Math.max(comboMax, combo);
        } else combo = 0;
      }
      acertosDoDia += certos;
      soma('jogoCerto', certos * PESOS_SEEDS.jogoCerto);
      if (certos === p.itensPorRodada) soma('rodadaPerfeita', PESOS_SEEDS.rodadaPerfeita);
      // Maestria do jogo desta rodada.
      const antes = nivelDe(maestria[jogo]);
      maestria[jogo] += pontosDeMaestria({ acertos: certos, total: p.itensPorRodada, comboMaximo: comboMax });
      for (let n = antes + 1; n <= nivelDe(maestria[jogo]); n++) soma('maestria', PESOS_SEEDS.nivelDeMaestria * n);
      jogo = (jogo + 1) % p.jogos;
      // Baú.
      const estrelas = estrelasDaRodada(Math.round((certos / p.itensPorRodada) * 100));
      const decisao = decidirBau({
        estrelas,
        bausHoje,
        semRaroSeguidos: semRaro,
        sorteio: rnd(),
        elegiveis: itensSorteaveisNoDrop(possui),
      });
      if (decisao.tipo === 'sem-bau') continue;
      bausHoje++;
      baus++;
      semRaro = decisao.raridade === 'raro' ? 0 : semRaro + 1;
      if (decisao.tipo === 'item') {
        possui.add(decisao.item.id);
        pecas++;
        soma('bau', SEEDS_DO_DROP);
      } else soma('bau', decisao.seeds);
    }
    // Meta do dia e marco de 7 dias de prática.
    if (acertosDoDia >= META_DIARIA_ACERTOS) soma('metaDiaria', PESOS_SEEDS.metaDiaria);
    sequencia++;
    if (sequencia % 7 === 0) soma('sequencia7', PESOS_SEEDS.sequencia7);
  }
  const seedsTotal = Object.values(fonte).reduce((a, b) => a + b, 0);
  return {
    perfil: p.id,
    dias,
    seedsTotal,
    seedsPorDia: Math.round((seedsTotal / dias) * 10) / 10,
    porFonte: fonte,
    baus,
    pecasDoBau: pecas,
  };
}

/** Dias-alvo do perfil típico por raridade (spec 7.1): comum 2–3, raro 7, épico 14–21, lendário 28–35. */
export const DIAS_ALVO: Record<Raridade, [number, number]> = {
  comum: [2, 3],
  raro: [6, 8],
  epico: [14, 21],
  lendario: [28, 35],
};

export function faixasDoCatalogo(): Record<Raridade, { min: number; max: number; n: number }> {
  const f = {} as Record<Raridade, { min: number; max: number; n: number }>;
  for (const i of CATALOGO_DA_LOJA) {
    if (i.precoSeeds === undefined) continue;
    const a = (f[i.raridade] ??= { min: Infinity, max: 0, n: 0 });
    a.min = Math.min(a.min, i.precoSeeds);
    a.max = Math.max(a.max, i.precoSeeds);
    a.n++;
  }
  return f;
}

function main() {
  const resultados = PERFIS.map((p) => simular(p));
  const tipico = resultados.find((r) => r.perfil === 'tipico')!;
  const faixas = faixasDoCatalogo();
  if (process.argv.includes('--json')) {
    console.log(
      JSON.stringify({ resultados, faixas, bausPorDia: BAUS_POR_DIA, estrelasParaOBau: ESTRELAS_PARA_O_BAU }, null, 2),
    );
    return;
  }
  console.log('Perfil    Seeds/dia  Seeds em 30d  baús  peças   fontes');
  for (const r of resultados) {
    const fontes = Object.entries(r.porFonte)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ');
    console.log(
      `${r.perfil.padEnd(9)} ${String(r.seedsPorDia).padStart(9)}  ${String(r.seedsTotal).padStart(12)}  ${String(r.baus).padStart(4)}  ${String(r.pecasDoBau).padStart(5)}   ${fontes}`,
    );
  }
  console.log('\nFaixas de preço do catálogo (Seeds) e dias do perfil típico para comprar:');
  for (const rar of ['comum', 'raro', 'epico', 'lendario'] as Raridade[]) {
    const f = faixas[rar];
    if (!f) continue;
    const [a, b] = DIAS_ALVO[rar];
    const dMin = (f.min / tipico.seedsPorDia).toFixed(1);
    const dMax = (f.max / tipico.seedsPorDia).toFixed(1);
    const alvo = `${Math.round(a * tipico.seedsPorDia)}–${Math.round(b * tipico.seedsPorDia)}`;
    console.log(
      `  ${rar.padEnd(9)} ${f.min}–${f.max} (${f.n} itens) → ${dMin}–${dMax} dias · alvo ${a}–${b} dias = ${alvo} Seeds`,
    );
  }
}

/* Só roda quando chamado como script: o teste importa `simular` sem imprimir nada. */
if (/simular-ritmo/.test(process.argv[1] ?? '')) main();
