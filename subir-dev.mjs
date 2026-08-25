/**
 * Sobe o app em modo dev COM O LOGIN DESLIGADO, para inspeção local.
 *
 *     node subir-dev.mjs          (ou `npm run dev:local`)
 *
 * POR QUE ESTE ARQUIVO EXISTE. O `.env` real tem `VITE_AUTH_REQUIRED=1` e não existe conta
 * cadastrada — a tabela `users` tem só `local-owner`, com email NULL. Rodar `npm run dev` puro
 * abre na tela de login e para ali, sem caminho para frente. Passar as variáveis como env de
 * PROCESSO funciona sem tocar no `.env` versionado: o `dotenv.config()` (server.ts) só preenche
 * chave AUSENTE, e o `loadEnv` do Vite copia `process.env` por cima do `.env` para o prefixo
 * `VITE_`.
 *
 * RODA EM PRIMEIRO PLANO, de propósito. Uma versão anterior usava `detached: true` + `unref()`
 * para sobreviver a quem a iniciou. Não sobrevivia: ambientes que executam comandos em sandbox
 * encerram a árvore de processos inteira quando a chamada termina, e o servidor morria em
 * silêncio — o log terminava sem uma linha de erro, o que torna a falha especialmente confusa.
 *
 * Em primeiro plano o processo pertence ao SEU terminal: fica de pé enquanto o terminal estiver
 * aberto, os logs aparecem na hora, e Ctrl+C encerra. Para deixar rodando enquanto trabalha,
 * use uma aba de terminal dedicada.
 */
import { spawn } from 'node:child_process'

const PORTA = process.env.PORT || '3100'

console.log(`\n  Babel Play — modo local, sem login`)
console.log(`  http://localhost:${PORTA}`)
console.log(`  Ctrl+C para encerrar. Mantenha este terminal aberto.\n`)

const filho = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    // Sem isto a app renderiza <Login/> e mais nada (App.tsx), e não há conta para entrar.
    VITE_AUTH_REQUIRED: '0',
    VITE_SUPABASE_URL: '',
    VITE_SUPABASE_ANON_KEY: '',
    AUTH_REQUIRED: '0',
    NODE_ENV: 'development',
  },
  // `inherit`: os logs do servidor saem no seu terminal, sem arquivo intermediário.
  stdio: 'inherit',
})

filho.on('exit', (codigo) => process.exit(codigo ?? 0))
process.on('SIGINT', () => { filho.kill('SIGINT') })
