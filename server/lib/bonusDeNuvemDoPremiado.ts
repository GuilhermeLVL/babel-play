/**
 * O BÔNUS DE NUVEM DO ANÚNCIO PREMIADO (`nuvem-30`, spec `anuncios-no-gratis`): cada exibição CONCLUÍDA no mês
 * soma 30 min à franquia de nuvem do Grátis (`FRANQUIA_DE_ALIVIO`) daquele mês.
 *
 * POR QUE LIDO DA TABELA DAS EXIBIÇÕES, e não um contador próprio em `usage_counters`: a franquia é uma
 * constante (`FRANQUIA_DE_ALIVIO.sttSegundosMes`) e não tem como dizer "mais 30 min" sem uma segunda escrita.
 * Contando as linhas concluídas, creditar a nuvem é a MESMA escrita que marca a conclusão
 * (`anunciosPremiadosRepo.concluir`): não há crédito pela metade nem crédito em dobro. Quem lê a franquia — a
 * porta (`avaliarAlivio`), a reserva de segundos (`reservarSegundosDeStt`, modo `alivio`) e `GET /api/me/uso` —
 * soma este bônus ao teto.
 *
 * O TETO EM DÓLAR cresce na mesma proporção (US$ 0,13 / 10.800 s × 1.800 s ≈ US$ 0,022 por exibição): sem isso
 * o dólar do mês fecharia antes dos segundos ganhos. Tokens e chamadas são de uso justo e não mudam.
 *
 * Folha: só o repositório e o core. Leitura que falha LANÇA (falha fechada, como os contadores).
 */
import { SEGUNDOS_DE_NUVEM_DO_PREMIADO } from '../../src/core/anuncios/premiado'
import { anunciosPremiadosRepo } from '../db/repositories/anunciosPremiados'
import type { UserId } from './authContext'

/** O espaço que dá nuvem. */
const ESPACO_DE_NUVEM = 'nuvem-30'

/** Os segundos de nuvem ganhos com anúncio no mês UTC de `agora`. */
export async function segundosDeBonusDoAlivio(userId: UserId, agora = Date.now()): Promise<number> {
  const mes = new Date(agora).toISOString().slice(0, 7)
  return (await anunciosPremiadosRepo.concluidasNoMes(userId, ESPACO_DE_NUVEM, mes)) * SEGUNDOS_DE_NUVEM_DO_PREMIADO
}
