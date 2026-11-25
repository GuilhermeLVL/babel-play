/**
 * A GUARDA DOS ARMAZÉNS LOCAIS DA CONTA — a lista do que mora só neste aparelho e é da conta, num lugar só.
 *
 * Cada módulo abaixo se registra em `armazemLocalPorConta` ao ser importado; importá-los AQUI garante que, no boot
 * (`main.tsx`), em `signOut`, em `limparTudo` e em `excluirConta`, o conjunto inteiro está registrado mesmo que a tela
 * dona do armazém nunca tenha sido aberta nesta sessão. Armazém novo com dado pessoal da conta: registre-o e importe-o
 * aqui (o teste `tests/dados-locais-por-conta.test.ts` confere a lista).
 *
 * Exceção: `entitlements` também se registra, mas NÃO entra aqui. Ele importa `data/api` e `data/efemero/store` (que chama
 * esta guarda no `limparTudo`) está no caminho de `data/api`: importá-lo aqui fecharia um ciclo. Ele já está no grafo
 * estático do App, então está registrado antes de qualquer troca de conta.
 */
import './cartoes/audioDoCartao/armazem';
import './cartoes/cenaDoCartao';
import './captura/rascunhoDaCaptura';
import './diario/historico';
import './ichat/conversas';
import './revisao/vozGuardada';
import './voz/cacheDeVoz';
import './armazensDoAparelhoDaConta';

import { armazensRegistrados } from './armazemLocalPorConta';
import { aoMudarDono, aoMudarIdentidade } from './identidade';

const seguro = async (f: () => Promise<void> | void): Promise<void> => {
  try {
    await f();
  } catch {
    /* um armazém com defeito não impede os outros de apagar */
  }
};

export async function apagarTodosOsArmazensDaConta(o?: { preservarVisitante?: boolean }): Promise<void> {
  await Promise.all([...armazensRegistrados()].map((a) => seguro(() => a.apagarTudo(o))));
}

export async function purgarTodosOsArmazensDeOutros(): Promise<void> {
  await Promise.all([...armazensRegistrados()].map((a) => seguro(() => a.purgarDeOutros())));
}

export async function destruirTodosOsArmazensDaConta(): Promise<void> {
  await Promise.all([...armazensRegistrados()].map((a) => seguro(() => a.destruir())));
}

let desfazer: Array<() => void> = [];

/**
 * Registra cedo (idempotente) o que apaga os armazéns quando a identidade ou a conta muda. Não abre nenhum banco.
 * Chamada em `main.tsx`; também é chamada pelos armazéns ao serem criados (rede de segurança).
 */
export function iniciarGuardaDosArmazensLocais(): void {
  if (desfazer.length || typeof window === 'undefined') return;
  /* Na partida: o que ficou de outro dono (recarga com outra conta) sai já, sem esperar o primeiro uso. */
  void purgarTodosOsArmazensDeOutros();
  /* Conta -> sem conta (sair) e qualquer troca de estado depois de carregado. */
  desfazer.push(
    aoMudarIdentidade((depois, antes) => {
      if (antes !== 'carregando' && antes !== depois)
        void apagarTodosOsArmazensDaConta({ preservarVisitante: antes === 'anonimo' && depois === 'conta' });
      else void purgarTodosOsArmazensDeOutros();
    }),
  );
  /* Conta -> conta, sair, e a primeira conta conhecida depois de uma recarga (aí só sai o que não é dela). */
  desfazer.push(
    aoMudarDono((_depois, antes) => {
      if (antes !== null) void apagarTodosOsArmazensDaConta();
      else void purgarTodosOsArmazensDeOutros();
    }),
  );
}

/** Só para testes: tira os ouvintes (o registro dos armazéns fica). */
export function _reiniciarGuardaDosArmazensLocais(): void {
  for (const d of desfazer) d();
  desfazer = [];
}
