/**
 * GAP-002 (auditoria 2026-09-13, provado em openspec/audits/2026-09-13-pre-deploy/evidencias/poc-ssrf.txt).
 *
 * O guard `assertPublicUrl` (server/ai/ssrf.ts) protege o proxy BYOK e o import web contra SSRF.
 * A auditoria provou que ele deixava passar 6 de 8 vetores de destino interno: IPv4 mapeado em IPv6
 * (`::ffff:127.0.0.1` → o servidor normaliza para `::ffff:7f00:1` e o guard não reconhecia o loopback),
 * o endereço de METADADOS da nuvem por essa via (`::ffff:169.254.169.254`), CGNAT `100.64/10`,
 * benchmark `198.18/15` e NAT64 `64:ff9b::/96`.
 *
 * Vetores por IP literal de propósito: sem DNS, o teste é hermético (não depende de rede).
 */
import { describe, expect, it } from 'vitest'

import { assertPublicUrl, ehDestinoBloqueado } from '../../server/ai/ssrf'

const DEVE_BLOQUEAR: Array<[string, string]> = [
  ['http://127.0.0.1:11434', 'loopback IPv4'],
  ['http://169.254.169.254/latest/meta-data/', 'metadata cloud IPv4'],
  ['http://[::ffff:127.0.0.1]', 'IPv4-mapped loopback'],
  ['http://[::ffff:169.254.169.254]', 'IPv4-mapped metadata'],
  ['http://[::ffff:a9fe:a9fe]', 'IPv4-mapped metadata (hex)'],
  ['http://100.100.100.200', 'CGNAT 100.64/10 (metadata Alibaba/Oracle)'],
  ['http://198.18.0.1', 'benchmark 198.18/15'],
  ['http://[64:ff9b::7f00:1]', 'NAT64 → 127.0.0.1'],
]

const DEVE_PERMITIR: Array<[string, string]> = [
  ['https://8.8.8.8', 'IP público'],
  ['https://1.1.1.1', 'IP público'],
]

describe('GAP-002 — guard anti-SSRF cobre IPv4-mapped e faixas internas', () => {
  it.each(DEVE_BLOQUEAR)('bloqueia %s (%s)', async (url) => {
    await expect(assertPublicUrl(url)).rejects.toSatisfy(ehDestinoBloqueado)
  })

  it.each(DEVE_PERMITIR)('permite %s (%s)', async (url) => {
    await expect(assertPublicUrl(url)).resolves.toBeUndefined()
  })
})
