/**
 * ONDE A ESCOLHA DE CONTEÚDO MORA — uma só, para o app inteiro (`seletor.js:8-10`): escolheu "Reunião
 * de produto" na Biblioteca, os Cartões e o Jogar abrem com ela. Persiste de um dia para o outro.
 *
 * GUARDADA EM DOIS LUGARES, pelo mesmo caminho das outras configurações da pessoa:
 *   · na CONTA: o campo `conteudo` do blob `settings.ui` (`data/rotas/settings.ts`, sem tabela nova).
 *     Na edição sem servidor a mesma rota grava no aparelho (`efemero/rotas/settings.ts`);
 *   · no APARELHO (`localStorage`), como espelho: a ficha pinta certa no primeiro quadro, antes de a
 *     conta responder, e a escolha sobrevive a recarregar sem rede.
 * Ao abrir, a conta manda (a escolha acompanha a pessoa entre aparelhos), a não ser que ela já tenha
 * escolhido nesta página antes de a conta responder.
 *
 * Quem escuta é avisado na hora (`assinarConteudo`), nesta aba e nas outras (`storage`).
 */
import { useEffect, useSyncExternalStore } from 'react';

import type { ContagensDeConteudo } from '../../core/learning/contagensDeConteudo';
import { fetchSettings, patchUiSettings } from '../../data/rotas/settings';
import { baseDoIdioma, indiceDaTrilha } from '../../data/trilha/indice';
import {
  type Conteudo,
  CONTEUDO_PADRAO,
  escolher,
  type FonteDeConteudo,
  lerConteudo,
  mesmoConteudo,
  mudarIdioma,
  sanear,
  voltarParaTudo,
} from './estado';

const CHAVE = 'babel.conteudo';
/** A gravação na conta espera a pessoa parar de trocar: são duas idas à rede (ler e mesclar o `ui`). */
const ESPERA_DA_CONTA_MS = 700;

function lerDoAparelho(): Conteudo {
  try {
    const texto = localStorage.getItem(CHAVE);
    return texto ? lerConteudo(JSON.parse(texto)) : CONTEUDO_PADRAO;
  } catch {
    return CONTEUDO_PADRAO; // armazenamento bloqueado ou JSON corrompido: o padrão sempre funciona
  }
}

let atual: Conteudo = lerDoAparelho();
/** Conta quantas vezes a pessoa escolheu nesta página: a leitura da conta não passa por cima. */
let escolhas = 0;
let daConta: Promise<void> | null = null;
let relogio: ReturnType<typeof setTimeout> | null = null;
const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const o of [...ouvintes]) o();
}

function guardarNaConta(): void {
  if (relogio) clearTimeout(relogio);
  relogio = setTimeout(() => {
    relogio = null;
    void patchUiSettings({ conteudo: atual });
  }, ESPERA_DA_CONTA_MS);
}

/** Troca a escolha. `naConta: false` é a que veio da conta ou de outra aba (não volta para lá). */
function por(novo: Conteudo, o: { naConta?: boolean } = {}): void {
  if (mesmoConteudo(novo, atual)) return;
  atual = novo;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(novo));
  } catch {
    /* armazenamento bloqueado: a escolha vale até fechar a página */
  }
  if (o.naConta !== false) guardarNaConta();
  avisar();
}

/** A escolha de agora. */
export const conteudoAtual = (): Conteudo => atual;

/** Avisa a cada troca. Devolve como parar de escutar. */
export function assinarConteudo(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** `fxEscolher()` de `seletor.js:50-63`. `idiomaDaFonte`: o idioma em que a fonte foi listada. */
export function escolherConteudo(fonte: FonteDeConteudo, idiomaDaFonte = ''): void {
  escolhas += 1;
  por(escolher(atual, fonte, idiomaDaFonte));
}

/** O "x" da ficha: volta para "Tudo" em um toque. */
export function voltarParaTudoNoConteudo(): void {
  escolhas += 1;
  por(voltarParaTudo(atual));
}

/** `fsMudarIdioma()` de `seletor.js:72-82`. */
export function mudarIdiomaDoConteudo(idioma: string): void {
  escolhas += 1;
  por(mudarIdioma(atual, idioma));
}

/**
 * Confere a escolha com o catálogo lido (`sanear`): a fonte que sumiu volta para "Tudo". `pedido` é o
 * idioma com que o catálogo foi lido; se a escolha já é de outro idioma, a resposta chegou tarde e não
 * julga nada.
 */
export function conferirConteudo(k: ContagensDeConteudo, pedido: string): void {
  if (pedido !== atual.idioma) return;
  /* A TRILHA DO APP NÃO DEPENDE DE CARTÃO: as palavras prontas existem por idioma (`data/trilha`), mesmo
     sem nenhuma ativada e mesmo num idioma em que a pessoa ainda não tem cartão. A escolha "Trilha" num
     idioma que tem trilha fica como está; quem não tem cartão dela vê a contagem zerada nos Cartões. */
  if (atual.fonte.tipo === 'trilha' && atual.idioma && indiceDaTrilha()[baseDoIdioma(atual.idioma)]) return;
  por(sanear(atual, k));
}

/** Lê a escolha guardada na conta, uma vez por página. */
export function carregarConteudoDaConta(): Promise<void> {
  daConta ??= (async () => {
    const antes = escolhas;
    const s = await fetchSettings();
    if (!s?.ui || escolhas !== antes) return;
    let ui: Record<string, unknown>;
    try {
      ui = JSON.parse(s.ui) as Record<string, unknown>;
    } catch {
      return;
    }
    if (ui.conteudo) por(lerConteudo(ui.conteudo), { naConta: false });
  })();
  return daConta;
}

if (typeof window !== 'undefined') {
  /* Outra aba trocou: esta acompanha, sem regravar. */
  window.addEventListener('storage', (e) => {
    if (e.key === CHAVE) por(lerDoAparelho(), { naConta: false });
  });
}

/** O conteúdo escolhido, vivo. Na primeira vez pede a escolha guardada na conta. */
export function useConteudo(): Conteudo {
  useEffect(() => {
    void carregarConteudoDaConta();
  }, []);
  return useSyncExternalStore(assinarConteudo, conteudoAtual, conteudoAtual);
}

/** Só para testes: volta ao que está no aparelho e esquece a conta e os relógios. */
export function zerarConteudoParaTeste(): void {
  if (relogio) clearTimeout(relogio);
  relogio = null;
  daConta = null;
  escolhas = 0;
  atual = lerDoAparelho();
  avisar();
}
