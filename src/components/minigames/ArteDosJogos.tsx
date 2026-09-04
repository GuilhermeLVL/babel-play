import React from 'react';
import { MINIGAMES, type MinigameId } from '@core';

/**
 * AS MINIATURAS DOS JOGOS — cada uma é a MECÂNICA desenhada, não um enfeite.
 *
 * POR QUE DESENHADAS AQUI, em SVG. O app não tem sistema de arte: zero `.svg` no repositório,
 * `src/assets` não existe e `public/` só guarda runtime. A alternativa seria baixar PNGs, o que
 * traria peso, dependência de rede e — pior — imagens de cor fixa num app com sete temas e dois
 * modos. Foi exatamente esse o defeito que quebrou as partículas antes: cinza a 6% de opacidade
 * é invisível por construção em metade dos temas.
 *
 * ENTÃO A REGRA CONTINUA: **nenhuma cor literal**. Tudo sai de `var(--token)` ou de `currentColor`
 * (que herda de um token), e trocar de tema repinta a arte junto.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * O QUE MUDOU, E POR QUÊ (auditoria de 01/09, achados F14–F18)
 *
 * 1. **Havia desenho invisível.** As cartas viradas da Memória e os quadrados vazios do Termo
 *    usavam `fill="var(--canvas)"` — e a faixa onde a arte vive também é `--canvas`. Era forma
 *    pintada da cor exata do fundo: sobrava só a borda de 1,5px. Agora o "vazio" é `--surface`,
 *    que é a superfície elevada e existe em todos os temas justamente para contrastar com o fundo.
 *
 * 2. **Nove jogos dividiam três cores por acidente.** `--accent` marcava "o ativo" em quase todos,
 *    então a grade lia como nove retângulos iguais. A saída não foi liberar cor literal (isso
 *    quebraria os temas): foi dar SIGNIFICADO às cores que já existem. Agora
 *
 *        cor = a FAMÍLIA do jogo (o que ele treina)     silhueta = QUAL jogo é
 *
 *    e a família não é dado novo: vem de `MINIGAMES[id].modalidade`, que o motor de regras já
 *    usa. Palavra → `--accent`; frase → `--good`; escuta → `--rare`. Ficam impossíveis de sair de
 *    sincronia, e a grade ganha três grupos legíveis de longe.
 *
 * 3. **Três artes eram o mesmo desenho.** Karaokê, Qual foi? e Ditado abriam todas com a mesma
 *    barra de onda. A onda dizia "tem áudio" — que é justamente o que as três têm em comum, ou
 *    seja, a parte que NÃO as distingue. Agora a onda é um apoio pequeno e o primeiro plano é o
 *    gesto de cada uma: falar (microfone), escolher (opções com uma marcada), escrever (cursor
 *    na linha).
 *
 * 4. **Cada carta mostrava duas metáforas do mesmo jogo**, a 10px uma da outra: esta arte e o
 *    ícone pixel. Na grade ficou só a arte; o ícone pixel segue servindo onde não cabe desenho.
 *
 * A EXCEÇÃO À REGRA DA FAMÍLIA são as cores SEMÂNTICAS: `--good` para "está certo", `--warn` para
 * "existe, fora de lugar", `--error` para "errado". Elas carregam significado que a família não
 * pode sobrescrever — no Termo, verde é acerto, não "jogo de frase".
 */

const VIEW = '0 0 160 70';

/**
 * O TOM DA FAMÍLIA. `modalidade` vem do motor de regras (`core/minigames/types.ts`), então a cor
 * da carta e o comportamento do jogo não têm como divergir.
 */
export function tomDoJogo(id: MinigameId): string {
  const m = MINIGAMES[id].modalidade;
  if (m === 'palavra') return 'var(--accent)';
  if (m === 'frase') return 'var(--good)';
  return 'var(--rare)'; // 'frase-audio' — os três que se ouvem
}

/** Rótulo curto da família, para a legenda da grade. Três palavras, não uma explicação. */
export const FAMILIAS: Array<{ rotulo: string; tom: string }> = [
  { rotulo: 'palavra', tom: 'var(--accent)' },
  { rotulo: 'frase', tom: 'var(--good)' },
  { rotulo: 'escuta', tom: 'var(--rare)' },
];

/**
 * `color` no `<svg>` é o que faz `currentColor` valer para a família inteira: cada desenho pede
 * `currentColor` onde quer o tom, e nenhum deles precisa saber qual é.
 */
function Moldura({ tom, children }: { tom: string; children: React.ReactNode }) {
  return (
    <svg viewBox={VIEW} className="w-full h-full" role="presentation" aria-hidden focusable="false" style={{ color: tom }}>
      {children}
    </svg>
  );
}

/* ── PALAVRA ──────────────────────────────────────────────────────────────────────────────── */

/** MEMÓRIA — a mesa de cartas, com um par aberto e o resto virado para baixo. */
function ArteMemoria({ tom }: { tom: string }) {
  const cel = (x: number, y: number, aberta = false) => (
    <g key={`${x}-${y}`}>
      <rect
        x={x} y={y} width={34} height={26} rx={6}
        /* `--surface` e não `--canvas`: a faixa da arte É `--canvas`, então a carta virada
           desaparecia e sobrava a borda. Ver o achado F14 no topo do arquivo. */
        fill="var(--surface)"
        stroke={aberta ? 'currentColor' : 'var(--border-subtle)'}
        strokeWidth={aberta ? 2.5 : 1.5}
      />
      {aberta
        ? <rect x={x + 7} y={y + 11} width={20} height={4} rx={2} fill="currentColor" />
        : <circle cx={x + 17} cy={y + 13} r={3.5} fill="var(--border-subtle)" />}
    </g>
  );
  return (
    <Moldura tom={tom}>
      {cel(6, 6, true)}{cel(44, 6)}{cel(82, 6)}{cel(120, 6, true)}
      {cel(6, 38)}{cel(44, 38)}{cel(82, 38)}{cel(120, 38)}
    </Moldura>
  );
}

/** CAÇA-PALAVRAS — a grade de letras com o traço atravessando na diagonal. */
function ArteCacaPalavras({ tom }: { tom: string }) {
  const pontos = [];
  for (let l = 0; l < 4; l++) {
    for (let c = 0; c < 9; c++) {
      pontos.push(
        <rect key={`${l}-${c}`} x={8 + c * 16} y={8 + l * 15} width={11} height={11} rx={3}
          fill="var(--surface)" stroke="var(--border-subtle)" strokeWidth={1} />,
      );
    }
  }
  return (
    <Moldura tom={tom}>
      {pontos}
      {/* O traço é o gesto do jogo: sem ele isto seria só uma grade. */}
      <line x1={16} y1={16} x2={112} y2={58} stroke="currentColor" strokeWidth={11}
        strokeLinecap="round" opacity={0.3} />
      <line x1={16} y1={16} x2={112} y2={58} stroke="currentColor" strokeWidth={2.5}
        strokeLinecap="round" />
    </Moldura>
  );
}

/** SOLETRAR — a assinatura do Termo: a linha de quadrados com verde e amarelo. */
function ArteTermo({ tom }: { tom: string }) {
  const quadrado = (x: number, y: number, estado: 'certa' | 'existe' | 'vazia' | 'cursor') => (
    <rect key={`${x}-${y}`} x={x} y={y} width={24} height={24} rx={5}
      /* Verde e amarelo aqui são SEMÂNTICOS (acertou / existe fora de lugar) e sobrevivem ao tom
         da família — ver a exceção no topo. O "vazio" virou `--surface` pelo mesmo motivo da
         Memória: pintado de `--canvas`, ele sumia dentro da faixa. */
      fill={estado === 'certa' ? 'var(--good)' : estado === 'existe' ? 'var(--warn)' : 'var(--surface)'}
      stroke={estado === 'cursor' ? 'currentColor' : estado === 'vazia' ? 'var(--border-subtle)' : 'none'}
      strokeWidth={estado === 'cursor' ? 2.5 : 1.5} />
  );
  return (
    <Moldura tom={tom}>
      {quadrado(8, 8, 'certa')}{quadrado(38, 8, 'existe')}{quadrado(68, 8, 'vazia')}
      {quadrado(98, 8, 'certa')}{quadrado(128, 8, 'vazia')}
      {quadrado(8, 38, 'vazia')}{quadrado(38, 38, 'cursor')}{quadrado(68, 38, 'vazia')}
      {quadrado(98, 38, 'vazia')}{quadrado(128, 38, 'vazia')}
    </Moldura>
  );
}

/** DUELO RELÂMPAGO — o relógio correndo e o raio da sequência. */
function ArteDuelo({ tom }: { tom: string }) {
  return (
    <Moldura tom={tom}>
      <circle cx={52} cy={35} r={24} fill="var(--surface)" stroke="var(--border-subtle)" strokeWidth={2} />
      {/* O arco marca o tempo QUE JÁ FOI: o relógio deste jogo anda para trás. */}
      <path d="M52 11a24 24 0 0 1 20.8 36" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" />
      <line x1={52} y1={35} x2={52} y2={21} stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round" />
      <line x1={52} y1={35} x2={62} y2={41} stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round" />
      {/* O raio fica em `--warn` porque ele é o único jogo cronometrado: a pressa é a assinatura
          dele, e uma cor de alerta diz isso mesmo dentro da família "palavra". */}
      <path d="M108 8 L94 38 h13 l-6 24 22-32 h-14 l7-22 z"
        fill="var(--warn)" stroke="var(--warn)" strokeWidth={1.5} strokeLinejoin="round" />
    </Moldura>
  );
}

/* ── FRASE ────────────────────────────────────────────────────────────────────────────────── */

/** FRASE EMBARALHADA — as peças fora de lugar caindo na linha. */
function ArteEmbaralhada({ tom }: { tom: string }) {
  const chip = (x: number, y: number, w: number, giro: number, ativo = false) => (
    <rect key={`${x}-${y}`} x={x} y={y} width={w} height={18} rx={9}
      transform={`rotate(${giro} ${x + w / 2} ${y + 9})`}
      fill={ativo ? 'currentColor' : 'var(--surface)'}
      stroke={ativo ? 'currentColor' : 'var(--border-subtle)'} strokeWidth={1.5} />
  );
  return (
    <Moldura tom={tom}>
      {chip(10, 6, 34, -7)}{chip(54, 4, 26, 5, true)}{chip(88, 7, 40, -3)}
      {/* A linha tracejada é o lugar onde a frase se monta. */}
      <line x1={10} y1={46} x2={150} y2={46} stroke="var(--border-subtle)" strokeWidth={2}
        strokeDasharray="6 5" strokeLinecap="round" />
      {chip(14, 52, 30, 0)}{chip(50, 52, 22, 0)}
    </Moldura>
  );
}

/**
 * CAÇA-CONECTORES — DUAS ideias e o elo entre elas.
 *
 * Eram cinco pílulas iguais numa fileira, o que fazia deste desenho um irmão do embaralhado.
 * O jogo não é sobre peças em fila: é sobre a PONTE. Agora há dois blocos grandes (as ideias) e
 * uma peça pequena acesa no meio (o conector), que é literalmente o que se marca ao jogar.
 */
function ArteConectores({ tom }: { tom: string }) {
  return (
    <Moldura tom={tom}>
      <rect x={8} y={26} width={48} height={18} rx={5} fill="var(--surface)" stroke="var(--border-subtle)" strokeWidth={1.5} />
      <rect x={104} y={26} width={48} height={18} rx={5} fill="var(--surface)" stroke="var(--border-subtle)" strokeWidth={1.5} />
      {/* O arco é o que o jogo trata: a ligação entre as duas metades da ideia. */}
      <path d="M40 24 Q80 2 120 24" fill="none" stroke="currentColor" strokeWidth={2}
        strokeLinecap="round" strokeDasharray="4 4" opacity={0.7} />
      <rect x={62} y={26} width={36} height={18} rx={9} fill="currentColor" />
    </Moldura>
  );
}

/* ── ESCUTA ───────────────────────────────────────────────────────────────────────────────── */

/** A onda, reduzida a APOIO. Ela diz "tem áudio" — o que as três têm em comum, e portanto o que
 *  NÃO as distingue. Fica pequena, à esquerda, e o primeiro plano é o gesto de cada jogo. */
function OndaDeApoio({ x = 8, alturas = [10, 20, 30, 18, 26] }: { x?: number; alturas?: number[] }) {
  return (
    <>
      {alturas.map((h, i) => (
        <rect key={i} x={x + i * 8} y={35 - h / 2} width={4} height={h} rx={2}
          fill="currentColor" opacity={0.4} />
      ))}
    </>
  );
}

/** KARAOKÊ — o microfone em primeiro plano: aqui VOCÊ fala. */
function ArteKaraoke({ tom }: { tom: string }) {
  return (
    <Moldura tom={tom}>
      <OndaDeApoio />
      {/* O microfone grande e centrado é a diferença: os outros dois de áudio não falam. */}
      <circle cx={100} cy={35} r={25} fill="var(--surface)" stroke="currentColor" strokeWidth={2.5} />
      <rect x={94} y={21} width={12} height={20} rx={6} fill="currentColor" />
      <path d="M89 37a11 11 0 0 0 22 0" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
      <line x1={100} y1={48} x2={100} y2={53} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
      {/* As ondas saindo do microfone: som que SAI, não que entra. */}
      <path d="M134 26a14 14 0 0 1 0 18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.6} />
      <path d="M143 20a24 24 0 0 1 0 30" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.35} />
    </Moldura>
  );
}

/** QUAL FOI? — três opções e a escolha marcada: o gesto é ESCOLHER. */
function ArteEscuta({ tom }: { tom: string }) {
  return (
    <Moldura tom={tom}>
      <OndaDeApoio alturas={[12, 26, 16]} />
      {[0, 1, 2].map(i => (
        <g key={i}>
          <rect x={48} y={10 + i * 18} width={104} height={14} rx={7}
            fill={i === 1 ? 'var(--good-soft)' : 'var(--surface)'}
            stroke={i === 1 ? 'var(--good)' : 'var(--border-subtle)'} strokeWidth={i === 1 ? 2 : 1.5} />
          {/* O certo leva o tique: é o que transforma "três faixas" em "uma escolha". */}
          {i === 1 && (
            <path d="M56 27.5l3.5 3.5 6-7" fill="none" stroke="var(--good)" strokeWidth={2.5}
              strokeLinecap="round" strokeLinejoin="round" />
          )}
        </g>
      ))}
    </Moldura>
  );
}

/** DITADO — o cursor escrevendo na linha: o gesto é ESCREVER. */
function ArteDitado({ tom }: { tom: string }) {
  return (
    <Moldura tom={tom}>
      <OndaDeApoio alturas={[14, 28, 20]} />
      {/* A correção palavra a palavra, que é o que este jogo entrega de diferente. */}
      <rect x={46} y={12} width={30} height={11} rx={5} fill="var(--good)" />
      <rect x={80} y={12} width={22} height={11} rx={5} fill="var(--error)" opacity={0.75} />
      <rect x={106} y={12} width={34} height={11} rx={5} fill="var(--good)" />
      {/* A linha onde se escreve, com o cursor no fim. */}
      <line x1={46} y1={50} x2={146} y2={50} stroke="var(--border-subtle)" strokeWidth={2} strokeLinecap="round" />
      <rect x={48} y={36} width={30} height={9} rx={4} fill="var(--ink-muted)" opacity={0.5} />
      <rect x={82} y={36} width={38} height={9} rx={4} fill="var(--ink-muted)" opacity={0.5} />
      <rect x={124} y={33} width={3} height={15} rx={1.5} fill="currentColor" />
    </Moldura>
  );
}

const ARTE: Record<MinigameId, (p: { tom: string }) => React.JSX.Element> = {
  memory: ArteMemoria,
  wordsearch: ArteCacaPalavras,
  termo: ArteTermo,
  blitz: ArteDuelo,
  scramble: ArteEmbaralhada,
  conectores: ArteConectores,
  karaoke: ArteKaraoke,
  escuta: ArteEscuta,
  ditado: ArteDitado,
};

/** A miniatura de um jogo. Cai em `null` se algum jogo novo ainda não tiver arte. */
export default function ArteDoJogo({ jogo }: { jogo: MinigameId }) {
  const Desenho = ARTE[jogo];
  return Desenho ? <Desenho tom={tomDoJogo(jogo)} /> : null;
}
