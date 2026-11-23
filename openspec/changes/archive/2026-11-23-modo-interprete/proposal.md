> **Change retroativa.** Documenta a Fase E ("modo intérprete") do plano aprovado `functional-doodling-crane`.
> **E1, E2, E4 e E5 já estão na `main`**: entraram pelo merge `b563485` da `feat/e-interprete-motor`, que
> chegou à `main` no merge `cd0aa88` da `perf/gratis-leve`. **E3 (a tela) e E6 (o e2e) estão no PR #47**
> (branch `claude/magical-curie-7zdnfs`), aberto e ainda não mesclado. O que está só no PR
> aparece como `- [ ]` em `tasks.md`.

## Why

Duas pessoas que não falam a mesma língua conversam frente a frente, com um aparelho só. Até a Fase E o
Babel Play fazia legenda numa direção só, a da configuração: o pipeline traduzia do "Eu falo" para o idioma
do outro (`sourceLang`/`targetLang`). Ninguém ouvia a tradução em voz alta. O `tts.ts` tinha só a voz do
aparelho, e o gancho para outro motor era um "no futuro" (`setTtsEngine`, comentário anterior ao
`ddb75c5`). O guarda de eco (`isTtsActive`) só contava a fala do `speechSynthesis`. Na folha da frase,
todo "Ouvir" lia o original (`d63514b`: "Até aqui todo Ouvir falava o original").

As decisões do dono que esta change segue:

- **O modo intérprete vale em todos os planos.** O Grátis lê a tradução com a voz do aparelho
  (`speechSynthesis`). O Premium usa a voz natural da nuvem, liberada pelo entitlement `vozNatural`, nunca
  pelo nome do plano (`src/core/vozNatural.ts`; `vozNatural: false` no `free` e `true` no `premium` e no
  `selfhost`, em `src/core/planos.ts`).
- **A voz natural nasce desligada**, atrás da flag `voz_natural` (migração 0046).
- **A meta de tempo é do fim da fala à voz em ≤ 2,5 s no p50, no Premium.** Está escrita em
  `src/lib/voz/filaDeFala.ts` e em `src/lib/voz/tempoAteAVoz.ts`, e é conferida pelo e2e do E6.

## What Changes

- **E1: fila de fala e guarda de eco** (`main`, `ddb75c5`; métrica em `ca58ed8`).
  - `src/lib/voz/filaDeFala.ts` lê uma tradução de cada vez. A fila tem no máximo 3 itens, contando o que
    está falando. O quarto derruba o mais velho da espera, nunca o que fala.
  - Um item com mais de 20 s desde o fim da fala original (`criadoEm`) não é lido.
  - `interromper` é o barge-in: corta a voz, esvazia a espera e encurta a cauda do eco. `repetir` lê o
    último item e `parar` cala a voz.
  - O motor é lido a cada item. O motor que falha não trava a fila: o prazo para começar é de 8 s, e o da
    fala é de 10 s mais 120 ms por caractere.
  - `src/lib/tts.ts` ganha `marcarFalaExterna`: a voz que não passa pelo `speechSynthesis` também liga o
    `isTtsActive`. Ganha também `cortarCaudaDoEco`, que por padrão deixa 150 ms de cauda.
  - `src/lib/voz/tempoAteAVoz.ts` guarda a métrica `tts_inicio` por motor (p50, p95 e média), exposta em
    `window.__ttsInicio()`. Ela fica na aba e não entra no lote `v: 1` da telemetria.
  - Tudo isso fica fora do JS inicial.
- **E2: direção pelo lado e máquina de estados** (`main`, `cc1816c` e `2fadba7`).
  - `src/lib/captura/interprete.ts` é uma máquina pura.
    - Fases: `parado`, `ouvindo`, `traduzindo` e `falando`.
    - Eventos: `tocar`, `fimDaFala`, `traduziu`, `semTraducao`, `fimDaVoz`, `repetir`, `pararVoz`,
      `trocarLados` e `sair`.
    - Efeitos: `abrirMicrofone`, `fecharMicrofone`, `interromperVoz`, `falar`, `repetirVoz` e `pararVoz`.
  - A direção vem do lado tocado (`direcaoDoLado`, com os lados trocados ou não).
  - O cenário `interprete`, `LadoDoInterprete`, `DirecaoDaFala`, `FimDaFala` e `SpeechSegment.lado` ficam em
    `tiposDaFala.ts`.
  - O pipeline e as fontes leem `direcaoDoMicrofone` e avisam `aoFimDaFala`. `abrirMicrofoneNoLado` e
    `fecharMicrofoneDoLado` ficam em `fontesDeAudio.ts`.
  - `traducaoDaFala.ts` ganha o gancho `aoTraduzirFinal`. Ele avisa só os finais, uma vez por fala: com
    `traduzida` (o texto sem o "≈") ou com `sem-traducao`.
- **E3: a tela** (PR #47: `03ff425`, `bb1acf4`, `e563dad`, `f29250c`, `c9b4fe2` e `d63514b`).
  - `src/lib/captura/controleDoInterprete.ts` liga a máquina, a fila e o microfone.
  - A tela é `src/components/views/captura/interprete/ModoInterprete.tsx`, com
    `src/styles/modoInterprete.css`.
    - No celular, a metade de cima (a do outro) fica virada 180°.
    - No computador, a tela tem duas colunas e os atalhos `1`, `2`, `R`, `P` e `Esc`.
  - As entradas ficam na `CapturaNoCelular` e no cabeçalho da captura do computador.
  - O microfone só abre no toque de um lado. O som do computador e a identificação de voz ficam de fora.
  - A sessão é salva com `scenario: 'interprete'`, e cada lado com o idioma dele.
  - A `FolhaDaFrase` ganha o botão "Ouvir tradução".
- **E4: `POST /api/ai/tts`** (`main`, `f23f628`; formatação em `c6cb926`). A Fase F moveu a regra para o
  núcleo `server/ai/nucleo/sintetizarVoz.ts` (`9f3ca7f`); `server/ai/ttsProxy.ts` ficou como adaptador.
  - O padrão é o Chatterbox Multilingual na DeepInfra (`server/ai/provedoresDeVoz.ts`), a US$ 1 por milhão
    de caracteres.
  - A rota tem cota de caracteres no mês e no dia local. As cotas `vozCaracteresMes` e
    `vozCaracteresDia` ficam em `src/core/planos.ts`.
  - Não há clonagem de voz, por construção e por teste.
  - A migração `0046_flag_voz_natural.sql` cria a flag `voz_natural` desligada.
  - A LGPD está registrada "a confirmar" em `docs/lgpd/operadores.md` e `docs/lgpd/ropa.csv` (T13).
- **E5: voz da nuvem no cliente** (`main`, `b7d1515`).
  - `src/lib/voz/vozDaNuvem.ts` é um `TtsEngine` que pede o áudio a `POST /api/ai/tts` e espera no máximo
    6 s.
  - Se falhar antes de o áudio começar, a voz do aparelho lê a mesma fala, com os mesmos callbacks. Depois
    de uma recusa que não muda na próxima fala, a nuvem fica pausada: pela sessão, pelo `Retry-After` ou
    só para aquele idioma.
  - `destravarVozDaNuvem()` serve o toque no iPhone, e `motorDaUltimaFala()` diz quem leu a última fala.
- **E6: e2e** (PR #47, `3e6c9ad`). `tests/e2e/modo-interprete.e2e.ts` usa Web Speech, Translator e
  `speechSynthesis` falsos.
  - No celular, com o Grátis, lê a voz do aparelho.
  - No computador, com o Premium e `/api/ai/tts` simulado, confere `p50 ≤ 2_500` ms em
    `window.__ttsInicio()`.

## Impact

**Na `main` (motor, sem tela):**

- **Voz e captura no cliente:** `src/lib/voz/{filaDeFala,vozDaNuvem,tempoAteAVoz}.ts` (novos),
  `src/lib/tts.ts`, `src/lib/captura/interprete.ts` (novo),
  `src/lib/captura/{tiposDaFala,pipelineDeFala,fontesDeAudio,segmentosDaWebSpeech,traducaoDaFala}.ts` e
  `src/components/views/LiveCapture.tsx` (5 linhas).
- **Contrato e plano:** `src/core/vozNatural.ts` (novo) e `src/core/planos.ts`.
- **Servidor:** `server/ai/{ttsProxy,provedoresDeVoz}.ts` e `server/ai/nucleo/sintetizarVoz.ts` (novos),
  `server/ai/{admissao,provedores,registroDeProvedores,telemetriaDeIa}.ts`,
  `server/lib/{config,orcamentoDeIa,usageQuota}.ts` e `server/routes/ai.ts`.
- **Banco:** `server/db/migrations/0046_flag_voz_natural.sql` e o `meta/`.
- **Docs e ambiente:** `docs/flags.md`, `docs/lgpd/{operadores.md,ropa.csv}` e `.env.production.example`.
- **Contrato da API:** `tests/contratos/api-contrato.json` ganha `POST /api/ai/tts`.

Na `main` de hoje, nenhuma tela usa `criarFilaDeFala` nem `criarVozDaNuvem`. Quem vê o motor funcionar
é o PR #47. Com a flag desligada, a rota responde 503 `voz_natural_desligada`
(`tests/caracterizacao/ia.test.ts`).

**No PR #47 (aguardando merge):**

- **Tela:** `src/lib/captura/controleDoInterprete.ts`,
  `src/components/views/captura/interprete/ModoInterprete.tsx` e `src/styles/modoInterprete.css` (novos),
  mais `src/components/views/LiveCapture.tsx` e
  `src/components/views/captura/celular/{CapturaNoCelular,FolhaDaFrase}.tsx`.
- **Sessão:** `src/lib/captura/{salvarSessao,trabalhoDeSalvar,rascunhoDaCaptura,segmentosDaWebSpeech}.ts`,
  `src/types.ts` (`CenarioDaSessao`), `src/data/rotas/sessoes.ts` e `src/data/efemero/rotas/sessoes.ts`.
- **Servidor:** `server/validation.ts` (`CENARIOS_DE_CAPTURA` e `patchMetaSchema.scenario`) e
  `server/routes/sessions.ts`.
- **Textos:** `public/i18n/{en,xx}.json` e `src/data/i18n/cobertura.json`.
- **Bundle:** o PR relata o JS inicial em 177,0 KB gzip, contra 176,8 antes e um teto de 180. A tela chega
  por `import()`.
