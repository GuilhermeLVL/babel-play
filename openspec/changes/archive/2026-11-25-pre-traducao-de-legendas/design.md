## Decisões

**D1. Núcleo puro, motor injetado.** `preTraduzirLegenda({ falas, traduzir, ... })` não conhece Worker, gateway nem DOM: recebe
`traduzir(texto) => Promise<string>`. Os testes rodam sem motor. O adaptador é quem liga o núcleo ao tradutor local.

**D2. Só local, por construção e por conferência.** O adaptador (a) recusa na criação um provedor fora de
`MOTORES_LOCAIS_DE_PRE_TRADUCAO` (`opus-mt-local`, `bergamot-local`), (b) descarta a resposta cujo `engine` não esteja na lista,
(c) nunca envia `nuvemPrimeiro`/`escalarSeRuim`. Não usa `gateway.mt.translate`, cuja cascata pode chegar à nuvem com consentimento.

**D3. Lote que não trava a tela.** Lote = até 20 falas ou 2 000 caracteres, o que vier primeiro. Entre lotes o laço chama `ceder()`
(padrão: `setTimeout(0)`), então o navegador pinta e responde a toques. A tradução em si roda no worker do motor, fora da thread
da tela. O sinal `AbortSignal` é conferido antes de cada fala: cancelar devolve o que já foi traduzido (estado `cancelada`).

**D4. Motor ainda baixando.** Se o par não está pronto, `traduzir` lança `MotorAindaCarregando`; o núcleo para com estado
`aguardando-motor` e devolve o parcial, sem contar falha. A tela (próxima etapa) avisa o tamanho do download ANTES de chamar
`preload`, e só com a pessoa de acordo.

**D5. Progresso honesto.** O progresso é `feitas / total`, onde feitas só conta fala de fato resolvida (traduzida, repetida já
traduzida, vazia pulada) ou falha registrada. A estimativa de tempo só aparece depois de 5 falas traduzidas e é média das
traduzidas, marcada como estimativa. Falas repetidas reaproveitam a tradução da primeira (legendas repetem "Yes.", "Okay.").

**D6. Legenda segura.** A política (`PoliticaDaLegenda`) é aplicada ao original E à tradução de cada fala, depois de traduzir. O
motor local recebe o texto cru (nunca sai do aparelho); o que vai para a sessão já tem `•••` no lugar do termo, e a contagem
fica em `ocultadas`. Perfil protegido: ligada e travada, como no resto do app.

**D7. Falha de uma fala não derruba o lote.** Erro comum numa fala vira `traducao: null` e entra em `falhas`; 5 falhas seguidas
interrompem com estado `falhou` (motor quebrado). Cancelamento e "motor carregando" não são falha.
