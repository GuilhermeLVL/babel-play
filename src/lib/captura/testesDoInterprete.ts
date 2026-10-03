/**
 * AS CHAVES DE TESTE DO INTÉRPRETE (Intérprete v3) — recursos novos que mexem no caminho da fala e que
 * ainda não foram medidos em conversa de verdade. Nascem LIGADAS (liberadas para o dono testar na tela);
 * quem quiser desliga no `/diagnostico` ("Testes do intérprete"). Valem só neste aparelho
 * (localStorage); sem armazenamento, ficam ligadas. Só o valor `nao` desliga.
 */
export interface ChaveDeTeste {
  id: string;
  titulo: string;
  descricao: string;
}

export const CHAVES_DE_TESTE: readonly ChaveDeTeste[] = [
  {
    id: 'fimInteligente',
    titulo: 'Fim de fala inteligente',
    descricao:
      'Fecha a fala assim que a frase acaba, em vez de esperar um silêncio fixo de 0,8 s, e espera mais quando a pessoa só parou para pensar.',
  },
  {
    id: 'parcialTraduzido',
    titulo: 'Tradução enquanto a pessoa fala',
    descricao: 'Mostra em cinza a tradução do trecho já dito, antes de a fala terminar. Não lê nada em voz alta.',
  },
  {
    id: 'vozPorFrase',
    titulo: 'Voz por frase',
    descricao: 'Começa a ler a primeira frase da tradução enquanto as outras ainda são preparadas (voz natural).',
  },
  {
    id: 'virtual',
    titulo: 'Conversa virtual',
    descricao: 'Mostra a opção de traduzir o áudio do computador (vídeo, Discord, jogo) além do microfone.',
  },
];

const nomeDaChave = (id: string) => `babel.interprete.${id}`;
const EVENTO = 'babel-chave-interprete';

/** A chave está ligada neste aparelho? */
export function chaveLigada(id: string): boolean {
  try {
    return localStorage.getItem(nomeDaChave(id)) !== 'nao';
  } catch {
    return true;
  }
}

/** Liga ou desliga a chave e avisa quem escuta (a tela e o motor leem o valor novo na hora). */
export function gravarChave(id: string, ligada: boolean): void {
  try {
    localStorage.setItem(nomeDaChave(id), ligada ? 'sim' : 'nao');
  } catch {
    /* sem armazenamento: a chave vale só até recarregar */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO, { detail: { id, ligada } }));
}

/** Quem quer saber quando uma chave muda. Devolve o cancelamento. */
export function aoMudarChave(cb: (id: string, ligada: boolean) => void): () => void {
  const ouvinte = (e: Event) => {
    const d = (e as CustomEvent<{ id: string; ligada: boolean }>).detail;
    cb(d.id, d.ligada);
  };
  window.addEventListener(EVENTO, ouvinte);
  return () => window.removeEventListener(EVENTO, ouvinte);
}
