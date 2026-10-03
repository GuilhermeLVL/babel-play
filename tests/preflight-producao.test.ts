/**
 * O PREFLIGHT DE PRODUÇÃO (`npm run preflight -- <arquivo>`): diz, SÓ PELOS NOMES, o que bloqueia o
 * boot, o que avisa e o que está ok no arquivo de variáveis do deploy.
 *
 * O arquivo falso é gerado na hora num diretório temporário FORA do repositório. Os valores aqui são
 * aleatórios e o teste confere que nenhum aparece na saída.
 */
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { conferirProducao, lerVariaveis, resumir } from '../server/lib/preflightProducao'

const aleatorio = (n = 24) => randomBytes(n).toString('hex')
const RAIZ = path.resolve(__dirname, '..')

/** Um arquivo de produção COMPLETO e correto (cadastro e venda fechados, Asaas de produção). */
function completo(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    SECRET_KEY: aleatorio(),
    ORIGEM_SEGREDO: aleatorio(),
    TRUST_PROXY: '2',
    AUTH_REQUIRED: '1',
    SUPABASE_URL: 'https://abcdefgh.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: aleatorio(),
    VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co',
    VITE_SUPABASE_ANON_KEY: aleatorio(),
    VITE_TURNSTILE_SITE_KEY: aleatorio(8),
    ASAAS_API_KEY: `$aact_prod_${aleatorio()}`,
    ASAAS_BASE_URL: 'https://api.asaas.com/v3',
    ASAAS_WEBHOOK_TOKEN: aleatorio(),
    SIGNUP_ENABLED: '0',
    CHECKOUT_ENABLED: '0',
    S3_ENDPOINT: 'https://conta.r2.cloudflarestorage.com',
    S3_BUCKET: 'babel-midia',
    S3_ACCESS_KEY_ID: aleatorio(8),
    S3_SECRET_ACCESS_KEY: aleatorio(),
    BACKUP_DIARIO: '1',
    BACKUP_HEARTBEAT_URL: 'https://heartbeat.exemplo-real.io/abc'.replace('exemplo-real', 'monitor'),
    LITESTREAM_BUCKET: 'babel-replica',
    LITESTREAM_ENDPOINT: 'https://conta.r2.cloudflarestorage.com',
    LITESTREAM_ACCESS_KEY_ID: aleatorio(8),
    LITESTREAM_SECRET_ACCESS_KEY: aleatorio(),
    LLM_API_KEY: aleatorio(),
    LLM_BASE_URL: 'https://api.provedor.io/v1',
    LLM_MODEL: 'modelo-a',
    LLM_RESERVA_API_KEY: aleatorio(),
    LLM_RESERVA_BASE_URL: 'https://api.reserva.io/v1',
    LLM_RESERVA_MODEL: 'modelo-b',
    GROQ_API_KEY: aleatorio(),
    AI_BUDGET_USD_MONTH: '40',
    AI_BUDGET_USD_DAY: '3',
    RESEND_API_KEY: aleatorio(),
    EMAIL_REMETENTE: 'Babel Play <nao-responda@babelplay.com.br>',
    SENTRY_DSN: 'https://chave@o1.ingest.sentry.io/1',
    APP_URL: 'https://babelplay.com.br',
  }
}

const nivelDe = (achados: ReturnType<typeof conferirProducao>, nome: string) =>
  achados.filter((a) => a.nome.split(', ').includes(nome)).map((a) => a.nivel)

describe('conferirProducao: o arquivo completo', () => {
  it('não bloqueia nada, e cadastro/venda fechados saem como OK', () => {
    const achados = conferirProducao(completo())
    expect(achados.filter((a) => a.nivel === 'BLOQUEIA')).toEqual([])
    expect(resumir(achados).podeSubir).toBe(true)
    expect(nivelDe(achados, 'SIGNUP_ENABLED')).toEqual(['OK'])
    expect(nivelDe(achados, 'CHECKOUT_ENABLED')).toEqual(['OK'])
  })

  it('nenhum valor do arquivo aparece nos achados (só nomes e textos fixos)', () => {
    const v = completo()
    const texto = JSON.stringify(conferirProducao(v))
    for (const [nome, valor] of Object.entries(v)) {
      if (valor.length >= 16) expect(texto, nome).not.toContain(valor)
    }
  })
})

describe('conferirProducao: o que BLOQUEIA', () => {
  it('SECRET_KEY ausente ou curta', () => {
    const sem = completo()
    delete sem.SECRET_KEY
    expect(nivelDe(conferirProducao(sem), 'SECRET_KEY')).toContain('BLOQUEIA')
    const curta = { ...completo(), SECRET_KEY: 'curta-demais' }
    expect(nivelDe(conferirProducao(curta), 'SECRET_KEY')).toEqual(['BLOQUEIA'])
  })

  it('AUTH_REQUIRED=0 em produção (trava do boot do servidor)', () => {
    expect(nivelDe(conferirProducao({ ...completo(), AUTH_REQUIRED: '0' }), 'AUTH_REQUIRED')).toEqual(['BLOQUEIA'])
  })

  it('TRUST_PROXY ausente (trava do boot do servidor)', () => {
    const v = completo()
    delete v.TRUST_PROXY
    expect(nivelDe(conferirProducao(v), 'TRUST_PROXY')).toEqual(['BLOQUEIA'])
  })

  it('/metrics ligado sem token nem porta interna (trava do boot do servidor)', () => {
    expect(nivelDe(conferirProducao({ ...completo(), METRICS_ENABLED: '1' }), 'METRICS_ENABLED')).toEqual(['BLOQUEIA'])
  })

  it('registro de IA inválido, sem repetir o conteúdo do JSON', () => {
    const lixo = `{"segredo-que-nao-pode-sair":${aleatorio(8)}`
    const achados = conferirProducao({ ...completo(), IA_PROVEDORES: lixo })
    expect(nivelDe(achados, 'IA_PROVEDORES')).toEqual(['BLOQUEIA'])
    expect(JSON.stringify(achados)).not.toContain('segredo-que-nao-pode-sair')
  })

  it('SUPABASE_URL ausente no modo público', () => {
    const v = completo()
    delete v.SUPABASE_URL
    expect(nivelDe(conferirProducao(v), 'SUPABASE_URL')).toContain('BLOQUEIA')
  })

  it('SUPABASE_URL e VITE_SUPABASE_URL de projetos diferentes', () => {
    const achados = conferirProducao({ ...completo(), VITE_SUPABASE_URL: 'https://outroprojeto.supabase.co' })
    expect(nivelDe(achados, 'VITE_SUPABASE_URL')).toContain('BLOQUEIA')
  })

  it('ASAAS_WEBHOOK_TOKEN ausente com a chave do Asaas presente', () => {
    const v = completo()
    delete v.ASAAS_WEBHOOK_TOKEN
    expect(nivelDe(conferirProducao(v), 'ASAAS_WEBHOOK_TOKEN')).toEqual(['BLOQUEIA'])
  })

  it('chave do sandbox com o endereço de produção', () => {
    const achados = conferirProducao({ ...completo(), ASAAS_API_KEY: `$aact_hmlg_${aleatorio()}` })
    expect(nivelDe(achados, 'ASAAS_API_KEY')).toContain('BLOQUEIA')
  })

  it('valor com cara de exemplo (troque-, exemplo, changeme), citando só o NOME', () => {
    const v = { ...completo(), ORIGEM_SEGREDO: 'troque-por-um-segredo', RESEND_API_KEY: 'changeme' }
    const achados = conferirProducao(v)
    const ex = achados.find((a) => a.nivel === 'BLOQUEIA' && a.texto.includes('exemplo'))
    expect(ex?.nome).toBe('ORIGEM_SEGREDO, RESEND_API_KEY')
    expect(JSON.stringify(achados)).not.toContain('troque-por-um-segredo')
  })

  it('NODE_ENV declarado como outra coisa', () => {
    expect(nivelDe(conferirProducao({ ...completo(), NODE_ENV: 'development' }), 'NODE_ENV')).toEqual(['BLOQUEIA'])
  })

  it('APP_URL apontando para o próprio computador', () => {
    expect(nivelDe(conferirProducao({ ...completo(), APP_URL: 'http://localhost:3000' }), 'APP_URL')).toEqual([
      'BLOQUEIA',
    ])
  })
})

describe('conferirProducao: o que AVISA', () => {
  it('ASAAS_BASE_URL no sandbox, ou ausente (o padrão do servidor é o sandbox)', () => {
    const sandbox = {
      ...completo(),
      ASAAS_BASE_URL: 'https://api-sandbox.asaas.com/v3',
      ASAAS_API_KEY: `$aact_hmlg_${aleatorio()}`,
    }
    const a = conferirProducao(sandbox)
    expect(nivelDe(a, 'ASAAS_BASE_URL')).toEqual(['AVISA'])
    expect(a.find((x) => x.nome === 'ASAAS_BASE_URL')?.texto).toMatch(/sandbox em produção\?/)
    expect(resumir(a).podeSubir).toBe(true)

    const ausente = completo()
    delete ausente.ASAAS_BASE_URL
    expect(nivelDe(conferirProducao(ausente), 'ASAAS_BASE_URL')).toEqual(['AVISA'])
  })

  it('SIGNUP_ENABLED e CHECKOUT_ENABLED abertos (ausentes ou =1) avisam que o primeiro deploy é fechado', () => {
    const v = completo()
    delete v.SIGNUP_ENABLED
    v.CHECKOUT_ENABLED = '1'
    const a = conferirProducao(v)
    expect(nivelDe(a, 'SIGNUP_ENABLED')).toEqual(['AVISA'])
    expect(nivelDe(a, 'CHECKOUT_ENABLED')).toEqual(['AVISA'])
    expect(a.find((x) => x.nome === 'SIGNUP_ENABLED')?.texto).toMatch(/ABERTO/)
  })

  it('capacidades ausentes: S3, Litestream, LLM, reserva, orçamento, e-mail, Sentry, captcha', () => {
    const v = completo()
    for (const n of Object.keys(v)) {
      if (/^(S3_|LITESTREAM_|LLM_|AI_BUDGET_|RESEND_|EMAIL_|SENTRY_|VITE_TURNSTILE|GROQ_)/.test(n)) delete v[n]
    }
    const a = conferirProducao(v)
    expect(resumir(a).podeSubir).toBe(true)
    for (const nome of [
      'S3_*',
      'LITESTREAM_*',
      'LLM_*',
      'LLM_RESERVA_*',
      'AI_BUDGET_USD_MONTH',
      'AI_BUDGET_USD_DAY',
      'RESEND_API_KEY',
      'SENTRY_DSN',
      'VITE_TURNSTILE_SITE_KEY',
    ]) {
      expect(nivelDe(a, nome), nome).toContain('AVISA')
    }
  })

  it('grupo S3 incompleto diz o que falta, só pelo nome', () => {
    const v = completo()
    delete v.S3_BUCKET
    const a = conferirProducao(v)
    expect(a.find((x) => x.nome === 'S3_*')?.texto).toContain('S3_BUCKET')
  })

  it('SUPABASE_SERVICE_ROLE_KEY ausente: avisa uma vez só, com o motivo da LGPD', () => {
    const v = completo()
    delete v.SUPABASE_SERVICE_ROLE_KEY
    const a = conferirProducao(v).filter((x) => x.nome === 'SUPABASE_SERVICE_ROLE_KEY')
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ nivel: 'AVISA' })
    expect(a[0]!.texto).toMatch(/LGPD/)
  })
})

describe('lerVariaveis', () => {
  it('lê o formato .env (aspas, comentários, linhas em branco)', () => {
    const v = lerVariaveis('# c\n\nA=1\nB="dois três"\nexport C=3\n')
    expect(v).toMatchObject({ A: '1', B: 'dois três' })
  })
})

describe('o comando (npm run preflight -- <arquivo>)', () => {
  const pasta = mkdtempSync(path.join(tmpdir(), 'preflight-'))
  afterAll(() => rmSync(pasta, { recursive: true, force: true }))

  const rodar = (...args: string[]) =>
    spawnSync(process.execPath, [path.join(RAIZ, 'scripts', 'preflight-producao.mjs'), ...args], {
      cwd: RAIZ,
      encoding: 'utf8',
      timeout: 60_000,
    })
  const arquivo = (nome: string, v: Record<string, string>) => {
    const caminho = path.join(pasta, nome)
    writeFileSync(
      caminho,
      Object.entries(v)
        .map(([k, x]) => `${k}=${x}`)
        .join('\n'),
    )
    return caminho
  }

  it('arquivo completo: sai 0, fala por nomes e não imprime nenhum valor', () => {
    const v = completo()
    const r = rodar(arquivo('ok.env', v))
    expect(r.status, r.stdout + r.stderr).toBe(0)
    expect(r.stdout).toMatch(/nada bloqueia o boot/)
    expect(r.stdout).toContain('SECRET_KEY')
    for (const valor of Object.values(v)) if (valor.length >= 16) expect(r.stdout + r.stderr).not.toContain(valor)
  })

  it('arquivo com SECRET_KEY curta: sai 1 e aponta a variável, sem o valor', () => {
    const v = { ...completo(), SECRET_KEY: 'curta-demais-123' }
    const r = rodar(arquivo('ruim.env', v))
    expect(r.status).toBe(1)
    expect(r.stdout).toMatch(/\[BLOQUEIA\] SECRET_KEY/)
    expect(r.stdout).toMatch(/NÃO SUBA/)
    expect(r.stdout + r.stderr).not.toContain('curta-demais-123')
  })

  it('caminho DENTRO do repositório: recusa (sai 2) sem sequer abrir o arquivo', () => {
    const r = rodar(path.join(RAIZ, '.env.producao-que-nao-existe'))
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/RECUSADO/)
  })

  it('sem argumento ou arquivo inexistente: sai 2 com o uso', () => {
    expect(rodar().status).toBe(2)
    expect(rodar(path.join(pasta, 'nao-existe.env')).status).toBe(2)
  })
})
