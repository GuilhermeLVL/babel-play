/**
 * A FICHA DE CONTEÚDO — o acesso à fonte, IGUAL em Jogar, Cartões e Biblioteca: ícone + nome + seta,
 * sempre no mesmo lugar do cabeçalho. Um toque abre o catálogo. Com outro conteúdo que não "Tudo" ela
 * fica acesa e ganha o "x", que volta para "Tudo" em um toque.
 *
 * A MARCAÇÃO É A DO PROTÓTIPO (`fsFicha()`, `seletor.js:108-115`) e o CSS é o dele
 * (`src/styles/polimento/seletor.css`, copiado). O movimento é `fsSinal()` (`seletor.js:93-103`): a
 * ficha "respira" uma vez quando o conteúdo muda, e uma vez ao chegar numa tela com um conteúdo que
 * não é "Tudo" (`seletor.js:185-186`).
 */
import { ChevronDown, X } from 'lucide-react';
import { type ReactNode, type Ref, useEffect, useRef } from 'react';

import { chaveDaFonte, type Conteudo } from '../../lib/conteudo/estado';
import { t } from '../../lib/i18n';
import { anima, MOLA, polido, reduz } from '../../lib/polimento/base';
import { iconeDaFonte, nomeCurtoDaFonte } from './fontes';

/** `fsSinal()` de `seletor.js:94-103`. `mudou`: o nome entra de novo. */
function sinal(ficha: HTMLElement | null, mudou: boolean): void {
  if (!ficha || !polido() || reduz()) return;
  anima(ficha, [{ transform: 'scale(0.9)' }, { transform: 'scale(1)' }], { d: 560, e: MOLA });
  ficha.classList.remove('fs-brilho');
  void ficha.offsetWidth;
  ficha.classList.add('fs-brilho');
  if (!mudou) return;
  ficha.querySelectorAll('.fs-nome').forEach((nome) =>
    anima(
      nome,
      [
        { opacity: 0, transform: 'translateY(8px)', filter: 'blur(4px)' },
        { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
      ],
      { d: 380, atraso: 60 },
    ),
  );
}

export function FichaDeConteudo({
  conteudo,
  idioma = '',
  tipoDaSessao,
  aoAbrir,
  aoVoltarParaTudo,
  refDoBotao,
}: {
  conteudo: Conteudo;
  /** "Inglês": só quando há dois idiomas e a fonte não é de um só (`idiomaNaFicha`). */
  idioma?: string;
  /** O tipo da sessão escolhida (`video`, `document`…), para o ícone; sem ele, o microfone. */
  tipoDaSessao?: string | null;
  aoAbrir: (gatilho: HTMLButtonElement) => void;
  aoVoltarParaTudo: () => void;
  /** O botão que abre: é para ele que o foco volta quando o catálogo fecha. */
  refDoBotao?: Ref<HTMLButtonElement>;
}) {
  const ficha = useRef<HTMLSpanElement>(null);
  const fonte = conteudo.fonte;
  const nome = nomeCurtoDaFonte(fonte);
  const Icone = iconeDaFonte(fonte, tipoDaSessao);
  const temVolta = fonte.tipo !== 'tudo';
  /* `fsRotulo()` de `seletor.js:108`. */
  const rotulo = idioma
    ? t('Conteúdo: {nome} em {idioma}', { nome, idioma: idioma.toLocaleLowerCase() })
    : t('Conteúdo: {nome}', { nome });

  /* O sinal: na chegada (se não é "Tudo") e a cada troca de fonte ou de idioma. */
  const chave = `${chaveDaFonte(fonte)}|${conteudo.idioma}`;
  const anterior = useRef<string | null>(null);
  useEffect(() => {
    if (anterior.current === null) {
      anterior.current = chave;
      if (!temVolta) return;
      const relogio = window.setTimeout(() => sinal(ficha.current, false), 420);
      return () => window.clearTimeout(relogio);
    }
    if (anterior.current === chave) return;
    /* A primeira leitura do catálogo só decide o idioma ('' → 'en'): não é uma troca da pessoa. */
    const soDecidiu = anterior.current.endsWith('|') && anterior.current.split('|')[0] === chaveDaFonte(fonte);
    anterior.current = chave;
    if (!soDecidiu) sinal(ficha.current, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return (
    <span className={`fs-ficha ${temVolta ? 'fs-com-volta' : ''}`} data-fs-ficha ref={ficha}>
      <button
        type="button"
        ref={refDoBotao}
        className="q-chip fs-abrir"
        data-fs="abrir"
        aria-haspopup="dialog"
        aria-label={t('{rotulo}. Trocar', { rotulo })}
        title={t('{rotulo}. Toque para trocar', { rotulo })}
        onClick={(e) => aoAbrir(e.currentTarget)}
      >
        <Icone aria-hidden />
        <span className="fs-nome">
          <b>{nome}</b>
          {idioma && <small>{idioma}</small>}
        </span>
        <ChevronDown aria-hidden />
      </button>
      {temVolta && (
        <button
          type="button"
          className="q-chip fs-volta"
          data-fs="tudo"
          aria-label={t('Voltar para Tudo')}
          title={t('Voltar para Tudo')}
          onClick={aoVoltarParaTudo}
        >
          <X aria-hidden />
        </button>
      )}
    </span>
  );
}

/**
 * O CABEÇALHO COM A FICHA — o MESMO x e y nas três telas (`seletor.css:31-37`): o título ocupa uma vaga
 * de largura fixa (190 px no computador, 168 px entre 721 e 980, 134 px no celular) e a ficha vem logo
 * depois. `classe` leva a marca da tela (`fs-cab-bib` na Biblioteca, `ct-cab` nos Cartões).
 */
export function CabecalhoComFicha({
  titulo,
  ficha,
  antesDaFicha,
  classe = '',
  children,
}: {
  titulo: ReactNode;
  ficha: ReactNode;
  /** O que vai entre o título e a ficha (o seletor Cartões | Jogos do celular). */
  antesDaFicha?: ReactNode;
  classe?: string;
  /** O que vem depois do espaço: o resumo, as abas, o botão da ponta. */
  children?: ReactNode;
}) {
  return (
    <header className={`q-cab fs-cab ${classe}`}>
      <h1>{titulo}</h1>
      {antesDaFicha}
      {ficha}
      <span className="q-espaco" />
      {children}
    </header>
  );
}
