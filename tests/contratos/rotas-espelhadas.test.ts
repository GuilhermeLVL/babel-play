// @vitest-environment jsdom
/**
 * TODA ROTA QUE O CLIENTE CHAMA OU É ESPELHADA SEM CONTA, OU TEM UM MOTIVO ESCRITO.
 *
 * A auditoria de 2026-09-07 pedia uma TABELA "rota → paridade | 501 explicado" para os módulos de
 * dados. Uma tabela num documento responde a pergunta uma vez e envelhece na primeira rota nova —
 * foi exatamente assim que seis rotas ficaram fora do espelho sem ninguém perceber, e a tela de
 * Progresso passou meses vazia para quem estuda sem conta.
 *
 * Este arquivo é a tabela, escrita de um jeito que não envelhece: ele LÊ as chamadas do cliente e
 * cobra que cada uma esteja num dos dois lados. Uma rota nova que ninguém espelhou nem justificou
 * derruba o CI no dia em que é escrita.
 *
 * O QUE ELE NÃO FAZ, e é deliberado: ele não compara RESPOSTAS. Isso é `sessoes.test.ts` (forma) e
 * `economia.test.ts` (valores), que exercitam as duas pontas de verdade. Aqui a pergunta é anterior
 * e mais barata: existe alguém do outro lado?
 */
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { servidorEfemero, CODIGO_EXIGE_CONTA } from '../../src/data/efemero/servidor'

/**
 * AS ROTAS QUE O MODO SEM CONTA NÃO ESPELHA — cada uma com o motivo, e o motivo é sempre o mesmo
 * tipo de coisa: ela depende de algo que só existe no servidor (chave de IA, cobrança, arquivo
 * pesado, um dispositivo da máquina). Uma entrada aqui é uma DECISÃO, não uma pendência.
 */
/* `POST /api/ai/llm/chat/completions` NÃO entra aqui, e a ausência é o achado: ela existe no
   Express e NENHUM código do cliente a chama. Rota órfã não é assunto de paridade — é de
   `codigo-morto-removido`, e a terceira asserção deste arquivo é quem impediu que ela ficasse
   escondida atrás de uma justificativa. */
const SO_COM_CONTA: Record<string, string> = {
  '/api/ai': 'gateway de IA: transcrição, tradução e LLM dependem de chave, cota e plano do servidor. A credencial é cifrada lá, nunca no navegador',
  '/api/gemini': 'o tutor depende da chave do servidor',
  '/api/import': 'importar exige o servidor: yt-dlp, busca de página (CORS e SSRF), extração de PDF/DOCX e um .apkg de dezenas de MB',
  '/api/anki': 'o acervo Anki nasce da importação, que não existe sem conta',
  '/api/images': 'proxy de imagens: o cliente já cai direto no Openverse quando ele falha',
  '/api/me': 'a conta é justamente o que não existe aqui — inclusive a cota e a exportação',
  '/api/billing': 'moeda comprada com dinheiro e assinatura: nascem e morrem no servidor',
  '/api/erros-do-cliente': 'diário de erros do servidor; sem conta o erro fica no console',
  '/api/sessions/utterances/relabel': 'reetiquetagem em lote: escrita cruzada de sessões',
  '/api/vocab/relabel': 'idem, no acervo',
  '/api/vocab/para-jogo': 'NÃO precisa de espelho: `compor` cai em `composicaoLocal`, a MESMA ordenação do core rodando no cliente. Espelhá-la criaria uma segunda verdade onde hoje há uma',
  '/api/rank': 'placar público: fala com o servidor real por `fetch` cru, fora do funil, com e sem conta',
  '/api/audio': 'captura do áudio do sistema por WASAPI: PASSA DIRETO (está em `PASSAM_DIRETO`) porque depende de um dispositivo da máquina, e só existe no self-host',
}

/**
 * Toda rota `/api/...` citada em `src/` — o cliente inteiro, e não só o funil.
 *
 * Varrer só `src/data` deixaria de fora quatro rotas reais: a sonda de STT (numa tela), o proxy de
 * LLM e o tutor (no gateway) e o `para-jogo` (no core). Uma varredura que não vê a chamada não
 * consegue cobrar por ela.
 *
 * O próprio servidor efêmero fica FORA: os caminhos que ele cita são a tabela de espelho, não
 * chamadas — incluí-lo faria o arquivo se justificar sozinho.
 */
function rotasChamadasPeloCliente(): string[] {
  const arquivos: string[] = []
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, nome.name)
      if (nome.isDirectory()) { varrer(caminho); continue }
      if (!/\.tsx?$/.test(nome.name)) continue
      if (caminho.split(String.fromCharCode(92)).join('/').endsWith('src/data/efemero/servidor.ts')) continue
      arquivos.push(caminho)
    }
  }
  varrer('src')
  const achadas = new Set<string>()
  for (const f of arquivos) {
    const codigo = readFileSync(f, 'utf8')
    /* Só o prefixo estável da rota: o que vem depois costuma ser `${id}` ou query, e o que se
       quer saber é se AQUELA rota tem alguém do outro lado. */
    for (const m of codigo.matchAll(/['"`](\/api\/[A-Za-z0-9\-_/]*)/g)) {
      const bruto = m[1].replace(/\/$/, '')
      if (bruto === '/api') continue
      achadas.add(bruto)
    }
  }
  return [...achadas].sort()
}

/**
 * A rota está na tabela do servidor efêmero?
 *
 * Tenta os quatro métodos, e basta UM responder algo que não seja "exige conta": a pergunta é se
 * existe alguém do outro lado daquele caminho, não se todos os verbos existem. Testar só GET diria
 * que `/api/vocab/bulk-add` (que é POST) está fora do espelho.
 */
async function espelhada(rota: string): Promise<boolean> {
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    const res = await servidorEfemero(rota, { method, body: method === 'GET' ? undefined : '{}' })
    if (res.status !== 501) return true
    const corpo = await res.json().catch(() => ({} as Record<string, unknown>))
    if ((corpo as { codigo?: string }).codigo !== CODIGO_EXIGE_CONTA) return true
  }
  return false
}

function justificada(rota: string): boolean {
  return Object.keys(SO_COM_CONTA).some((prefixo) => rota === prefixo || rota.startsWith(`${prefixo}/`))
}

describe('paridade de rotas entre o servidor real e o modo sem conta', () => {
  const rotas = rotasChamadasPeloCliente()

  it('a varredura encontra as chamadas (não passou por vazio)', () => {
    expect(rotas.length).toBeGreaterThan(15)
    expect(rotas).toContain('/api/sessions')
    expect(rotas).toContain('/api/vocab')
  })

  it('cada rota chamada pelo cliente é espelhada OU tem motivo escrito', async () => {
    const orfas: string[] = []
    for (const rota of rotas) {
      if (justificada(rota)) continue
      if (await espelhada(rota)) continue
      orfas.push(rota)
    }
    expect(orfas, `sem espelho e sem motivo: ${orfas.join(', ')}`).toEqual([])
  })

  it('a lista de motivos não guarda rota que ninguém chama mais', () => {
    /* O outro lado da mesma disciplina: uma justificativa para uma rota que saiu do cliente é
       documentação que sobreviveu ao próprio assunto. */
    const mortos = Object.keys(SO_COM_CONTA).filter(
      (prefixo) => !rotas.some((r) => r === prefixo || r.startsWith(`${prefixo}/`)),
    )
    expect(mortos, `motivo escrito para rota que ninguém chama: ${mortos.join(', ')}`).toEqual([])
  })

  it('as seis rotas do achado A25 passaram a ter resposta sem conta', async () => {
    /* A auditoria listou exatamente estas como fora do espelho. `para-jogo` é a exceção que ficou,
       e o motivo está na tabela acima — ela não precisa de espelho, precisa de não ter. */
    for (const rota of [
      '/api/metrics/xp',
      '/api/vocab/pagina',
      '/api/vocab/inicio-da-contagem',
      '/api/sessions/utterances/all',
    ]) {
      expect(await espelhada(rota), rota).toBe(true)
    }
    const del = await servidorEfemero('/api/vocab/nao-existe', { method: 'DELETE' })
    /* 404 e não 501: a rota EXISTE, o cartão é que não. */
    expect(del.status).toBe(404)
  })
})
