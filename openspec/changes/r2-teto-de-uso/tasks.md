## 1. Variáveis e leitura do teto

- [x] 1.1 `server/lib/tetoDoR2.ts`: `lerTetoDoR2(env)` com a gramática ausente/número/`0`/`ilimitado`/inválido, para `R2_TETO_MB`, `R2_TETO_OPS_A_MES`, `R2_TETO_OPS_B_MES`
- [x] 1.2 Declarar as três variáveis em `server/lib/config.ts` (opcional, degrada-capacidade, `paraQue` com os padrões) e comentadas em `.env.production.example`
- [x] 1.3 Testes unitários dos cinco casos por variável (`tests/teto-do-r2.test.ts`)

## 2. Teto global de armazenamento

- [x] 2.1 `reservarArmazenamento` confere `SUM(storage_bytes/total) + bytes > teto` na mesma transação com trava; `ResultadoDeCota.motivo: 'usuario' | 'conta'`
- [x] 2.2 `corpoDeRecusa` devolve `507` com mensagem neutra quando `motivo = 'conta'`; `0` recusa tudo; `ilimitado` nunca recusa; só vale com adaptador S3
- [x] 2.3 Testes de integração em `tests/integration/r2-teto-armazenamento.test.ts`: abaixo/acima do teto, dois uploads simultâneos no limite (um passa), `0`, `ilimitado`, disco sem S3 ignora o teto

## 3. Teto mensal de operações

- [x] 3.1 `comTetoDeOperacoes(store)` em `server/lib/tetoDoR2.ts`: classifica A/B, incrementa `usage_counters` (`__r2__`, `r2_ops_a`/`r2_ops_b`, `YYYY-MM` UTC) com `ON CONFLICT DO UPDATE`, recusa `gravar`/`gravarDeArquivo` por A e `ler`/`lerFaixa` por B; `remover` e `tamanho` contam e sempre passam
- [x] 3.2 `armazenamentoDoAmbiente` aplica o embrulho só no S3; rota de áudio mapeia `ErroDeTetoDoR2` para `503`
- [x] 3.3 Testes: contagem por classe, virada de mês, recusa no teto, `remover` passa com A batido, `tamanho` passa com B batido, disco não conta
- [x] 3.4 `somarBytesEmDisco` só pula `NomeDeArquivoInvalido`; outra falha do store aborta a reconciliação (teste)

## 4. Observabilidade e docs

- [x] 4.1 Log `r2_teto_alerta_80` (uma vez por processo e janela) e `r2_teto_recusa`; gauge `r2_uso_fracao{recurso}` em `server/http/metricas.ts`, com teste
- [x] 4.2 `docs/deploy.md`: seção "Teto do R2" (variáveis, reversão, Budget Alert de US$ 1 no painel da Cloudflare)
- [ ] 4.3 `npm run typecheck`, `npm run lint`, `npm test`, `npx knip` verdes
