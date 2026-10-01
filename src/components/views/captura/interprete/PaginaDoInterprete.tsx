import { ArrowLeftRight, ChevronDown, Languages, Loader2, Mic, Smartphone, Volume2 } from 'lucide-react';

import { t } from '../../../../lib/i18n';
import { langLabel } from '../../../../lib/languages';
import { LangFlag } from '../../../LangFlag';
import { CabecalhoDeTela, IconeEmBloco } from '../../../ui';

/**
 * A TELA DO INTÉRPRETE NO MENU (pedido do dono, 30/09: no cabeçalho da captura, o botão passava
 * despercebido). É a porta de entrada da conversa frente a frente: os dois idiomas, o botão grande de
 * começar e o preparo dos dois lados. Tocar em "Começar conversa" abre a tela dividida
 * (`ModoInterprete`), e sair dela volta para cá.
 *
 * No visual da Captura, sem inventar peça nova: o cabeçalho de tela, o cartão escuro do estúdio com o
 * par de idiomas (`.par-idiomas` / `.campo-idioma`, os do diálogo de idiomas) e os três passos do
 * estado vazio (`.vazio` > `.passo`). Chega por `import()`: fora do JS inicial.
 */
export default function PaginaDoInterprete({
  idiomas,
  possivel,
  abrindo,
  aviso,
  aoComecar,
  aoEscolherIdiomas,
  aoInverter,
}: {
  idiomas: { meu: string; outro: string };
  /** Dois idiomas diferentes: sem isso não há conversa a traduzir. */
  possivel: boolean;
  /** O início está em curso (a folha do microfone, o modelo): o botão espera. */
  abrindo: boolean;
  /** O preparo dos dois lados (o tradutor do outro sentido baixando), uma linha. */
  aviso: string | null;
  aoComecar: () => void;
  aoEscolherIdiomas: () => void;
  aoInverter: () => void;
}) {
  const campo = (rotulo: string, codigo: string) => (
    <button type="button" className="campo-idioma" onClick={aoEscolherIdiomas}>
      <span className="label-mono">{rotulo}</span>
      <span className="v">
        <LangFlag code={codigo} className="inline-block w-4 h-3 align-[-1px]" /> {langLabel(codigo)}
      </span>
      <ChevronDown aria-hidden />
    </button>
  );
  const passos = [
    { icone: Languages, texto: t('Escolha o seu idioma e o da outra pessoa') },
    { icone: Smartphone, texto: t('Toque em Começar e deixe o aparelho entre vocês') },
    { icone: Volume2, texto: t('Cada um toca a sua metade e fala: a tradução é lida em voz alta para o outro') },
  ];

  return (
    <div className="tela larga entra" data-testid="pagina-do-interprete">
      <CabecalhoDeTela
        icone={Languages}
        sobrancelha={t('Conversa frente a frente')}
        titulo={t('Intérprete')}
        sub={t('Cada pessoa fala no seu idioma e ouve a tradução no dela, em voz alta.')}
      />
      <section className="cartao escuro estudio" aria-label={t('Começar a conversa')}>
        <div className="estudio-topo">
          <h2>
            <span className="ponto" />
            {t('Conversa')}
          </h2>
        </div>
        <div className="par-idiomas">
          {campo(t('Você fala'), idiomas.meu)}
          <button
            type="button"
            className="btn btn-outline icone"
            aria-label={t('Inverter os idiomas')}
            onClick={aoInverter}
          >
            <ArrowLeftRight aria-hidden />
          </button>
          {campo(t('A outra pessoa fala'), idiomas.outro)}
        </div>
        <div className="estudio-acoes">
          <button
            type="button"
            className="btn btn-solid grande"
            onClick={aoComecar}
            disabled={!possivel || abrindo}
            data-testid="comecar-conversa"
          >
            {abrindo ? <Loader2 aria-hidden className="animate-spin" /> : <Mic aria-hidden />}
            {abrindo ? t('Abrindo o microfone…') : t('Começar conversa')}
          </button>
        </div>
        <p className="mut orientacao-da-captura" style={{ fontSize: 12.5, marginTop: 6 }} role="status">
          {!possivel
            ? t('Escolha dois idiomas diferentes: um para você, outro para a outra pessoa.')
            : (aviso ?? t('A tradução dos dois lados fica pronta no aparelho antes da primeira frase.'))}
        </p>
      </section>
      <section className="cartao" aria-label={t('Como funciona')}>
        <div className="vazio">
          <IconeEmBloco icone={Languages} />
          <h3 style={{ color: 'inherit' }}>{t('Uma conversa, dois idiomas')}</h3>
          <p className="mut">{t('Três passos e pronto:')}</p>
          <div className="pilha" style={{ textAlign: 'left', marginTop: 6 }}>
            {passos.map((p, i) => (
              <div className="passo" key={i}>
                <IconeEmBloco icone={p.icone} />
                <span>
                  {i + 1} · {p.texto}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
