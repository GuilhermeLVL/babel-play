import '../../styles/questAjustes.css';
import '../../styles/seletorDeVoz.css';

import { AudioLines, Check, Cloud, Sparkles, Square, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { noHeadset } from '../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../lib/i18n';
import { langLabelNaUI } from '../../lib/languages';
import { cancelSpeech, codigoDeFala, speak, vozesCarregadas } from '../../lib/tts';
import { fraseDeAmostra, nomeLegivelDaVoz, type OpcaoDeVoz, opcoesDeVoz } from '../../lib/voz/catalogoDeVozes';
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
import { toast } from '../Toast';

const ICONE = { automatica: Sparkles, nuvem: Cloud, aparelho: AudioLines } as const;

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
    l.scrollTop += marcada.getBoundingClientRect().top - l.getBoundingClientRect().top - Math.max(0, sobra / 2);
  }, [idioma]);

  const ouvir = async (o: OpcaoDeVoz) => {
    const jaTocava = tocando === o.id;
    parar();
    setRecuou(false);
    if (jaTocava) return setTocando(null);
    const meu = pedido.current;
    const fim = () => {
      if (meu === pedido.current) setTocando(null);
    };
    const texto = fraseDeAmostra(idioma);
    const fala = { lang: codigoDeFala(idioma), onEnd: fim, onError: fim };
    setTocando(o.id);
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
    calar.current = cancelSpeech;
    /* `voiceName: ''` é a automática de verdade: sem ele, a amostra sairia com a voz já escolhida. */
    speak(texto, { ...fala, voiceName: o.id });
  };

  const escolher = (o: OpcaoDeVoz) => {
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
          const escolhida = o.id === emUso;
          const amostra = tocando === o.id;
          return (
            <div key={o.id || 'automatica'} className="voz-linha">
              <button
                type="button"
                role="radio"
                className="q-opcao"
                aria-checked={escolhida}
                data-voz={o.id || 'automatica'}
                onClick={() => escolher(o)}
              >
                <Icone aria-hidden />
                <span className="voz-texto">
                  <b>{o.nome}</b>
                  <small>{o.tipo === 'aparelho' ? [o.detalhe, ...o.etiquetas].join(' · ') : o.detalhe}</small>
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
                data-amostra={o.id || 'automatica'}
                onClick={() => void ouvir(o)}
              >
                {amostra ? <Square aria-hidden /> : <Volume2 aria-hidden />}
              </button>
            </div>
          );
        })}
      </div>
      {avisoDoSumico && (
        <p className="q-aju-nota" role="status" data-testid="voz-que-sumiu">
          {avisoDoSumico}
        </p>
      )}
      {semVozDoAparelho && (
        <p className="q-aju-nota" role="note" data-testid="sem-voz-do-aparelho">
          {noHeadset()
            ? t('No Quest a voz é a do site: não há outras vozes para escolher.')
            : t('Nenhuma voz instalada para este idioma.')}
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
