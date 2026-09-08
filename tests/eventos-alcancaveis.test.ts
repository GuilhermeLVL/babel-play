/**
 * TODO EVENTO QUE A META CONTA TEM DE PODER ACONTECER — MEDIDO NAS CHAMADAS REAIS.
 *
 * A conquista "Colecionador" (`src/core/learning/conquistas.ts:64`) pede que a pessoa veja TODOS os
 * eventos dos jogos, e a meta dela é `todosOsEventos().length`. A auditoria de 08/09 mediu que a
 * meta era 11 e que só 10 aconteciam: `eventosDeJogo.ts:82` declara o evento `'perfeita'` sob
 * `if (ctx.perfeita)`, e NENHUMA chamada de `eventosCondicionais` em todo o app passava esse campo.
 * A conquista, o rastro `ras-arcoiris` que ela entrega e o cadeado "Conquista: Colecionador"
 * (`src/lib/galeria/acesso.ts:65`) eram inalcançáveis jogando.
 *
 * POR QUE O TESTE QUE EXISTIA NÃO PEGOU, E POR QUE ESTE PRECISOU DE DUAS TENTATIVAS.
 *
 * `tests/conquistas.test.ts:54` injeta `eventosVistos: 11` e confere a aritmética do progresso.
 * Aritmética correta sobre um número inatingível continua passando.
 *
 * A primeira versão DESTE arquivo tinha o mesmo vício numa camada acima: ela montava
 * `{ perfeita: true }` à mão e verificava que `eventosCondicionais` devolvia o evento. Só que essa
 * função SEMPRE devolveu — o defeito nunca esteve nela, e sim no fato de ninguém a chamar assim.
 * O teste teria passado igual antes do conserto, que é a definição de gate decorativo.
 *
 * A medição certa é sobre as CHAMADAS: varrer `src/` atrás de `eventosCondicionais(...)`, ler que
 * campos cada chamada passa, e exigir que todo evento condicional da meta tenha pelo menos uma
 * chamada capaz de dispará-lo. É o mesmo desenho de `tests/contratos/rotas-espelhadas.test.ts`,
 * que varre o código atrás das rotas em vez de confiar numa lista.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { todosOsEventos, eventosCondicionais, sortearEventoRaro, type ContextoDeJogada } from '../src/lib/eventosDeJogo';

const RAIZ = join(__dirname, '..', 'src');

function arquivosDeCodigo(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosDeCodigo(caminho, saida);
    else if (/\.(ts|tsx)$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

/**
 * Os argumentos de cada `eventosCondicionais(...)` do app, como TEXTO.
 *
 * Ler o objeto literal com regex é grosseiro de propósito: o que interessa é só QUE CHAVES a
 * chamada menciona, e para isso o texto basta. Um parser de verdade aqui seria precisão que este
 * teste não usa.
 */
function chamadasNoCodigo(): string[] {
  const chamadas: string[] = [];
  for (const arquivo of arquivosDeCodigo(RAIZ)) {
    const texto = readFileSync(arquivo, 'utf8');
    for (const m of texto.matchAll(/eventosCondicionais\(([^)]*)\)/g)) {
      // A declaração e o import da própria função não são chamadas.
      if (/^\s*ctx\s*:/.test(m[1])) continue;
      chamadas.push(m[1]);
    }
  }
  return chamadas;
}

/** O contexto que uma chamada é capaz de produzir, no melhor caso para o evento. */
function contextosPossiveis(argumento: string): ContextoDeJogada[] {
  const ctxs: ContextoDeJogada[] = [];
  /* Combo literal (`combo: 5`) dispara só aquele degrau; combo por variável (`combo: nova`) pode
     ser qualquer um, então conta para os três. */
  const comboLiteral = argumento.match(/combo:\s*(\d+)/);
  if (comboLiteral) ctxs.push({ combo: Number(comboLiteral[1]), fever: false });
  else if (/combo:/.test(argumento)) for (const c of [5, 10, 15]) ctxs.push({ combo: c, fever: false });
  if (/recorde:\s*(true|[a-zA-Z])/.test(argumento)) ctxs.push({ combo: 0, fever: false, recorde: true });
  if (/perfeita:\s*(true|[a-zA-Z])/.test(argumento)) ctxs.push({ combo: 0, fever: false, perfeita: true });
  return ctxs;
}

describe('a meta do Colecionador é alcançável jogando', () => {
  const meta = todosOsEventos();
  const chamadas = chamadasNoCodigo();

  it('o varredor achou as chamadas — senão o resto do arquivo é decorativo', () => {
    expect(chamadas.length, 'nenhuma chamada de eventosCondicionais encontrada em src/').toBeGreaterThan(0);
  });

  /* Os raros não vêm de contexto e sim do sorteio (`juice.ts:87`): para eles basta que exista
     algum valor do dado que os devolva. */
  const produziveis = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const ev = sortearEventoRaro(() => i / 1000, 1);
    if (ev) produziveis.add(ev.id);
  }
  for (const argumento of chamadas) {
    for (const ctx of contextosPossiveis(argumento)) {
      for (const ev of eventosCondicionais(ctx)) produziveis.add(ev.id);
    }
  }

  it.each(todosOsEventos())('o evento "%s" tem um caminho no app que o produz', (id) => {
    expect(
      produziveis.has(id),
      `"${id}" está na meta da conquista Colecionador e nenhuma chamada real de eventosCondicionais o dispara`,
    ).toBe(true);
  });

  it('nenhum evento produzido está fora da meta — senão a contagem nunca fecha', () => {
    for (const id of produziveis) {
      expect(meta, `"${id}" é produzido pelo app e não está em todosOsEventos()`).toContain(id);
    }
  });
});
