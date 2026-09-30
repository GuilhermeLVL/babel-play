/**
 * (Sem `#!/usr/bin/env node` de propósito: o `vite.config.ts` IMPORTA este módulo, e o empacotador
 * da config põe código antes da primeira linha — com o shebang lá, a config não carrega.)
 *
 * GARANTE O BERGAMOT NO `public/` — o motor (WASM + cola) e os modelos pt→en, servidos do PRÓPRIO
 * domínio (A9b do plano "Grátis sem travar").
 *
 * POR QUE O BUILD BAIXA, e não o navegador. Os modelos moram no bucket público da Mozilla
 * (`mozilla/translations`, GCS), que só manda CORS para `localhost` — conferido em 29/09/2026: da
 * nossa origem, o `fetch` do navegador é barrado. E o R2 do dono ainda não está ativo. Então o
 * build baixa os três `.gz` do par, CONFERE o sha256 de cada um (fixado em
 * `src/gateway/adapters/modelosDoBergamot.json`, a mesma fonte que o app lê) e os deixa em
 * `public/modelos/bergamot/<par>/<execução>/`. O `.gz` do modelo tem 22,7 MB — abaixo do teto de
 * 25 MiB por arquivo do Cloudflare Pages —, e é servido como está: o worker descomprime com
 * `DecompressionStream`. Nada disto é versionado (`.gitignore`); o caminho tem o id da execução de
 * treino, então o cache pode ser `immutable` (`public/_headers`, `server/http/estaticos.ts`).
 *
 * O MOTOR vem do pacote instalado (`@browsermt/bergamot-translator`, MPL-2.0), conferido pelo
 * sha256 contra o medido na bancada: o `.wasm` é copiado; a cola do Emscripten
 * (`bergamot-translator-worker.js`, um script clássico) vira MÓDULO ES — o worker do app é módulo,
 * e `importScripts` não existe lá; a CSP não deixa `eval`. O embrulho troca UMA linha
 * (`var global_object = this;` → `globalThis`): no módulo o código é estrito, e o `this` de uma
 * chamada solta é `undefined` — a cola publicaria as funções do WASM em lugar nenhum.
 *
 * Chamado pelo `vite.config.ts` ao montar a configuração (dev e build, como o ORT em
 * `copiar-assets-runtime.mjs`) e pelo Dockerfile. IDEMPOTENTE: arquivo no lugar com o hash certo
 * não é baixado de novo. SEM REDE NÃO DERRUBA NADA: avisa, e o build sai sem oferecer o Bergamot
 * (`__BERGAMOT_PT_EN__` falso) — o app segue no opus-mt, sem prometer um download que não existe.
 *
 *   node scripts/baixar-modelos-bergamot.mjs            # garante (baixa o que falta)
 *   BERGAMOT_BAIXAR=0 node scripts/…                     # pula (CI que não precisa do motor)
 *   node scripts/baixar-modelos-bergamot.mjs --exigir   # sai 1 se algo faltar
 */
/* global AbortSignal */
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
/** A pasta que o Vite copia para o `dist`: `/modelos/bergamot/…` no navegador. */
export const DESTINO = join(RAIZ, 'public', 'modelos', 'bergamot')
export const CONFIG = JSON.parse(
  readFileSync(join(RAIZ, 'src', 'gateway', 'adapters', 'modelosDoBergamot.json'), 'utf8'),
)

/** O nome da cola como módulo, o que `bergamotModelo.ts` (`planoDeCarga`) pede. */
export const COLA_MJS = 'bergamot-translator-worker.mjs'

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

/** O arquivo em disco é exatamente o esperado (tamanho e sha256)? */
export function arquivoConfere(caminho, { bytes, sha256: esperado }) {
  try {
    if (!existsSync(caminho) || statSync(caminho).size !== bytes) return false
    return sha256(readFileSync(caminho)) === esperado
  } catch {
    return false
  }
}

/**
 * Garante UM arquivo: se já está no lugar e confere, nada; senão baixa e só grava se o sha256
 * conferir — primeiro num `.parcial`, depois o `rename` (o que o Vite copia nunca é meio arquivo).
 * Um arquivo errado que estava no lugar SAI, mesmo que o download novo falhe: melhor não oferecer
 * o Bergamot do que servir um modelo que não confere. Nunca lança.
 */
export async function garantirArquivo({ url, destino, bytes, sha256: esperado, buscar = fetch, tempoMs = 180_000 }) {
  if (arquivoConfere(destino, { bytes, sha256: esperado })) return { estado: 'ja-existia' }
  rmSync(destino, { force: true })
  const parcial = `${destino}.parcial`
  try {
    const r = await buscar(url, { signal: AbortSignal.timeout(tempoMs) })
    if (!r.ok) return { estado: 'falhou', motivo: `HTTP ${r.status} em ${url}` }
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length !== bytes) return { estado: 'falhou', motivo: `tamanho ${buf.length} ≠ ${bytes} em ${url}` }
    const hash = sha256(buf)
    if (hash !== esperado) return { estado: 'falhou', motivo: `sha256 não confere em ${url} (${hash})` }
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(parcial, buf)
    renameSync(parcial, destino)
    return { estado: 'baixado' }
  } catch (e) {
    rmSync(parcial, { force: true })
    return { estado: 'falhou', motivo: String(e?.cause?.message ?? e?.message ?? e) }
  }
}

const ALVO_DO_REMENDO = 'var global_object = this;'

/**
 * A cola do Emscripten como MÓDULO ES: `export default function montarModulo(Module) { … }`. Dentro
 * da função, o `var Module = typeof Module != "undefined" ? Module : {}` da cola pega o parâmetro —
 * é assim que o worker entrega o `instantiateWasm` (o gemm) e o `onRuntimeInitialized`. `null` se o
 * ponto do remendo não aparecer exatamente uma vez (outra versão do pacote): gerar às cegas daria um
 * motor que não sobe.
 */
export function colaComoModulo(fonte, versao = CONFIG.motor.versao) {
  if (fonte.split(ALVO_DO_REMENDO).length !== 2) return null
  const corpo = fonte.replace(ALVO_DO_REMENDO, 'var global_object = globalThis;')
  return `/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of
 * the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * \`worker/bergamot-translator-worker.js\` de ${CONFIG.motor.pacote}@${versao} (${CONFIG.motor.fonte}),
 * embrulhado como módulo ES pelo Babel Play (scripts/baixar-modelos-bergamot.mjs). Única mudança no
 * código original: \`global_object\` passou de \`this\` a \`globalThis\` (em módulo o código é estrito, e o
 * \`this\` de uma chamada solta é \`undefined\`). O código-fonte do .wasm ao lado:
 * ${CONFIG.motor.fonte} (tag v${versao}).
 */
export default function montarModulo(Module) {
${corpo}
return Module;
}
`
}

/** Onde cada coisa mora no `public/` (e, pelo mesmo caminho, no navegador). */
export function caminhosDoBergamot(raiz = DESTINO, config = CONFIG) {
  const motor = join(raiz, `motor-${config.motor.versao}`)
  return {
    motor: { dir: motor, wasm: join(motor, config.motor.wasm.nome), cola: join(motor, COLA_MJS) },
    pares: Object.fromEntries(
      Object.entries(config.pares).map(([par, p]) => [
        par,
        {
          dir: join(raiz, par, p.execucao),
          arquivos: Object.values(p.arquivos).map((a) => ({
            url: `${config.origem}${p.caminhoNaOrigem}${a.nome}`,
            destino: join(raiz, par, p.execucao, a.nome),
            bytes: a.bytes,
            sha256: a.sha256,
          })),
        },
      ]),
    ),
  }
}

/**
 * O build pode oferecer o Bergamot? Motor gerado e — salvo quando os modelos vêm de um CDN
 * (`VITE_BERGAMOT_MODELOS_URL`, `exigirModelos: false`) — os arquivos de cada par no lugar, no
 * tamanho certo. O hash foi conferido ao gravar (e só o `rename` depois do hash põe o arquivo lá).
 */
export function bergamotNoPublic({ raiz = DESTINO, config = CONFIG, exigirModelos = true } = {}) {
  const c = caminhosDoBergamot(raiz, config)
  if (!existsSync(c.motor.wasm) || !existsSync(c.motor.cola)) return false
  if (!exigirModelos) return true
  return Object.values(c.pares).every((p) =>
    p.arquivos.every((a) => existsSync(a.destino) && statSync(a.destino).size === a.bytes),
  )
}

/** Tira do `public/` execuções e motores de versões anteriores: iriam para o dist (e o deploy) à toa. */
export function limparVersoesAntigas({ raiz = DESTINO, config = CONFIG } = {}) {
  if (!existsSync(raiz)) return
  for (const nome of readdirSync(raiz)) {
    const caminho = join(raiz, nome)
    if (!statSync(caminho).isDirectory()) continue
    if (nome.startsWith('motor-')) {
      if (nome !== `motor-${config.motor.versao}`) rmSync(caminho, { recursive: true, force: true })
      continue
    }
    const par = config.pares[nome]
    if (!par) {
      rmSync(caminho, { recursive: true, force: true })
      continue
    }
    for (const execucao of readdirSync(caminho))
      if (execucao !== par.execucao) rmSync(join(caminho, execucao), { recursive: true, force: true })
  }
}

/** O motor do pacote instalado. `require.resolve` literal: é o que o knip reconhece como uso do pacote. */
function motorDoPacote(config) {
  const require = createRequire(import.meta.url)
  return {
    wasm: require.resolve('@browsermt/bergamot-translator/worker/bergamot-translator-worker.wasm'),
    cola: require.resolve('@browsermt/bergamot-translator/worker/bergamot-translator-worker.js'),
    sha256Wasm: config.motor.wasm.sha256,
    sha256Cola: config.motor.cola.sha256,
  }
}

function garantirMotor(c, fonte, config) {
  try {
    const wasm = readFileSync(fonte.wasm)
    const cola = readFileSync(fonte.cola)
    if (sha256(wasm) !== fonte.sha256Wasm || sha256(cola) !== fonte.sha256Cola)
      return `o ${config.motor.pacote} instalado não é o ${config.motor.versao} medido (sha256 diferente)`
    const modulo = colaComoModulo(cola.toString('utf8'), config.motor.versao)
    if (!modulo) return 'a cola do Emscripten mudou: o remendo de `global_object` não se aplica'
    mkdirSync(c.motor.dir, { recursive: true })
    if (!arquivoConfere(c.motor.wasm, { bytes: wasm.length, sha256: fonte.sha256Wasm }))
      copyFileSync(fonte.wasm, c.motor.wasm)
    if (!existsSync(c.motor.cola) || readFileSync(c.motor.cola, 'utf8') !== modulo) writeFileSync(c.motor.cola, modulo)
    return null
  } catch (e) {
    return `motor indisponível: ${String(e?.message ?? e)}`
  }
}

function leiaMe(config) {
  const pares = Object.entries(config.pares)
    .map(([par, p]) => `  - ${par}: ${config.origem}${p.caminhoNaOrigem} (execução ${p.execucao})`)
    .join('\n')
  return `Bergamot no Babel Play — motor e modelos de tradução no aparelho (gerado por scripts/baixar-modelos-bergamot.mjs)

Motor: ${config.motor.pacote}@${config.motor.versao}, ${config.motor.licenca}. Código-fonte: ${config.motor.fonte}
Modelos: Mozilla translations (${config.registro}), ${config.licencaDosModelos}. Arquivos originais:
${pares}

Licença MPL-2.0: https://mozilla.org/MPL/2.0/
`
}

/**
 * Garante tudo. Devolve o que ficou pronto (`modelos`, `motor`); nunca lança. `buscar`, `raiz`,
 * `config` e `motor` são injetáveis para o teste.
 *
 * @param {{
 *   raiz?: string,
 *   config?: typeof CONFIG,
 *   motor?: { wasm: string, cola: string, sha256Wasm: string, sha256Cola: string },
 *   buscar?: (url: string, init?: RequestInit) => Promise<Response>,
 *   log?: (s: string) => void,
 *   avisar?: (s: string) => void,
 * }} [opcoes]
 */
export async function garantirBergamot({
  raiz = DESTINO,
  config = CONFIG,
  motor,
  buscar = fetch,
  log = console.log,
  avisar = console.warn,
} = {}) {
  const c = caminhosDoBergamot(raiz, config)
  limparVersoesAntigas({ raiz, config })
  const falhaDoMotor = garantirMotor(c, motor ?? motorDoPacote(config), config)
  if (falhaDoMotor) avisar(`[bergamot] ${falhaDoMotor} — o app segue no opus-mt`)

  const contagem = { baixado: 0, 'ja-existia': 0, falhou: 0 }
  const falhas = []
  for (const par of Object.values(c.pares)) {
    for (const a of par.arquivos) {
      const r = await garantirArquivo({ ...a, buscar })
      contagem[r.estado] += 1
      if (r.estado === 'falhou') falhas.push(r.motivo)
    }
  }
  if (!falhaDoMotor) writeFileSync(join(raiz, 'LEIA-ME.txt'), leiaMe(config))
  log(
    `[bergamot] modelos: ${contagem.baixado} baixado(s), ${contagem['ja-existia']} já no lugar` +
      (contagem.falhou ? `, ${contagem.falhou} com falha` : '') +
      ` → public/modelos/bergamot/`,
  )
  if (falhas.length)
    avisar(`[bergamot] SEM os modelos do Bergamot (o pt→en fica no opus-mt neste build):\n  - ${falhas.join('\n  - ')}`)
  return { modelos: falhas.length === 0, motor: !falhaDoMotor }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.BERGAMOT_BAIXAR === '0') {
    console.log('[bergamot] BERGAMOT_BAIXAR=0: pulado (o build não oferece o Bergamot)')
  } else {
    const r = await garantirBergamot()
    if (process.argv.includes('--exigir') && !(r.modelos && r.motor)) process.exit(1)
  }
}
