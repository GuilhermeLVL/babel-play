import '../../styles/questAjustes.css';
import '../../styles/seletorDeVoz.css';

import { AudioLines, Check, Cloud, Cpu, Sparkles, Square, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { FLAG_VOZ_NO_APARELHO } from '../../core/harness/vozNoAparelho';
import { noHeadset } from '../../lib/dispositivo/telaNovaDoQuest';
import { useFlag } from '../../lib/flags';
import { t } from '../../lib/i18n';
import { langLabelNaUI } from '../../lib/languages';
import { cancelSpeech, codigoDeFala, speak, vozesCarregadas } from '../../lib/tts';
import { fraseDeAmostra, nomeLegivelDaVoz, type OpcaoDeVoz, opcoesDeVoz } from '../../lib/voz/catalogoDeVozes';
import { passosParaInstalarVoz } from '../../lib/voz/faltaDeVoz';
import {
  escolherVoz,
  useVozesPreferidas,
  VOZ_AUTOMATICA,
  VOZ_DA_NUVEM,
  vozDaNuvemDisponivel,
  vozDoAparelhoExiste,
  vozEmUso,
  vozGuardada,
} from '../../lib/voz/preferenciaDeVoz';
import {
  definirVozDoNarrador,
  motorDaVozNoAparelho,
  VOZ_NO_APARELHO,
  vozDoNarradorNoAparelho,
  vozNoAparelhoUtilizavel,
} from '../../lib/voz/vozNoAparelho';
import { zoomDoCorpo } from '../../lib/zoomDoCorpo';
import { toast } from '../Toast';
import VozNoAparelho from './VozNoAparelho';

const ICONE = { automatica: Sparkles, nuvem: Cloud, 'no-aparelho': Cpu, aparelho: AudioLines } as const;

/**
 * O SELETOR DE VOZ — um só, para a Leitura ("Voz, idioma e tom"), o intérprete e a conversa virtual (a
 * pílula de voz) e os Ajustes ("Voz").
 *
 * Mostra as vozes de UM idioma: "Automática" primeiro (o comportamento de quem nunca escolheu), a voz
 * natural da nuvem só quando o plano a tem ligada, e as vozes do aparelho com o nome legível, o país do
 * sotaque e o que o navegador informa (natural, no aparelho ou pela internet). Cada voz tem um botão
 * de OUVIR UMA AMOSTRA: uma frase curta no idioma, com aquela voz.
 *
 * A escolha é a preferência do app inteiro para o idioma (`lib/voz/preferenciaDeVoz.ts`): vale na hora
 * em todo lugar que fala. A voz guardada que não existe neste aparelho aparece como um aviso, e a
 * marcada é a automática — que é a que de fato lê.
 *
 * Só as peças do desenho novo: `.q-seletor-lista`, `.q-opcao`, `.q-ctl`, `.q-tag`, `.q-aju-nota`.
 */
export default function SeletorDeVoz({
  idioma,
  nuvem,
  aoEscolher,
}: {
  /** O idioma das vozes (`en` ou `en-US`). */
  idioma: string;
  /** O plano tem a voz natural ligada? Padrão: a capacidade `vozNatural` com a flag `voz_natural`. */
  nuvem?: boolean;
  aoEscolher?: (voz: string) => void;
}) {
  useVozesPreferidas(); // a lista acompanha a escolha feita em outra tela, a conta e as vozes do sistema
  useFlag(FLAG_VOZ_NO_APARELHO); // a voz no aparelho aparece (ou some) quando a flag chega
  const comNuvem = nuvem ?? vozDaNuvemDisponivel();
  const opcoes = opcoesDeVoz(idioma, comNuvem);
  const emUso = vozEmUso(idioma, comNuvem);
  const guardada = vozGuardada(idioma);
  /* A voz guardada não vale aqui: o plano perdeu a nuvem, ou o aparelho não tem a voz (só dá para
     dizer isso depois de a lista do sistema chegar). */
  const avisoDoSumico =
    guardada === VOZ_AUTOMATICA || guardada === emUso
      ? ''
      : guardada === VOZ_DA_NUVEM
        ? t('A voz natural não faz parte do seu plano agora. Lendo com a voz automática.')
        : guardada === VOZ_NO_APARELHO
          ? t('A voz de alta qualidade não está pronta neste aparelho. Lendo com a voz automática.')
          : vozesCarregadas() && !vozDoAparelhoExiste(guardada)
            ? t('A voz {voz} não existe neste aparelho. Lendo com a voz automática.', {
                voz: nomeLegivelDaVoz(guardada),
              })
            : '';
  const semVozDoAparelho = !opcoes.some((o) => o.tipo === 'aparelho');
  const nomeDoIdioma = langLabelNaUI(idioma);

  /** A amostra tocando agora (o `id` da opção) e quem a toca, para poder calar. */
  const [tocando, setTocando] = useState<string | null>(null);
  const [recuou, setRecuou] = useState(false);
  const calar = useRef<(() => void) | null>(null);
  const pedido = useRef(0);
  const parar = () => {
    pedido.current++;
    calar.current?.();
    calar.current = null;
  };
  useEffect(() => parar, []);

  /* Ao abrir, a voz escolhida fica à vista: numa lista que rola (a folha do intérprete tem duas, curtas),
     ela podia estar escondida abaixo da dobra. Só mexe na rolagem DA LISTA, nunca na da página. */
  const lista = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const l = lista.current;
    const marcada = l?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!l || !marcada || l.scrollHeight <= l.clientHeight) return;
    const sobra = l.clientHeight - marcada.offsetHeight;
    l.scrollTop +=
      (marcada.getBoundingClientRect().top - l.getBoundingClientRect().top) / zoomDoCorpo() - Math.max(0, sobra / 2);
  }, [idioma]);

  const ouvir = async (o: OpcaoDeVoz) => {
    const chave = o.vozDoModelo ? `${o.id}:${o.vozDoModelo}` : o.id;
    const jaTocava = tocando === chave;
    parar();
    setRecuou(false);
    if (jaTocava) return setTocando(null);
    const meu = pedido.current;
    const fim = () => {
      if (meu === pedido.current) setTocando(null);
    };
    const texto = fraseDeAmostra(idioma);
    const fala = { lang: codigoDeFala(idioma), onEnd: fim, onError: fim };
    setTocando(chave);
    if (o.tipo === 'nuvem') {
      /* A voz da nuvem fica fora do JS inicial; a amostra gasta os caracteres de uma frase curta. Se a
         nuvem não responder, quem lê é a voz do aparelho, e a tela diz isso. */
      const { criarVozDaNuvem } = await import('../../lib/voz/vozDaNuvem');
      if (meu !== pedido.current) return;
      const motor = criarVozDaNuvem({ aoRecuar: () => setRecuou(true) });
      calar.current = () => motor.cancel();
      motor.speak(texto, fala);
      return;
    }
    if (o.tipo === 'no-aparelho') {
      /* A amostra da voz no aparelho sai do próprio motor (o worker carrega o modelo já baixado). */
      const motor = await motorDaVozNoAparelho().catch(() => null);
      if (meu !== pedido.current) return;
      if (!motor) return fim();
      calar.current = () => motor.cancel();
      motor.speak(texto, o.vozDoModelo ? { ...fala, voiceName: o.vozDoModelo } : fala);
      return;
    }
    calar.current = cancelSpeech;
    /* `voiceName: ''` é a automática de verdade: sem ele, a amostra sairia com a voz já escolhida. */
    speak(texto, { ...fala, voiceName: o.id });
  };

  const escolher = (o: OpcaoDeVoz) => {
    if (o.id === VOZ_NO_APARELHO && !vozNoAparelhoUtilizavel()) return; // antes de baixar, só o botão de baixar vale
    if (o.vozDoModelo) definirVozDoNarrador(o.vozDoModelo);
    aoEscolher?.(o.id);
    void escolherVoz(idioma, o.id).then(
      (ok) => ok || toast.warn(t('A voz já vale neste aparelho, mas não deu para guardar na conta agora.')),
    );
  };

  return (
    <div className="voz-seletor" data-testid="seletor-de-voz" data-idioma={idioma}>
      <div
        ref={lista}
        className="q-seletor-lista voz-lista"
        role="radiogroup"
        aria-label={t('Voz para {idioma}', { idioma: nomeDoIdioma })}
      >
        {opcoes.map((o) => {
          const Icone = ICONE[o.tipo];
          const chave = o.vozDoModelo ? `${o.id}:${o.vozDoModelo}` : o.id;
          const escolhida = o.id === emUso && (!o.vozDoModelo || o.vozDoModelo === vozDoNarradorNoAparelho());
          const amostra = tocando === chave;
          return (
            <div key={chave || 'automatica'} className="voz-linha">
              <button
                type="button"
                role="radio"
                className="q-opcao"
                aria-checked={escolhida}
                data-voz={chave || 'automatica'}
                onClick={() => escolher(o)}
              >
                <Icone aria-hidden />
                <span className="voz-texto">
                  <b>{o.nome}</b>
                  <small>{o.tipo === 'aparelho' ? [o.detalhe, ...o.etiquetas].join(' · ') : o.detalhe}</small>
                  {o.tipo === 'no-aparelho' &&
                    o.etiquetas.map((e) => (
                      <span key={e} className="q-tag voz-texto-tag">
                        {e}
                      </span>
                    ))}
                </span>
                {o.tipo === 'nuvem' &&
                  o.etiquetas.map((e) => (
                    <span key={e} className="q-tag">
                      {e}
                    </span>
                  ))}
                {escolhida && <Check aria-hidden className="q-opcao-ok" />}
              </button>
              <button
                type="button"
                className="q-ctl"
                aria-pressed={amostra}
                aria-label={amostra ? t('Parar a amostra') : t('Ouvir uma amostra da voz {voz}', { voz: o.nome })}
                data-amostra={chave || 'automatica'}
                disabled={o.tipo === 'no-aparelho' && !vozNoAparelhoUtilizavel()}
                onClick={() => void ouvir(o)}
              >
                {amostra ? <Square aria-hidden /> : <Volume2 aria-hidden />}
              </button>
            </div>
          );
        })}
      </div>
      <VozNoAparelho
        idioma={idioma}
        aoFicarPronta={() =>
          escolher({ id: VOZ_NO_APARELHO, tipo: 'no-aparelho', nome: '', detalhe: '', etiquetas: [] })
        }
      />
      {avisoDoSumico && (
        <p className="q-aju-nota" role="status" data-testid="voz-que-sumiu">
          {avisoDoSumico}
        </p>
      )}
      {semVozDoAparelho && (
        <p className="q-aju-nota" role="note" data-testid="sem-voz-do-aparelho">
          {noHeadset()
            ? t('No Quest a voz é a do site: não há outras vozes para escolher.')
            : !vozesCarregadas()
              ? t('Carregando as vozes deste aparelho…')
              : `${t('Este aparelho não tem voz em {idioma}.', { idioma: nomeDoIdioma })} ${passosParaInstalarVoz()}`}
        </p>
      )}
      {opcoes.some((o) => o.etiquetas.includes(t('Natural'))) && (
        <p className="q-aju-nota" data-testid="nota-natural">
          {t('“Natural” é uma estimativa pelo nome da voz: o navegador não informa a qualidade.')}
        </p>
      )}
      {recuou && (
        <p className="q-aju-nota" role="status" data-testid="amostra-pela-reserva">
          {t('A voz natural não respondeu agora: esta amostra foi lida pela voz do aparelho.')}
        </p>
      )}
    </div>
  );
}
