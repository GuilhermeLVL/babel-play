/**
 * Inventário de configuração (F14-02).
 *
 * Estes casos passam o ambiente POR PARÂMETRO em vez de mexer em `process.env` global — e isso é
 * deliberado. `tests/integration/audio-dir-config.test.ts` precisa de `vi.resetModules()` e de um
 * reimport do módulo para reavaliar o env, o que o torna sensível a ordem e a carga da máquina.
 * Uma função pura não tem esse problema: o teste diz o que entra e confere o que sai.
 */
import { describe, it, expect } from 'vitest'
import {
  VARIAVEIS,
  conferirConfiguracao,
  sttDeNuvemConfigurado,
  adminDoSupabase,
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
