/**
 * O CATÁLOGO DE VOZES DE UM IDIOMA, pronto para o seletor (`components/voz/SeletorDeVoz.tsx`) e para
 * quem só precisa dizer o nome da voz em uso (o botão que abre o seletor).
 *
 * A ordem: "Automática" sempre primeiro (é o comportamento de quem nunca escolheu); a voz natural da
 * nuvem, só com a capacidade do plano; depois as vozes do aparelho para o idioma, na ordem de
 * `voicesFor()` (as naturais antes, as que rodam no aparelho antes das de rede).
 *
 * O que o navegador NÃO informa não é inventado: a Web Speech só dá nome, idioma e `localService`.
 * "Natural" é a heurística de nome de `isNeuralVoice` (a mesma que escolhe a automática).
 */
import { idiomaDaInterface, t } from '../i18n';
import { type VoiceInfo, voicesFor } from '../tts';
import { VOZ_AUTOMATICA, VOZ_DA_NUVEM, vozDaNuvemDisponivel, vozEmUso } from './preferenciaDeVoz';

export interface OpcaoDeVoz {
  /** O que vai para a preferência: `''` (automática), `@nuvem`, ou o nome exato da voz do aparelho. */
  id: string;
  tipo: 'automatica' | 'nuvem' | 'aparelho';
  nome: string;
  /** A variante (o país do sotaque) ou a frase que diz o que a opção é. */
  detalhe: string;
  /** Etiquetas curtas: "Natural", "No aparelho", "Pela internet", "Nuvem". */
  etiquetas: string[];
}

/**
 * O nome de uma voz sem o que é do fabricante e do sistema:
 * "Microsoft Aria Online (Natural) - English (United States)" → "Aria"; "Luciana (Enhanced)" → "Luciana".
 * "Google US English" fica como está (tirar "Google" deixaria só o nome do idioma).
 */
export function nomeLegivelDaVoz(nome: string): string {
  const limpo = nome
    .replace(/^Microsoft\s+/i, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+Online\b/i, '')
    .replace(/\s*\((Natural|Neural|Enhanced|Premium|Aprimorada|Melhorada)\)/gi, '')
    .trim();
  return limpo || nome;
}

/** O país do sotaque, no idioma da interface: `en-GB` → "Reino Unido". Sem região, o próprio código. */
export function varianteDaVoz(lang: string): string {
  const [, ...resto] = lang.replace('_', '-').split('-');
  const regiao = resto.find((p) => /^([A-Za-z]{2}|\d{3})$/.test(p));
  if (!regiao) return lang;
  try {
    return new Intl.DisplayNames([idiomaDaInterface()], { type: 'region' }).of(regiao.toUpperCase()) ?? lang;
  } catch {
    return lang;
  }
}

function opcaoDoAparelho(v: VoiceInfo): OpcaoDeVoz {
  const etiquetas: string[] = [];
  if (v.neural) etiquetas.push(t('Natural'));
  /* `localService` é o que o navegador informa; quando não informa, a etiqueta não aparece. */
  if (v.local === true) etiquetas.push(t('No aparelho'));
  else if (v.local === false) etiquetas.push(t('Pela internet'));
  return { id: v.name, tipo: 'aparelho', nome: nomeLegivelDaVoz(v.name), detalhe: varianteDaVoz(v.lang), etiquetas };
}

/** As opções de voz de um idioma (aceita `en` ou `en-US`). `nuvem`: o plano tem a voz natural ligada. */
export function opcoesDeVoz(idioma: string, nuvem: boolean = vozDaNuvemDisponivel()): OpcaoDeVoz[] {
  const opcoes: OpcaoDeVoz[] = [
    {
      id: VOZ_AUTOMATICA,
      tipo: 'automatica',
      nome: t('Automática'),
      detalhe: t('O app escolhe a melhor voz.'),
      etiquetas: [],
    },
  ];
  if (nuvem) {
    opcoes.push({
      id: VOZ_DA_NUVEM,
      tipo: 'nuvem',
      nome: t('Voz natural'),
      detalhe: t('Lê no intérprete e na conversa virtual. Nas outras telas, lê a voz do aparelho.'),
      etiquetas: [t('Nuvem')],
    });
  }
  return [...opcoes, ...voicesFor(idioma).map(opcaoDoAparelho)];
}

/** O nome da voz que VALE agora para o idioma, para o botão que abre o seletor. */
export function nomeDaVozEmUso(idioma: string, nuvem: boolean = vozDaNuvemDisponivel()): string {
  const id = vozEmUso(idioma, nuvem);
  if (id === VOZ_AUTOMATICA) return t('Automática');
  if (id === VOZ_DA_NUVEM) return t('Voz natural');
  return nomeLegivelDaVoz(id);
}

/* Uma frase curta em cada idioma, para ouvir a voz antes de escolher. É conteúdo NO idioma da voz, e
   não texto da interface: não passa pelo catálogo de tradução. */
const AMOSTRAS: Record<string, string> = {
  en: 'Hello! This is how I sound when I read to you.',
  pt: 'Olá! É assim que eu soo quando leio para você.',
  es: '¡Hola! Así sueno cuando leo para ti.',
  fr: 'Bonjour ! Voici ma voix quand je lis pour vous.',
  de: 'Hallo! So klinge ich, wenn ich dir vorlese.',
  it: 'Ciao! Questa è la mia voce quando leggo per te.',
  ja: 'こんにちは。これが私の読み上げる声です。',
  ko: '안녕하세요. 제가 읽어 드릴 때의 목소리입니다.',
  zh: '你好！这是我为你朗读时的声音。',
  ru: 'Здравствуйте! Так звучит мой голос, когда я читаю вам.',
  ar: 'مرحبا! هكذا يبدو صوتي عندما أقرأ لك.',
  hi: 'नमस्ते! जब मैं आपके लिए पढ़ता हूँ तो मेरी आवाज़ ऐसी होती है।',
  nl: 'Hallo! Zo klink ik als ik voor je voorlees.',
  sv: 'Hej! Så här låter jag när jag läser för dig.',
  pl: 'Cześć! Tak brzmi mój głos, kiedy ci czytam.',
  tr: 'Merhaba! Sana okurken sesim böyle çıkıyor.',
  sw: 'Habari! Hivi ndivyo ninavyosikika ninapokusomea.',
  id: 'Halo! Beginilah suara saya saat membaca untukmu.',
  uk: 'Вітаю! Так звучить мій голос, коли я читаю вам.',
  el: 'Γεια σας! Έτσι ακούγομαι όταν σας διαβάζω.',
  he: 'שלום! כך אני נשמע כשאני קורא לך.',
};

/**
 * A frase da amostra no idioma da voz. Idioma sem frase pronta: o nome do idioma, escrito nele mesmo
 * ("norsk", "Tiếng Việt") — curto, e a voz certa o pronuncia bem.
 */
export function fraseDeAmostra(idioma: string): string {
  const base = (idioma || '').toLowerCase().split(/[-_]/)[0];
  if (AMOSTRAS[base]) return AMOSTRAS[base];
  try {
    return new Intl.DisplayNames([base], { type: 'language' }).of(base) ?? base;
  } catch {
    return base;
  }
}

/** Um lado da conversa do intérprete: quem ouve aquela voz e em que idioma ela lê. */
export interface LadoDaVoz {
  /** "Para você", "Para a outra pessoa". */
  quem: string;
  /** O idioma que a voz LÊ (o da tradução que aquele lado ouve). */
  idioma: string;
}

/** Os dois lados de uma conversa: cada um ouve a tradução no próprio idioma, com a própria voz. */
export function ladosDaVoz(idiomas: { meu: string; outro: string }): LadoDaVoz[] {
  return [
    { quem: t('Para você'), idioma: idiomas.meu },
    { quem: t('Para a outra pessoa'), idioma: idiomas.outro },
  ];
}
