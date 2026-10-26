import { type KeyboardEvent, memo, useMemo } from 'react';

import type { MarcaNaLinha } from '../../../../core/assistente/telaDoAssistente';
import { palavrasDoPedaco } from '../../../../lib/captura/trechosTocaveis';
import type { Etiquetador } from '../../../../lib/etiquetas/indiceDeEtiquetas';
import { rotuloDoNivel, rotuloDoTipo } from './copyDoAssistente';

/** Um pedaço do texto com a posição dele na linha (para casar com as marcas, que vêm em posições). */
export interface PedacoComPosicao {
  texto: string;
  inicio: number;
  fim: number;
}

/**
 * O texto em pedaços ESTÁVEIS: os espaços, a pontuação das pontas e as palavras (em chinês e japonês, as palavras do
 * `palavrasDoPedaco`). O corte NÃO depende das marcas — quando elas chegam, a árvore é a mesma e só os atributos mudam.
 * É isso que deixa o destaque SILENCIOSO dentro de uma região `aria-live` (a legenda da captura, a metade do
 * Intérprete): nenhum nó de texto novo, nada a anunciar.
 */
export function pedacosComPosicao(texto: string, lang: string | undefined): PedacoComPosicao[] {
  const saida: PedacoComPosicao[] = [];
  let pos = 0;
  const por = (t: string) => {
    if (!t) return;
    saida.push({ texto: t, inicio: pos, fim: pos + t.length });
    pos += t.length;
  };
  for (const bloco of texto.split(/(\s+)/)) {
    if (!bloco) continue;
    if (!bloco.trim()) {
      por(bloco);
      continue;
    }
    for (const parte of palavrasDoPedaco(bloco, lang || '')) {
      const m = /^([^\p{L}\p{N}]*)([\s\S]*?)([^\p{L}\p{N}]*)$/u.exec(parte);
      if (!m || !m[2]) {
        por(parte);
        continue;
      }
      por(m[1]);
      por(m[2]);
      por(m[3]);
    }
  }
  return saida;
}

/**
 * A marca de um pedaço: a palavra cai na marca quando se sobrepõe a ela; o espaço (e a pontuação) só quando está
 * DENTRO dela (o fio continua entre as palavras de "break a leg", mas não passa embaixo do ponto final).
 */
export function marcaDoPedaco(p: PedacoComPosicao, marcas: ReadonlyArray<MarcaNaLinha>): number {
  const solto = !/[\p{L}\p{N}]/u.test(p.texto);
  return marcas.findIndex((m) => (solto ? m.inicio < p.inicio && p.fim < m.fim : p.inicio < m.fim && m.inicio < p.fim));
}

export const rotuloDaMarca = (m: MarcaNaLinha) =>
  m.tipo === 'nivel' ? rotuloDoNivel(m.nivel, m.escala) : rotuloDoTipo(m.tipo);

/** O `title` da marca: o sentido, quando há; senão, o rótulo (nível). */
export const tituloDaMarca = (m: MarcaNaLinha) => (m.sentido ? `${m.texto}: ${m.sentido}` : rotuloDaMarca(m));

/**
 * O TEXTO DE UMA FALA COM AS MARCAS DO ASSISTENTE (Fase C3), para as telas da página: a legenda da captura e as bolhas
 * e metades do Intérprete. Cada pedaço é um `span` desde o começo; a marca é só atributo (`data-marca`, `title`): um
 * sublinhado pontilhado, sem anúncio.
 *
 * `interativa`: a primeira parte de cada marca vira um botão (ROVING: só a primeira marca da linha entra no Tab, ← →
 * andam entre elas, Enter abre). Sem ela (a linha da captura já é um botão, e botão dentro de botão não vale), o toque
 * é lido por quem envolve: `marcaDoAlvo(evento.target)`.
 *
 * `etiquetador`: as ETIQUETAS DE PALAVRAS (salva, aprendendo, nova para você) entram do mesmo jeito, como atributo
 * (`data-etiqueta`) no pedaço-palavra — o corte é o mesmo, nenhum nó novo.
 */
export const TextoComMarcas = memo(function TextoComMarcas({
  texto,
  lang,
  marcas,
  interativa = false,
  aoAbrir,
  etiquetador,
}: {
  texto: string;
  lang: string | undefined;
  marcas?: ReadonlyArray<MarcaNaLinha>;
  interativa?: boolean;
  aoAbrir?: (m: MarcaNaLinha) => void;
  etiquetador?: Etiquetador | null;
}) {
  const pedacos = useMemo(() => pedacosComPosicao(texto, lang), [texto, lang]);
  const lista = marcas ?? [];
  let primeiraDaLinha = true;
  const vistas = new Set<number>();
  const teclar = (e: KeyboardEvent<HTMLElement>, m: MarcaNaLinha) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const todas = [...(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[data-marca-foco]') ?? [])];
      const alvo = todas[todas.indexOf(e.currentTarget) + (e.key === 'ArrowRight' ? 1 : -1)];
      if (!alvo) return;
      e.preventDefault();
      e.stopPropagation();
      alvo.focus();
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    aoAbrir?.(m);
  };
  return (
    <>
      {pedacos.map((p, i) => {
        const k = lista.length ? marcaDoPedaco(p, lista) : -1;
        const etiqueta = etiquetador?.etiqueta(p.texto, lang);
        if (k < 0)
          return (
            <span key={i} data-etiqueta={etiqueta}>
              {p.texto}
            </span>
          );
        const m = lista[k];
        const comeco = !vistas.has(k);
        vistas.add(k);
        const foco = interativa && comeco;
        const tab = foco ? (primeiraDaLinha ? 0 : -1) : undefined;
        if (foco) primeiraDaLinha = false;
        return (
          <span
            key={i}
            className="asst-marca"
            data-marca={m.tipo}
            data-etiqueta={etiqueta}
            data-marca-i={k}
            data-marca-foco={foco ? '' : undefined}
            title={tituloDaMarca(m)}
            role={foco ? 'button' : undefined}
            tabIndex={tab}
            aria-label={foco ? `${m.texto}, ${rotuloDaMarca(m)}` : undefined}
            onClick={
              interativa && aoAbrir
                ? (e) => {
                    e.stopPropagation();
                    aoAbrir(m);
                  }
                : undefined
            }
            onKeyDown={foco ? (e) => teclar(e, m) : undefined}
          >
            {p.texto}
          </span>
        );
      })}
    </>
  );
});

/** A marca tocada, a partir do alvo do clique (para quem envolve o texto num botão, como a linha da captura). */
export function marcaDoAlvo(alvo: EventTarget | null, marcas: ReadonlyArray<MarcaNaLinha> | undefined) {
  const el = (alvo as Element | null)?.closest?.('[data-marca-i]');
  const i = el ? Number(el.getAttribute('data-marca-i')) : -1;
  return marcas && i >= 0 ? marcas[i] : undefined;
}
