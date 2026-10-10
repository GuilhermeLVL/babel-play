/* A base das folhas de baixo (`dialog.folha-de-baixo`, `.folha-corpo`) mora com a captura do celular, onde elas
   nasceram; a explicação é uma folha e precisa dela. */
import '../../../styles/capturaNoCelular.css';
/* O respiro de cima no computador, o centro no celular e a lista de ajudas vazia: as exceções ao
   protótipo, com o porquê de cada uma. */
import '../../../styles/polimentoExplicacao.css';

import type { MinigameId } from '@core';
import { Eye, Lightbulb, type LucideIcon, Radar, Scissors, Sparkles, Timer, Volume2, WandSparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { NivelDoJogo } from '../../../core/minigames/regras';
import { guardarNivelDoJogo, lerNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { anima, polido, reduz } from '../../../lib/polimento/base';
import { sentir } from '../../../lib/polimento/sentidos';
import MiniDoJogo from './MiniDoJogo';
import { textosDoJogo, vezesDaAjuda } from './textos';

const NOME_NIVEL: Record<NivelDoJogo, string> = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' };

/** O ícone de cada ajuda, pelo nome dela (no protótipo cada uma traz o seu: `jogos*.js`). */
const ICONE_DA_AJUDA: Array<[RegExp, LucideIcon]> = [
  [/^\+10 s/, Timer],
  [/^Ver resposta|^Espiar/, Eye],
  [/^Radar/, Radar],
  [/^Ouvir/, Volume2],
  [/^Cortar/, Scissors],
  [/^Auto/, WandSparkles],
];
const iconeDaAjuda = (nome: string): LucideIcon => ICONE_DA_AJUDA.find(([re]) => re.test(nome))?.[1] ?? Lightbulb;

/**
 * A EXPLICAÇÃO EM TRÊS TELAS — porte de `abrirOnb()` (`jogos4.js:186-244`): o que é o jogo e o que
 * treina; o passo a passo; e o nível com as ajudas. Abre sozinha na primeira partida de cada jogo e
 * volta pelo botão "Como se joga" (na tela 1) ou pelo selo de nível (direto na tela 3).
 *
 * É uma folha (`dialog.folha-de-baixo.pj-como-folha`): no celular sobe de baixo, no computador é um
 * cartão no centro. A entrada e a saída são da camada de polimento (`src/lib/polimento/dialogos.ts`).
 * A marcação e os textos são os do protótipo; o nível escolhido é guardado de verdade, por jogo.
 *
 * `aoFechar(mudou)`: `mudou` diz se o nível trocou enquanto a folha esteve aberta (quem chama recomeça
 * a rodada, como no protótipo).
 */
export default function ExplicacaoDoJogo({
  jogo,
  pagina = 0,
  primeira = false,
  aoFechar,
}: {
  jogo: MinigameId;
  pagina?: 0 | 1 | 2;
  primeira?: boolean;
  aoFechar: (mudouONivel: boolean) => void;
}) {
  const textos = textosDoJogo(jogo);
  const ref = useRef<HTMLDialogElement>(null);
  const [pg, setPg] = useState<number>(pagina);
  const [antes] = useState<NivelDoJogo>(() => lerNivelDoJogo(jogo));
  const [nivel, setNivel] = useState<NivelDoJogo>(antes);
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  const mudou = useRef(false);
  mudou.current = nivel !== antes;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal?.();
    d.querySelector<HTMLElement>('[data-onb="prox"]')?.focus();
    const aoFecharNativo = () => fechar.current(mudou.current);
    d.addEventListener('close', aoFecharNativo);
    return () => d.removeEventListener('close', aoFecharNativo);
  }, []);

  if (!textos) return null;

  const ir = (dir: 1 | -1) => {
    const nova = pg + dir;
    setPg(nova);
    sentir('aba'); /* `jogos4.js:232` */
    /* A tela nova entra pelo lado para onde se foi (`jogos4.js:233`). */
    requestAnimationFrame(() => {
      const s = ref.current?.querySelector(`[data-pg="${nova}"]`);
      if (s && polido() && !reduz())
        anima(
          s,
          [
            { opacity: 0, transform: `translateX(${28 * dir}px)` },
            { opacity: 1, transform: 'translateX(0)' },
          ],
          {
            d: 320,
          },
        );
    });
  };
  const escolher = (n: NivelDoJogo) => {
    guardarNivelDoJogo(jogo, n);
    setNivel(n);
  };
  const rotuloDoProximo =
    pg < 2 ? 'Próximo' : primeira ? 'Começar' : nivel !== antes ? `Recomeçar no ${NOME_NIVEL[nivel]}` : 'Continuar';

  return (
    <dialog
      ref={ref}
      className="folha-de-baixo pj-como-folha"
      aria-label="Ações"
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
    >
      <span className="folha-pega" aria-hidden="true" />
      <div className="folha-corpo">
        <div className="pj-como pj-onb">
          <section data-pg="0" hidden={pg !== 0}>
            <MiniDoJogo jogo={jogo} />
            <span className="label-mono">Como se joga · 1 de 3</span>
            <h2>{textos.titulo}</h2>
            {/* O texto é do protótipo (fixo no repositório), com a marcação simples que ele traz. */}
            <p className="pj-onb-texto" dangerouslySetInnerHTML={{ __html: textos.instr }} />
            <p className="pj-onb-treina">
              <Sparkles data-pj-i="" aria-hidden />
              <span>
                <b>O que treina:</b> {textos.treina}
              </span>
            </p>
          </section>
          <section data-pg="1" hidden={pg !== 1}>
            <span className="label-mono">Passo a passo · 2 de 3</span>
            <h2>Como jogar</h2>
            <ol>
              {textos.passos.map((p, i) => (
                <li key={i}>
                  <span dangerouslySetInnerHTML={{ __html: p }} />
                </li>
              ))}
            </ol>
          </section>
          <section data-pg="2" hidden={pg !== 2}>
            <span className="label-mono">Do seu jeito · 3 de 3</span>
            <h2>Nível e ajudas</h2>
            {textos.niveis.length > 0 ? (
              <div className="pj-nivs" role="radiogroup" aria-label="Nível de dificuldade">
                {textos.niveis.map(([n, oQueMuda]) => (
                  <button
                    key={n}
                    type="button"
                    className="pj-niv"
                    role="radio"
                    data-nivel-op={n}
                    aria-checked={n === nivel}
                    onClick={() => escolher(n)}
                  >
                    <b>{NOME_NIVEL[n]}</b>
                    <span>{oQueMuda}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="pj-como-ajudas">{textos.paragrafos[0]}</p>
            )}
            <ul className="pj-onb-ajudas">
              {textos.ajudas.map((a) => {
                const Icone = iconeDaAjuda(a.nome);
                const n = vezesDaAjuda(a, nivel);
                return (
                  <li key={a.nome}>
                    <Icone data-pj-i="" aria-hidden />
                    <span>
                      <b>{a.nome}</b>
                      {n !== null ? ` · ${n} por rodada` : ''}
                      {a.txt && <small>{a.txt}</small>}
                    </span>
                    <em className={a.custo === 'de graça' ? '' : 'custa'}>{a.custo}</em>
                  </li>
                );
              })}
            </ul>
            <p className="pj-como-ajudas">{textos.paragrafos[textos.paragrafos.length - 1]}</p>
          </section>
          <div className="pj-onb-pe">
            <span className="pj-onb-pontos" aria-hidden="true">
              {[0, 1, 2].map((k) => (
                <i key={k} className={k === pg ? 'on' : undefined} />
              ))}
            </span>
            <button type="button" className="pj-link" data-onb="fechar" onClick={() => ref.current?.close()}>
              {primeira ? 'Pular explicação' : 'Fechar'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              data-onb="voltar"
              hidden={pg === 0}
              onClick={() => ir(-1)}
            >
              Voltar
            </button>
            <button
              type="button"
              className="btn btn-solid"
              data-onb="prox"
              onClick={() => (pg === 2 ? ref.current?.close() : ir(1))}
            >
              {rotuloDoProximo}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
