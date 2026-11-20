/**
 * TODO MOUNT PRIVADO QUE GUARDA OU PROCESSA DADO NA NUVEM PASSA POR `exigirContaLiberada` — ou tem a razão
 * escrita aqui para ficar de fora.
 *
 * O portão é o do menor de 16 sem responsável (ECA Digital art. 24, LGPD art. 14): 403 `responsavel_pendente`
 * e `idade_nao_informada`. A revisão de segurança de 26/10/2026 achou `/api/leitura` (as anotações do leitor)
 * montado sem ele — dado de estudo do titular na nuvem, aberto a quem o portão existe para segurar. Este teste
 * lê a montagem de `server/http/app.ts` e falha no dia em que um router privado novo entrar sem o portão.
 *
 * Duas pontas, como em `montagem-espelha-o-server.test.ts`: os mounts privados vêm da caracterização
 * (`ROUTERS_PRIVADOS`, que ela mesma confere contra o `app.ts`), e a lista do portão é lida do `app.ts`.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { ROUTERS_PRIVADOS } from '../caracterizacao/_app'

/** Mounts privados FORA do portão, cada um com o motivo. Uma entrada aqui é decisão, não pendência. */
const FORA_DO_PORTAO: Record<string, string> = {
  '/api/me':
    'direitos do titular (idade, convite, exportar, excluir) nunca travam — é por aqui que o menor informa a idade e convida o responsável',
  '/api/responsavel': 'o lado do responsável: aceitar o convite é justamente o que libera a conta do menor',
  '/api/admin': 'administração do dono, com `requireRole` e 2FA; não guarda dado de estudo de ninguém',
  '/api/erros-do-cliente': 'diário de erros do navegador, sem conteúdo do titular, com teto por usuário',
  '/api/billing': 'cobrança: só adulto assina (o checkout pede a idade), e o menor precisa poder ver e cancelar',
  '/api/anuncios': 'o premiado tem a própria porta de perfil protegido (403 `perfil_protegido` para menor)',
  '/api/audio': 'capacidade local do self-host; no modo público é o stub 403 de qualquer jeito',
}

function mountsDoPortao(): string[] {
  const fonte = readFileSync('server/http/app.ts', 'utf8')
  /* O ÚLTIMO `app.use([` antes do uso do portão (o import no topo não tem a vírgula depois do nome). */
  const uso = fonte.search(/\],\s*exigirContaLiberada,?\s*\)/)
  if (uso < 0) throw new Error('a montagem de `exigirContaLiberada` não foi encontrada em app.ts')
  const inicio = fonte.lastIndexOf('app.use(', uso)
  const m = [fonte.slice(inicio, uso), fonte.slice(fonte.indexOf('[', inicio) + 1, uso)]
  return Array.from(m[1].matchAll(/['"`](\/api\/[a-z-]+)['"`]/g), (x) => x[1])
}

describe('exigirContaLiberada nos mounts privados', () => {
  it('a leitura do app.ts achou o portão com um número plausível de mounts', () => {
    expect(mountsDoPortao().length).toBeGreaterThanOrEqual(10)
  })

  it('todo mount privado está no portão ou na lista com a razão', () => {
    const portao = mountsDoPortao()
    const faltando = ROUTERS_PRIVADOS.map(([caminho]) => caminho).filter(
      (c) => !portao.includes(c) && !(c in FORA_DO_PORTAO),
    )
    expect(faltando, 'mount privado sem `exigirContaLiberada` em server/http/app.ts').toEqual([])
  })

  it('a lista de exceções não cita mount que está no portão ou que não existe', () => {
    const portao = mountsDoPortao()
    const privados = ROUTERS_PRIVADOS.map(([c]) => c)
    for (const c of Object.keys(FORA_DO_PORTAO)) {
      expect(portao, `${c} está no portão: apague a exceção`).not.toContain(c)
      expect(privados, `${c} não é mais mount privado`).toContain(c)
    }
  })

  it('/api/leitura está no portão (o achado de 26/10/2026)', () => {
    expect(mountsDoPortao()).toContain('/api/leitura')
  })
})
