/**
 * O SELO DA FALA — ONDE a fala está sendo processada, e por quê (etapa 5 de
 * `planos-v3-e-rota-inteligente`, design §5; spec `transparencia-da-fala`).
 *
 * POR QUE EXISTE. O selo da captura mostrava o rótulo técnico da rota ("nuvem (large-v3-turbo) ·
 * reserva local"), que diz o modelo e não responde à pergunta de quem usa: o meu áudio sai daqui?
 * Aqui a resposta vira uma de três etiquetas fixas ("No aparelho", "Pelo navegador", "Nuvem do
 * Babel"), um detalhe curto sem jargão e o motivo.
 *
 * DUAS FONTES, E A ORDEM ENTRE ELAS. O PREVISTO é a decisão da política (`decidirRota`); o REAL é o
 * motor que de fato atendeu a última fala final (`SpeechSegment.engine`). Depois da primeira fala
 * vale o real, e quando ele diverge do previsto o motivo diz que mudou. Antes dela vale o previsto,
 * com palavra que não afirma o que ainda não aconteceu ("Vai rodar no aparelho").
 *
 * A REGRA DE OURO: o selo nunca diz "No aparelho" se o motor real da última fala mandou o áudio para
 * fora. Para onde cada motor manda é o que o registro declara (`enviaDadosA`), nunca uma lista daqui.
 * Na dúvida o selo falha FECHADO:
 *   · o id de um adaptador com vários motores (`web-speech` cobre o modo que envia e os dois que não
 *     enviam) vale pelo motor que envia;
 *   · motor que o registro não conhece, ou que não transcreve: não há selo (melhor calar que errar);
 *   · o modelo local atendeu uma fala cuja rota prevista era a nuvem (ou com a chave da própria
 *     pessoa, que vai à nuvem primeiro): a nuvem foi tentada antes, e o áudio pode ter saído — a
 *     etiqueta diz onde a fala foi transcrita, e o detalhe não promete que o áudio ficou.
 *
 * O TEXTO. As frases em português são as chaves do catálogo de i18n (como o `t()` do app); quem
 * traduz é a tela (`textoDoSelo`). "Não fica guardado" NÃO está no detalhe da nuvem de propósito: o
 * nosso servidor não grava o áudio da transcrição, mas a retenção zero do provedor é configuração da
 * conta dele, e o cliente não tem como conferi-la.
 *
 * PURO: sem DOM, sem relógio, sem estado global. Tudo entra por parâmetro.
 */
import { exigeConsentimento, motorPorId, REGISTRO_DE_MOTORES } from '../../core/harness/registroDeMotores';
import {
  decidirRota,
  type DecisaoDeRota,
  type DisponibilidadeNoNavegador,
  type PedidoDeRota,
} from '../../core/rota/politicaDeRota';

/** As três etiquetas fixas (design §5). */
export type OndeDoSelo = 'aparelho' | 'navegador' | 'nuvem';

export interface MotivoDoSelo {
  /** A frase em português: a chave do catálogo de i18n. */
  chave: string;
  vars?: Record<string, string | number>;
}

export interface SeloDaFala {
  onde: OndeDoSelo;
  /** Chave de i18n. Com `confirmado`, uma das três etiquetas fixas; antes da primeira fala, a forma "Vai…". */
  etiqueta: string;
  /** Chave de i18n: para onde o áudio vai, sem nome de modelo. */
  detalhe: string;
  /** Por que esta rota (a explicação da política), ou o que mudou. `null` = nada a dizer. */
  motivo: MotivoDoSelo | null;
  /** O áudio saiu do aparelho — ou PODE ter saído (a nuvem tentada antes de o modelo local atender). */
  saiDoAparelho: boolean;
  /** `true` = uma fala já foi atendida e o selo diz o que aconteceu; `false` = é o previsto. */
  confirmado: boolean;
  /** O motor real não é o que a política previa. */
  mudou: boolean;
}

const ETIQUETA: Record<OndeDoSelo, string> = {
  aparelho: 'No aparelho',
  navegador: 'Pelo navegador',
  nuvem: 'Nuvem do Babel',
};

/** Antes da primeira fala: o que VAI acontecer, sem afirmar que aconteceu. */
const ETIQUETA_PREVISTA: Record<OndeDoSelo, string> = {
  aparelho: 'Vai rodar no aparelho',
  navegador: 'Vai pelo navegador',
  nuvem: 'Vai pela Nuvem do Babel',
};

const DETALHE: Record<OndeDoSelo, string> = {
  aparelho: 'seu áudio não sai daqui',
  navegador: 'o áudio vai para o serviço de fala do navegador',
  nuvem: 'o áudio vai para o nosso servidor',
};
const DETALHE_PREVISTO_NO_APARELHO = 'seu áudio não vai sair daqui';
const DETALHE_DEPOIS_DA_NUVEM = 'transcrita aqui, depois de tentar a nuvem';

const MUDOU: Record<OndeDoSelo, string> = {
  aparelho: 'Mudou: esta fala foi transcrita no aparelho.',
  navegador: 'Mudou: esta fala foi para o serviço de fala do navegador.',
  nuvem: 'Mudou: esta fala foi para a nuvem.',
};
const MUDOU_A_NUVEM_NAO_RESPONDEU = 'Mudou: a nuvem não respondeu nesta fala.';
const NAVEGADOR_NO_APARELHO = 'O navegador reconheceu esta fala no próprio aparelho.';

/** Onde o processamento acontece e se o áudio sai: o que o previsto e o real têm em comum. */
interface Lugar {
  onde: OndeDoSelo;
  envia: boolean;
}

/** A etiqueta de um lugar: o navegador que processa no aparelho é "No aparelho". */
const etiquetaDoLugar = (l: Lugar): OndeDoSelo => (l.envia ? l.onde : 'aparelho');

const lugarDoPrevisto = (d: DecisaoDeRota): Lugar => ({
  onde: d.processamento.onde,
  envia: d.processamento.enviaDadosA !== null,
});

/**
 * O lugar do motor que atendeu a fala, pelo registro. Aceita o id do motor (`web-speech-local`) ou o
 * do adaptador (`whisper-local`, `groq-whisper`, `web-speech`): a fala do pipeline guarda o adaptador
 * (`r.engine ?? b.adapterId`, em `gateway/index.ts`), e a da Web Speech, o motor com o modo
 * (`segmentosDaWebSpeech.ts`). `null` = o selo não tem o que afirmar.
 */
function lugarDoMotor(id: string): Lugar | null {
  const exato = motorPorId(id);
  const motores = exato ? [exato] : REGISTRO_DE_MOTORES.filter((m) => m.adapterId === id);
  const deFala = motores.filter((m) => m.tarefa === 'stt');
  if (!deFala.length) return null;
  // Vários motores no mesmo adaptador: basta um enviar para o selo falar por ele.
  const m = deFala.find(exigeConsentimento) ?? deFala[0];
  if (m.runtime === 'nuvem') return m.enviaDadosA === 'nos' ? { onde: 'nuvem', envia: true } : null;
  if (m.runtime === 'local') return m.enviaDadosA === null ? { onde: 'aparelho', envia: false } : null;
  return { onde: 'navegador', envia: exigeConsentimento(m) };
}

/**
 * O SELO. `previsto`: a decisão da política, ou uma por fonte (o som do computador e o microfone
 * podem ir a lugares diferentes). `motorReal`: o motor da última fala final (`motorDaUltimaFala`);
 * `null` = nenhuma fala ainda. Devolve `null` quando não há o que dizer com segurança.
 */
export function seloDaFala(
  previsto: DecisaoDeRota | readonly DecisaoDeRota[] | null,
  motorReal?: string | null,
  opcoes: {
    /**
     * A transcrição vai pela nuvem com a CHAVE DA PESSOA (o provedor "nuvem" dos ajustes), que a
     * política não vê: o previsto dela não vale, e o modelo local só atende depois de a nuvem falhar.
     */
    nuvemPorChavePropria?: boolean;
  } = {},
): SeloDaFala | null {
  const daPolitica: readonly DecisaoDeRota[] = !previsto ? [] : 'rota' in previsto ? [previsto] : previsto;
  const previstos = opcoes.nuvemPorChavePropria ? [] : daPolitica;

  if (!motorReal) {
    // Com duas fontes, o selo mostra a que mais expõe o áudio: nunca promete menos do que vai acontecer.
    const d = previstos.find((p) => lugarDoPrevisto(p).envia) ?? previstos[0];
    if (!d) return null;
    const onde = etiquetaDoLugar(lugarDoPrevisto(d));
    return {
      onde,
      etiqueta: ETIQUETA_PREVISTA[onde],
      detalhe: onde === 'aparelho' ? DETALHE_PREVISTO_NO_APARELHO : DETALHE[onde],
      motivo: d.explicacao,
      saiDoAparelho: onde !== 'aparelho',
      confirmado: false,
      mudou: false,
    };
  }

  const real = lugarDoMotor(motorReal);
  if (!real) return null;
  const onde = etiquetaDoLugar(real);
  const base = { onde, etiqueta: ETIQUETA[onde], confirmado: true };

  /* O nosso modelo atendeu, e a rota do modelo era a nuvem: o gateway tentou a nuvem primeiro e caiu
     na reserva. A fala foi transcrita aqui, mas o áudio pode ter subido antes de a nuvem falhar. */
  const nuvemAntes = opcoes.nuvemPorChavePropria || previstos.some((p) => p.processamento.onde === 'nuvem');
  if (real.onde === 'aparelho' && nuvemAntes) {
    return {
      ...base,
      detalhe: DETALHE_DEPOIS_DA_NUVEM,
      motivo: { chave: MUDOU_A_NUVEM_NAO_RESPONDEU },
      saiDoAparelho: true,
      mudou: true,
    };
  }

  const exato = previstos.find((p) => {
    const l = lugarDoPrevisto(p);
    return l.onde === real.onde && l.envia === real.envia;
  });
  const mesmaEtiqueta = exato ?? previstos.find((p) => etiquetaDoLugar(lugarDoPrevisto(p)) === onde);
  const mudou = previstos.length > 0 && !mesmaEtiqueta;
  const motivo: MotivoDoSelo | null = mudou
    ? { chave: MUDOU[onde] }
    : exato
      ? exato.explicacao
      : real.onde === 'navegador' && mesmaEtiqueta
        ? { chave: NAVEGADOR_NO_APARELHO } // previsto o nosso modelo, atendeu o navegador no aparelho
        : (mesmaEtiqueta?.explicacao ?? null);
  return { ...base, detalhe: DETALHE[onde], motivo, saiDoAparelho: real.envia, mudou };
}

/** O `t()` do app (`lib/i18n.ts`), recebido por parâmetro: este módulo não lê o idioma da interface. */
type Traduzir = (chave: string, vars?: Record<string, string | number>) => string;

/**
 * O selo em texto: a frase clara ("No aparelho · seu áudio não sai daqui") e o motivo. `nomeDoIdioma`
 * troca o código que a política põe em `{idioma}` ("en") pelo nome que a tela mostra ("inglês").
 */
export function textoDoSelo(
  selo: SeloDaFala,
  t: Traduzir,
  nomeDoIdioma: (codigo: string) => string = (codigo) => codigo,
): { frase: string; motivo: string } {
  const frase = `${t(selo.etiqueta)} · ${t(selo.detalhe)}`;
  if (!selo.motivo) return { frase, motivo: '' };
  const { chave, vars } = selo.motivo;
  const comNome = vars && typeof vars.idioma === 'string' ? { ...vars, idioma: nomeDoIdioma(vars.idioma) } : vars;
  return { frase, motivo: t(chave, comNome) };
}

/**
 * O MOTOR REAL da última fala FINAL da tela (o parcial em curso não conta: ele nunca sai do aparelho
 * e ainda não é a fala). `null` = nenhuma fala final, ou a última não diz quem a atendeu.
 *
 * A fala traz o motor (`engine`): a do pipeline, o adaptador; a da Web Speech, o motor do registro
 * com o modo em que a sessão abriu (`segmentosDaWebSpeech.ts`: `web-speech-local` quando o navegador
 * reconheceu no aparelho, `web-speech` quando enviou ao fabricante). Vale o que a fala guarda.
 *
 * A fala SEM motor (as de antes de a Web Speech guardá-lo) é deduzida da fonte, sempre para o lado
 * que NÃO esconde um envio:
 *   · som do computador pelo navegador: é sempre no aparelho (o adaptador lança se receber uma
 *     trilha sem `processLocally`) → `web-speech-local-trilha`;
 *   · microfone pelo navegador: não se sabe o modo → `web-speech`, o que envia (falha fechado);
 *   · sem o navegador na fonte, a fala sem motor é uma transcrição que falhou: nada a afirmar.
 */
export function motorDaUltimaFala(
  falas: readonly { isPartial?: boolean; engine?: string; source: 'system' | 'mic' }[],
  dicas: { sistemaNoNavegador: boolean; micNoNavegador: boolean },
): string | null {
  for (let i = falas.length - 1; i >= 0; i--) {
    const f = falas[i];
    if (f.isPartial) continue;
    if (f.engine) return f.engine;
    if (f.source === 'mic') return dicas.micNoNavegador ? 'web-speech' : null;
    return dicas.sistemaNoNavegador ? 'web-speech-local-trilha' : null;
  }
  return null;
}

/** O microfone que vai ao reconhecimento do navegador, como a captura o decidiu. */
export interface MicrofoneNoNavegador {
  /** O idioma que se fala ao microfone. */
  idioma: string;
  /** O navegador reconhece esse idioma no aparelho? (a sonda guardada; `null` = sem resposta). */
  falaNoAparelho: DisponibilidadeNoNavegador | null;
  bipaAoReligar: boolean;
}

/**
 * OS PREVISTOS DA CAPTURA: a política (desligada, modo sombra) respondendo por cada fonte de áudio.
 * `base` é o pedido do MODELO de transcrição (`montarPedidoDeRota`, que a conferência já usa); o
 * microfone pelo navegador é uma segunda pergunta, porque vai a outro lugar. No cenário só de
 * microfone pelo navegador, o modelo não ouve nada e não entra. Não altera o pedido.
 */
export function previstosDoSelo(
  base: PedidoDeRota,
  o: { soMicrofone: boolean; semRede: boolean; micNoNavegador: MicrofoneNoNavegador | null },
): DecisaoDeRota[] {
  const pedido: PedidoDeRota = { ...base, estado: { ...base.estado, semRede: o.semRede } };
  const mic = o.micNoNavegador;
  const previstos: DecisaoDeRota[] = [];
  if (!(o.soMicrofone && mic)) previstos.push(decidirRota(pedido));
  if (mic) {
    previstos.push(
      decidirRota({
        ...pedido,
        fonte: 'microfone',
        idioma: mic.idioma,
        idiomaDoMicrofone: undefined,
        aparelho: {
          ...pedido.aparelho,
          navegador: {
            ...pedido.aparelho.navegador,
            fala: true,
            falaNoAparelho: mic.falaNoAparelho,
            bipaAoReligar: mic.bipaAoReligar,
          },
        },
        estado: { ...pedido.estado, preferencia: { ...pedido.estado.preferencia, microfone: 'navegador' } },
      }),
    );
  }
  return previstos;
}
