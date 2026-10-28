import React from 'react';

import { ALTURA, LARGURA, type PaletaDaCapa, planoDaCapa } from '../../../core/livros/capaTipografica';

/** As cores de um tema viram variáveis CSS; o tema escuro troca o conjunto em `questLivrosCapas.css`. */
const variaveis = (p: PaletaDaCapa, prefixo: 'cl' | 'ce') => ({
  [`--${prefixo}-fundo`]: p.fundo,
  [`--${prefixo}-tinta`]: p.tinta,
  [`--${prefixo}-enfeite`]: p.enfeite,
});

/** Seis ornamentos, todos no quadro 200 x 300 e fora da caixa do título (y 92 a 210). Só enfeite: sem texto. */
function Ornamento({ n }: { n: number }) {
  switch (n) {
    case 0: // moldura dupla e losango
      return (
        <g className="cp-enf" fill="none" strokeWidth="1.6">
          <rect x="12" y="12" width="176" height="276" rx="3" />
          <rect x="19" y="19" width="162" height="262" rx="2" strokeWidth="0.8" />
          <path d="M100 52 L108 64 L100 76 L92 64 Z" className="cp-enf-cheio" stroke="none" />
          <path d="M60 64 H86 M114 64 H140" />
        </g>
      );
    case 1: // faixa superior cheia e duas linhas na base
      return (
        <g className="cp-enf">
          <rect x="0" y="0" width="200" height="58" className="cp-enf-cheio" opacity="0.9" />
          <path d="M30 222 H170 M30 228 H170" strokeWidth="1.2" fill="none" />
        </g>
      );
    case 2: // sol grande, atrás do título
      return (
        <g className="cp-enf-cheio">
          <circle cx="100" cy="150" r="78" opacity="0.22" />
          <circle cx="100" cy="150" r="52" opacity="0.18" />
        </g>
      );
    case 3: // lombada em listras e filetes
      return (
        <g className="cp-enf-cheio">
          <rect x="14" y="0" width="10" height="300" opacity="0.85" />
          <rect x="28" y="0" width="3" height="300" opacity="0.6" />
          <rect x="40" y="40" width="120" height="2" opacity="0.8" />
          <rect x="40" y="220" width="120" height="2" opacity="0.8" />
        </g>
      );
    case 4: // arco (janela)
      return (
        <g className="cp-enf" fill="none" strokeWidth="1.6">
          <path d="M44 86 V50 a56 56 0 0 1 112 0 V86" transform="translate(0 4)" />
          <path d="M56 86 V54 a44 44 0 0 1 88 0 V86" transform="translate(0 4)" strokeWidth="0.8" />
          <path d="M30 222 H170" />
        </g>
      );
    default: // régua com pontos, em cima e embaixo
      return (
        <g className="cp-enf">
          <path d="M26 46 H174 M26 54 H174" strokeWidth="1" fill="none" />
          <circle cx="100" cy="50" r="5" className="cp-enf-cheio" stroke="none" />
          <path d="M26 222 H174" strokeWidth="1" fill="none" />
          <circle cx="60" cy="222" r="3" className="cp-enf-cheio" stroke="none" />
          <circle cx="100" cy="222" r="3" className="cp-enf-cheio" stroke="none" />
          <circle cx="140" cy="222" r="3" className="cp-enf-cheio" stroke="none" />
        </g>
      );
  }
}

/**
 * A CAPA TIPOGRÁFICA em SVG: papel ou cor, ornamento, título em até 4 linhas, autor e selo do idioma. Decorativa
 * por padrão (`aria-hidden`): quem a usa sozinha põe o nome acessível ao redor. Sem imagem de terceiros.
 */
export default function CapaTipografica({
  id,
  titulo,
  autor,
  idioma,
}: {
  id: string;
  titulo: string;
  autor?: string;
  idioma?: string;
}) {
  const plano = React.useMemo(() => planoDaCapa({ id, titulo, autor, idioma }), [id, titulo, autor, idioma]);
  const estilo = { ...variaveis(plano.claro, 'cl'), ...variaveis(plano.escuro, 'ce') } as React.CSSProperties;
  const lang = idioma || undefined;
  const dir = plano.rtl ? 'rtl' : undefined;
  const yAutor = plano.autor.length > 1 ? 242 : 250;
  return (
    <svg
      className="lv-capa-tip"
      data-ornamento={plano.ornamento}
      data-forte={plano.forte ? 'sim' : 'nao'}
      viewBox={`0 0 ${LARGURA} ${ALTURA}`}
      style={estilo}
      aria-hidden
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width={LARGURA} height={ALTURA} className="cp-fundo" />
      <Ornamento n={plano.ornamento} />
      {/* O vinco da lombada: dá volume sem depender de imagem. */}
      <rect width="5" height={ALTURA} fill="#000" opacity="0.14" />
      <g className="cp-tinta" textAnchor="middle" lang={lang} direction={dir}>
        {plano.titulo.linhas.map((linha, i) => (
          <text
            key={i}
            x={LARGURA / 2}
            y={plano.titulo.ys[i]}
            fontSize={plano.titulo.corpo}
            className="cp-titulo"
            data-testid="capa-linha"
          >
            {linha}
          </text>
        ))}
        {plano.autor.map((linha, i) => (
          <text key={i} x={LARGURA / 2} y={yAutor + i * 14} fontSize="12" className="cp-autor">
            {linha}
          </text>
        ))}
      </g>
      {plano.selo && (
        <g>
          <rect x="82" y="266" width="36" height="17" rx="8.5" className="cp-selo" />
          <text x="100" y="278.2" fontSize="10" textAnchor="middle" className="cp-selo-texto" lang={lang}>
            {plano.selo}
          </text>
        </g>
      )}
    </svg>
  );
}
