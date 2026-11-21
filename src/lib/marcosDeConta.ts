import { estadoDoTeto, TETO_ANONIMO, TETO_DA_EDICAO_ESTATICA } from '@core';

import type { FaixaDeclarada } from '../core/acessoSemConta';
import { edicaoEstatica } from './edicaoEstatica';

/**
 * OS AVISOS POR MARCO DE USO — a peça que não existia (mudança porta-de-entrada).
 *
 * O QUE HAVIA ATÉ 01/09: o convite aparecia UMA VEZ por visita (`sessionStorage
 * 'babel.convite_visto'`) e só era disparado por sete padrões de ação que pediam rede — importar,
 * usar IA de nuvem, mexer em credenciais. Depois disso, silêncio. Quem gravou dez sessões e fichou
 * cem palavras sem conta nunca ouviu que ia perder tudo ao trocar de navegador.
 *
 * A REGRA NOVA é a do padrão de 2026, e é a mesma que o Figma usa: pedir a conta **no momento em
 * que a pessoa tem algo a perder**, não na porta. Cada marco dispara UMA vez, é dispensável, e
 * nunca bloqueia o que está acontecendo — quem dispensou já respondeu, e repetir é implicar.
 *
 * Por que a memória é `localStorage` e não `sessionStorage`: um aviso que volta a cada aba nova é
 * a mesma conversa de novo. O que a pessoa dispensou, ficou dispensado.
 */

export type MarcoDeConta = 'primeira-sessao' | 'segunda-sessao' | 'caderno-quase-cheio' | 'acervo-quase-cheio';

const CHAVE = 'babel.marcos_vistos';

function vistos(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHAVE) || '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function marcarVisto(m: MarcoDeConta): void {
  try {
    const s = vistos();
    s.add(m);
    localStorage.setItem(CHAVE, JSON.stringify([...s]));
  } catch {
    /* sem storage: o aviso volta, e é melhor do que sumir */
  }
}

export function jaViu(m: MarcoDeConta): boolean {
  return vistos().has(m);
}

export interface AvisoDeConta {
  marco: MarcoDeConta;
  titulo: string;
  texto: string;
}

const TEXTO_COM_CONTA: Record<MarcoDeConta, AvisoDeConta> = {
  /* Só com o acesso sem conta v2 ligado: o fim da 1ª sessão, antes de a porta pedir a conta. */
  'primeira-sessao': {
    marco: 'primeira-sessao',
    titulo: 'Guarde o que você capturou',
    texto:
      'Sua sessão está só neste navegador. Com uma conta, ela fica guardada e vai com você para qualquer aparelho.',
  },
  'segunda-sessao': {
    marco: 'segunda-sessao',
    titulo: 'Suas gravações estão só neste navegador',
    texto:
      'Limpar o navegador ou trocar de aparelho leva tudo junto. Criar uma conta guarda o que você já fez — e o que está aqui sobe junto.',
  },
  'caderno-quase-cheio': {
    marco: 'caderno-quase-cheio',
    titulo: `Seu caderno está chegando no limite de ${TETO_ANONIMO.palavras} palavras`,
    texto: 'Sem conta, o caderno para aí. Com conta ele deixa de ter teto, e o que você já fichou sobe junto.',
  },
  'acervo-quase-cheio': {
    marco: 'acervo-quase-cheio',
    titulo: `Você está chegando no limite de ${TETO_ANONIMO.sessoes} gravações`,
    texto: 'Sem conta, a próxima não cabe. Com conta não há teto, e estas aqui sobem junto.',
  },
};

/**
 * OS MESMOS MARCOS NA EDIÇÃO ESTÁTICA (o site sem servidor): o aviso continua valendo — o teto e o
 * "só neste navegador" são os mesmos —, mas não há conta a criar. Dizer "crie uma conta" ali seria
 * mandar a pessoa para uma porta que não existe; o texto diz o que é, uma demonstração.
 */
const TEXTO_DA_EDICAO_ESTATICA: Record<MarcoDeConta, AvisoDeConta> = {
  /* Não acontece (a regra do acesso sem conta v2 não vale na estática); está aqui para o tipo. */
  'primeira-sessao': {
    marco: 'primeira-sessao',
    titulo: 'Suas gravações estão só neste navegador',
    texto: 'Esta é a edição de demonstração: limpar o navegador ou trocar de aparelho leva tudo junto.',
  },
  'segunda-sessao': {
    marco: 'segunda-sessao',
    titulo: 'Suas gravações estão só neste navegador',
    texto: 'Esta é a edição de demonstração: limpar o navegador ou trocar de aparelho leva tudo junto.',
  },
  'caderno-quase-cheio': {
    marco: 'caderno-quase-cheio',
    titulo: `Seu caderno está chegando no limite de ${TETO_ANONIMO.palavras} palavras`,
    texto: 'Esta é a edição de demonstração, e o caderno para aí. A versão completa do Frasy não tem esse limite.',
  },
  'acervo-quase-cheio': {
    marco: 'acervo-quase-cheio',
    titulo: `Você está chegando no limite de ${TETO_DA_EDICAO_ESTATICA.sessoes} gravações`,
    texto:
      'Esta é a edição de demonstração, e a próxima gravação não cabe. A versão completa do Frasy não tem esse limite.',
  },
};

/**
 * O QUE AVISAR AGORA — função pura, testável, sem tela.
 *
 * Devolve no máximo um aviso: dois de uma vez viram ruído, e o primeiro da lista é sempre o mais
 * concreto (o teto que está perto vale mais do que o lembrete genérico de guardar).
 */
/**
 * O CONVITE NEUTRO para quem se declarou menor de 18 (acesso sem conta v2): o mesmo marco, a mesma
 * memória de "já vi", sem a pressão de "vai perder tudo". Sem urgência, sem culpa (`copy-br-etica`).
 */
const TEXTO_DO_MENOR = 'Com um responsável, você pode criar uma conta e guardar o que fez aqui.';

export function avisoPendente(estado: {
  sessoes: number;
  palavras: number;
  semConta: boolean;
  /** A flag `acesso_restrito_sem_conta` ligada para esta pessoa. Ausente = o comportamento de antes. */
  acessoRestrito?: boolean;
  /** A faixa declarada na porta (`faixaSemConta`); só conta com `acessoRestrito`. */
  faixa?: FaixaDeclarada;
}): AvisoDeConta | null {
  const aviso = avisoDoMarco(estado);
  if (aviso && estado.acessoRestrito && estado.faixa === 'menor' && !edicaoEstatica()) {
    return { ...aviso, texto: TEXTO_DO_MENOR };
  }
  return aviso;
}

function avisoDoMarco(estado: {
  sessoes: number;
  palavras: number;
  semConta: boolean;
  acessoRestrito?: boolean;
  faixa?: FaixaDeclarada;
}): AvisoDeConta | null {
  if (!estado.semConta) return null;
  const estatica = edicaoEstatica();
  const TEXTO = estatica ? TEXTO_DA_EDICAO_ESTATICA : TEXTO_COM_CONTA;

  // O teto é o da EDIÇÃO (20 na estática, 5 na completa): avisar "perto" em 4 de 20 seria cedo demais.
  const acervo = estadoDoTeto('sessoes', estado.sessoes, { edicaoEstatica: estatica });
  if (acervo.perto && !jaViu('acervo-quase-cheio')) return TEXTO['acervo-quase-cheio'];

  const caderno = estadoDoTeto('palavras', estado.palavras, { edicaoEstatica: estatica });
  if (caderno.perto && !jaViu('caderno-quase-cheio')) return TEXTO['caderno-quase-cheio'];

  /* Acesso sem conta v2: o fim da 1ª sessão convida a guardar (a próxima visita já abre a porta). O menor
     não passa por aqui: segue local, e só ouve os marcos de sempre, no tom neutro. */
  if (estado.acessoRestrito && !estatica && estado.faixa !== 'menor' && estado.sessoes >= 1) {
    return jaViu('primeira-sessao') ? null : TEXTO['primeira-sessao'];
  }

  // O mais genérico por último: só fala quando não há nada mais concreto para dizer.
  if (estado.sessoes >= 2 && !jaViu('segunda-sessao')) return TEXTO['segunda-sessao'];

  return null;
}
