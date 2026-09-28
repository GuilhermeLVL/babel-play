/**
 * OS PACOTES DE IDIOMA DO NAVEGADOR NA BARRA DE PREPARO (harness adaptativo, estágio 4 parte 1).
 *
 * Dois downloads que não são nossos e que a pessoa não via: o pacote do Translator (Chrome/Edge,
 * `monitor` → `downloadprogress`) e o de voz do reconhecimento no aparelho (`SpeechRecognition
 * .install`, sem porcentagem). Os dois só começam no clique em "Iniciar" — é o gesto que a API
 * exige — e antes só apareciam no `clog`: a legenda saía sem tradução e ninguém sabia por quê.
 *
 * NADA DE VISUAL NOVO: entram como mais linhas do MESMO painel do Whisper e do opus-mt
 * (`ModelPrepPanel`, campo `nativos`). Falha é silenciosa por desenho — o opus-mt e o Whisper já
 * cobrem o par, a pessoa não pediu este pacote, e um toast por par viraria enxurrada: a linha some e
 * o `clog` registra. Captura parada: o progresso que chega depois não reabre o painel.
 */
import type { ModelPrepState } from '../../components/ModelPrepPanel';
import type { EstadoDaInstalacaoDoMic } from './motorDoMicrofone';

export type PacoteNativo = 'tradutor' | 'voz';

/** Quanto tempo a linha fica em 100% antes de sumir — o mesmo respiro das barras do Whisper/opus-mt. */
const RESPIRO_MS = 1800;

const VAZIO: ModelPrepState = { whisper: null, mt: null, fromCache: false, error: null, done: false };

/**
 * O preparo com a linha do pacote `qual` em `p` (0..1; `null` = baixando sem porcentagem), ou SEM
 * ela (`undefined`). Sem nada mais no painel (nem Whisper, nem opus-mt, nem erro), o painel some.
 */
export function comPacoteNativo(
  s: ModelPrepState | null,
  qual: PacoteNativo,
  p: number | null | undefined,
): ModelPrepState | null {
  const nativos = { ...s?.nativos };
  if (p === undefined) delete nativos[qual];
  else nativos[qual] = p;
  const base = s ?? VAZIO;
  const temNativos = Object.keys(nativos).length > 0;
  if (!temNativos) {
    if (!s) return null;
    const { nativos: _fora, ...resto } = base;
    const soPacotes = resto.whisper === null && resto.mt === null && !resto.error && !resto.done;
    /* O Whisper/opus-mt já tinham terminado e só o pacote segurava o painel (o respiro deles pulou a
       limpeza por causa dele): some junto. */
    return soPacotes || preparoConcluido(resto) ? null : resto;
  }
  return { ...base, nativos };
}

/** Nenhum pacote do navegador ainda baixando (os prontos saem sozinhos depois do respiro). */
export function semPacotePendente(s: ModelPrepState): boolean {
  return Object.values(s.nativos ?? {}).every((p) => p != null && p >= 1);
}

/** Terminou TUDO (Whisper, opus-mt e os pacotes do navegador)? É o que esconde o painel na captura. */
export function preparoConcluido(s: ModelPrepState): boolean {
  return s.done && (s.mt == null || s.mt >= 1) && semPacotePendente(s);
}

type SetModelPrep = (f: (s: ModelPrepState | null) => ModelPrepState | null) => void;

/**
 * Os ouvintes que a captura passa ao `prepararNativo` (tradutor, por par) e ao `resolverMotorDoMic`
 * (voz). Vários pares baixando viram UMA linha, a média; o par que falha sai da conta.
 */
export function criarProgressoDosPacotesNativos({
  setModelPrep,
  ativo,
  clog,
}: {
  setModelPrep: SetModelPrep;
  /** A captura ainda está de pé? Parada, o progresso tardio é ignorado. */
  ativo: () => boolean;
  clog?: (...a: unknown[]) => void;
}) {
  const pares = new Map<string, number>();
  const aplicar = (qual: PacoteNativo, p: number | null | undefined) => {
    if (!ativo()) return;
    setModelPrep((s) => comPacoteNativo(s, qual, p));
  };
  const sumirDepois = (qual: PacoteNativo, aindaPronto: () => boolean) =>
    setTimeout(() => {
      if (aindaPronto()) aplicar(qual, undefined);
    }, RESPIRO_MS);

  const media = () => [...pares.values()].reduce((a, b) => a + b, 0) / pares.size;

  return {
    tradutor: {
      progresso(p: number, par: string) {
        pares.set(par, p);
        const m = media();
        aplicar('tradutor', m);
        if (m >= 1) {
          clog?.('tradutor nativo: pacote de idioma pronto ✓', [...pares.keys()].join(', '));
          sumirDepois('tradutor', () => pares.size > 0 && media() >= 1);
        }
      },
      falhou(par: string) {
        clog?.('tradutor nativo: pacote', par, 'falhou; segue pelo tradutor local');
        pares.delete(par);
        if (pares.size === 0) aplicar('tradutor', undefined);
        else aplicar('tradutor', media());
      },
    },
    voz(estado: EstadoDaInstalacaoDoMic) {
      if (estado === 'baixando') aplicar('voz', null);
      else if (estado === 'falhou') {
        clog?.('reconhecimento no aparelho: pacote de voz falhou; segue pelo modelo local');
        aplicar('voz', undefined);
      } else {
        aplicar('voz', 1);
        sumirDepois('voz', () => true);
      }
    },
  };
}
