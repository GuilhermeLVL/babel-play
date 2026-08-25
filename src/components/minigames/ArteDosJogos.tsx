import React from 'react';
import type { MinigameId } from '@core';

/**
 * AS MINIATURAS DOS JOGOS — cada uma é a MECÂNICA desenhada, não um enfeite.
 *
 * POR QUE DESENHADAS AQUI, em SVG. O app não tem sistema de arte: zero `.svg` no repositório,
 * `src/assets` não existe e `public/` só guarda runtime. A alternativa seria baixar PNGs, o que
 * traria peso, dependência de rede e — pior — imagens de cor fixa num app com seis temas e dois
 * modos. Foi exatamente esse o defeito que quebrou as partículas antes: cinza a 6% de opacidade
 * é invisível por construção em metade dos temas.
 *
 * ENTÃO A REGRA AQUI É: **nenhuma cor literal**. Tudo sai de `var(--token)`, que o SVG inline
 * resolve normalmente (verificado no navegador). Trocar de tema repinta a arte junto.
 *
 * A ESCOLHA DOS TOKENS não é aleatória. `--good` e `--warn` continuam coloridos em todos os temas
 * — são semânticos —, então carregam o significado (verde = no lugar certo, amarelo = existe).
 * `--accent` marca o que está ATIVO, e em temas monocromáticos ele vira branco/preto: por isso
 * ele nunca é o único portador de significado, só o destaque.
 *
 * Cada desenho responde "o que eu faço aqui?" antes de a pessoa ler o título.
 */

const VIEW = '0 0 160 70';

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox={VIEW} className="w-full h-full" role="presentation" aria-hidden focusable="false">
      {children}
    </svg>
  );
}

/** MEMÓRIA — a mesa de cartas, com um par aberto e o resto virado para baixo. */
function ArteMemoria() {
  const cel = (x: number, y: number, aberta = false) => (
    <g key={`${x}-${y}`}>
      <rect
        x={x} y={y} width={34} height={26} rx={6}
        fill={aberta ? 'var(--surface)' : 'var(--canvas)'}
        stroke={aberta ? 'var(--good)' : 'var(--border-subtle)'}
        strokeWidth={aberta ? 2 : 1.5}
      />
      {aberta
        ? <rect x={x + 7} y={y + 11} width={20} height={4} rx={2} fill="var(--good)" />
        : <circle cx={x + 17} cy={y + 13} r={3.5} fill="var(--border-subtle)" />}
    </g>
  );
  return (
    <Moldura>
      {cel(6, 6, true)}{cel(44, 6)}{cel(82, 6)}{cel(120, 6, true)}
      {cel(6, 38)}{cel(44, 38)}{cel(82, 38)}{cel(120, 38)}
    </Moldura>
  );
}

/** CAÇA-PALAVRAS — a grade de letras com o traço atravessando na diagonal. */
function ArteCacaPalavras() {
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
    <Moldura>
      {pontos}
      {/* O traço é o gesto do jogo: sem ele isto seria só uma grade. */}
      <line x1={16} y1={16} x2={112} y2={58} stroke="var(--accent)" strokeWidth={11}
        strokeLinecap="round" opacity={0.35} />
      <line x1={16} y1={16} x2={112} y2={58} stroke="var(--accent)" strokeWidth={2}
        strokeLinecap="round" />
    </Moldura>
  );
}

/** SOLETRAR — a assinatura do Termo: a linha de quadrados com verde e amarelo. */
function ArteTermo() {
  const quadrado = (x: number, y: number, estado: 'certa' | 'existe' | 'vazia' | 'cursor') => (
    <rect key={`${x}-${y}`} x={x} y={y} width={24} height={24} rx={5}
      fill={estado === 'certa' ? 'var(--good)' : estado === 'existe' ? 'var(--warn)' : 'var(--canvas)'}
      stroke={estado === 'cursor' ? 'var(--accent)' : estado === 'vazia' ? 'var(--border-subtle)' : 'none'}
      strokeWidth={estado === 'cursor' ? 2.5 : 1.5} />
  );
  return (
    <Moldura>
      {quadrado(8, 8, 'certa')}{quadrado(38, 8, 'existe')}{quadrado(68, 8, 'vazia')}
      {quadrado(98, 8, 'certa')}{quadrado(128, 8, 'vazia')}
      {quadrado(8, 38, 'vazia')}{quadrado(38, 38, 'cursor')}{quadrado(68, 38, 'vazia')}
      {quadrado(98, 38, 'vazia')}{quadrado(128, 38, 'vazia')}
    </Moldura>
  );
}

/** FRASE EMBARALHADA — as peças fora de lugar caindo na linha. */
function ArteEmbaralhada() {
  const chip = (x: number, y: number, w: number, giro: number, ativo = false) => (
    <rect key={`${x}-${y}`} x={x} y={y} width={w} height={18} rx={9}
      transform={`rotate(${giro} ${x + w / 2} ${y + 9})`}
      fill={ativo ? 'var(--accent)' : 'var(--surface)'}
      stroke={ativo ? 'var(--accent)' : 'var(--border-subtle)'} strokeWidth={1.5} />
  );
  return (
    <Moldura>
      {chip(10, 6, 34, -7)}{chip(54, 4, 26, 5, true)}{chip(88, 7, 40, -3)}
      {/* A linha tracejada é o lugar onde a frase se monta. */}
      <line x1={10} y1={46} x2={150} y2={46} stroke="var(--border-subtle)" strokeWidth={2}
        strokeDasharray="6 5" strokeLinecap="round" />
      {chip(14, 52, 30, 0)}{chip(50, 52, 22, 0)}
    </Moldura>
  );
}

/** KARAOKÊ — a onda da fala com a palavra atual acesa. */
function ArteKaraoke() {
  const alturas = [10, 22, 34, 46, 30, 18, 40, 52, 36, 24, 14, 28, 44, 20, 12];
  return (
    <Moldura>
      {alturas.map((h, i) => (
        <rect key={i} x={10 + i * 9} y={35 - h / 2} width={4.5} height={h} rx={2.25}
          fill={i === 7 ? 'var(--accent)' : 'var(--border-subtle)'} />
      ))}
      {/* O microfone diz que aqui VOCÊ fala — é o que separa este dos jogos de leitura. */}
      <circle cx={140} cy={35} r={13} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2} />
      <rect x={136.5} y={27} width={7} height={12} rx={3.5} fill="var(--accent)" />
      <path d="M133 37a7 7 0 0 0 14 0" fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" />
      <line x1={140} y1={44} x2={140} y2={47} stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" />
    </Moldura>
  );
}

/** DUELO RELÂMPAGO — o relógio correndo e o raio da sequência. */
function ArteDuelo() {
  return (
    <Moldura>
      <circle cx={52} cy={35} r={24} fill="var(--surface)" stroke="var(--border-subtle)" strokeWidth={2} />
      {/* O arco em accent é o tempo QUE JÁ FOI: o relógio deste jogo anda para trás. */}
      <path d="M52 11a24 24 0 0 1 20.8 36" fill="none" stroke="var(--accent)" strokeWidth={3.5} strokeLinecap="round" />
      <line x1={52} y1={35} x2={52} y2={21} stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round" />
      <line x1={52} y1={35} x2={62} y2={41} stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round" />
      <path d="M108 8 L94 38 h13 l-6 24 22-32 h-14 l7-22 z"
        fill="var(--warn)" stroke="var(--warn)" strokeWidth={1.5} strokeLinejoin="round" />
    </Moldura>
  );
}

/** QUAL FOI? — a onda tocando e três legendas, uma delas acesa. */
function ArteEscuta() {
  const alturas = [12, 26, 38, 22, 44, 30, 16];
  return (
    <Moldura>
      {alturas.map((h, i) => (
        <rect key={i} x={12 + i * 9} y={35 - h / 2} width={4.5} height={h} rx={2.25}
          fill={i === 3 ? 'var(--accent)' : 'var(--border-subtle)'} />
      ))}
      {[0, 1, 2].map(i => (
        <rect key={i} x={84} y={12 + i * 17} width={64} height={13} rx={6}
          fill={i === 1 ? 'var(--good-soft)' : 'var(--surface)'}
          stroke={i === 1 ? 'var(--good)' : 'var(--border-subtle)'} strokeWidth={i === 1 ? 2 : 1.5} />
      ))}
    </Moldura>
  );
}

/** DITADO — o cursor escrevendo na linha, com uma palavra já conferida. */
function ArteDitado() {
  return (
    <Moldura>
      <rect x={10} y={12} width={26} height={11} rx={5} fill="var(--good)" />
      <rect x={40} y={12} width={34} height={11} rx={5} fill="var(--good)" />
      <rect x={78} y={12} width={22} height={11} rx={5} fill="var(--error)" opacity={0.75} />
      <rect x={104} y={12} width={30} height={11} rx={5} fill="var(--good)" />
      {/* A linha onde se escreve, com o cursor piscando no fim. */}
      <line x1={10} y1={48} x2={132} y2={48} stroke="var(--border-subtle)" strokeWidth={2} strokeLinecap="round" />
      <rect x={12} y={36} width={28} height={9} rx={4} fill="var(--ink-muted)" opacity={0.5} />
      <rect x={44} y={36} width={36} height={9} rx={4} fill="var(--ink-muted)" opacity={0.5} />
      <rect x={84} y={34} width={2.5} height={13} rx={1.25} fill="var(--accent)" />
    </Moldura>
  );
}

/** CAÇA-CONECTORES — as peças da frase com o elo aceso no meio. */
function ArteConectores() {
  const larguras = [22, 30, 26, 34, 20];
  let x = 8;
  return (
    <Moldura>
      {larguras.map((w, i) => {
        const cx = x;
        x += w + 6;
        const ligacao = i === 2;
        return (
          <rect key={i} x={cx} y={28} width={w} height={14} rx={7}
            fill={ligacao ? 'var(--accent)' : 'var(--surface)'}
            stroke={ligacao ? 'var(--accent)' : 'var(--border-subtle)'} strokeWidth={1.5} />
        );
      })}
      {/* O arco é o que o jogo trata: a ligação entre as duas metades da ideia. */}
      <path d="M40 26 Q72 6 104 26" fill="none" stroke="var(--accent)" strokeWidth={2}
        strokeLinecap="round" strokeDasharray="4 4" />
      <circle cx={72} cy={14} r={4} fill="var(--accent)" />
    </Moldura>
  );
}

const ARTE: Record<MinigameId, () => React.JSX.Element> = {
  memory: ArteMemoria,
  wordsearch: ArteCacaPalavras,
  termo: ArteTermo,
  scramble: ArteEmbaralhada,
  karaoke: ArteKaraoke,
  blitz: ArteDuelo,
  escuta: ArteEscuta,
  ditado: ArteDitado,
  conectores: ArteConectores,
};

/** A miniatura de um jogo. Cai em `null` se algum jogo novo ainda não tiver arte. */
export default function ArteDoJogo({ jogo }: { jogo: MinigameId }) {
  const Desenho = ARTE[jogo];
  return Desenho ? <Desenho /> : null;
}
