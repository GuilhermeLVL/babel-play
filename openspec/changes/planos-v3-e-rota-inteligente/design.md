# Desenho técnico

Fontes: os dois estudos de 09/10/2026 em `docs/auditoria/` e o mapa do código feito no mesmo dia. Onde
cito `arquivo:linha`, a leitura é de 09/10 na branch `feat/polimento-movimento`.

## 1. Os planos

| | Grátis | Essencial | Premium | Ao Vivo |
|---|---|---|---|---|
| Mensal | R$ 0 | R$ 9,90 | R$ 19,90 | R$ 39,90 |
| Anual | | R$ 79,90 | R$ 149,90 | só mensal no início |
| Anúncios | leves | não | não | não |
| Nível de serviço | No aparelho | No aparelho + Precisão sob demanda | Precisão por padrão onde compensa | Ao vivo |
| Nuvem por trechos | amostra por anúncio premiado | 5 h/mês | 20 h/mês | 20 h/mês |
| Nuvem ao vivo | | | | 10 h/mês |
| Nuance | não | sim | sim | sim |
| Intérprete automático | não | não | sim | sim |
| Voz | do aparelho | do aparelho | neural básica | neural boa |

Para quem: Grátis para quem está conhecendo ou tem computador com placa de vídeo; Essencial para o
estudante no computador; Premium para quem depende de nuvem (celular, notebook fraco, Quest); Ao Vivo
para intérprete em viagem, reunião e aula.

Custo estimado por assinante no uso típico: R$ 0,75 (Essencial), R$ 3,50 (Premium), R$ 7,00 (Ao Vivo).
Onde dá prejuízo: Essencial mensal no Pix, Ao Vivo no teto com serviço de fluxo caro, voz cara em
qualquer nível. São estimativas; o uso real por assinante precisa ser medido antes de vender anual.

## 2. O que está preso a dois planos hoje

- Tipo `PlanoDeAssinatura = 'free' | 'premium' | 'selfhost'` e a matriz (`src/core/planos.ts:52,145-238`).
- `essencial` e `pro` são apelidos de Premium (`planos.ts:61`); R$ 39,90 é lido como "Premium antigo"
  (`planos.ts:379-382`); R$ 9,90 não paga plano nenhum (teste `planos-matriz.test.ts:199`).
- Só `premium` e `selfhost` contam como pagantes na admissão (`server/ai/admissao.ts:77`).
- O teste de 14 dias concede `premium` fixo (`server/lib/entitlements.ts:86`).
- Quem já paga recebe 409 ao tentar assinar outro plano (`server/routes/billing.ts:368-375`) e não há
  função para alterar o valor de uma assinatura no Asaas.
- A flag `voz_natural` foi semeada só para `premium` e `selfhost` (migração 0046).
- Entitlements do cliente copiados à mão em cinco lugares (`src/lib/entitlements.ts:59-140` e outros).
- Tela de Planos com duas colunas fixas (`Planos.tsx:652`).
- Um contador só de segundos de transcrição (`server/lib/usageQuota.ts`); Premium com 40 h/mês.
- O servidor só transcreve por trechos (`POST /api/ai/stt`). Não existe transporte para texto durante a
  fala pela nuvem.

O servidor nunca foi implantado (`docs/ESTADO-DO-LANCAMENTO.md:34-35`), então não deve haver assinatura
antiga nos nomes e valores que colidem. Precisa da confirmação do dono (pergunta 3).

## 3. A política de rota

Um módulo puro, `src/core/rota/politicaDeRota.ts`, sem tela, sem relógio e sem leitura de estado
global. Recebe o pedido e devolve a decisão com o motivo.

```ts
export type NivelDeServico = 'aparelho' | 'precisao' | 'aovivo';
export type TarefaDaRota = 'stt-final' | 'stt-parcial' | 'mt-final' | 'mt-parcial' | 'voz' | 'nuance';
export type DegrauDaRota =
  | 'modelo-no-aparelho'      // Whisper, Moonshine, Bergamot, opus-mt, voz do sistema
  | 'navegador-no-aparelho'   // fala do navegador processada localmente, tradutor do Chrome
  | 'navegador-na-nuvem'      // fala do navegador que envia o áudio ao fabricante
  | 'nuvem-por-trechos'
  | 'nuvem-ao-vivo'
  | 'nuvem-do-site';          // edição estática

export interface DecisaoDeRota {
  nivel: NivelDeServico;
  rota: PassoDaRota;                 // o que roda agora
  reservas: PassoDaRota[];           // em ordem; sempre termina no aparelho
  descartadas: { degrau: DegrauDaRota; motivo: MotivoDaRota }[];
  processamento: { onde: 'aparelho' | 'navegador' | 'nuvem'; enviaDadosA: DestinoDosDados };
  explicacao: { chave: string; vars?: Record<string, string | number> };
  acao?: 'autorizar-nuvem' | 'ver-consumo' | 'ver-planos' | null;
}
export function decidirRota(p: PedidoDeRota): DecisaoDeRota;
```

`PedidoDeRota` leva a tarefa, a fonte (microfone, sistema, texto), o idioma, o aparelho (tipo, leve,
placa de vídeo provada, recursos do navegador, se está travando), o plano em CAPACIDADES (nunca o nome)
com o que resta de cota, e o estado (consentimentos, perfil privado ou protegido, nuvem disponível ou
pausada, rede, edição estática, preferência da pessoa).

### Regras, na ordem

1. **Nunca sai do aparelho**: tradução parcial; perfil privado; perfil protegido sem responsável; sem
   consentimento para o degrau em questão.
2. **Escolha explícita da pessoa**, limitada pelo que o plano inclui.
3. **Aparelho primeiro** quando ele acompanha (fator de tempo real medido até 0,5 na média móvel) e o
   idioma é bem servido localmente. Inglês em aparelho que acompanha não vai à nuvem por padrão em
   nenhum plano.
4. **Navegador**: antes da nuvem quando processa no aparelho; quando envia o áudio ao fabricante, só com
   aceite e com a etiqueta própria.
5. **Nossa nuvem**: só se o plano inclui, há cota, não está pausada e compensa (aparelho leve ou
   travando, idioma diferente de inglês, sem placa de vídeo provada).
6. **Reservas** terminam sempre num degrau do aparelho. A queda é anunciada, nunca silenciosa quando
   muda para onde o áudio vai.

### Árvore resumida (transcrever)

| Aparelho | Grátis | Essencial | Premium | Ao Vivo |
|---|---|---|---|---|
| Computador com placa de vídeo, inglês | aparelho | aparelho | aparelho; "refinar na nuvem" por trecho | aparelho; nuvem a pedido |
| Computador com placa de vídeo, outros idiomas | melhor modelo local | local; nuvem a pedido ou quando a confiança cai | nuvem primeiro, local de reserva | nuvem em fluxo |
| Computador sem placa de vídeo | modelo leve; se não acompanha, navegador com etiqueta | nuvem dentro da cota | nuvem primeiro | nuvem em fluxo |
| Celular | modelo leve em inglês; outros, navegador com etiqueta | nuvem dentro da cota | nuvem primeiro | nuvem em fluxo |
| Quest | modelo leve em inglês; outros idiomas com aviso de atraso (sem anúncio no Quest, logo sem amostra) | nuvem dentro da cota | nuvem primeiro | nuvem em fluxo |

Traduzir: no Grátis, tradutor do navegador, depois Bergamot, depois opus-mt; a partir do Premium, o
modelo de linguagem da nuvem por padrão (custa centavos por hora). Falar: voz do aparelho até o
Essencial; voz neural a partir do Premium. Nuance: só pela nuvem (não há via local aceitável em
português); no Grátis, poucas por dia como recompensa ou nenhuma (pergunta 8).

### Como entra sem quebrar nada

1. **Modo sombra**: a política compõe as funções puras que já existem (`routeStt`, `escolherMotorDoMic`,
   `routeMt`) e é comparada com a decisão de hoje, só em desenvolvimento.
2. **Transparência**: o selo passa a ler a explicação da política, ainda com a decisão antiga.
3. **Valendo**, atrás da flag `rota_inteligente`, ligada por percentual.

Pontos de encaixe: `pipelineDeFala.ts:1310` e `:840`, `traducaoDaFala.ts:447`, `gateway/index.ts:316`,
`LiveCapture.tsx:2751`, `nuvemDaImportacao.ts:48`, `AiEnginePanel.tsx:55`. No servidor, um espelho
pequeno em `admitirTranscricao` (`transcrever.ts:89-124`) recusa o nível que o plano não tem.

## 4. Cotas por nível

- Métrica nova `stt_live_seconds` ao lado de `stt_seconds`, na mesma tabela `usage_counters` (os nomes
  são texto; sem alteração de esquema).
- Reserva antes do provedor, estorno na falha, como hoje. O fluxo ao vivo reserva em blocos de 30 s e o
  servidor corta quando acaba.
- `GET /api/me/uso` devolve o restante por nível; a tela mostra o medidor e a política recebe o
  restante.
- Quando o mês acaba: a rota cai para o aparelho com o motivo `cota-do-mes` e a ação "ver consumo".
  Nada é bloqueado.
- Limites de pedidos do servidor hoje estão no padrão da camada grátis da Groq (`config.ts:1205-1212`).
  Quatro planos pagos pedem chave paga e limites próprios; o preço do OpenRouter precisa entrar na
  tabela do orçamento (`orcamentoDeIa.ts:66-83`) antes de ele servir de rota.

## 5. Transparência

Três etiquetas fixas, sempre visíveis na captura e no intérprete:

| Etiqueta | Quando | O áudio sai do aparelho? |
|---|---|---|
| No aparelho | modelo local ou recurso do navegador processado localmente | Não |
| Pelo navegador | fala do navegador que envia ao fabricante (Google, Apple) | Sim, para um terceiro |
| Nuvem do Babel | nossa nuvem, por trechos ou ao vivo | Sim, para o nosso servidor |

- Ao toque: duas linhas com o motivo e o que dá para trocar, e a folha "Como isto funciona".
- Mudança automática de rota: aviso curto, não bloqueante, dizendo o que mudou e por quê.
- Consentimento separado para "Pelo navegador" e para "Nuvem do Babel". Sem aceite prévio, a rota nunca
  passa de "No aparelho" para algo que envia áudio.
- Perfil infantil: travado em "No aparelho".
- "Testar sem internet": um botão que prova, desligando a rede da própria tela, que o modo local
  funciona (um estudo de 2025 mostrou que só dizer "é local" não convence).

Componentes que já existem e são reaproveitados: `ModeloNoDispositivo`, `Provenance`, `NuvemDoQuest`,
`AvisoDeNuvemSemConsentimento`, `AvisoDoUsoDoDia`, `AiEnginePanel`.

## 6. Qualidade no aparelho (o que melhora o Grátis sem custo)

Em ordem de ganho por esforço. Nada é adotado sem medição na nossa bancada.

1. **Parakeet TDT 0.6b v3 para português e outros idiomas**: erra cerca de 5 em 100 palavras em
   português fora do navegador, contra 14 a 18 do modelo que usamos. No navegador há ressalvas sérias
   (tamanho, quantização, sem fluxo). Medir primeiro; pode não se confirmar.
2. **Conferir a rota `hybrid-fp16`** contra o defeito aberto da biblioteca (perda de precisão do Whisper
   em fp16 no WebGPU, versão 4). Pode estar piorando celular e Quest sem ninguém ver.
3. **Inglês de pagante fica no aparelho** quando acompanha (regra 3 da política).
4. **Moonshine v2 em fluxo** para inglês (e depois espanhol e alemão), se houver arquivo que a
   biblioteca abra.
5. **Fala do navegador processada no aparelho**: sondar no Chrome e no Edge reais quais idiomas existem
   e usar a lista de frases com o vocabulário da pessoa.
6. **Correção determinística** de vocabulário do usuário e nomes do conteúdo depois do reconhecimento,
   com limiar conservador.
7. **Tabela única de qualidade** (modelo × idioma × aparelho) lida pela política e mostrada em
   linguagem simples.
8. **Amostragem de concordância** local × nuvem (1 trecho em 20 de quem tem nuvem) para medir qualidade
   em produção sem gabarito.

Não fazer: modelo de linguagem pequeno reescrevendo a legenda (inventa e ensina errado a quem estuda),
Gemini Nano para português (não fala), camadas grátis que treinam com os dados (Gemini grátis, Mistral
Experiment, OpenRouter `:free`) com dado de usuário, NLLB (licença não comercial).

Nuvem de custo zero: a camada grátis da Groq é por organização e cobre cerca de uma pessoa e meia em
legenda contínua; o contrato exige cliente adulto e diz que não é para consumidor. Não sustenta amostra
aberta. A amostra do Grátis, se existir, é recompensa por anúncio, com teto global diário e queda para
o aparelho.

## 7. Anúncios no Grátis

- **Política pura** `src/core/anuncios/politicaDeAnuncio.ts`: `podeMostrar(...)` nega para plano sem
  anúncios, perfil protegido, Quest, captura ativa, intérprete, rodada em andamento, conta com menos de
  três dias, sem consentimento, e intersticial há menos de cinco minutos.
- **Um componente** `EspacoDeAnuncio` que não renderiza nada quando a política nega.
- **Espaços** (os do protótipo): premiado opcional (Seeds, tema por 24 h, amostra de nuvem), bloco
  nativo no fim da rodada, linha na Biblioteca, cartão no Início, tema patrocinado na Loja.
- **Atrás da flag `anuncios`**, desligada; com ela desligada nenhum byte de terceiro é pedido.

Riscos que precisam de teste real antes de contar com receita:

- A CSP só aceita script próprio (`server/http/csp.ts:112-128`) e há um teste que afirma isso.
- `Cross-Origin-Embedder-Policy: credentialless` (que dá as threads ao Whisper local) quebra quadros de
  terceiros. O cabeçalho é do documento inteiro; não dá para ligar só em algumas telas.
- AdSense exige domínio próprio e páginas públicas com conteúdo; o premiado na web é programa com
  inscrição.
- Na edição estática todo mundo é "sem conta" e por isso tratado como perfil protegido: pela regra,
  ninguém veria anúncio ali (pergunta 13).
- Rende pouco: R$ 0,05 a 0,30 por usuário grátis por mês. O valor real é ser motivo para assinar.
- ECA Digital (Lei 15.211/2025) e Decreto 12.880/2026: padrão mais protetivo; pede consulta jurídica.

## 8. Etapas

Cada etapa é entregável sozinha. "Atrás de flag" quer dizer desligada de fábrica.

| # | Etapa | Depende de | Muda algo para o usuário? |
|---|---|---|---|
| 0 | ADR novo e respostas do dono | | Não |
| 1 | Matriz preparada para vários planos pagos, sem plano novo | 0 | Não |
| 2 | Entitlements e cotas novos na matriz (`semAnuncios`, `sttAoVivo`, nível de voz) | 1 | Não |
| 3 | Contador por nível | 2 | Não |
| 4 | Política de rota em modo sombra | 2 | Não |
| 5 | Transparência: selo de três etiquetas, motivo, avisos, consentimentos | 4 | Sim |
| 6 | Rota inteligente valendo (flag `rota_inteligente`) | 4 | Sim, com a flag |
| 7 | Os quatro planos na matriz, venda fechada (flag `venda_planos_v3`) | 3 | Não |
| 8 | Cobrança dos quatro e troca de plano | 7 | Sim, com a flag |
| 9 | Tela de Planos, medidor e seletor de nível | 8 | Sim |
| 10 | Nuvem ao vivo (flag `stt_ao_vivo`) | 3, 6, 7 | Sim, com a flag |
| 11 | Anúncios (flag `anuncios`) | 2, 9 | Sim, com a flag |
| Q | Qualidade no aparelho: medições e adoções da seção 6 | independente | Sim |

A trilha Q e as etapas 4 e 5 não dependem de nenhuma decisão comercial e podem começar primeiro.

## 9. Medições antes de decidir (custo zero ou centavos)

1. Parakeet v3 no navegador (int8 em WASM, fp16 em WebGPU) em pt, es, fr, de, na bancada.
2. As mesmas 100 falas em fp16 e fp32 na rota de celular e Quest.
3. `SpeechRecognition.available()` com processamento local para pt-BR, en, es no Chrome e no Edge.
4. Diagnóstico no Quest (o navegador subiu de versão em 2026; os relatos de "sem fala nem voz" são
   anteriores).
5. Erro do reconhecimento do navegador contra o local e a nuvem no mesmo áudio real.
6. Tradução de 100 a 200 frases curtas em cada tradutor.
7. Anúncio de teste com o isolamento ligado, em página de bancada.

Os testes pagos cabem no limite de US$ 1 da chave do dono; a chave fica só em arquivo fora do
repositório, criado por ele.

## 10. Perguntas em aberto

Cada uma com o padrão que assumo se não houver resposta.

1. Reverter o ADR 0011 (um plano pago só)? Padrão: sim, com ADR novo.
2. Nome interno do plano de R$ 9,90: reusar `essencial` (hoje apelido de Premium)? Padrão: sim, depois
   de confirmar que nenhum banco tem esse valor.
3. Existe assinatura real de R$ 39,90 ou R$ 179 ao ano no Asaas? Padrão: assumo que não e tiro os
   preços legados só depois da confirmação.
4. As 5 h do Essencial valem para transcrição e tradução? Padrão: sim, sob demanda (não por padrão).
5. No Ao Vivo, as 10 h ao vivo somam às 20 h por trechos? Padrão: somam.
6. Premium cai de 40 h para 20 h por mês e o anual de R$ 179 para R$ 149,90? Padrão: sim.
7. O teste de 14 dias é de qual plano? Padrão: Premium, sem anúncios durante o teste.
8. As 3 h de nuvem que o Grátis tem hoje em aparelho fraco: continuam, viram amostra por anúncio ou
   saem? Padrão: viram amostra por anúncio, com teto global.
9. "Sincronização" no Essencial: o Grátis deixa de guardar no servidor? Padrão: não; o Grátis mantém o
   que tem hoje e a linha sai da comparação.
10. Quais vozes são a "básica" e a "boa"? Padrão: decidir depois de medir custo.
11. Troca de plano: vale no próximo ciclo? Padrão: sim, sem pro-rata.
12. Serviço para o "Ao vivo" e exigência de retenção zero. Padrão: escolher por medição, exigindo
    retenção zero.
13. Anúncios: qual rede, domínio próprio, consulta jurídica, e se a edição estática (todos sem conta)
    fica sem anúncio. Padrão: sem anúncio na estática e nada ligado antes da consulta.
14. No computador, o Intérprete volta a ter duas colunas sem metade virada? Padrão: fica como o
    protótipo.

## 11. Decisões tomadas em 09/10/2026 (o dono delegou: "você mesmo pode fazer essas coisas")

O dono delegou as decisões pendentes e pediu a implementação dos planos e das telas do protótipo. Valem
os padrões da seção 10, com estes registros:

1. O ADR 0011 é substituído por um ADR novo (quatro planos).
2. O plano de R$ 9,90 usa o id `essencial`; o apelido antigo (`essencial` = Premium) sai.
3. Preços legados (R$ 39,90 = Premium, R$ 179 ao ano) saem. O servidor nunca foi implantado
   (`docs/ESTADO-DO-LANCAMENTO.md`), então não pode haver assinatura neles criada por este sistema. Se o
   dono tiver cobrança manual no Asaas nesses valores, precisa avisar ANTES de abrir a venda.
4. Essencial: 5 h de nuvem por trechos (transcrição e tradução), sob demanda, não por padrão.
5. Ao Vivo: 10 h ao vivo SOMADAS às 20 h por trechos.
6. Premium: 20 h por mês; anual R$ 149,90.
7. Teste de 14 dias: do Premium, sem anúncios durante o teste.
8. As 3 h de nuvem de alívio do Grátis viram a amostra por anúncio premiado, com teto global diário.
   Enquanto a flag `anuncios` estiver desligada, o alívio continua como está (o Grátis não perde nada
   antes de a amostra existir).
9. O Grátis continua guardando no servidor; "sincronização" sai da comparação de planos.
10. Vozes "básica" e "boa": a escolher por medição de custo; até lá o Premium e o Ao Vivo usam a mesma
    voz neural que existe hoje.
11. Troca de plano: vale no próximo ciclo, sem pro-rata.
12. Serviço do "Ao vivo": não escolhido. O plano Ao Vivo entra na matriz e nas telas, mas NÃO é vendido
    enquanto a flag `stt_ao_vivo` estiver desligada.
13. Anúncios: política e espaços entram atrás da flag `anuncios`, desligada, sem rede de anúncios
    configurada. Sem anúncio na edição estática, no perfil protegido e no Quest. Ligar exige domínio
    próprio, rede escolhida e consulta jurídica: continua sendo decisão do dono.
14. Intérprete no computador: duas colunas, nenhuma metade virada (a metade virada é para o aparelho
    deitado entre duas pessoas; num monitor as duas leem do mesmo lado).

Do selo: o modo do reconhecimento do navegador passa a ser gravado por fala; o motivo fica visível; a
linha aparece também sem rótulo técnico. Do cursor: o tamanho menor fica; sobre superfícies laranja ele
passa à cor de tinta para não sumir.

Venda: tudo que cobra entra atrás de `venda_planos_v3`, desligada. Abrir a venda é ato do dono.
