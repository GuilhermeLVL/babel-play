/**
 * O OUVIDO DA LEITURA EM VOZ ALTA (spec `leitura-ativa-voz-alta`; design §5) — só motor local, por construção.
 *
 * A VOZ NUNCA SAI DO APARELHO. Este adaptador conhece só motores que reconhecem no aparelho: a Web Speech com
 * `processLocally` (Chrome/Edge 139+, que FALHA FECHADO: lança em vez de cair na nuvem calada). Ele não recebe a
 * fábrica de motores do app (`routeStt`, `motorDoMicrofone`), então não tem como abrir a nuvem, nem com o
 * consentimento de nuvem dado em outra tela. Sem motor local, `disponivel` é falso e a tela esmaece o modo.
 * [Pendente: o modelo local do roteador (Moonshine, `startLive`) como segundo motor; hoje só a Web Speech local.]
 *
 * O ÁUDIO MORRE A CADA FRASE. Os buffers vivem no motor; `descartar()` encerra a sessão e abre outra limpa (o
 * motor solta o que ouviu). A tela chama ao fim de cada frase (o alinhador diz quando), ao pausar, ao sair e no
 * `visibilitychange`. Daqui só sai TEXTO (o parcial), que o alinhador transforma no estado das palavras.
 */
import { type ErroDaWebSpeech, WebSpeechStt } from '../../gateway/adapters/webSpeech';
import type { SttCallbacks, SttSession } from '../../gateway/capabilities';
import { temReconhecimentoLocal } from '../captura/webSpeechDoSistema';

/** Um motor que reconhece NO aparelho. */
export interface MotorLocal {
  id: string;
  disponivel(): boolean;
  /** Abre uma sessão; lança se não puder reconhecer no aparelho. */
  iniciar(lang: string, cb: SttCallbacks): SttSession;
}

export const WEB_SPEECH_LOCAL: MotorLocal = {
  id: 'web-speech-local',
  disponivel: () => temReconhecimentoLocal(),
  iniciar: (lang, cb) => new WebSpeechStt({ processLocally: true }).startLive(lang, cb),
};

/** Os motores locais, na ordem de preferência. Nunca um motor de nuvem aqui. */
export const MOTORES_LOCAIS: readonly MotorLocal[] = [WEB_SPEECH_LOCAL];

export function ouvinteDisponivel(motores: readonly MotorLocal[] = MOTORES_LOCAIS): boolean {
  return motores.some((m) => m.disponivel());
}

export type FalhaDoOuvinte = 'sem-motor-local' | 'sem-microfone' | 'negado' | 'parou';

export interface OuvinteLocal {
  /** Para de ouvir (e solta o áudio). */
  parar(): void;
  /** Solta o áudio da frase que acabou e segue ouvindo com uma sessão limpa. */
  descartar(): void;
}

function falhaDe(e: Error): FalhaDoOuvinte {
  const codigo = (e as ErroDaWebSpeech).codigo;
  if (codigo === 'not-allowed' || codigo === 'service-not-allowed') return 'negado';
  if (codigo === 'audio-capture') return 'sem-microfone';
  return 'parou';
}

/**
 * Liga o ouvido. Devolve `null` quando nenhum motor local abriu (`aoFalhar('sem-motor-local')` já foi chamado).
 * `aoParcial(texto, final)`: a hipótese da fala corrente; `final` = a fala acabou.
 */
export function abrirOuvinteLocal(o: {
  lang: string;
  aoParcial(texto: string, final: boolean): void;
  aoFalhar(f: FalhaDoOuvinte): void;
  motores?: readonly MotorLocal[];
}): OuvinteLocal | null {
  const motor = (o.motores ?? MOTORES_LOCAIS).find((m) => m.disponivel());
  if (!motor) {
    o.aoFalhar('sem-motor-local');
    return null;
  }
  let vivo = true;
  let sessao: SttSession | null = null;
  const abrir = (): SttSession | null => {
    try {
      return motor.iniciar(o.lang, {
        onPartial: (texto) => {
          if (vivo) o.aoParcial(texto, false);
        },
        onFinal: (r) => {
          if (vivo) o.aoParcial(r.text, true);
        },
        onError: (e) => {
          if (!vivo || !(e as ErroDaWebSpeech).fatal) return;
          vivo = false;
          sessao = null;
          o.aoFalhar(falhaDe(e));
        },
      });
    } catch {
      vivo = false;
      o.aoFalhar('sem-motor-local');
      return null;
    }
  };
  sessao = abrir();
  if (!sessao) return null;
  const encerrar = () => {
    const s = sessao;
    sessao = null;
    try {
      s?.stop();
    } catch {
      /* já parado */
    }
  };
  return {
    parar() {
      vivo = false;
      encerrar();
    },
    descartar() {
      if (!vivo) return;
      encerrar();
      sessao = abrir();
    },
  };
}
