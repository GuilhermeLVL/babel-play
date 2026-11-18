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

/**
 * PRAZO SEM PROGRESSO de um par do tradutor nativo (COMP-03, auditoria de 17/11/2026). No Chromium sem o pacote, um par
 * chamava `falhou` e o outro nunca mais dizia nada: a média ficava em 0% e o cartão cobria a primeira legenda a sessão
 * inteira. Vencido o prazo, o par sai da conta como se tivesse falhado; o download do navegador continua, e a próxima
 * sessão o usa.
 */
export const PRAZO_SEM_PROGRESSO_MS = 20_000;

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
  const prazos = new Map<string, ReturnType<typeof setTimeout>>();
  /** O tradutor local já traduziu nesta sessão: o nativo não é mais esperado, e a linha dele não volta. */
  let localAssumiu = false;
  /** Uma sessão nova tomou o lugar desta: nada que ainda chegue daqui (um prazo vencendo) mexe no cartão dela. */
  let descartado = false;
  const aplicar = (qual: PacoteNativo, p: number | null | undefined) => {
    if (descartado || !ativo()) return;
    setModelPrep((s) => comPacoteNativo(s, qual, p));
  };
  const soltarPrazo = (par: string) => {
    clearTimeout(prazos.get(par));
    prazos.delete(par);
  };
  const sumirDepois = (qual: PacoteNativo, aindaPronto: () => boolean) =>
    setTimeout(() => {
      if (aindaPronto()) aplicar(qual, undefined);
    }, RESPIRO_MS);

  const media = () => [...pares.values()].reduce((a, b) => a + b, 0) / pares.size;

  const tradutor = {
    progresso(p: number, par: string) {
      if (localAssumiu) return;
      pares.set(par, p);
      soltarPrazo(par);
      if (p < 1)
        prazos.set(
          par,
          setTimeout(() => {
            clog?.(
              'tradutor nativo: pacote',
              par,
              `sem progresso em ${PRAZO_SEM_PROGRESSO_MS / 1000} s; sai do cartão`,
            );
            tradutor.falhou(par);
          }, PRAZO_SEM_PROGRESSO_MS),
        );
      const m = media();
      aplicar('tradutor', m);
      if (m >= 1) {
        clog?.('tradutor nativo: pacote de idioma pronto ✓', [...pares.keys()].join(', '));
        sumirDepois('tradutor', () => pares.size > 0 && media() >= 1);
      }
    },
    /** O par falhou, o disjuntor do `chrome-translator` abriu ou o prazo venceu: sai da média. */
    falhou(par: string) {
      clog?.('tradutor nativo: pacote', par, 'falhou; segue pelo tradutor local');
      soltarPrazo(par);
      if (!pares.delete(par) && localAssumiu) return;
      if (pares.size === 0) aplicar('tradutor', undefined);
      else aplicar('tradutor', media());
    },
    /** A primeira tradução local da sessão chegou: o cartão do nativo some no mesmo quadro e não volta. */
    localAssumiu() {
      if (localAssumiu) return;
      localAssumiu = true;
      for (const par of [...prazos.keys()]) soltarPrazo(par);
      const tinha = pares.size > 0;
      pares.clear();
      if (tinha) aplicar('tradutor', undefined);
    },
  };

  return {
    /** A sessão acabou (outra começou): solta os prazos e silencia os ouvintes desta. */
    descartar() {
      descartado = true;
      for (const par of [...prazos.keys()]) soltarPrazo(par);
    },
    /* Os métodos vão soltos (`pacotes.tradutor.progresso` como ouvinte): nada de `this`. */
    tradutor,
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

/** Os ouvintes de uma sessão (o tradutor, por par, e a voz). */
export type PacotesNativos = ReturnType<typeof criarProgressoDosPacotesNativos>;
