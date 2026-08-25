import { describe, it, expect } from 'vitest';
import {
  REVELAVEL, MINIGAME_IDS, previaSegura, esqueleto, repetidosDaUltima,
  type ItemCru,
} from '../src/core';
import { chaveComparavel } from '../src/core/learning/quality';

/**
 * A REGRA QUE ESTES TESTES TRAVAM: a antessala nunca mostra mais do que o jogo mostra no primeiro
 * instante da jogada.
 *
 * O defeito era real e específico — a prévia imprimia a palavra que o Termo ia pedir para soletrar
 * e a frase que o Ditado ia pedir para transcrever, enquanto os próprios jogos se recusavam a
 * mostrar isso. Um teste de "chama sem quebrar" não pegaria a volta do vazamento; o que pega é
 * procurar a resposta DENTRO do que foi emitido.
 */

/** Um caso por jogo, com resposta e pista distinguíveis a olho no relatório de falha. */
const CRUS: ItemCru[] = [
  { ref: 'building', alvo: 'building', pista: 'prédio alto', cefr: 'A2', cefrConfianca: 1 },
  { ref: 'advice', alvo: 'advice', pista: 'conselho', cefr: 'B1', cefrConfianca: 1 },
  { ref: 's1', alvo: 'she woke up early today', pista: 'ela acordou cedo hoje' },
];

describe('REVELAVEL — a tabela', () => {
  it('declara facetas para TODO minigame (exaustividade em runtime, não só no tipo)', () => {
    expect(MINIGAME_IDS.length).toBeGreaterThan(0);
    for (const id of MINIGAME_IDS) {
      expect(REVELAVEL[id], `jogo sem facetas declaradas: ${id}`).toBeDefined();
      expect(REVELAVEL[id].size, `facetas vazias em ${id}`).toBeGreaterThan(0);
    }
  });

  it('só karaokê e caça-conectores podem mostrar a resposta — os dois mostram a frase por mecânica', () => {
    const comAlvo = MINIGAME_IDS.filter(id => REVELAVEL[id].has('alvo')).sort();
    expect(comAlvo).toEqual(['conectores', 'karaoke']);
  });

  it('estado, quando e nível valem para todos: falam da SUA relação com o item, não do conteúdo', () => {
    for (const id of MINIGAME_IDS) {
      for (const f of ['estado', 'quando', 'nivel'] as const) {
        expect(REVELAVEL[id].has(f), `${id} deveria permitir ${f}`).toBe(true);
      }
    }
  });
});

describe('previaSegura — a trava', () => {
  it('nunca emite a resposta de um jogo que não declara `alvo`', () => {
    for (const id of MINIGAME_IDS) {
      if (REVELAVEL[id].has('alvo')) continue;
      for (const item of previaSegura(id, CRUS)) {
        for (const cru of CRUS) {
          expect(item.titulo, `${id}: título entregou a resposta`).not.toBe(cru.alvo);
        }
      }
    }
  });

  /**
   * A ASSERÇÃO SÉRIA. Comparar por igualdade deixaria passar "building" dentro de "the building",
   * e deixaria passar o caso `traducao-igual` que `avaliarCartao` já sabe que existe no baralho:
   * cartão cuja tradução É a própria palavra. Nesse cartão, emitir a "pista" emitiria a resposta.
   */
  it('nenhuma string emitida CONTÉM a resposta, comparada por chave normalizada', () => {
    const armadilha: ItemCru[] = [
      ...CRUS,
      // O caso real: tradução idêntica à palavra. Mostrar a pista aqui seria mostrar o alvo.
      { ref: 'hotel', alvo: 'hotel', pista: 'Hotel' },
      // E o caso do alvo contido na pista.
      { ref: 'run', alvo: 'run', pista: 'run away — fugir' },
    ];
    for (const id of MINIGAME_IDS) {
      if (REVELAVEL[id].has('alvo')) continue;
      for (const [i, item] of previaSegura(id, armadilha).entries()) {
        const alvo = chaveComparavel(armadilha[i].alvo);
        if (!alvo) continue;
        for (const campo of [item.titulo, item.pista, item.forma]) {
          if (!campo) continue;
          expect(
            chaveComparavel(campo).includes(alvo),
            `${id}: "${campo}" contém a resposta "${armadilha[i].alvo}"`,
          ).toBe(false);
        }
      }
    }
  });

  it('a pista SOBE para o título quando o jogo já a mostra, e o alvo não aparece', () => {
    const [primeiro] = previaSegura('termo', CRUS);
    expect(primeiro.titulo).toBe('prédio alto');
    expect(primeiro.forma).toBe('8 letras');
  });

  it('sem alvo nem pista, sobra só o esqueleto', () => {
    const [primeiro, , terceiro] = previaSegura('memory', CRUS);
    expect(primeiro.titulo).toBe('8 letras');
    expect(primeiro.pista).toBeUndefined();
    expect(terceiro.titulo).toBe('5 palavras');
  });

  it('karaokê e conectores mostram a frase — é a mecânica, não um furo', () => {
    expect(previaSegura('karaoke', CRUS)[2].titulo).toBe('she woke up early today');
    expect(previaSegura('conectores', CRUS)[2].pista).toBe('ela acordou cedo hoje');
  });

  it('nível só passa com confiança curada — um CEFR estimado é invenção', () => {
    const chutado: ItemCru[] = [{ ref: 'x', alvo: 'x', pista: 'y', cefr: 'C2', cefrConfianca: 0.4 }];
    expect(previaSegura('blitz', chutado)[0].cefr).toBeUndefined();
    expect(previaSegura('blitz', CRUS)[0].cefr).toBe('A2');
  });

  it('preserva a ordem e a quantidade — a prévia descreve a rodada inteira', () => {
    for (const id of MINIGAME_IDS) {
      const saida = previaSegura(id, CRUS);
      expect(saida).toHaveLength(CRUS.length);
      expect(saida.map(i => i.ref)).toEqual(CRUS.map(c => c.ref));
    }
  });
});

describe('esqueleto', () => {
  it('não devolve nenhum caractere do texto original', () => {
    const r = esqueleto('building');
    expect(JSON.stringify(r)).not.toContain('b');
    expect(typeof r.letras).toBe('number');
  });

  it('conta LETRAS, não caracteres: hífen e apóstrofo não ganham casa no tabuleiro', () => {
    expect(esqueleto('co-worker').letras).toBe(8);
    expect(esqueleto("don't").letras).toBe(4);
    expect(esqueleto('ação').letras).toBe(4);
  });

  it('conta palavras e aguenta texto vazio', () => {
    expect(esqueleto('she woke up').palavras).toBe(3);
    expect(esqueleto('   ')).toEqual({ letras: 0, palavras: 0 });
  });
});

describe('repetidosDaUltima — o que substitui a lista na função de denunciar repetição', () => {
  it('conta quantos itens vieram da rodada anterior', () => {
    expect(repetidosDaUltima(CRUS, new Set(['building', 'advice']))).toBe(2);
    expect(repetidosDaUltima(CRUS, new Set(['outra']))).toBe(0);
    expect(repetidosDaUltima(CRUS, new Set())).toBe(0);
  });
});

/**
 * A FACETA `origem` E A PORTA DOS FUNDOS QUE ELA QUASE ABRIU.
 *
 * Levar a procedência até a prévia é útil e inócuo — "veio de uma gravação sua" não ajuda ninguém a
 * lembrar uma palavra. Só que o RÓTULO da gravação é texto escrito por gente, e um título como
 * "Conversa sobre as chaves perdidas" numa rodada que pede *keys* entrega a resposta antes do
 * primeiro clique. Seria um vazamento novo, aberto pelo mesmo arquivo escrito para fechá-los.
 */
describe('faceta origem — procedência sem entregar a resposta', () => {
  it('os nove jogos declaram a faceta: procedência não é conteúdo', () => {
    for (const id of MINIGAME_IDS) {
      expect(REVELAVEL[id].has('origem'), id).toBe(true);
    }
  });

  it('o tipo da origem e o idioma chegam à tela', () => {
    const [item] = previaSegura('memory', [
      { ref: 'keys', alvo: 'keys', pista: 'chaves', origem: 'sessao', origemRotulo: 'Aula de inglês', idioma: 'en' },
    ]);
    expect(item.origem).toEqual({ tipo: 'sessao', rotulo: 'Aula de inglês', idioma: 'en' });
  });

  it('o rótulo que CONTÉM a palavra-alvo é retido — e o tipo sobrevive', () => {
    const [item] = previaSegura('memory', [
      { ref: 'keys', alvo: 'keys', pista: 'chaves', origem: 'sessao', origemRotulo: 'Conversa sobre as keys perdidas' },
    ]);
    // Sem rótulo, a tela cai para o nome genérico da fonte — que é verdade e não entrega nada.
    expect(item.origem?.rotulo).toBeUndefined();
    expect(item.origem?.tipo).toBe('sessao');
  });

  it('a retenção é insensível a maiúsculas e acentos, como a da pista', () => {
    const [item] = previaSegura('termo', [
      { ref: 'ação', alvo: 'ação', pista: 'action', origem: 'sessao', origemRotulo: 'Aula sobre ACAO' },
    ]);
    expect(item.origem?.rotulo).toBeUndefined();
  });

  it('nenhum rótulo emitido contém o alvo, em nenhum dos nove jogos', () => {
    for (const id of MINIGAME_IDS) {
      const previa = previaSegura(id, [
        { ref: 'keys', alvo: 'keys', pista: 'chaves', origem: 'sessao', origemRotulo: 'As keys perdidas' },
        { ref: 'bread', alvo: 'bread', pista: 'pão', origem: 'sessao', origemRotulo: 'Café da manhã' },
      ]);
      for (const item of previa) {
        const rotulo = item.origem?.rotulo;
        if (!rotulo) continue;
        expect(chaveComparavel(rotulo).includes(chaveComparavel('keys')), `${id}: ${rotulo}`).toBe(false);
      }
    }
  });

  it('sem dado de origem, o campo não é inventado', () => {
    const [item] = previaSegura('memory', [{ ref: 'x', alvo: 'house', pista: 'casa' }]);
    expect(item.origem).toBeUndefined();
  });
});

/**
 * O CÓDIGO MORTO QUE NINGUÉM VIA, e o teste que o mantém vivo.
 *
 * A antessala escolhe entre LISTA e RESUMO comparando `titulo !== forma`: onde o título é o próprio
 * esqueleto ("10 letras"), não há o que distinguir entre as linhas e o resumo diz mais em duas
 * frases. Só que `previaSegura` não emitia `forma` nesse ramo — a comparação dava sempre verdadeiro,
 * e o card "este jogo esconde o conteúdo até você jogar" nunca aparecia. A Memória imprimia oito
 * linhas "N letras · VENCIDA" na tela, medido no navegador com o baralho real.
 *
 * O defeito sobreviveu porque a causa e o sintoma estão em arquivos diferentes. Este teste fecha a
 * distância: ele afirma a INVARIANTE no ponto de origem, não o sintoma na tela.
 */
describe('esqueleto emitido como título também vem como forma', () => {
  it('nos três jogos que não revelam nada, título e forma são o mesmo texto', () => {
    for (const id of ['memory', 'escuta', 'ditado'] as const) {
      const [item] = previaSegura(id, [{ ref: 'x', alvo: 'building', pista: 'prédio' }]);
      expect(item.titulo, id).toBe('8 letras');
      expect(item.forma, `${id}: sem forma, a antessala não sabe que a linha é só esqueleto`).toBe(item.titulo);
    }
  });

  it('onde a pista sobe ao título, forma continua sendo a medida — e não o título', () => {
    const [item] = previaSegura('termo', [{ ref: 'x', alvo: 'building', pista: 'prédio' }]);
    expect(item.titulo).toBe('prédio');
    expect(item.forma).toBe('8 letras');
  });

  it('forma e tamanho falam da mesma medida', () => {
    for (const id of MINIGAME_IDS) {
      for (const item of previaSegura(id, [{ ref: 'x', alvo: 'building', pista: 'prédio' }])) {
        if (!item.forma) continue;
        expect(item.forma, id).toContain(String(item.tamanho));
      }
    }
  });
})
