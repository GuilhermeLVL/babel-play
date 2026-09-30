/**
 * Inventário de configuração (F14-02).
 *
 * Estes casos passam o ambiente POR PARÂMETRO em vez de mexer em `process.env` global — e isso é
 * deliberado. `tests/integration/audio-dir-config.test.ts` precisa de `vi.resetModules()` e de um
 * reimport do módulo para reavaliar o env, o que o torna sensível a ordem e a carga da máquina.
 * Uma função pura não tem esse problema: o teste diz o que entra e confere o que sai.
 */
import { describe, expect, it } from 'vitest'

import {
  adminDoSupabase,
  conferirConfiguracao,
  sttDeNuvemConfigurado,
  sttGerenciadoDoEnv,
  VARIAVEIS,
} from '../../server/lib/config'

/** Ambiente mínimo de um deploy público bem configurado. */
const PUBLICO_COMPLETO = {
  SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'chave-de-servico',
  SECRET_KEY: 'chave-de-cifra-dos-segredos',
} as NodeJS.ProcessEnv

describe('inventário de configuração', () => {
  it('declara todas as variáveis com nome único e propósito escrito', () => {
    const nomes = VARIAVEIS.map((v) => v.nome)
    expect(new Set(nomes).size).toBe(nomes.length)
    for (const v of VARIAVEIS) {
      expect(v.paraQue.trim().length).toBeGreaterThan(10)
      expect(['sempre', 'modo-publico', 'producao', 'opcional']).toContain(v.exigencia)
    }
  })

  it('modo público completo: nada ausente', () => {
    const r = conferirConfiguracao(PUBLICO_COMPLETO, true)
    expect(r.ok).toBe(true)
    expect(r.faltando).toEqual([])
    expect(r.declaradas).toBe(VARIAVEIS.length)
  })

  it('service role key ausente: aparece em `faltando`, mas NÃO derruba a saúde do serviço', () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omitida, ...semChave } = PUBLICO_COMPLETO
    const r = conferirConfiguracao(semChave as NodeJS.ProcessEnv, true)
    // Nomear importa: "configuração incompleta" não diz a ninguém o que fazer a seguir.
    expect(r.faltando).toContain('SUPABASE_SERVICE_ROLE_KEY')
    /*
     * `ok` continua true de propósito. A primeira versão reprovava aqui, e o efeito foi medido: o
     * container do docker-compose ficou UNHEALTHY por falta desta chave, que não está no
     * .env.docker. Sem ela o que se perde é o desvínculo de login na exclusão de conta — uma
     * capacidade, que a própria rota reporta ao titular. Derrubar o serviço inteiro por isso é
     * trocar um problema pequeno por um grande.
     */
    expect(r.ok).toBe(true)
    expect(r.faltandoCriticas).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('SUPABASE_URL ausente no modo público: reprova, porque a autenticação depende dela', () => {
    const { SUPABASE_URL: _omitida, ...semUrl } = PUBLICO_COMPLETO
    const r = conferirConfiguracao(semUrl as NodeJS.ProcessEnv, true)
    expect(r.ok).toBe(false)
    expect(r.faltandoCriticas).toContain('SUPABASE_URL')
  })

  it('self-host: o que só o modo público exige deixa de ser obrigatório', () => {
    const r = conferirConfiguracao({} as NodeJS.ProcessEnv, false)
    expect(r.ok).toBe(true)
    expect(r.modoPublico).toBe(false)
  })

  it('string vazia conta como ausente — senão `VAR=` passaria por configurada', () => {
    const r = conferirConfiguracao({ ...PUBLICO_COMPLETO, SUPABASE_URL: '   ' }, true)
    expect(r.ok).toBe(false)
    expect(r.faltando).toContain('SUPABASE_URL')
  })
})

describe('acessores que saíram de dentro dos handlers', () => {
  it('STT de nuvem: qualquer uma das duas chaves basta', () => {
    expect(sttDeNuvemConfigurado({ GROQ_API_KEY: 'x' } as NodeJS.ProcessEnv)).toBe(true)
    expect(sttDeNuvemConfigurado({ STT_API_KEY: 'x' } as NodeJS.ProcessEnv)).toBe(true)
    expect(sttDeNuvemConfigurado({} as NodeJS.ProcessEnv)).toBe(false)
  })

  /*
   * B0 (Fase B, 29/09/2026): UMA FONTE SÓ. `sttDeNuvemConfigurado` (lido por `/stt/available`) e o
   * `sttGerenciado` do `sttProxy.ts` (lido pela transcrição) liam o ambiente cada um do seu jeito, e
   * discordavam: o `.env.production.example` configura só `LLM_API_KEY` com a base da Groq — a
   * disponibilidade respondia 200 e a transcrição, 501. Agora as duas saem de `sttGerenciadoDoEnv`.
   */
  it('STT de nuvem: a chave do LLM vale quando o LLM é a Groq (o .env.production.example)', () => {
    const env = { LLM_API_KEY: 'chave-llm-falsa', LLM_BASE_URL: 'https://api.groq.com/openai/v1' } as NodeJS.ProcessEnv
    expect(sttGerenciadoDoEnv(env)).toEqual({
      secret: 'chave-llm-falsa',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'whisper-large-v3-turbo',
    })
    // Sem LLM_BASE_URL o LLM já é a Groq (o padrão de `provedores.ts`): o mesmo vale.
    expect(sttGerenciadoDoEnv({ LLM_API_KEY: 'chave-llm-falsa' } as NodeJS.ProcessEnv)?.secret).toBe('chave-llm-falsa')
    expect(sttDeNuvemConfigurado(env)).toBe(true)
  })

  it('STT de nuvem: a chave de um LLM que NÃO é a Groq não anuncia STT (aquele endereço não tem Whisper garantido)', () => {
    const env = { LLM_API_KEY: 'chave-llm-falsa', LLM_BASE_URL: 'http://llm-falso.local/v1' } as NodeJS.ProcessEnv
    expect(sttGerenciadoDoEnv(env)).toBeNull()
    expect(sttDeNuvemConfigurado(env)).toBe(false)
  })

  it('STT de nuvem: GROQ_API_KEY vazia não esconde a STT_API_KEY (o `??` tratava "" como chave)', () => {
    const env = { GROQ_API_KEY: '', STT_API_KEY: 'chave-stt-falsa', STT_BASE_URL: 'http://203.0.113.20/v1' }
    expect(sttGerenciadoDoEnv(env as NodeJS.ProcessEnv)).toEqual({
      secret: 'chave-stt-falsa',
      baseUrl: 'http://203.0.113.20/v1',
      model: 'whisper-large-v3-turbo',
    })
  })

  it('STT de nuvem: a precedência de antes continua — GROQ_* vence STT_*, e STT_MODEL escolhe o modelo', () => {
    const env = {
      GROQ_API_KEY: 'chave-groq',
      STT_API_KEY: 'chave-stt',
      GROQ_BASE_URL: 'https://groq.exemplo/v1/',
      STT_BASE_URL: 'https://stt.exemplo/v1',
      STT_MODEL: 'whisper-large-v3',
      LLM_API_KEY: 'chave-llm',
    } as NodeJS.ProcessEnv
    expect(sttGerenciadoDoEnv(env)).toEqual({
      secret: 'chave-groq',
      baseUrl: 'https://groq.exemplo/v1',
      model: 'whisper-large-v3',
    })
  })

  it('STT de nuvem: a disponibilidade é exatamente "há configuração", em toda a matriz', () => {
    const matriz: Record<string, string>[] = [
      {},
      { GROQ_API_KEY: 'k' },
      { STT_API_KEY: 'k' },
      { GROQ_API_KEY: '', STT_API_KEY: 'k' },
      { GROQ_API_KEY: '   ' },
      { LLM_API_KEY: 'k' },
      { LLM_API_KEY: 'k', LLM_BASE_URL: 'https://api.groq.com/openai/v1' },
      { LLM_API_KEY: 'k', LLM_BASE_URL: 'https://openrouter.ai/api/v1' },
      { LLM_API_KEY: 'k', GROQ_BASE_URL: 'http://203.0.113.20/v1' },
    ]
    for (const env of matriz) {
      expect(sttDeNuvemConfigurado(env as NodeJS.ProcessEnv), JSON.stringify(env)).toBe(
        sttGerenciadoDoEnv(env as NodeJS.ProcessEnv) !== null,
      )
    }
  })

  it('admin do Supabase: devolve null quando falta qualquer uma das partes', () => {
    expect(adminDoSupabase({ SUPABASE_URL: 'https://p.supabase.co' } as NodeJS.ProcessEnv)).toBeNull()
    expect(adminDoSupabase({ SUPABASE_SERVICE_ROLE_KEY: 'k' } as NodeJS.ProcessEnv)).toBeNull()
    expect(adminDoSupabase({} as NodeJS.ProcessEnv)).toBeNull()
  })

  it('admin do Supabase: normaliza a barra final da URL', () => {
    const r = adminDoSupabase({
      SUPABASE_URL: 'https://p.supabase.co///',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
    } as NodeJS.ProcessEnv)
    // A barra sobrando duplicaria a `/` do path e a Admin API responderia 404 — que o chamador
    // interpretaria como "usuário já não existe" e reportaria o vínculo como removido.
    expect(r).toEqual({ base: 'https://p.supabase.co', chave: 'k' })
  })
})
