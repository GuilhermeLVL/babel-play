import { describe, it, expect } from 'vitest';
import { mesmaFonte, fonteDaEscolha, type FonteDeItens } from '../src/core/minigames/source';

/**
 * O DEFEITO QUE ESTE ARQUIVO IMPEDE DE VOLTAR.
 *
 * `FonteDeItens` é dependência de `useMemo` na tela Jogar, e o React compara por IDENTIDADE. Um
 * `setFonte` que fabrica um objeto novo com os MESMOS valores custa uma passada inteira do
 * pipeline: triagem do baralho, pedido de composição e o gate dos nove jogos.
 *
 * Foi o que acontecia no arranque do /jogar: a restauração da fonte guardada rodava quando a lista
 * de gravações chegava e, no caso comum, restaurava exatamente a fonte que já estava lá. Medido
 * com o contador de `lib/passadasDoPipeline` (build de produção, CPU 4x): uma triagem, uma
 * composição e um gate a mais, por nada.
 *
 * O caso do meio — `{ id, lang }` contra `{ id, lang, sessionId: undefined }` — é o que quebra a
 * comparação ingênua por `JSON.stringify`: `undefined` não sobrevive à serialização e os dois
 * viram textos diferentes, embora descrevam o mesmo recorte.
 */
describe('mesmaFonte — dois objetos, o mesmo recorte', () => {
  it('a fonte restaurada no caso comum é igual à que já estava lá', () => {
    // Exatamente o par que roda no boot: estado inicial (já com idioma) contra o que
    // `lerFonteGuardada` devolve para quem nunca escolheu nada.
    const atual: FonteDeItens = { id: 'baralho', lang: 'en' };
    const restaurada = fonteDaEscolha({ origem: 'gravacoes', escopo: 'todas', lang: 'en' });

    expect(restaurada).not.toBe(atual);          // objeto novo — é este o problema
    expect(mesmaFonte(atual, restaurada)).toBe(true);
  });

  it('campo ausente e campo `undefined` descrevem o mesmo recorte', () => {
    const semCampos: FonteDeItens = { id: 'baralho', lang: 'pt' };
    const comUndefined: FonteDeItens = { id: 'baralho', lang: 'pt', sessionId: undefined, nivel: undefined };

    expect(mesmaFonte(semCampos, comUndefined)).toBe(true);
  });

  it('idioma diferente é fonte diferente', () => {
    expect(mesmaFonte({ id: 'baralho', lang: 'en' }, { id: 'baralho', lang: 'pt' })).toBe(false);
  });

  it('idioma vazio não é o mesmo que idioma escolhido', () => {
    // O estado "ainda não sei" (`lang: ''`) tria o baralho INTEIRO, sem filtro — deixá-lo passar
    // por igual a uma fonte com idioma seria justamente pular a passada que corrige a tela.
    expect(mesmaFonte({ id: 'baralho', lang: '' }, { id: 'baralho', lang: 'en' })).toBe(false);
  });

  it('outra gravação é outra fonte', () => {
    const a: FonteDeItens = { id: 'sessao', lang: 'en', sessionId: 's1' };
    const b: FonteDeItens = { id: 'sessao', lang: 'en', sessionId: 's2' };

    expect(mesmaFonte(a, b)).toBe(false);
    expect(mesmaFonte(a, { ...a })).toBe(true);
  });

  it('outro nível da trilha é outra fonte', () => {
    const a: FonteDeItens = { id: 'trilha', lang: 'en', nivel: 'A1' };
    const b: FonteDeItens = { id: 'trilha', lang: 'en', nivel: 'A2' };

    expect(mesmaFonte(a, b)).toBe(false);
    expect(mesmaFonte(a, { ...a })).toBe(true);
  });

  it('mesma origem e idioma, escopos diferentes: baralho não é a gravação', () => {
    expect(mesmaFonte({ id: 'baralho', lang: 'en' }, { id: 'sessao', lang: 'en', sessionId: 's1' })).toBe(false);
  });
});
