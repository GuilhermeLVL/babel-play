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
import type { AcoesDoCatalogo } from './CatalogoDeConteudo';
import { FichaDeConteudo } from './FichaDeConteudo';
import { idiomaNaFicha } from './fontes';

/** O que a tela pode pedir ao seletor sem tocar na ficha. */
export interface ControleDoSeletor {
  /** Abre o catálogo. */
  abrir: () => void;
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
  ...acoes
}: AcoesDoCatalogo & {
  controle?: RefObject<ControleDoSeletor | null>;
  conteudo: Conteudo;
  contagens: ContagensDeConteudo | null;
  aoRecarregar: () => Promise<ContagensDeConteudo | null>;
  semRede?: boolean;
}) {
  const [aberto, setAberto] = useState<false | 'catalogo' | 'trazer'>(false);
  const botao = useRef<HTMLButtonElement>(null);
  const tipoDaSessao =
    conteudo.fonte.tipo === 'sessao'
      ? contagens?.sessoes.find((s) => s.id === (conteudo.fonte as { id: string }).id)?.tipo
      : null;

  if (controle) controle.current = { abrir: () => setAberto('catalogo'), abrirTrazer: () => setAberto('trazer') };

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
        aoAbrir={() => setAberto('catalogo')}
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
