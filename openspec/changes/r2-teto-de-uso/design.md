## Context

- Cota por usuário já existe: `reservarArmazenamento(userId, bytes)` em `server/lib/storageQuota.ts`
  lê e grava `usage_counters` (metric `storage_bytes`, window `total`) e é chamada antes de cada
  upload (`routes/sessions.ts:363`, `routes/import.ts:571`); `liberarArmazenamento`/`ajustarArmazenamento`
  devolvem o saldo quando o arquivo some.
- Adaptador S3: `armazenamentoS3(cfg)` em `server/lib/armazenamento.ts` implementa a interface
  `Armazenamento` (`gravar`, `gravarDeArquivo`, `ler`, `lerFaixa`, `remover`, `tamanho`, …).
  `armazenamentoDoAmbiente(dir, env)` escolhe S3 ou disco.
- Padrões a seguir: teto de IA (`orcamentoDiarioDeIaUsd`, alerta a 80 %), variáveis declaradas em
  `server/lib/config.ts` com `paraQue`, `exigencia`, `criticidade`.

## Goals / Non-Goals

- Goals: ficar no nível gratuito do R2 por construção; reverter/ajustar só por variável; ver no log
  e nas métricas quando se aproxima do teto; nenhuma dependência nova (sem token da Cloudflare).
- Non-Goals: medir o uso pela API da Cloudflare (fica para quando houver token de leitura);
  cobrar/avisar o usuário final; mudar a cota por plano; Workers/Hyperdrive.

## Decisions

1. **Fonte do total guardado = nosso próprio contador.** `SUM(count) FROM usage_counters WHERE
metric='storage_bytes' AND window='total'`. É o que já alimenta a cota por usuário e é
   reconciliado com o disco/R2 (`reconciliarArmazenamento`). Alternativa rejeitada: consultar a
   GraphQL Analytics da Cloudflare a cada upload (token, latência, atraso de horas na métrica).
2. **Onde recusar o armazenamento: dentro de `reservarArmazenamento`**, depois da checagem por
   usuário e na mesma transação com trava, para dois uploads simultâneos não passarem juntos pelo
   teto. `ResultadoDeCota` ganha `motivo: 'usuario' | 'conta'`; `corpoDeRecusa` devolve `507` com
   mensagem "o serviço está no limite de armazenamento; tente mais tarde" quando o motivo é `conta`
   (sem culpar o usuário nem revelar números da conta).
3. **Contagem de operações no adaptador**, não nas rotas: um embrulho `comTetoDeOperacoes(store,
deps)` em `server/lib/tetoDoR2.ts` intercepta cada método do `Armazenamento` S3, classifica
   (A: `gravar`, `gravarDeArquivo`, `remover`; B: `ler`, `lerFaixa`, `tamanho`), lê/incrementa
   `usage_counters` (`userId` fixo `__r2__`, metric `r2_ops_a`/`r2_ops_b`, window `YYYY-MM` em UTC,
   `ON CONFLICT DO UPDATE` atômico, como `usageCountersRepo.incrementar`) e recusa com
   `ErroDeTetoDoR2` (`codigo: 'R2_TETO_OPS'`) quando `count >= teto`. `armazenamentoDoAmbiente`
   aplica o embrulho só quando o adaptador é S3. Uma leitura recusada responde `503` na rota de
   áudio (já existe tratamento de erro de armazenamento; mapear o código).
   Alternativa rejeitada: contar só em memória (perde no reinício, não vale entre instâncias).
   **Contador indisponível** (falha ao gravar no banco): classe A (`gravar`/`gravarDeArquivo`) falha
   FECHADA com `ErroDeTetoDoR2` de código `R2_TETO_INDISPONIVEL` (a rota responde `503` e devolve a
   reserva de cota); classe B e `remover` seguem abertos (a reprodução de áudio e a exclusão não caem
   por falha do contador). O aviso `r2_teto_contagem_falhou` é `warn`, no máximo um por minuto por
   processo.
4. **Semântica das variáveis** (declaradas em `config.ts`, `exigencia: 'opcional'`,
   `criticidade: 'degrada-capacidade'`):
   - `R2_TETO_MB`: ausente → `9216`; número ≥ 1 → teto em MB; `0` → recusa todo upload novo (kill
     switch); `ilimitado` → sem teto. Qualquer outro valor é erro de configuração no boot.
   - `R2_TETO_OPS_A_MES`: ausente → `900000`; mesma gramática. `R2_TETO_OPS_B_MES`: ausente →
     `9000000`; mesma gramática.
   - Função pura `lerTetoDoR2(env)` → `{ bytes: number | Infinity; opsA; opsB }` em
     `server/lib/tetoDoR2.ts`, com testes dos cinco casos por variável.
5. **Alerta a 80 %:** ao cruzar 80 % de qualquer teto, uma vez por processo e por janela, log
   `r2_teto_alerta_80` com `{ recurso, usado, teto }` e gauge `r2_uso_fracao{recurso}` em
   `server/http/metricas.ts`. Ao recusar: log `r2_teto_recusa` com o recurso.
6. **Retenção, exclusão e reconciliação nunca são bloqueadas**: `remover` conta como classe A e
   **sempre passa** (apagar reduz o problema). Nas rotas de usuário, `tamanho` recusa como
   `ler`/`lerFaixa` (fail-closed: a rota de áudio faz HEAD antes do GET, e um cliente em laço somaria
   HEADs além do teto). Os jobs internos que precisam medir ou apagar independentemente do teto usam a
   via **`semTeto(store)`** (referência guardada num `Symbol` no embrulho; store que não é embrulho
   volta como veio): exclusão de conta/LGPD (`me.ts`), apagar sessão (`DELETE /api/sessions/:id`),
   `retencaoDeAudio.ts` e `somarBytesEmDisco`/reconciliação. Pela via sem teto as operações AINDA
   contam (o número reflete o R2), só não recusam. Complemento: `somarBytesEmDisco` só pula nome inválido
   (`NomeDeArquivoInvalido`); qualquer outra falha do store sobe e a reconciliação aborta sem gravar.
7. **Cloudflare:** Budget Alert de US$ 1 criado pelo dono no painel (não há token com permissão de
   Notificações nesta sessão). Documentado em `docs/deploy.md` como passo de ambiente.

## Risks / Trade-offs

- O total guardado pode divergir do R2 real (uploads fora do app, reconciliação atrasada). A
  margem de 10 % cobre isso; a reconciliação já existente corrige por usuário.
- Contar operações custa uma escrita no banco por operação de armazenamento. Aceitável (o upload
  já faz várias escritas); se pesar, agrupar em memória e descarregar a cada N segundos (fora
  deste change).
- Classe B recusada interrompe a reprodução de áudio. O padrão de 9 M/mês está muito longe do uso
  previsto; o alerta a 80 % chega antes.

## Migration Plan

Sem migração de schema. Deploy = variáveis ausentes (padrões ligados). Reverter = `R2_TETO_MB=ilimitado`
etc. e reiniciar.

## Open Questions

- **Teto mensal de operações por usuário, checado antes do global.** Hoje um locatário sozinho pode
  consumir o teto global de operações (custo compartilhado: os outros recebem 503). O alerta a 80 %
  (decisão 5) avisa antes; o próximo passo é um teto por usuário em `usage_counters`, conferido antes
  do contador `__r2__`.

- **Contar em lotes quando o tráfego crescer.** Hoje é um UPDATE por operação. O plano: cada processo
  reserva N operações de uma vez (`count + N <= teto`, numa instrução) e as consome em memória,
  reservando o próximo lote quando acabar; o que sobrar no fim do mês ou do processo é a margem
  perdida (no máximo N por processo).
- **`ajustarArmazenamento` não confere o teto da conta.** A correção da estimativa do YouTube soma o
  delta sem teto; o estouro é de no máximo um upload, dentro da margem de 10 %. Fora desta rodada.
- **Gauge na recusa por armazenamento.** Na recusa pela conta o gauge `r2_uso_fracao{armazenamento}`
  mostra a soma antes do upload recusado (abaixo de 1), enquanto nas operações a recusa marca 1.
  Uniformizar fica fora desta rodada.

- Quando houver token de leitura da Cloudflare, cruzar o contador com a Analytics (job diário) e
  registrar divergência > 5 % como aviso.
