# Ofertas de planos: banners, avisos e modal

Fase 8. Como o app fala de planos **sem atrapalhar o estudo**: quando uma oferta pode aparecer, com
que frequência, como mudar textos e gatilhos sem deploy, e como medir a conversão.

| Peça                                                 | Onde                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Forma do payload, avisos embutidos, eventos do funil | `src/core/ofertas.ts`                                                                |
| Validação do payload (zod)                           | `server/lib/ofertas.ts`                                                              |
| Motor (puro: decide se mostra, qual gatilho e como)  | `src/lib/ofertas/motor.ts`                                                           |
| Canal dos momentos (`babel:oferta`)                  | `src/lib/ofertas/eventos.ts`                                                         |
| Memória do aparelho (frequência, "não mostrar")      | `src/lib/ofertas/historico.ts`                                                       |
| Cota perto do fim (`GET /api/me/uso`, cache de 1 h)  | `src/lib/ofertas/cota.ts`                                                            |
| Quem pode testar (`/api/billing/status`, 1 h)        | `src/lib/ofertas/teste.ts`                                                           |
| Quem é a pessoa (plano, perfil protegido, teste)     | `src/lib/ofertas/plano.ts` (`planoDaOferta`, `pessoaDaOferta`)                       |
| Fim do teste de 14 dias (D-3 e D0)                   | `src/lib/ofertas/fimDoTeste.ts`                                                      |
| Instrumentação (funil anônimo)                       | `src/lib/ofertas/instrumentacao.ts` → `POST /api/metricas/ofertas`                   |
| Host único + componentes                             | `src/components/ofertas/` (`HostDeOfertas`, `CartaoDeOferta`, `ModalDeOferta`)       |
| Comparação de planos (não duplicada)                 | `src/components/views/Planos.tsx`, aberta com o plano sugerido destacado             |
| Contadores Prometheus                                | `server/http/metricas.ts` (`oferta_eventos_total`, `oferta_eventos_por_plano_total`) |

## Princípios

- **Nada bloqueia o estudo.** Nenhuma oferta aparece durante a **captura ao vivo**, durante uma
  **rodada de jogo** ou com **outro diálogo aberto** (a celebração de uma conquista, o salvamento da
  sessão). O pedido espera a tela liberar (até 10 min) e é descartado depois disso.
- **Uma por vez**, e o banner não é modal: não prende o foco, não escurece a tela.
- **"Não mostrar novamente" é para sempre**, por gatilho, e está visível em todo componente.
- **Flag desligada = só o que é informação.** Com `oferta_planos` desligada, só aparecem os avisos
  funcionais (a cota acabou, a cota está perto do fim), com textos embutidos. Toda oferta
  promocional depende da flag ligada. **A flag nasce LIGADA** desde a migração 0039 (decisão do dono,
  29/09), com um gatilho para cada um dos seis momentos; o operador desliga pelo admin ou pela CLI. Desde a
  **0045** (C8 da change `planos-v2`) os textos são os da matriz v2: o Premium, a Tradução Nuance e o aparelho
  que segue sem limite — nada de "qualidade", "mais precisa" ou "planos pagos" —, com `variante: "v2"`.
- **Perfil protegido não recebe venda** (C8). A conta de menor, ou sem idade declarada, só vê os avisos
  funcionais, com o texto EMBUTIDO (nunca o da flag, que pode vender) e sem plano sugerido: a ação leva ao
  consumo do mês (ECA Digital, art. 18; LGPD, art. 14).
- **Design do app, não um anúncio à parte.** O banner e o aviso de cota têm o desenho do
  `AvisoDeConta` do Hub; o modal é a casca dos diálogos de "Sua assinatura" (`.dlg-cab`,
  `.dlg-corpo`, `.dlg-pe`); os ícones são lucide; nenhum emoji.

## Momentos (gatilhos)

| Momento                | Quem dispara                                                                                                                                     | Tipo        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `fim_de_cota`          | 402 `quota_exceeded` da nuvem (Tradutor IA, STT de nuvem, tutor) e a checagem de consumo quando um contador chega a 100%                         | funcional   |
| `cota_proxima`         | checagem de consumo (`GET /api/me/uso`, com conta, cache de 1 h): qualquer contador ≥ 80%                                                        | funcional   |
| `modelo_premium`       | 402 com `entitlement` (STT/LLM gerenciado é de plano pago) e o tutor respondendo `managed_requires_plan`                                         | promocional |
| `conquista`            | ao **fechar** a celebração de uma conquista (`RecompensaDesbloqueada`) — nunca sobre ela                                                         | promocional |
| `fim_de_sessao`        | depois de **salvar** uma captura; ao **sair** do Jogar depois de ter fechado ao menos uma rodada — nunca no meio nem sobre o resumo              | promocional |
| `convidado_para_conta` | a Fase 7 (modo convidado) com `window.dispatchEvent(new CustomEvent('babel:oferta', { detail: { momento: 'convidado_para_conta', contexto } }))` | promocional |
| `fim_do_teste`         | o host, a cada hora, para quem está no teste de 14 dias (o `teste` dos entitlements): D-3 e D0 (`fase`), só com os avisos embutidos              | funcional   |

Qualquer tela pode disparar um momento com `dispararOferta(momento, contexto)`
(`src/lib/ofertas/eventos.ts`) ou com o evento cru acima. Quem decide se algo aparece é sempre o
motor.

Antes desta fase, um 402 no Tradutor IA só pausava a nuvem, em silêncio: a pessoa via a tradução
piorar sem saber que a cota tinha acabado.

## Regras de frequência

Aplicadas pelo motor, nesta ordem:

1. **Flag**: promocional só com `oferta_planos` ligada.
   - **Perfil protegido** (a conta de menor, ou sem idade declarada): promocional recusada
     (`perfil_protegido`); o funcional vem só do gatilho embutido, sem plano sugerido. O convidado não entra
     aqui: para ele a única promocional já é criar a conta (onde a idade é perguntada).
2. **Planos-alvo**:
   - Premium e self-host nunca veem oferta promocional (não se oferece o Premium a quem é Premium). O
     Premium vê o aviso funcional de cota, mas sem venda: a ação leva ao **consumo do mês**.
   - Self-host não vê nem o aviso de cota (não há cota).
   - O **convidado vê a conta antes de qualquer plano**: para ele, a única promocional é
     `convidado_para_conta`, e a ação dos avisos de cota é "criar conta".
   - O gatilho só vale para os planos listados em `planos`.
   - Plano sugerido: Grátis → **teste** de 14 dias sem cartão quando o servidor deixa testar (`teste.estado`
     de `/api/billing/status`, lembrado 1 h no aparelho; sem resposta, não se promete o teste) ou
     **Premium**; convidado → conta; Premium, self-host e perfil protegido → nenhum. O selo do componente diz
     "Sugerido: 14 dias de Premium grátis, sem cartão" ou "Sugerido: Premium · R$ 19,90/mês" (da matriz).
3. **"Não mostrar novamente"**: permanente, por gatilho (vale também para os funcionais).
4. **Tela ocupada** (captura, rodada, diálogo aberto): adia.
5. **Teto global** (só promocionais): nenhuma nos **3 primeiros minutos** da sessão de uso; no
   máximo **1 por sessão de uso** (a aba; sobrevive a recarregar); **30 minutos** desde a última
   oferta de qualquer tipo.
6. **Por gatilho** (promocionais e funcionais): `maxPorDia` (24 h corridas), `maxPorSemana`
   (7 dias corridos) e `intervaloMinHoras` desde a última exibição daquele gatilho.

Os avisos funcionais embutidos (`GATILHOS_FUNCIONAIS`): fim de cota 1/dia, 3/semana, 12 h entre um
e outro; cota próxima 1/dia, 2/semana, 24 h.

Tudo é contado **no aparelho** (`localStorage['babel.ofertas.historico']`,
`sessionStorage['babel.ofertas.sessao']`). Não é cota nem segurança — é educação com a pessoa.

O card de planos do Hub (`CardDePlanos`) segue a mesma educação: a variante de armazenamento
(> 90%) respeita a dispensa e volta no máximo uma vez a cada 7 dias, com "Não mostrar novamente".

## Componentes

| `componente` | O que aparece                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `banner`     | Cartão discreto flutuante, embaixo e centrado (acima da dock no celular), tom de acento. Esc com o foco nele dispensa.             |
| `aviso_cota` | O mesmo cartão, tom de alerta.                                                                                                     |
| `modal`      | Diálogo nativo (foco preso, Esc e clique fora fecham), com "Agora não", "Não mostrar novamente" e a ação.                          |
| `comparacao` | O cartão de acento cuja ação abre a tela de **Planos** com o plano sugerido destacado (contorno de acento + "Sugerido para você"). |

A ação de qualquer componente leva: convidado → login/criar conta; Grátis → Planos com o cartão do
Premium destacado (quem pode testar vê ali o "Testar 14 dias grátis", um toque, sem cartão); Premium e
perfil protegido → aba "Consumo do mês"; o fim do teste → Planos, sem destaque de venda.

## Editar textos e gatilhos sem deploy

Tudo mora no payload da flag `oferta_planos` (forma completa e validação em `docs/flags.md`). Cada
gatilho:

```json
{
  "id": "conquista_premium",
  "momento": "conquista",
  "componente": "modal",
  "titulo": { "pt": "Você está indo longe", "en": "You are going far" },
  "texto": {
    "pt": "A Tradução Nuance do Premium mostra outras formas de dizer cada frase.",
    "en": "Premium's Nuance Translation shows other ways to say each sentence."
  },
  "cta": "Ver planos",
  "maxPorDia": 1,
  "maxPorSemana": 2,
  "intervaloMinHoras": 48,
  "planos": ["free"],
  "variante": "a"
}
```

- `titulo`, `texto`, `cta`: **texto** é uma chave do catálogo i18n (o português é a chave);
  **objeto** é o texto literal por idioma (idioma exato → base → `pt` → o primeiro).
- `variante` (opcional, `[a-z0-9_-]{1,24}`): rótulo de experimento A/B que vai para as métricas.
  Para um A/B, crie dois gatilhos do mesmo momento com `variante` diferente e separe o público com
  duas flags ou pelo `percentual`/`planos` das regras.
- Gatilho da flag para `fim_de_cota` ou `cota_proxima` **substitui** o aviso embutido daquele
  momento enquanto a flag estiver ligada.
- Vários gatilhos no mesmo momento: vale o primeiro, na ordem da lista, que passar nas regras.
- **Texto honesto** (C7/C8): nada de "% de qualidade" nem de "mais precisa"; "sem limite no dia a dia" só
  com a nota do uso justo ao lado (CDC: até 2 h de nuvem por dia e 40 h por mês, depois a legenda segue no
  aparelho); não prometa o teste de 14 dias no texto (nem todo mundo pode testar — o selo do host já diz a
  quem pode).

Pela CLI de operação (na máquina de produção). Cada campo enviado (`regras`, `payload`) substitui o
anterior **inteiro** — para mudar um gatilho, mande a lista completa; o campo que não for enviado
fica como está:

```sh
node dist-server/operacao.cjs flags definir oferta_planos '{"habilitada":true,"regras":{"planos":["convidado","free"],"percentual":20},"payload":{"gatilhos":[{"id":"conquista_premium","momento":"conquista","componente":"modal","titulo":{"pt":"Você está indo longe"},"texto":{"pt":"A Tradução Nuance do Premium mostra outras formas de dizer cada frase."},"cta":"Ver planos","maxPorDia":1,"maxPorSemana":2,"intervaloMinHoras":48,"planos":["free"],"variante":"a"}]}}'
node dist-server/operacao.cjs flags desligar oferta_planos   # tudo promocional some; os avisos de cota continuam
```

Ou pela API admin: `PUT /api/admin/flags/oferta_planos` com o mesmo corpo. Payload inválido volta
400 com a lista do que está errado. A mudança chega aos clientes em até 30 s (cache do servidor) e
no próximo refresh das flags do cliente (foco na aba ou 5 min).

## Métricas e conversão

Eventos (cliente → `POST /api/metricas/ofertas`, em lotes de até 20, a cada 2 s ou ao sair da aba):

| Evento                 | Quando                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `oferta_exibida`       | o componente apareceu                                                                    |
| `oferta_dispensada`    | "Agora não", X, Esc, clique fora                                                         |
| `oferta_nao_mostrar`   | "Não mostrar novamente"                                                                  |
| `oferta_clicada`       | a ação                                                                                   |
| `checkout_iniciado`    | a página de pagamento abriu (`planos/Checkout.tsx`); atribuído à última oferta clicada   |
| `assinatura_concluida` | o servidor confirmou a assinatura (`planos/Assinado.tsx`); uma vez por checkout iniciado |

Cada evento leva só `{ gatilho, componente, plano_atual, plano_sugerido, variante }`. **Sem id de
usuário, sem id de instalação, sem texto.** O servidor não grava nada: incrementa dois contadores.

- `oferta_eventos_total{evento, gatilho, componente}`
- `oferta_eventos_por_plano_total{evento, plano_atual, plano_sugerido, variante}`

Cardinalidade fechada: `evento`, `componente` e os planos são listas do código (fora delas = 400;
`plano_sugerido` ∈ `conta | teste | premium | nenhum`, e o nome antigo `essencial`/`pro` conta como Premium);
`gatilho` e `variante` só assumem valores que existem (os embutidos e os do payload atual da flag)
— o resto vira `outro`. Checkout sem oferta clicada nas últimas 24 h entra como `gatilho="nenhum"`
(orgânico).

Privacidade: respeita "Métricas de uso anônimas" (Ajustes → Privacidade) e não envia nada de conta
de menor restrita.

**A/B dos textos v2:** `variante="v2"` (0045) contra `padrao` (payload editado sem variante) mostra se os
textos da matriz v2 convertem melhor; o `plano_sugerido="teste"` mostra quanto do funil passa pelo teste. Funciona sem conta (a rota passa direto pelo servidor em memória), porque a
conversão convidado → conta é justamente a que importa medir.

### Lendo o funil (PromQL)

```promql
# Taxa de clique por gatilho (últimos 7 dias)
sum by (gatilho) (increase(oferta_eventos_total{evento="oferta_clicada"}[7d]))
  / sum by (gatilho) (increase(oferta_eventos_total{evento="oferta_exibida"}[7d]))

# Conversão exibida → assinatura, por gatilho
sum by (gatilho) (increase(oferta_eventos_total{evento="assinatura_concluida"}[30d]))
  / sum by (gatilho) (increase(oferta_eventos_total{evento="oferta_exibida"}[30d]))

# Rejeição: quem pede para nunca mais ver (sinal de gatilho chato)
sum by (gatilho) (increase(oferta_eventos_total{evento="oferta_nao_mostrar"}[7d]))
  / sum by (gatilho) (increase(oferta_eventos_total{evento="oferta_exibida"}[7d]))

# A/B: conversão por variante
sum by (variante) (increase(oferta_eventos_por_plano_total{evento="checkout_iniciado"}[14d]))
  / sum by (variante) (increase(oferta_eventos_por_plano_total{evento="oferta_exibida"}[14d]))
```

Os contadores são **por processo** (ver o bloco de cluster em `server/http/metricas.ts`) e zeram no
deploy: use sempre `increase()`/`rate()`, nunca o valor cru. `/metrics` só existe com
`METRICS_ENABLED=1`.

**Alerta de gatilho chato:** `oferta_nao_mostrar / oferta_exibida` acima de ~15% num gatilho é
sinal para baixar a frequência ou trocar o texto dele.
