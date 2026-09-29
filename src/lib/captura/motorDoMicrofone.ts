/**
 * O MOTOR DO MICROFONE — qual reconhecedor ouve a SUA voz, decidido pelo que sai do aparelho
 * (harness adaptativo §1.1 e §6; integração de 2026-09-28).
 *
 * POR QUE EXISTE. A Web Speech era o motor PADRÃO do microfone (`micEngine = 'browser'`) e a captura
 * a instanciava direto, por fora do perfil e do gateway. No Chrome, sem `processLocally`, ela manda o
 * áudio aos servidores do Google — até no perfil "Privado/Local 100% offline", sem consentimento
 * nenhum (auditoria de eficiência 2026-09-28, §3; LGPD). O registro de motores passou a exigir o
 * consentimento de nuvem para ela; esta decisão é o que a captura consulta antes de abrir o mic.
 *
 * TRÊS DEGRAUS, do que não sai do aparelho ao que sai:
 *   (a) `web-speech-local` — o navegador reconhece NO aparelho (`available({processLocally})` =
 *       'available'). Grátis, sem download nosso, sem consentimento: nada sai;
 *   (b) `web-speech-nuvem` — a de sempre, SÓ com o consentimento ESPECÍFICO do reconhecimento do
 *       navegador (a opção "Rápido") e NUNCA no perfil Privado nem no perfil protegido;
 *   (c) `whisper` — o Whisper/Moonshine local que já servia a quem não tem Web Speech.
 * Quem escolheu o Whisper no seletor fica nele: a escolha da pessoa vale mais que o padrão.
 *
 * "RÁPIDO" OU "PRIVADO" (decisão do dono, opção b, 2026-09-28). Sem (a), a pessoa escolhe UMA vez,
 * antes de o mic abrir: "Rápido" = (b), o áudio vai ao Google/Microsoft/Apple, sem download;
 * "Privado" = (c), baixa o modelo e nada sai. O consentimento é PRÓPRIO
 * (`consentimentos.reconhecimentoDoNavegador`), separado do "Usar IA de nuvem" — este fala de
 * NOSSOS servidores de IA (Groq, OpenRouter, MyMemory); aquele, do fornecedor do navegador. Um "sim"
 * não vale pelo outro (LGPD art. 8º, § 4º: consentimento para finalidade determinada). A escolha
 * muda depois em "Dispositivos e modelos de IA" (Microfone) e em Ajustes → Privacidade.
 *
 * PERFIL PROTEGIDO (`perfilProtegido()`: menor, ou idade ainda não declarada no modo público) não
 * vê o "Rápido": fica no "Privado" sem pergunta. É a política que o app já tem para a nuvem —
 * a configuração mais protetiva é a padrão, e a conta de menor só sai do aparelho com o vínculo do
 * responsável aceito (`protecaoDoMenor.ts`, `restrita`). Com o vínculo aceito, a pergunta volta.
 *
 * PACOTE A BAIXAR ('downloadable'): `SpeechRecognition.install()` exige ativação do usuário, então só
 * é chamado a partir do clique em "Iniciar"/microfone (`resolverMotorDoMic`, chamado de `startMic`),
 * nunca sozinho. Quando o degrau seguinte seria o NOSSO Whisper (Privado, perfil protegido, sem
 * consentimento), a instalação é ESPERADA (estágio 4): o pacote do navegador é grátis, nada sai do
 * aparelho e costuma ser bem menor que o modelo — instalou, ESTA sessão já usa o local
 * (`instalado-no-aparelho`); falhou ou passou do prazo, o Whisper segue como antes. Com o "Rápido"
 * consentido, a nuvem atende agora e a instalação corre sem espera (a próxima sessão já é local).
 */
import type { Disponibilidade } from '../dispositivo/sonda';

export type MotorDoMicrofone = 'web-speech-local' | 'web-speech-nuvem' | 'whisper';

export type MotivoDoMotorDoMic =
  | 'escolha-whisper'
  | 'sem-web-speech'
  | 'no-aparelho'
  | 'instalado-no-aparelho'
  | 'nuvem-consentida'
  | 'perfil-privado'
  | 'perfil-protegido'
  | 'sem-consentimento';

/** A resposta da pergunta "Rápido ou Privado?" — guardada nas preferências. */
export type EscolhaDoMic = 'rapido' | 'privado';

export interface EntradaDoMotorDoMic {
  /** O seletor da tela: 'browser' (Web Speech, padrão) ou 'whisper'. */
  preferido: 'browser' | 'whisper';
  /** `SpeechRecognition`/`webkitSpeechRecognition` existe. */
  webSpeechSuportado: boolean;
  /** `available({langs:[idioma do mic], processLocally:true})`; `null` = sem a API ou sem resposta. */
  noAparelho: Disponibilidade | null;
  /** Consentimento ESPECÍFICO do reconhecimento do navegador (a opção "Rápido"). */
  consentiuNavegador: boolean;
  /** O "Rápido" pode existir para este perfil (`podeOferecerRapido`)? */
  rapidoPermitido: boolean;
  /** Perfil de IA ativo: `local-private` promete que nada sai do aparelho. */
  perfilId: string;
  /**
   * O reconhecimento do navegador apita a cada religada neste aparelho (Android, ver
   * `webSpeechBipaAoReligar`): o "no aparelho" deixa de valer por si só, e só o "Rápido" o chama.
   */
  bipaAoReligar?: boolean;
}

export interface DecisaoDoMotorDoMic {
  motor: MotorDoMicrofone;
  motivo: MotivoDoMotorDoMic;
  /** Pedir `install()` do pacote do idioma (só a partir de um clique). */
  instalarNoAparelho: boolean;
}

/** O perfil que promete "100% offline". */
export const PERFIL_PRIVADO = 'local-private';

/**
 * O BIPE DO ANDROID (relato do dono no celular, 2026-09-29). O Chrome do Android ignora o
 * `continuous`: encerra o reconhecimento a cada frase (ou em ~3 s de silêncio), o `onend` religa, e o
 * SISTEMA toca o som de "começou a ouvir"/"parou" a cada volta — um bipe a cada poucos segundos, que o
 * site não tem como calar (WICG/speech-api#99). Lá, o reconhecimento do navegador (na nuvem ou no
 * aparelho, que passa pelo mesmo serviço) só entra quando a pessoa escolheu o "Rápido"; o "Privado" é o
 * nosso modelo, que abre o microfone UMA vez e não apita.
 */
export function webSpeechBipaAoReligar(escopo: unknown = globalThis): boolean {
  const n = (escopo as { navigator?: { userAgent?: string; userAgentData?: { platform?: string } } })?.navigator;
  if (!n) return false;
  if (n.userAgentData?.platform) return n.userAgentData.platform === 'Android';
  return /Android/i.test(n.userAgent ?? '');
}

/** O "no aparelho" que conta: no Android ele apita igual à nuvem, então não decide sozinho. */
const noAparelhoQueConta = (e: EntradaDoMotorDoMic) => (e.bipaAoReligar ? null : e.noAparelho);

export function escolherMotorDoMic(entrada: EntradaDoMotorDoMic): DecisaoDoMotorDoMic {
  const e = { ...entrada, noAparelho: noAparelhoQueConta(entrada) };
  if (!e.webSpeechSuportado) return { motor: 'whisper', motivo: 'sem-web-speech', instalarNoAparelho: false };
  if (e.preferido === 'whisper') return { motor: 'whisper', motivo: 'escolha-whisper', instalarNoAparelho: false };
  if (e.noAparelho === 'available') return { motor: 'web-speech-local', motivo: 'no-aparelho', instalarNoAparelho: false };
  const instalarNoAparelho = e.noAparelho === 'downloadable';
  if (e.perfilId === PERFIL_PRIVADO) return { motor: 'whisper', motivo: 'perfil-privado', instalarNoAparelho };
  if (!e.rapidoPermitido) return { motor: 'whisper', motivo: 'perfil-protegido', instalarNoAparelho };
  if (e.consentiuNavegador) return { motor: 'web-speech-nuvem', motivo: 'nuvem-consentida', instalarNoAparelho };
  return { motor: 'whisper', motivo: 'sem-consentimento', instalarNoAparelho };
}

/**
 * O "Rápido" existe para quem? Para o adulto; para o perfil protegido, só com o responsável tendo
 * autorizado (vínculo aceito e conta não restrita) — a mesma régua da nuvem em `protecaoDoMenor.ts`.
 */
export function podeOferecerRapido(e: { protegido: boolean; responsavelAutorizou: boolean }): boolean {
  return !e.protegido || e.responsavelAutorizou;
}

/** O que está guardado: consentiu → "Rápido"; já respondeu sem consentir → "Privado"; nunca → null. */
export function escolhaGuardada(e: { consentiuNavegador: boolean; jaEscolheu: boolean }): EscolhaDoMic | null {
  if (e.consentiuNavegador) return 'rapido';
  return e.jaEscolheu ? 'privado' : null;
}

/**
 * Perguntar "Rápido ou Privado?" AGORA? Só quando a resposta muda alguma coisa: há Web Speech, o
 * seletor está no navegador, o navegador NÃO reconhece no aparelho (com (a) nada sai e nada baixa),
 * o "Rápido" existe para este perfil, e a pessoa ainda não respondeu.
 */
export function precisaPerguntarMotorDoMic(e: EntradaDoMotorDoMic & { escolha: EscolhaDoMic | null }): boolean {
  if (!e.webSpeechSuportado || e.preferido !== 'browser') return false;
  if (noAparelhoQueConta(e) === 'available') return false;
  if (e.perfilId === PERFIL_PRIVADO || !e.rapidoPermitido) return false;
  return e.escolha === null;
}

/**
 * O que a sonda guardada sabe do idioma do mic (ela mede só pt-BR e en). Serve à ROTA do STT, que
 * precisa saber antes de o mic abrir se o Whisper vai decodificar a sua voz (Moonshine é só inglês).
 */
export function disponibilidadeDaSondaParaIdioma(
  lang: string,
  stt: { ptBR: Disponibilidade | null; en: Disponibilidade | null } | undefined,
): Disponibilidade | null {
  const base = lang.toLowerCase().split('-')[0];
  if (!stt) return null;
  if (base === 'pt') return stt.ptBR;
  if (base === 'en') return stt.en;
  return null;
}

type ComInstalar = { install?: (o: { langs: string[]; processLocally: boolean }) => unknown };

/** O que a tela mostra do pacote de voz do navegador (sem porcentagem: `install()` não informa). */
export type EstadoDaInstalacaoDoMic = 'baixando' | 'pronto' | 'falhou';

/**
 * PRAZO DA INSTALAÇÃO ESPERADA. O mic fica fechado enquanto o pacote baixa (a barra diz o que está
 * acontecendo); um `install()` que nunca responde não pode prender a captura — passado o prazo, o
 * Whisper assume (e o pacote, se terminar depois, serve à próxima sessão).
 */
export const PRAZO_DA_INSTALACAO_MS = 180_000;

/**
 * A decisão com a pergunta ao navegador AO VIVO (a sonda guardada pode ter até 30 dias; o pacote pode
 * ter sido instalado ontem). Chamada do clique — por isso pode pedir o `install()`. Nunca lança.
 *
 * `perguntar`: a tela mostra "Rápido ou Privado?" e devolve a resposta (quem a GUARDA é a tela);
 * `null` = fechou sem escolher → "Privado" nesta vez, e a pergunta volta na próxima. O clique numa
 * das opções é ativação do usuário nova, então o `install()` depois dela continua valendo. Recebe
 * `pacoteDoNavegador`: o "Privado" será o reconhecimento do próprio navegador (a instalar), e não o
 * nosso modelo — a tela o recomenda.
 *
 * `aoInstalar`: o progresso da instalação ESPERADA ('baixando' → 'pronto' | 'falhou'), para a barra
 * de preparo da captura. A instalação sem espera (com o "Rápido") não fala: ninguém espera por ela.
 */
export async function resolverMotorDoMic(
  e: Omit<EntradaDoMotorDoMic, 'noAparelho'> & {
    lang: string;
    escopo?: unknown;
    escolha?: EscolhaDoMic | null;
    perguntar?: (contexto: { pacoteDoNavegador: boolean }) => Promise<EscolhaDoMic | null>;
    aoInstalar?: (estado: EstadoDaInstalacaoDoMic) => void;
    prazoDaInstalacaoMs?: number;
  },
): Promise<DecisaoDoMotorDoMic> {
  const escopo = e.escopo ?? globalThis;
  const bipaAoReligar = e.bipaAoReligar ?? webSpeechBipaAoReligar(escopo);
  let noAparelho: Disponibilidade | null = null;
  if (e.webSpeechSuportado && e.preferido === 'browser' && !bipaAoReligar) {
    try {
      const { disponibilidadeDoSttNoAparelho } = await import('../dispositivo/sonda');
      noAparelho = await disponibilidadeDoSttNoAparelho(e.lang, escopo);
    } catch {
      noAparelho = null; // sem sonda: segue pelo consentimento
    }
  }
  const s = escopo as { SpeechRecognition?: ComInstalar; webkitSpeechRecognition?: ComInstalar };
  const SR = s.SpeechRecognition ?? s.webkitSpeechRecognition;
  const podeInstalar = typeof SR?.install === 'function';
  let consentiuNavegador = e.consentiuNavegador;
  if (e.perguntar && e.escolha !== undefined && precisaPerguntarMotorDoMic({ ...e, bipaAoReligar, noAparelho, escolha: e.escolha })) {
    const resposta = await e
      .perguntar({ pacoteDoNavegador: noAparelho === 'downloadable' && podeInstalar })
      .catch(() => null);
    consentiuNavegador = resposta === 'rapido';
  }
  const decisao = escolherMotorDoMic({ ...e, bipaAoReligar, consentiuNavegador, noAparelho });
  if (!decisao.instalarNoAparelho || !podeInstalar) return decisao;
  /* `install` que lança síncrono vira rejeição aqui; sem ativação, sem rede, idioma recusado: a
     próxima sessão pergunta de novo. Só `true` conta como instalado. */
  const instalacao = Promise.resolve()
    .then(() => SR!.install!({ langs: [e.lang], processLocally: true }))
    .then(
      (r) => r === true,
      () => false,
    );
  if (decisao.motor !== 'whisper') {
    void instalacao; // "Rápido": a nuvem atende agora; o pacote serve à próxima sessão
    return decisao;
  }
  e.aoInstalar?.('baixando');
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<false>((resolver) => {
    relogio = setTimeout(() => resolver(false), e.prazoDaInstalacaoMs ?? PRAZO_DA_INSTALACAO_MS);
  });
  const instalou = await Promise.race([instalacao, prazo]);
  clearTimeout(relogio);
  e.aoInstalar?.(instalou ? 'pronto' : 'falhou');
  return instalou ? { motor: 'web-speech-local', motivo: 'instalado-no-aparelho', instalarNoAparelho: true } : decisao;
}
