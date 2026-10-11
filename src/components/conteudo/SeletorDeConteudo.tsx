/**
 * O SELETOR DE CONTEÚDO PRONTO PARA ENCAIXAR — a ficha ligada à escolha do app inteiro
 * (`lib/conteudo/loja.ts`) e o catálogo que ela abre. O catálogo é baixado só quando a ficha é tocada
 * (`lazy`): no arranque entra só a ficha.
 *
 * Quem encaixa passa as contagens (a tela já as lê para os próprios números) e as ações de retorno do
 * painel (Revisar, Praticar, Jogar, Ver palavras, "…"). O foco volta para a ficha quando o catálogo
 * fecha (`seletor.js:69-70, 320-321`).
 */
import { lazy, type RefObject, Suspense, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { ContagensDeConteudo } from '../../core/learning/contagensDeConteudo';
import type { Conteudo } from '../../lib/conteudo/estado';
import { escolherConteudo, mudarIdiomaDoConteudo, voltarParaTudoNoConteudo } from '../../lib/conteudo/loja';
import { sentir } from '../../lib/polimento/sentidos';
import type { AcoesDoCatalogo, JogoDoCatalogo } from './CatalogoDeConteudo';
import { FichaDeConteudo } from './FichaDeConteudo';
import { idiomaNaFicha } from './fontes';

/** O que a tela pode pedir ao seletor sem tocar na ficha. */
export interface ControleDoSeletor {
  /** Abre o catálogo. Com `paraJogo`, marca o que não serve para aquele jogo (`seletor.js:301-307`). */
  abrir: (o?: { paraJogo?: JogoDoCatalogo }) => void;
  /** Abre direto em "Trazer uma fonte" (a porta "+" das telas, `fontes.js:369-370`). */
  abrirTrazer: () => void;
}

const CatalogoDeConteudo = lazy(() => import('./CatalogoDeConteudo'));

export function SeletorDeConteudo({
  conteudo,
  contagens,
  aoRecarregar,
  semRede,
  controle,
  semVolta,
  nomeNaFicha,
  trilhaDoApp,
  ...acoes
}: AcoesDoCatalogo & {
  controle?: RefObject<ControleDoSeletor | null>;
  conteudo: Conteudo;
  contagens: ContagensDeConteudo | null;
  aoRecarregar: () => Promise<ContagensDeConteudo | null>;
  semRede?: boolean;
  /** A ficha sem o "x" (quem só tem a Trilha). */
  semVolta?: boolean;
  /** O nome na ficha, quando a tela sabe mais que o nome curto ("Trilha · A1"). */
  nomeNaFicha?: string;
  /** A Trilha do app no idioma (palavras e frases prontas): a linha existe mesmo sem cartão ativado. */
  trilhaDoApp?: { palavras: number; frases: number } | null;
}) {
  const [aberto, setAberto] = useState<false | 'catalogo' | 'trazer'>(false);
  const [paraJogo, setParaJogo] = useState<JogoDoCatalogo | null>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const tipoDaSessao =
    conteudo.fonte.tipo === 'sessao'
      ? contagens?.sessoes.find((s) => s.id === (conteudo.fonte as { id: string }).id)?.tipo
      : null;

  const abrir = (o?: { paraJogo?: JogoDoCatalogo }) => {
    setParaJogo(o?.paraJogo ?? null);
    setAberto('catalogo');
  };
  if (controle)
    controle.current = {
      abrir,
      abrirTrazer: () => {
        setParaJogo(null);
        setAberto('trazer');
      },
    };

  const fechar = () => {
    setAberto(false);
    /* Depois de o navegador terminar o fechamento: o foco volta para a ficha, mesmo refeita. */
    window.setTimeout(() => {
      if (!document.querySelector('dialog[open]:not([aria-hidden="true"])'))
        botao.current?.focus({ preventScroll: true });
    }, 0);
  };

  return (
    <>
      <FichaDeConteudo
        conteudo={conteudo}
        idioma={idiomaNaFicha(conteudo, contagens)}
        tipoDaSessao={tipoDaSessao}
        refDoBotao={botao}
        semVolta={semVolta}
        nome={nomeNaFicha}
        aoAbrir={() => abrir()}
        aoVoltarParaTudo={() => {
          sentir('aba');
          voltarParaTudoNoConteudo();
        }}
      />
      {/* Fora do cabeçalho, no fim do documento, como no protótipo (`ctAbrir`, `cartoes.js:170-174`): as
          regras de título do cabeçalho da tela (`.q-cab h2`) não podem alcançar os títulos do diálogo. */}
      {aberto &&
        createPortal(
          <Suspense fallback={null}>
            <CatalogoDeConteudo
              conteudo={conteudo}
              contagens={contagens}
              aoRecarregar={aoRecarregar}
              semRede={semRede}
              paraJogo={paraJogo}
              trilhaDoApp={trilhaDoApp}
              abrirEm={aberto}
              aoFechar={fechar}
              aoEscolher={(fonte, idioma) => {
                sentir('aba');
                escolherConteudo(fonte, idioma);
              }}
              aoMudarIdioma={(idioma) => {
                sentir('aba');
                mudarIdiomaDoConteudo(idioma);
              }}
              {...acoes}
            />
          </Suspense>,
          document.body,
        )}
    </>
  );
}
