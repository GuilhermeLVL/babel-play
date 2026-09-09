// @vitest-environment jsdom
/**
 * A ROTA E O CADEADO DIZEM A MESMA COISA.
 *
 * `estadoDoItem` responde SE dá para usar e resume o cadeado num `motivo` ("Nível 5 ou 140
 * Seeds"). `rotaDeObtencao` responde COMO se consegue, em frase inteira, e leva a um destino.
 * São duas leituras do mesmo fato, e enquanto a segunda morou escrita à mão dentro de uma tela
 * as duas discordaram em dois pontos que este arquivo agora prende:
 *
 *  · a rota mostrava o ID da conquista (`foco_impecavel`) onde o cadeado já mostrava o nome;
 *  · a rota de um item com nível E preço dizia só "Custa N Seeds", escondendo o caminho de graça
 *    que o cadeado do mesmo item anunciava.
 *
 * A forma do teste é deliberada: em vez de comparar as duas strings (o que travaria a redação),
 * ele exige que **todo número e todo nome que o cadeado cita apareçam na rota**. A rota pode
 * dizer mais; não pode dizer menos.
 */
import { beforeEach,describe, expect, it } from 'vitest';

import { CONQUISTAS } from '../../src/core';
import { FONTE_OPTIONS } from '../../src/lib/appearance';
import { CATALOGO_DA_LOJA, estadoDoItem, type ItemDaLoja,rotaDeObtencao } from '../../src/lib/loja';

/* Nível 1 e zero Seeds: o estado de quem acabou de chegar, que é quando a rota importa. Sem
   nenhuma posse no localStorage, `estadoDoItem` responde pela regra pura do catálogo. */
const NIVEL_ZERADO = 1;
const SEM_SEEDS = 0;

beforeEach(() => localStorage.clear());

/** Normaliza para comparar sem depender de maiúscula ou de acento no "Nível". */
const solto = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

describe('rotaDeObtencao concorda com o cadeado de estadoDoItem', () => {
  const trancados = CATALOGO_DA_LOJA.filter(
    (i) => estadoDoItem(i, NIVEL_ZERADO, SEM_SEEDS).estado !== 'equipavel',
  );

  it('há itens trancados no nível 1 — senão o teste não testa nada', () => {
    expect(trancados.length).toBeGreaterThan(10);
  });

  /* O comparador é a parte que pode falhar em silêncio: se `solto` não tirasse o acento, o
     `matchAll(/nivel (\d+)/)` nunca casaria e a suíte inteira passaria sem comparar nada. */
  it('o comparador tira o acento, senão o resto do arquivo é decorativo', () => {
    expect(solto('Nível 5 ou 140 Seeds')).toBe('nivel 5 ou 140 seeds');
    expect([...solto('Nível 5 ou 140 Seeds').matchAll(/nivel (\d+)/g)]).toHaveLength(1);
  });

  it.each(trancados.map((i) => [i.id, i] as [string, ItemDaLoja]))(
    '%s: a rota repete tudo que o cadeado cita',
    (_id, item) => {
      const { motivo } = estadoDoItem(item, NIVEL_ZERADO, SEM_SEEDS);
      expect(motivo, 'todo item trancado tem motivo').toBeTruthy();
      const rota = solto(rotaDeObtencao(item, SEM_SEEDS).texto);

      /* Os NÚMEROS do motivo com a unidade colada (140 Seeds, 150 Créditos, Nível 5) têm de
         reaparecer na rota. É o que pega a rota que esconde metade do preço. */
      for (const [, numero, unidade] of solto(motivo!).matchAll(/(\d+)\s+(seeds|creditos)/g)) {
        expect(rota, `${item.id}: a rota omite "${numero} ${unidade}"`).toContain(`${numero} ${unidade}`);
      }
      for (const [, numero] of solto(motivo!).matchAll(/nivel (\d+)/g)) {
        expect(rota, `${item.id}: a rota omite "nível ${numero}"`).toContain(`nivel ${numero}`);
      }
      /* E o NOME da conquista, nunca o id. */
      if (item.exclusivoDe) {
        const nome = CONQUISTAS.find((c) => c.id === item.exclusivoDe)?.nome;
        expect(nome, `${item.id}: exclusivoDe aponta para a conquista inexistente "${item.exclusivoDe}"`).toBeTruthy();
        expect(rota).toContain(solto(nome!));
      }
    },
  );
});

describe('toda rota é acionável', () => {
  it.each(CATALOGO_DA_LOJA.map((i) => [i.id, i] as [string, ItemDaLoja]))(
    '%s tem canal, frase e destino',
    (_id, item) => {
      const r = rotaDeObtencao(item, SEM_SEEDS);
      expect(['conquistas', 'loja', 'passe']).toContain(r.destino);
      expect(r.titulo.length).toBeGreaterThan(3);
      expect(r.texto.length).toBeGreaterThan(20);
      expect(r.rotuloDoBotao.length).toBeGreaterThan(3);
    },
  );

  /* O item de conquista NÃO manda para a Loja, e o de Créditos não manda para as Conquistas: um
     destino errado é pior do que nenhum, porque manda a pessoa procurar onde não está. */
  it('o destino corresponde ao canal', () => {
    for (const item of CATALOGO_DA_LOJA) {
      const r = rotaDeObtencao(item, SEM_SEEDS);
      if (r.origem === 'conquista') expect(r.destino).toBe('conquistas');
      if (r.origem === 'seeds') expect(r.destino).toBe('loja');
      if (r.origem === 'nivel') expect(r.destino).toBe('passe');
    }
  });

  /* O saldo entra na frase: "faltam N Seeds" é a informação que decide se a pessoa vai à Loja
     agora ou volta a estudar. Com o preço no bolso, a frase muda. */
  it('a rota de Seeds conta quanto falta, e some quando não falta mais', () => {
    const comPreco = CATALOGO_DA_LOJA.find((i) => i.precoSeeds !== undefined && !i.exclusivoDe && i.precoCreditos === undefined);
    expect(comPreco).toBeTruthy();
    const preco = comPreco!.precoSeeds!;
    expect(rotaDeObtencao(comPreco!, 0).texto).toContain(`Faltam ${preco} Seeds`);
    expect(rotaDeObtencao(comPreco!, preco).texto).toContain(`já tem as ${preco} Seeds`);
  });

  /* O item do Passe premium tem DUAS portas — a casa da trilha e a prateleira avulsa — e dizer
     só a paga faria a trilha comprada parecer não entregar nada. */
  it('o exclusivo do Passe cita a casa da trilha e manda para o Passe', () => {
    const doPasse = CATALOGO_DA_LOJA.filter((i) => i.exclusivoDoPasse !== undefined);
    expect(doPasse.length).toBeGreaterThan(0);
    for (const item of doPasse) {
      const r = rotaDeObtencao(item, SEM_SEEDS);
      expect(r.texto).toContain(`casa ${item.exclusivoDoPasse}`);
      expect(r.destino).toBe('passe');
    }
  });
});

/**
 * AS FONTES SÃO DESCRITAS EM DOIS LUGARES, e é estrutural: `FONTE_OPTIONS` (`src/lib`) é o que o
 * seletor de aparência lê, e o item de catálogo (`src/core`) é o que o inventário mostra. O core
 * não pode importar do lib — inverteria a dependência que existe para o servidor poder ler o
 * catálogo. Então a cópia se repete, e o que impede as duas de divergirem é este teste.
 *
 * Ele nasceu de uma divergência real: a descrição de "Impacto" prometia "Archivo no peso máximo",
 * o CSS declarava a mesma pilha do padrão, e escolher a opção não mudava um pixel.
 */
describe('as oito fontes do catálogo batem com as do seletor', () => {
  const doCatalogo = CATALOGO_DA_LOJA.filter((i) => i.tipo === 'fonte');

  it('há um item por família oferecida, e nenhum a mais', () => {
    expect(doCatalogo.map((i) => i.alvo).sort()).toEqual(FONTE_OPTIONS.map((f) => f.id).sort());
  });

  it('nome e descrição são os mesmos nos dois lugares', () => {
    for (const item of doCatalogo) {
      const opcao = FONTE_OPTIONS.find((f) => f.id === item.alvo)!;
      expect(item.nome, `nome de ${item.id}`).toBe(opcao.name);
      expect(item.desc, `descrição de ${item.id}`).toBe(opcao.desc);
    }
  });

  /* Tipografia é legibilidade, e legibilidade é DIREITO — a mesma classificação que
     `coerencia-e-recompensa` já aplica a tamanho de texto e contraste. Nenhuma família pode ficar
     atrás de nível, Seeds, Créditos ou conquista. */
  it('nenhuma fonte é recompensa: todas são nível 1 e de graça', () => {
    for (const item of doCatalogo) {
      expect(item.nivel, `${item.id} deveria ser nível 1`).toBe(1);
      expect(item.precoSeeds, `${item.id} não pode ter preço`).toBeUndefined();
      expect(item.precoCreditos, `${item.id} não pode ter preço`).toBeUndefined();
      expect(item.exclusivoDe, `${item.id} não pode ser exclusivo`).toBeUndefined();
    }
  });
});

/**
 * UMA CONQUISTA COMUM NAO PAGA UM COSMETICO EPICO.
 *
 * A regra saiu de uma medicao que corrigiu a minha primeira leitura, e as duas ficam registradas
 * porque a diferenca entre elas e o conteudo do teste.
 *
 * A volta do catalogo mestre poe `cur-katana` (epico) em `sem-erro` — a conquista mais barata que
 * existe: raridade comum, meta de UMA rodada perfeita, 20 Seeds. Escrevi entao a regra "a
 * recompensa nunca fica duas faixas acima da conquista"... e o teste reprovou um par que ja estava
 * la e e deliberado: `ouvinte` (raro) entrega `part-cometa` (lendario), duas faixas. Sessenta
 * minutos de gravacao nao sao um feito barato, e o premio dele e proporcional.
 *
 * Ou seja: a distancia em faixas sozinha nao e a regra. O que separa `sem-erro` de `ouvinte` e o
 * PISO — uma conquista COMUM e, por definicao, a que qualquer pessoa tropeca em fazer, e pagar
 * epico ou lendario por ela apaga o significado da raridade em todo o resto do catalogo. Acima de
 * comum, o autor calibra; em comum, nao ha o que calibrar.
 *
 * `cur-katana` foi para `nivel-10` (epico), onde a faixa casa exatamente e que ate aqui so pagava
 * Seeds.
 */
describe('a raridade do exclusivo acompanha a da conquista', () => {
  const FAIXA = { comum: 0, raro: 1, epico: 2, lendario: 3 } as const;
  const comCosmetico = CONQUISTAS.filter((c) => c.recompensa.cosmetico);

  it('há exclusivos para medir', () => {
    expect(comCosmetico.length).toBeGreaterThan(4);
  });

  it.each(comCosmetico.map((c) => [c.id, c] as const))(
    '%s paga um cosmético proporcional ao feito',
    (_id, conquista) => {
      const item = CATALOGO_DA_LOJA.find((i) => i.id === conquista.recompensa.cosmetico);
      expect(item, `${conquista.id} promete "${conquista.recompensa.cosmetico}", que não existe no catálogo`).toBeTruthy();
      const distancia = FAIXA[item!.raridade] - FAIXA[conquista.raridade as keyof typeof FAIXA];
      /* O premio nunca vale MENOS que a conquista: seria a conquista desvalorizando a si mesma. */
      expect(distancia, `${conquista.id} (${conquista.raridade}) entrega ${item!.id} (${item!.raridade}), que e de faixa mais baixa`).toBeGreaterThanOrEqual(0);
      /* E o piso: conquista comum nao paga epico nem lendario. */
      if (conquista.raridade === 'comum') {
        expect(FAIXA[item!.raridade], `${conquista.id} e comum e entrega ${item!.id} (${item!.raridade})`).toBeLessThanOrEqual(FAIXA.raro);
      }
    },
  );

  /* E o item que a conquista promete tem de ser EXCLUSIVO dela: um cosmético anunciado como prêmio
     e vendido na Loja ao lado seria a promessa e a sua própria quebra na mesma tela. */
  it('o cosmético prometido é exclusivo daquela conquista', () => {
    for (const c of comCosmetico) {
      const item = CATALOGO_DA_LOJA.find((i) => i.id === c.recompensa.cosmetico)!;
      expect(item.exclusivoDe, `${item.id} é prêmio de ${c.id} e não está marcado como exclusivo dela`).toBe(c.id);
      expect(item.precoSeeds, `${item.id} é prêmio de ${c.id} e também é vendido`).toBeUndefined();
      expect(item.precoCreditos, `${item.id} é prêmio de ${c.id} e também é vendido`).toBeUndefined();
    }
  });
});
