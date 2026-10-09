# Aparelhos, planos e nuvem: o que o grátis resolve e o que justifica pagar

Estudo de 09/10/2026, pedido do dono. Junta quatro levantamentos feitos no dia: a auditoria do caminho
da fala no código, a pesquisa de modelos e preços do OpenRouter, a pesquisa técnica por aparelho e a
pesquisa de mercado. Nada aqui foi implementado. Números de terceiros têm a data da fonte; esta área
muda todo mês e vários pontos pedem medição própria (seção 6).

Marcas: **[C]** confirmado em fonte; **[I]** inferência; câmbio PTAX de 09/10/2026, R$ 4,99 por dólar.

## 1. O que cada aparelho consegue de graça

| Aparelho | Transcrição grátis | Tradução grátis | Voz grátis | Onde não há via grátis aceitável |
|---|---|---|---|---|
| Computador, Chrome/Edge | Sim: reconhecimento do navegador em tempo real (inclusive som de aba, Chrome 135+) e modelo local em WebGPU | Sim: tradutor embutido do Chrome (138+), Bergamot, opus-mt | Sim (boa no Edge, vozes online) | Português local de alta precisão; gíria e registro na tradução |
| Computador, Firefox/Safari | Só modelo local | Bergamot, opus-mt | Sim | Texto durante a fala com pouca espera |
| Celular Android | Reconhecimento do navegador só pelo microfone, em frases curtas que reiniciam; modelo local só em topo de linha, sem medição pública | Só modelo próprio (o tradutor do Chrome não existe no celular) | Sim, qualidade variável | **Som do sistema (impossível na web)**; legenda contínua estável |
| iPhone | Reconhecimento instável; memória de ~1,5 GB por aba limita modelo local | Só modelo próprio | Sim | **Som do sistema**; sessão longa confiável |
| Meta Quest 3 | **Não existe** no navegador (quatro fontes independentes, a mais recente de 03/2026) | Só modelo próprio, não medido | **Relatos dizem que não** | Transcrição, voz e som do sistema |

Dois limites são da plataforma e pagar não resolve: no celular e no Quest a web não capta o som de
outro aplicativo; o aparelho só ouve o ambiente pelo microfone.

Concorrentes grátis do sistema (legendas do Windows, do Chrome, do Android, do iOS, do Quest): nenhum
mostra os dois idiomas lado a lado nem guarda vocabulário [I]. A legenda do Windows só traduz para
inglês ou chinês; a do Quest não traduz [C].

## 2. Quanto o modelo pago acrescenta

**Transcrição, de cada 100 palavras, quantas erra** (áudio de teste; em conversa real com ruído o erro
dobra ou triplica [I]):

| Onde roda | Inglês | Português |
|---|---|---|
| No aparelho (Moonshine small/medium, Whisper small, Nemotron streaming) | 7 a 9 | 7 a 13 |
| Whisper large-v3-turbo na nuvem (US$ 0,012 a 0,04 por hora) | 5 a 8 | ~5 |
| Melhores pagos (Scribe v2, AssemblyAI Universal-3 Pro) | 2 a 6 | ~3 |

Fontes: Open ASR Leaderboard v4 (03/2026), Artificial Analysis (10/2026), artigo do Whisper (2022, a
única tabela por tamanho em português: antiga). Não existe medição independente do reconhecimento do
navegador.

- **Em inglês, no computador, o grátis fica a 1 ou 2 palavras em 100 do pago.** Em português a
  distância é de 4 a 10.
- **Espera tolerável** em legenda ao vivo: até 2 ou 3 s (estudo de 2026 com 216 espectadores; Ofcom).
  Texto durante a fala fica abaixo disso; Whisper por trechos somado à tradução chega perto do limite.
- **Tradução:** modelos de linguagem ganham dos tradutores locais sobretudo em contexto, gíria e
  registro (formal ou informal, "tu" ou "você"). Não há comparação pública para frase curta de conversa.
- **Voz:** as vozes neurais ganham das vozes padrão de Android e do Chrome; as "Natural" do Edge se
  aproximam.

**O que justifica pagar, por aparelho:**
- **Quest:** sem nuvem não há legenda nem intérprete. A nuvem é pré-requisito do produto ali.
- **Celular:** sessão contínua e estável, e tradução (não há tradutor embutido).
- **Computador:** português e outros idiomas com menos erro, áudio ruidoso, tradução com registro.
  Quem estuda inglês num computador com placa de vídeo quase não precisa de nuvem.

## 3. Custos de nuvem (OpenRouter e alternativas)

- Transcrição por trechos, Whisper large-v3-turbo: US$ 0,012 a 0,04 por hora. Sem texto durante a fala.
- Transcrição com texto durante a fala (Deepgram ~US$ 0,29 a 0,35/h; AssemblyAI ~US$ 0,15/h): 12 a 30
  vezes mais.
- Tradução por modelo de linguagem: ~US$ 0,005 a 0,015 por hora de conversa.
- Nuance: ~US$ 0,00023 por chamada (Haiku 5.5) a US$ 0,0046 (Sonnet 5.5).
- Voz neural: US$ 0,03 (Kokoro) a US$ 1,00 (ElevenLabs) por hora falada.
- Um Premium de 20 h de nuvem + 200 Nuances custa US$ 0,90 a 1,50 por mês (R$ 4,50 a 7,50).
- OpenRouter: taxa de 5,5% na compra de crédito; com menos de US$ 10 comprados, só 50 pedidos grátis
  por dia e checagens extras de saldo. Retenção zero (`zdr`) deve ser exigida em todo pedido (LGPD,
  menores). A chave do dono tem limite de US$ 1.

## 4. Proposta de planos

| | Grátis | Essencial | Premium | Ao Vivo |
|---|---|---|---|---|
| Preço mensal | R$ 0 | R$ 9,90 | R$ 19,90 | R$ 39,90 |
| Preço anual | | R$ 79,90 | R$ 149,90 | só mensal no início |
| Para quem | Quem está conhecendo; computador com placa de vídeo | Estudante no computador: sem anúncio e com Nuance | Quem depende de nuvem: celular, notebook fraco, Quest | Intérprete na rua, viagem, reunião, aula ao vivo |
| O que entra | Tudo no aparelho sem limite, jogos, revisão; anúncio leve | Sem anúncio, sincronização, Nuance rápida, 5 h de nuvem | + transcrição e tradução na nuvem (20 h), intérprete automático, voz neural básica | + texto durante a fala pela nuvem (10 h), voz neural boa |
| Custo no uso típico | R$ 0,03 a 0,25 | R$ 0,75 | R$ 3,50 | R$ 7,00 |
| Custo no teto | R$ 0,37 | R$ 2,90 | R$ 7 a 10,50 | R$ 19 a 27,50 |
| Margem típica (mensal) | | ~78% | ~71% | ~72% |

Comparação: apps de idiomas no Brasil cobram de R$ 31,90 a R$ 69,90 por mês; Spotify R$ 23,90;
ChatGPT Go R$ 39,99; Otter Pro ~R$ 85. Nenhum concorrente junta legenda bilíngue de qualquer som,
revisão, jogos e intérprete.

Onde dá prejuízo [I]: Essencial mensal no Pix (a taxa de R$ 1,99 come 20%); Ao Vivo anual no teto com
Deepgram; voz ElevenLabs em qualquer nível; imposto de 15,5% (Anexo V) em vez de 6%.

Resultado mensal estimado, antes de custos fixos (R$ 300 a 600):

| Ativos | Conversão 1,5% | 3,5% | 7% |
|---|---|---|---|
| 100 | ~R$ 0 | R$ 24 | R$ 65 |
| 1.000 | ~R$ 5 | R$ 240 | R$ 650 |
| 10.000 | ~R$ 50 | R$ 2.400 | R$ 6.500 |

No cenário conservador a amostra de nuvem do Grátis come todo o ganho. Com o Grátis 100% no aparelho,
10.000 ativos a 1,5% sobem para ~R$ 2.200. Referências de conversão: Duolingo ~9% depois de dez anos;
mediana do RevenueCat 2026 para apps com camada grátis, 2,1%.

## 5. Anúncios no Grátis

- **Rende pouco:** R$ 0,05 a 0,30 por usuário grátis por mês (o Duolingo faz ~R$ 0,27 com carga alta em
  app nativo). Anúncio leve em 1.000 usuários rende R$ 50 a 100; um ponto a mais de conversão rende
  R$ 115 a 145. O valor real do anúncio é ser motivo para assinar o "sem anúncios".
- **Exigências do Google AdSense [C]:** domínio próprio (`pages.dev` dificilmente passa [I]); páginas
  públicas com conteúdo (o app é quase todo atrás de login); proibido em tela sem conteúdo, em tela de
  comunicação privada (atinge legenda de chamada e intérprete) e colado em botão. Anúncio premiado na
  web é programa beta com inscrição (jogos HTML5) ou o Offerwall, liberado a todos em 04/2026.
- **Menores:** o ECA Digital (Lei 15.211/2025, em vigor desde 03/2026, sanções a partir de 01/2027)
  proíbe direcionar publicidade a crianças e adolescentes por perfil, e cita realidade virtual. O
  seguro: nenhum anúncio no perfil infantil nem no Quest; só anúncio não personalizado para todos.
  Vale consulta jurídica antes de ligar.
- **Recomendação:** premiado opcional (Seeds, ajuda extra, amostra de nuvem do dia) como formato
  principal; um espaço nativo no fim da rodada, na Biblioteca e uma faixa no Início; intersticial só
  entre rodadas, no máximo 1 a cada 5 minutos; nada nos três primeiros dias; nunca na captura, no
  intérprete nem no meio de uma rodada.

## 6. O que precisa de medição própria

1. Quest 3: uma página de diagnóstico (reconhecimento, vozes, WebGPU em página comum, captura de tela).
2. Quest e dois celulares: velocidade e temperatura de Whisper tiny/base e Nemotron por 10 minutos.
3. Chrome no computador: quais idiomas o reconhecimento no aparelho oferece (pt-BR?).
4. Erro do reconhecimento do navegador contra Whisper local, large-v3-turbo e um pago, no mesmo áudio
   real em inglês e português. Não existe medição pública.
5. Tradução: 100 a 200 frases curtas de conversa em opus-mt, Bergamot, tradutor do Chrome e dois modelos.
6. Uso real de nuvem por assinante antes de vender plano anual.

## 7. Achados do código (auditoria do caminho da fala)

- O fim da fala espera 800 ms de silêncio (31% do tempo medido); a nuvem nunca dá texto parcial; em
  vários cenários não há parcial nenhum (Quest, celular com nuvem primeiro, Modo desempenho, primeira
  fala em "Detectar", que é o padrão).
- Com nuvem permitida, todo pagante vai à nuvem primeiro, mesmo com placa de vídeo.
- O OpenRouter hoje só é reserva do tradutor e do tutor; os limites de pedidos do servidor estão no
  padrão da camada grátis da Groq; o preço do OpenRouter não está declarado no orçamento.
- A função do site estático só responde depois de traduzir.

Feito em 09/10 (commits `490fcf84`, `233579fa`): a fala aparece assim que começa; a tradução parcial
não é apagada no final; o Grátis não vai ao servidor para ser recusado; a marcação da Leitura e da
Transcrição segue a voz e o áudio.
