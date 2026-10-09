import { expect, test } from '@playwright/test'

import { irParaPraticar } from './_helpers'

/**
 * A GRADE MOSTRA TODO JOGO QUE O SISTEMA CONHECE, E SO ELE.
 *
 * Em 07/09 os nove culturais sairam da grade porque nao passavam por sistema nenhum: a rodada nao
 * nascia em `montarRodada` e o `RoundReport` era descartado. Em 08/09 eles voltaram reescritos,
 * rodando sobre o baralho e reportando o proprio `gameId`. A catraca inverteu de lado: antes
 * provava que eles NAO estavam na tela; agora prova que estao, e que a grade nao perdeu ninguem.
 */
/**
 * UM PADRAO POR JOGO, COBRINDO AS TRES REDACOES.
 *
 * A versao anterior desta lista era de substrings soltas ('vogais', 'Charada', 'proibida') e o
 * comentario dizia que elas apareciam "nos TRES perfis". Seis das nove NAO apareciam no perfil
 * `pro`, que reescreve o titulo com o nome proprio do jogo ("Complete as vogais" vira "Choseong:
 * consoantes a vista"). O teste passava por um motivo que ele nao declarava: o perfil PADRAO da
 * primeira visita era `senior`. Quando o padrao virou `pro` (12/09, spec `leitura-padrao`), seis
 * asserções cairam de uma vez — e nao havia nada de errado com a grade.
 *
 * Agora cada entrada traz as duas redacoes, entao a lista deixa de depender de qual perfil esta
 * ativo. Uma terceira redacao nova quebra aqui, que e o lugar certo para quebrar.
 */
const CULTURAIS = [
  /Karuta/,
  /Complete as vogais|Choseong/,
  /Tênis de palavras|Rali cronometrado/,
  /Mala cumulativa|mala/i,
  /Bao/,
  /Charada|Vitendawili/,
  /Corrente de palavras|Shiritori/,
  /Frase maluca|Cadavre exquis/,
  /Palavra proibida|Tabu/,
]

test.describe('Grade de jogos', () => {
  test('nao anuncia jogo que nao registra progresso', async ({ page }) => {
    test.slow()
    await irParaPraticar(page)
    await expect(page.getByRole('main')).toBeVisible()
    // O selo era a afirmacao falsa mais direta da tela, e nao volta.
    await expect(page.getByText('100% Funcional')).toHaveCount(0)
    await expect(page.getByRole('tab', { name: /Jogos do Mundo/i })).toHaveCount(0)
  })

  test('os nove culturais estao na grade', async ({ page }) => {
    test.slow()
    await irParaPraticar(page)
    const corpo = page.getByRole('main')
    for (const nome of CULTURAIS) {
      await expect(corpo.getByText(nome).first(), `${nome} nao aparece na grade`).toBeVisible()
    }
  })

  test('as categorias que sobraram sao as dos jogos que registram', async ({ page }) => {
    await irParaPraticar(page)
    await expect(page.getByRole('tab', { name: 'Todos' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Clássicos' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Favoritos' })).toBeVisible()
  })
})
