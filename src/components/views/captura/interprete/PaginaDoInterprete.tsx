import {
  ArrowLeftRight,
  AudioLines,
  ChevronDown,
  Languages,
  Loader2,
  Lock,
  Mic,
  Smartphone,
  Volume2,
} from 'lucide-react';
import { type ReactNode, useEffect, useSyncExternalStore } from 'react';

import { t } from '../../../../lib/i18n';
import { langLabel } from '../../../../lib/languages';
import {
  aoMudarIdiomasDaVozDoQuest,
  atualizarIdiomasDaVozDoQuest,
  idiomasDaVozDoQuest,
  vozDoQuestFala,
} from '../../../../lib/voz/vozDoQuest';
import { LangFlag } from '../../../LangFlag';
import { CabecalhoDeTela, IconeEmBloco } from '../../../ui';
import type { AutomaticoNoPlano } from './ModoInterprete';

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
  automatico = 'oculto',
  noQuest = false,
  semVoz = false,
  vozDoSite = false,
  avisos,
  aoConhecerOPremium,
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
  /** O modo automático nesta conta: o padrão de quem o tem; com cadeado para quem não tem. */
  automatico?: AutomaticoNoPlano;
  /** A tela do Meta Quest (maquete de 01/10/2026): alvos de 60 px e um único botão principal. */
  noQuest?: boolean;
  /** O aparelho não tem voz de leitura: a tradução é só em texto, e a tela não promete voz. */
  semVoz?: boolean;
  /** A voz do site está ligada: no aparelho sem voz, ela lê a tradução nos idiomas que tem. */
  vozDoSite?: boolean;
  /** O cartão da nuvem do aparelho leve (`NuvemDoQuest`): no headset, é ela que faz a conversa andar. */
  avisos?: ReactNode;
  /** Abre os Planos (ausente no perfil protegido: nada de oferta). */
  aoConhecerOPremium?: () => void;
  aoComecar: () => void;
  aoEscolherIdiomas: () => void;
  aoInverter: () => void;
}) {
  const comVozDoSite = semVoz && vozDoSite;
  useSyncExternalStore(
    aoMudarIdiomasDaVozDoQuest,
    () => idiomasDaVozDoQuest().join(),
    () => '',
  );
  useEffect(() => {
    if (comVozDoSite) void atualizarIdiomasDaVozDoQuest();
  }, [comVozDoSite]);
  /** Os idiomas da conversa que NÃO são lidos em voz alta neste aparelho. */
  const emTexto = semVoz ? [idiomas.meu, idiomas.outro].filter((i) => !(comVozDoSite && vozDoQuestFala(i))) : [];
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
    automatico === 'disponivel'
      ? {
          icone: AudioLines,
          texto: t('Toque em Ouvir e conversem: o app reconhece quem fala e lê a tradução em voz alta'),
        }
      : { icone: Volume2, texto: t('Cada um toca a sua metade e fala: a tradução é lida em voz alta para o outro') },
  ];

  /* NO QUEST: os dois idiomas como alvos grandes, os passos à esquerda e UM botão principal de 120 px.
     O que é do plano pago vem dito antes do toque, ao lado do modo por toque, que funciona no grátis. */
  if (noQuest) {
    const lado = (rotulo: string, codigo: string) => (
      <button type="button" className="q-tile em-linha" onClick={aoEscolherIdiomas}>
        <span className="q-ic">
          <LangFlag code={codigo} className="inline-block w-6 h-4" />
        </span>
        <span>
          <span className="q-rotulo">{rotulo}</span>
          <b style={{ display: 'block', marginTop: 6 }}>{langLabel(codigo)}</b>
        </span>
      </button>
    );
    return (
      <div className="q-palco" data-testid="pagina-do-interprete">
        <div className="q-cab">
          <div>
            <p className="q-sobre">{t('Conversa frente a frente')}</p>
            <h1>{t('Intérprete')}</h1>
          </div>
          {emTexto.length === 2 && <span className="q-chip">{t('Tradução em texto neste aparelho')}</span>}
          {emTexto.length === 1 && (
            <span className="q-chip">
              {t('Voz só em {idioma}', { idioma: langLabel(emTexto[0] === idiomas.meu ? idiomas.outro : idiomas.meu) })}
            </span>
          )}
        </div>
        <div className="q-par">
          {lado(t('Você fala'), idiomas.meu)}
          <button type="button" className="q-ctl" aria-label={t('Inverter os idiomas')} onClick={aoInverter}>
            <ArrowLeftRight aria-hidden />
          </button>
          {lado(t('A outra pessoa fala'), idiomas.outro)}
        </div>
        {avisos}
        <div className="q-meio">
          <ol className="q-passos" aria-label={t('Como funciona')}>
            <li>
              <span aria-hidden>1</span>
              {t('Escolha o seu idioma e o da outra pessoa.')}
            </li>
            <li>
              <span aria-hidden>2</span>
              {t('Toque em Começar: a tela se divide em dois lados.')}
            </li>
            <li>
              <span aria-hidden>3</span>
              {emTexto.length === 2
                ? t('Cada pessoa toca o seu lado e fala. A tradução aparece em texto do outro lado.')
                : emTexto.length === 1
                  ? t(
                      'Cada pessoa toca o seu lado e fala. A tradução é lida em voz alta em {comVoz}; em {semVoz}, aparece em texto.',
                      {
                        comVoz: langLabel(emTexto[0] === idiomas.meu ? idiomas.outro : idiomas.meu),
                        semVoz: langLabel(emTexto[0]),
                      },
                    )
                  : t('Cada pessoa toca o seu lado e fala. A tradução é lida em voz alta para a outra.')}
            </li>
            <li className="q-nota" role="status">
              <span aria-hidden>
                <Languages />
              </span>
              <span>
                {!possivel
                  ? t('Escolha dois idiomas diferentes: um para você, outro para a outra pessoa.')
                  : (aviso ?? t('A tradução dos dois lados fica pronta no aparelho antes da primeira frase.'))}
              </span>
            </li>
          </ol>
          <div className="q-grande">
            <button
              type="button"
              className="q-botao"
              onClick={aoComecar}
              disabled={!possivel || abrindo}
              aria-label={t('Começar conversa')}
              data-testid="comecar-conversa"
            >
              {abrindo ? <Loader2 aria-hidden className="animate-spin" /> : <Mic aria-hidden />}
            </button>
            <b aria-hidden>{abrindo ? t('Abrindo o microfone…') : t('Começar conversa')}</b>
          </div>
        </div>
        {automatico === 'premium' && (
          <div className="q-aviso" data-testid="modo-da-pagina">
            <span>
              {t(
                'No Premium, o modo automático reconhece sozinho quem fala qual idioma. Aqui, cada um toca o seu lado.',
              )}
            </span>
            {aoConhecerOPremium && (
              <button type="button" className="q-ctl" onClick={aoConhecerOPremium}>
                {t('Conhecer o Premium')}
              </button>
            )}
          </div>
        )}
        {automatico === 'disponivel' && (
          <div className="q-aviso" data-testid="modo-da-pagina">
            <span>
              {t(
                'Modo automático: o app reconhece sozinho quem fala qual idioma. Dá para trocar para o toque na conversa.',
              )}
            </span>
          </div>
        )}
      </div>
    );
  }

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
        {automatico === 'disponivel' && (
          <p className="mut orientacao-da-captura" style={{ fontSize: 12.5 }} data-testid="modo-da-pagina">
            <AudioLines aria-hidden className="inline-block w-3.5 h-3.5 align-[-2px]" />{' '}
            {t(
              'Modo automático: o app reconhece sozinho quem fala qual idioma. Dá para trocar para o toque na conversa.',
            )}
          </p>
        )}
        {automatico === 'premium' && (
          <p className="mut orientacao-da-captura" style={{ fontSize: 12.5 }} data-testid="modo-da-pagina">
            <Lock aria-hidden className="inline-block w-3.5 h-3.5 align-[-2px]" />{' '}
            {t(
              'No Premium, o modo automático reconhece sozinho quem fala qual idioma. Aqui, cada um toca a sua metade.',
            )}{' '}
            {aoConhecerOPremium && (
              <button type="button" className="link" onClick={aoConhecerOPremium}>
                {t('Conhecer o Premium')}
              </button>
            )}
          </p>
        )}
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
