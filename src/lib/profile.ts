/**
 * PERFIL DE EXIBIÇÃO — a única fonte da linguagem e da densidade por público.
 *
 * O PROBLEMA QUE ESTE ARQUIVO RESOLVE
 * ────────────────────────────────────
 * Antes, cada texto que variava por perfil era um ternário escrito à mão no lugar onde aparecia:
 *
 *     {ageProfile === 'kids' ? 'Biblioteca de Vídeos' : ageProfile === 'senior' ? … : 'Biblioteca'}
 *
 * Espalhados por seis telas. Três consequências mediram-se na prática: (1) mudar um termo exigia
 * caçar todas as ocorrências; (2) telas novas nasciam sem nenhuma adaptação — Study, Reading e os
 * nove exercícios, ~9.500 linhas, tinham ZERO ocorrências de `ageProfile`; (3) as versões
 * envelheciam separadas — foi assim que emojis sobreviveram em duas telas e não nas outras.
 *
 * Aqui o termo é declarado uma vez, nas três redações, e quem precisa lê. Nenhum recurso muda de
 * comportamento por causa desta camada: ela troca PALAVRAS e decide QUANTO aparece de uma vez.
 *
 * NÃO é i18n. É registro de linguagem dentro do mesmo idioma. Se um dia o app for traduzido, o
 * eixo do idioma entra por fora deste (chave → idioma → perfil), sem reescrever os consumidores.
 */

import { EDICAO_LEVE } from './edicao';
export type AgeProfileType = 'kids' | 'pro' | 'senior';

export function isAgeProfile(v: unknown): v is AgeProfileType {
  return v === 'kids' || v === 'pro' || v === 'senior';
}

const AGE_PROFILE_KEY = 'babel.age_profile';

/**
 * Lê o perfil direto do espelho local. É um ESCAPE, não o caminho normal — quem pode receber por
 * prop deve receber por prop, porque prop re-renderiza e isto não.
 *
 * Existe para componentes enterrados que não têm o perfil na mão e cujo custo de fiação não se
 * paga: o bloco "Como funciona" vive dentro dos nove exercícios, e passar a prop por todos eles
 * seria muito toque para uma leitura feita uma vez, na montagem. Trocar de perfil com um exercício
 * aberto não reflete ali até reabrir — limite aceito conscientemente.
 */
export function readAgeProfile(): AgeProfileType {
  // Edição leve: o padrão é o perfil SÊNIOR (linguagem simples, passos numerados) — decisão do
  // dono (2026-08-27): a primeira visita deve ser a mais guiada; quem quiser troca em Aparência.
  return readStoredEnum(AGE_PROFILE_KEY, ['kids', 'pro', 'senior'], EDICAO_LEVE ? 'senior' : 'pro');
}

/**
 * A mesma leitura defensiva para qualquer preferência de valor fechado guardada localmente.
 *
 * Duas armadilhas que um `localStorage.getItem(k) as T || padrão` não cobre:
 *  - valor inválido guardado é truthy, então o `||` não pega — e toda tabela `Record<T, string>`
 *    passa a devolver `undefined` (a UI renderiza vazio onde deveria haver rótulo);
 *  - `getItem` LANÇA com storage bloqueado (aba privada, iframe com sandbox). Dentro do
 *    inicializador de um `useState`, isso impede a montagem do componente.
 */
export function readStoredEnum<T extends string>(key: string, valid: readonly T[], fallback: T): T {
  const v = readStoredValue(key);
  return valid.includes(v as T) ? (v as T) : fallback;
}

/** `localStorage.getItem` sem a exceção do storage bloqueado — ausente e inacessível são o mesmo. */
export function readStoredValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

type Variants = Record<AgeProfileType, string>;

/**
 * Regras de redação, para as próximas entradas seguirem o mesmo padrão:
 *
 *   kids   — concreto e do mundo dele (Roblox, Discord, jogo, carta, desafio). Sem diminutivo,
 *            sem tom de pré-escola: essa faixa rejeita interface infantilizada.
 *   pro    — o termo TÉCNICO de verdade (SRS, CEFR, WPM). Quem escolheu este perfil quer precisão
 *            e densidade; simplificar aqui é que seria condescendente.
 *   senior — português direto, sem sigla, verbo no início quando for ação. Frase curta.
 */
export const COPY = {
  // ── Exercícios (Study) ───────────────────────────────────────────────────
  'ex.review': {
    kids: 'Treino de memória',
    pro: 'Revisão espaçada (SRS)',
    senior: 'Repetir o que você salvou'
  },
  'ex.review.hint.due': {
    kids: '{n} cartas esperando você',
    pro: '{n} vencidos agora',
    senior: '{n} palavras para repetir hoje'
  },
  'ex.review.hint.deck': {
    kids: '{n} cartas no seu baralho',
    pro: '{n} cartões no deck',
    senior: '{n} palavras guardadas'
  },
  'ex.active_production': {
    kids: 'Escrever de cabeça',
    pro: 'Produção ativa',
    senior: 'Escrever sem olhar a resposta'
  },
  'ex.active_production.hint': {
    kids: '{n} cartas prontas para o desafio',
    pro: '{n} cartões maduros o bastante',
    senior: '{n} palavras já bem firmes'
  },
  'ex.shadowing': {
    kids: 'Desafio de pronúncia',
    pro: 'Shadowing (pronúncia)',
    senior: 'Repetir em voz alta'
  },
  'ex.shadowing.hint': {
    kids: '{n} falas para imitar',
    pro: '{n} frases desta sessão',
    senior: '{n} frases para praticar'
  },
  'ex.rewrite': {
    kids: 'Reescrever do seu jeito',
    pro: 'Reescrever um trecho',
    senior: 'Escrever a frase com outras palavras'
  },
  'ex.rewrite.hint': {
    kids: 'mude a frase e veja se ficou boa',
    pro: 'reformular e comparar com feedback',
    senior: 'você reescreve e recebe uma correção'
  },
  'ex.caption_sync': {
    kids: 'Casar a legenda com o som',
    pro: 'Sincronizar legenda',
    senior: 'Ligar a frase ao trecho do áudio'
  },
  'ex.caption_sync.hint': {
    kids: 'ouça e ache o trecho certo',
    pro: 'ouvir o trecho real e casar a legenda',
    senior: 'ouça e escolha a frase correspondente'
  },
  'ex.waveform': {
    kids: 'Escrever o que ouviu',
    pro: 'Ditado com waveform',
    senior: 'Escutar e escrever'
  },
  'ex.waveform.hint': {
    kids: 'ouça o áudio e digite a fala',
    pro: 'ouvir o áudio real e transcrever',
    senior: 'ouça o trecho e escreva o que entendeu'
  },
  'ex.context_mining': {
    kids: 'Caça às palavras de ligação',
    pro: 'Mineração de conectores',
    senior: 'Encontrar as palavras que ligam ideias'
  },
  'ex.context_mining.hint': {
    kids: 'ache as palavrinhas que ligam as frases',
    pro: 'achar os conectores na sua própria transcrição',
    senior: 'marque as palavras que ligam uma ideia à outra'
  },
  'ex.vocab_drill': {
    kids: 'Trocar por uma palavra melhor',
    pro: 'Drill de vocabulário',
    senior: 'Escolher a palavra mais precisa'
  },
  'ex.vocab_drill.hint': {
    kids: 'troque o simples pelo mais legal',
    pro: 'trocar o básico pelo preciso',
    senior: 'substitua a palavra comum pela mais exata'
  },
  'ex.ed_drill': {
    kids: 'Som do "-ed" no fim',
    pro: 'Drill de pronúncia "-ed"',
    senior: 'Pronúncia do "-ed" em inglês'
  },
  'ex.ed_drill.hint': {
    kids: 'três sons diferentes, acerte qual é',
    pro: 'terminais /t/ /d/ /ɪd/, conteúdo em inglês',
    senior: 'três formas de falar o fim do verbo, em inglês'
  },
  'ex.scenario_interview': {
    kids: 'Conversa: entrevista',
    pro: 'Cenário: entrevista de emprego',
    senior: 'Conversa: entrevista de emprego'
  },
  'ex.scenario_meeting': {
    kids: 'Conversa: reunião',
    pro: 'Cenário: reunião de alinhamento',
    senior: 'Conversa: reunião de trabalho'
  },
  'ex.scenario_restaurant': {
    kids: 'Conversa: restaurante',
    pro: 'Cenário: restaurante',
    senior: 'Conversa: pedir no restaurante'
  },
  'ex.scenario.hint': {
    kids: 'converse e receba dicas',
    pro: 'conversa com feedback',
    senior: 'você conversa e recebe correções'
  },

  // ── Motivos de bloqueio ──────────────────────────────────────────────────
  'block.emptyDeck': {
    kids: 'Seu baralho está vazio, capture palavras primeiro.',
    pro: 'Seu deck está vazio, adicione palavras primeiro.',
    senior: 'Você ainda não guardou palavras. Grave algo primeiro.'
  },
  'block.notMature': {
    kids: 'Treine mais um pouco para liberar este desafio.',
    pro: 'Nenhum cartão atingiu a estabilidade mínima ({n}d). Revise mais.',
    senior: 'Repita mais algumas vezes para liberar este exercício.'
  },
  'block.noTranscript': {
    kids: 'Precisa de uma gravação com legenda.',
    pro: 'Precisa de uma sessão com transcrição.',
    senior: 'É preciso ter uma gravação com o texto já pronto.'
  },
  'block.noAudio': {
    kids: 'Esta sessão não tem som gravado.',
    pro: 'Esta sessão não tem áudio gravado.',
    senior: 'Esta gravação não tem áudio salvo.'
  },
  'block.noTimestamps': {
    kids: 'A legenda não tem as marcas de tempo.',
    pro: 'A transcrição não tem marcações de tempo.',
    senior: 'Não sabemos em que minuto cada frase acontece.'
  },

  // ── "Agora" — a ação primária do centro de exercícios ────────────────────
  'now.due.title': {
    kids: '{n} cartas esperando você',
    pro: '{n} cartões vencidos',
    senior: '{n} palavras para repetir'
  },
  'now.due.sub': {
    kids: 'Treine agora para manter a sua ofensiva viva.',
    pro: 'Revisão espaçada ({sched}), o agendamento vem do servidor.',
    senior: 'São as palavras que você está prestes a esquecer.'
  },
  'now.due.cta': {
    kids: 'Treinar agora',
    pro: 'Revisar agora',
    senior: 'Começar a repetir'
  },
  'now.clear.title': {
    kids: 'Tudo em dia!',
    pro: 'Nada vencido por hoje',
    senior: 'Nada para repetir hoje'
  },
  'now.clear.sub': {
    kids: 'Aproveite para treinar a pronúncia nas {n} falas desta gravação.',
    pro: 'Aproveite para praticar pronúncia nas {n} frases desta sessão.',
    senior: 'Se quiser, pratique a pronúncia nas {n} frases desta aula.'
  },
  'now.clear.cta': {
    kids: 'Treinar pronúncia',
    pro: 'Praticar shadowing',
    senior: 'Praticar em voz alta'
  },
  'now.empty.sub': {
    kids: 'Grave alguma coisa para destravar os desafios de fala.',
    pro: 'Capture uma sessão para destravar os exercícios de fala.',
    senior: 'Grave um áudio para liberar os exercícios de fala.'
  },

  // ── Métricas ─────────────────────────────────────────────────────────────
  'metric.deckSize': {
    kids: 'Palavras colecionadas',
    pro: 'Volume lexical ativo',
    senior: 'Palavras guardadas'
  },
  'metric.retention': {
    kids: 'Quanto você lembra',
    pro: 'Taxa de retenção média',
    senior: 'O que ficou na memória'
  },
  'metric.reviews': {
    kids: 'Treinos feitos',
    pro: 'Revisões feitas',
    senior: 'Repetições feitas'
  },
  'metric.level': {
    kids: 'Nível das suas palavras',
    pro: 'Nível predominante',
    senior: 'Grau de dificuldade'
  },
  'metric.cefr': {
    kids: 'Faixa de dificuldade',
    pro: 'Nível CEFR',
    senior: 'Nível de leitura'
  },
  'metric.wpm': {
    kids: 'Velocidade da fala',
    pro: 'Ritmo (WPM)',
    senior: 'Palavras por minuto'
  },
  'metric.evolution': {
    kids: 'Sua coleção crescendo',
    pro: 'Evolução do vocabulário',
    senior: 'Quantas palavras por semana'
  },

  // ── Abas de Vocabulário (Metrics) ────────────────────────────────────────
  'metricsTab.dashboard': {
    kids: 'Visão geral',
    pro: 'Visão geral',
    senior: 'Resumo'
  },
  'metricsTab.lexical': {
    kids: 'Suas palavras a fundo',
    pro: 'Inteligência lexical',
    senior: 'Detalhes das palavras'
  },
  'metricsTab.fluency': {
    kids: 'Sua fala',
    pro: 'Desempenho & fluência',
    senior: 'Como você fala'
  },

  // ── Sub-abas da Sessão (Analysis) ────────────────────────────────────────
  'sessionTab.transcript': {
    kids: 'Legenda e palavras',
    pro: 'Transcrição & Vocabulário',
    senior: 'Texto e palavras'
  },
  'sessionTab.transcript.doc': {
    kids: 'Texto e palavras',
    pro: 'Texto & Vocabulário',
    senior: 'Texto e palavras'
  },
  'sessionTab.reading': {
    kids: 'Ler com calma',
    pro: 'Leitura & Notas',
    senior: 'Leitura e anotações'
  },
  // A aba abre o LOBBY DE JOGOS filtrado pela sessão — não mais a lista de exercícios. O rótulo
  // antigo ("Central de Exercícios (SRS)") descrevia o modo de revisão, que hoje é o segundo modo
  // da aba e só é alcançado por "Revisar agora"; anunciar SRS na aba mandaria a pessoa ao lugar
  // errado logo de cara.
  'sessionTab.practice': {
    kids: 'Jogos',
    pro: 'Jogos',
    senior: 'Jogos'
  },
  'sessionTab.overview': {
    kids: 'Seus números',
    pro: 'Visão Geral & Métricas',
    senior: 'Resumo desta aula'
  },

  // ── Revelação progressiva ────────────────────────────────────────────────
  'reveal.more': {
    kids: 'Ver tudo ({n})',
    pro: 'Ver tudo ({n})',
    senior: 'Mostrar todas as opções ({n})'
  },
  'reveal.less': {
    kids: 'Mostrar menos',
    pro: 'Mostrar menos',
    senior: 'Mostrar só o principal'
  }
} as const satisfies Record<string, Variants>;

export type CopyKey = keyof typeof COPY;

/**
 * Traduz uma chave para o perfil em vigor. `vars` substitui `{nome}` no texto — é o que permite
 * "{n} cartas esperando você" e "{n} vencidos agora" serem a MESMA chave com contagens reais.
 */
export function t(key: CopyKey, profile: AgeProfileType, vars?: Record<string, string | number>): string {
  const entry = COPY[key] as Variants;
  let out: string = entry[profile] ?? entry.pro;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}

/**
 * REVELAÇÃO PROGRESSIVA — quanto aparece de uma vez.
 *
 * `true` = a tela abre só com o essencial, e o resto fica atrás de um "Ver tudo" SEMPRE VISÍVEL.
 * Nada é removido, desabilitado ou bloqueado: só deixa de competir por atenção na primeira olhada.
 * O perfil `pro` escolheu densidade — nele tudo nasce aberto.
 */
export function coreOnly(profile: AgeProfileType): boolean {
  return profile !== 'pro';
}

/** Atalhos de teclado e paletas de comando são porta de entrada de quem já domina a ferramenta. */
export function showsPowerUserAffordances(profile: AgeProfileType): boolean {
  return profile === 'pro';
}

/**
 * Registro de linguagem para o tutor de IA. Injetado no `systemInstruction` (ver ichatContext.ts) —
 * sem isto o iChat responde a uma criança de 9 anos no mesmo tom que a um executivo.
 */
export const TUTOR_REGISTER: Record<AgeProfileType, string> = {
  kids:
    'O usuário é uma criança ou adolescente (7 a 15 anos) que joga Roblox/Minecraft. Fale de forma ' +
    'direta e animada, com frases curtas e exemplos do mundo dele (jogos, vídeos, amigos). Não use ' +
    'siglas técnicas (SRS, CEFR, FSRS, WPM) nem tom de professor formal, e também não infantilize: ' +
    'ele quer ser tratado como alguém capaz. Máximo de 3 frases por resposta.',
  pro:
    'O usuário é um adulto usando a ferramenta para trabalho ou estudo sério. Pode usar os termos ' +
    'técnicos do app (SRS, CEFR, WPM, FSRS) sem explicar. Seja denso e direto, sem rodeios.',
  senior:
    'O usuário prefere leitura tranquila e linguagem simples. Use português direto, sem nenhuma ' +
    'sigla nem termo em inglês sem tradução. Uma ideia por frase, frases curtas, e sempre diga o ' +
    'próximo passo concreto. Máximo de 4 frases por resposta.'
};
