# Tradução sem rota no celular: medição da change `traducao-sem-rota-no-celular`

Data: 17/11/2026. Branch: `feat/traducao-sem-rota-no-celular`. Tudo abaixo foi medido, salvo onde está escrito "inferido".

## Como foi medido

- **Build local da edição estática** (`npm run build:estatica`), servida por `tests/e2e-estatica/_servidor-estatico.mjs` em
  `127.0.0.1:4175`. É o visitante sem conta e sem nuvem, como o da auditoria. A produção não foi tocada.
- **Bancada:** a mesma da auditoria (`reports/auditoria-qualidade/celular/medir-celular.mjs`), copiada fora do repositório com
  três ajustes:
  - a URL vem de `URL_DO_APP`;
  - na pergunta "Como transcrever a sua voz?", que aparece nessa edição, escolhe "Privado" (Whisper no aparelho);
  - grava em `resultado.json` as marcas `frasy:*` (`src/gateway/marcasDeDesempenho.ts`) e as sobreposições entre o cartão
    de preparo e a primeira fala.
- **Aparelhos:** iPhone 14 e Pixel 7 emulados no Chromium headless, que não tem Translator nativo. Rede livre.
- **Sessões:** a 1ª com perfil novo; a 2ª com cópia do perfil da 1ª (`rodar-local.sh`, igual ao `rodar-visitante.sh`).
- **Linhas sem tradução:** contadas por um critério que também pega a linha honesta nova. Conta como sem tradução a linha
  com tradução vazia, "…", entre parênteses, igual ao original ou com o motivo. O `analisar.mjs` da auditoria só contava
  "(…)", então daria 0 por construção.
- **Latência "fim da fala → tradução":** mesma âncora do `latencias.mjs`. No pivô, o tempo vai até a 2ª resposta do
  `mtWorker`, a tradução que a pessoa lê.
- **Bergamot (CDN):** um build com `VITE_BERGAMOT_MODELOS_URL=/modelos` e o par `es-en` copiado para `dist/modelos/bergamot/`
  com o sha256 conferido. Simula o bucket configurado e não altera nada da produção.

## Resultados

### CEL-01: linhas sem tradução, espanhol → português, cenário mercado (9 falas)

| Rodada                         | Auditoria (produção) | Agora (build local)   |
| ------------------------------ | -------------------- | --------------------- |
| iPhone 14, 1ª sessão           | 9/9                  | 0/9 (duas réplicas)   |
| iPhone 14, 2ª sessão           | 9/9                  | 0/9                   |
| Pixel 7, 1ª e 2ª sessão        | —                    | 0/9 e 0/9             |
| iPhone 14 com Bergamot es-en   | —                    | 0/9 (1ª) e 0/9 (2ª)   |

Em nenhuma rodada o console registrou `NoRouteError`.

### CEL-08: a 2ª sessão contra a 1ª (fim da fala → tradução, ms)

| Rodada                            | p50 da 1ª           | máx. da 1ª                    | p50 da 2ª | máx. da 2ª | 2ª ÷ 1ª |
| --------------------------------- | ------------------- | ----------------------------- | --------- | ---------- | ------- |
| iPhone 14, mercado (es→pt, pivô)  | 5 120 (5 552 na outra réplica) | 15 973 (inclui o download) | 4 907     | 7 143      | 0,96×   |
| Pixel 7, mercado (es→pt, pivô)    | 3 081               | 13 934                        | 2 930     | 6 700      | 0,95×   |
| iPhone 14, desenho (en→pt)        | 3 045               | 8 670                         | (*)       | (*)        | —       |

(*) Na 2ª sessão do desenho só 1 fala foi ao `mtWorker`: as outras vieram da memória de tradução entre sessões (mesmo áudio).
Isso não é mais devagar; a métrica do worker só não as vê.

**O que as marcas mostram:**

- Em todas as rodadas a carga do tradutor começa **depois** do fim da carga do STT.
  - Exemplo, iPhone na 2ª sessão: STT de 5 092 a 8 075 ms, carga do MT de 14 254 a 14 982 ms.
  - O celular já carrega um modelo de cada vez (`umModeloDeCadaVez`).
- A fila do worker de tradução nunca passou de 1.

**Causa:** a disputa STT × MT no início da sessão **não se reproduziu** neste build. A hipótese do design não foi
sustentada, por isso a tarefa 4.3 não aplicou correção. A regressão da auditoria (2,4× e 4,8×) foi medida em produção e não
reapareceu aqui. A causa dela fica em aberto; pode ter sido a carga da máquina durante a auditoria, mas isso é inferido.

### Memória da aba (pico do processo renderer, MB)

| Rodada                         | 1ª sessão                      | 2ª sessão | Diferença para a referência en→pt (2 358 / 2 558) |
| ------------------------------ | ------------------------------ | --------- | ------------------------------------------------- |
| en→pt, desenho (referência)    | 2 358                          | 2 558     | —                                                 |
| es→pt, opus-mt nas duas pernas | 2 543 e 2 153 (duas réplicas)  | 2 764     | +185 / −205 / +206 (dentro do teto de +300)       |
| es→pt, Pixel 7                 | 2 359                          | 2 524     | —                                                 |
| es→pt, Bergamot es-en          | 3 084                          | 2 874     | **+726 / +316 (acima do teto)**                   |

O Bergamot é cerca de 3× menor em disco, mas na memória o worker dele (o heap WASM, cerca de 550 MB segundo
`bergamotLocal.ts`) soma ao opus-mt en→pt e ao Whisper.

### Qualidade do pivô (juiz `claude -p --model sonnet`, sem crédito de API)

- **Juiz da auditoria** (`juiz-traducao.mjs`, fala dita → legenda lida, mede STT e MT juntos):
  - iPhone, 1ª sessão: 1 correta, 3 parciais, 3 erradas, 1 perigosa ("11 euros" virou "11 horas", erro do STT).
  - Pixel, 2ª sessão: a mesma distribuição.
- **Juiz só da tradução** (texto transcrito → tradução, nota de 1 a 5, nas 9 falas):
  - opus-mt nas duas pernas: **2,33** (iPhone) e **2,56** (Pixel);
  - Bergamot es-en + opus-mt en→pt: **2,89**.
- **O piso de 3/5 do spec não foi atingido.** Boa parte das notas baixas vem de espanhol já truncado pelo STT ("que le puedo",
  "contarje", "típer"). Mesmo assim, o pivô erra expressões ("oferta" virou "acordo", "que te vaya bien" virou "você é um bom
  dia").

### Cartão de preparo

- Nas rodadas do celular, nenhuma amostra pegou o cartão aberto junto com uma fala: a área em comum foi 0 em todas.
- O cartão "Tradutor do navegador" não aparece no Chromium headless, que não tem Translator.
- No layout atual o cartão está no fluxo da faixa de avisos (`CapturaDoPrototipo`, `avisos`), não em `position: absolute`.
  Na captura da auditoria (`computador/runs/sessao-10min-a/05-gravando-601s.png`) ele ocupa uma faixa própria acima da lista.
  O que "cobria" era o cartão preso a sessão inteira (COMP-03), já corrigido. Isso é inferido da imagem.
- O teste e2e das três janelas não foi escrito (tarefa 3.2 em aberto).
