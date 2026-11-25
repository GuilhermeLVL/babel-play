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

export {
  apagarTodosOsArmazensDaConta,
  destruirTodosOsArmazensDaConta,
  iniciarGuardaDosArmazensLocais,
} from './armazemLocalPorConta';
