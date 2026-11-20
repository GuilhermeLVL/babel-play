# Juiz 7: advogada de direito digital da criança e do consumidor

Escopo: avaliei só o dossiê, sem ler código nem pesquisar na web. Sobre a lei: cito com segurança o CDC (arts. 6º, III e IV; 37, §2º; 39, IV; 49), a LGPD (art. 5º, II; art. 14 e §§) e o CBAP/Conar (art. 37, crianças e jovens). Cito a Lei 15.211/2025 (ECA Digital) **pelos temas**. A correspondência exata com os arts. 4º, 7º, 8º, 17, 18, 20, 22 e 35 é **suposição minha e precisa ser conferida no texto oficial** antes de ir para qualquer documento jurídico.

## Notas

| Critério                       | A (v3 com texto certo) | B (Estudar com IA) | C (Um pago só + família) |
| ------------------------------ | ---------------------- | ------------------ | ------------------------ |
| 1. Valor pelo preço            | 6                      | 8                  | 8                        |
| 2. Clareza                     | 8                      | 6                  | 9                        |
| 3. Justiça com o Grátis        | 9                      | 9                  | 9                        |
| 4. Motivo para upgrade         | 5                      | 8                  | 8                        |
| 5. Risco de dano (10 = nenhum) | 9                      | 7                  | 5                        |
| 6. Sustentabilidade            | 5                      | 7                  | 5                        |
| **Média**                      | **7,0**                | **7,5**            | **6,8**                  |

### Justificativas

**A**

1. Valor (6): o preço é baixo, mas depois do Parakeet o Essencial entrega pouco além do que o Grátis já faz; nomear o tutor ajuda, só que não muda o pacote.
2. Clareza (8): são poucas mudanças. Ainda resta a dúvida "o que é Nuance?" e a diferença entre 5 h e 20 h de nuvem que a maioria nem vai usar.
3. Justiça (9): nada sai do Grátis e não aparece empurrão novo.
4. Upgrade (5): a nuvem perdeu força e o tutor por texto sozinho é um motivo fraco.
5. Risco (9): é o menor risco. O tutor é só texto, com tarefas fechadas (explicar, resumir, dar exemplo). Não há conversa aberta por voz com adolescente nem painel novo de vigilância. Ligar a voz natural (TTS) de saída não trata voz da pessoa.
6. Sustentabilidade (5): o dossiê mostra o principal motivo de pagar enfraquecido. Com o fixo de R$ 165, o negócio depende de volume que A não cria.

**B**

1. Valor (8): o Plus resolve um problema real (entender a cena e virar cartão) a R$ 14,90, no nível do Duolingo Super.
2. Clareza (6): quatro degraus pagos (Plus, Família, Pro e os anuais) exigem leitura. A Família ser "Plus para 4" precisa estar escrito, senão o responsável acha que inclui o Pro.
3. Justiça (9): o Grátis fica intacto.
4. Upgrade (8): o objetivo de cada plano é claro: estudar com IA, cuidar da família, conversar por voz.
5. Risco (7): o desenho **isola o recurso de maior risco (conversa por voz/roleplay) no Pro**, que pode ser restrito a adulto, e a Família leva só o Plus, que é texto. O painel do responsável já nasce sem o conteúdo ouvido. Os riscos que sobram são "tempo de estudo" como métrica e a conversa aberta do tutor por texto (detalhes abaixo).
6. Sustentabilidade (7): os preços acompanham o mercado, a família vale ~1,7× o individual e o custo do Pro tem margem (voz e LLM ficam bem abaixo de R$ 34,90).

**C**

1. Valor (8): muito recurso por R$ 19,90.
2. Clareza (9): "Grátis ou Premium", e família para quem tem filhos. É o mais simples.
3. Justiça (9): o Grátis fica intacto.
4. Upgrade (8): tudo de IA num lugar só.
5. Risco (5): **o tutor por voz entra no único plano pago e, portanto, na Família de até 5 perfis**. Na prática, todo adolescente pago ganha conversa aberta por voz com IA. Para tirar isso de menor, eu teria de criar uma exceção por perfil, e aí "um pago só" deixa de ser verdade e a tela confunde. Pesam ainda os 5 perfis sem regra sobre quem pode entrar.
6. Sustentabilidade (5): voz, LLM e 20 h de nuvem a R$ 19,90, multiplicados por 5 perfis na Família, comprimem a margem. Não há degrau para ticket alto.

## Análise jurídica por recurso de IA

### 1. Tutor por texto (explicar, resumir, exemplo, correção, ~300 mensagens)

- **Risco:** médio-baixo enquanto se limita a tarefas sobre o idioma. Sobe se virar chat livre, porque o adolescente pode levar assuntos pessoais (autolesão, sexualidade, bullying). Com produto que atende menor, o dever de cuidado e o melhor interesse (ECA Digital; LGPD art. 14, caput) pesam.
- **Salvaguardas necessárias:**
  - instrução de sistema que restringe o tema ao idioma e ao conteúdo estudado;
  - moderação de entrada e de saída nos perfis protegidos;
  - resposta fixa de acolhimento com o CVV 188 quando aparecer sinal de risco à vida. Suponho que seja exigível pelo dever de cuidado, e é boa prática de qualquer forma;
  - nada de persona de "amigo" e nada de memória de fatos pessoais entre sessões;
  - aviso permanente "você está falando com uma IA", em linguagem simples (LGPD art. 14, §6º; CDC art. 6º, III);
  - retenção zero no provedor, sem uso para treino, e Gemini proibido (já está nas restrições).
- **Cota:** a mensagem de fim de cota no perfil protegido **não pode dizer "peça aos seus pais" nem mostrar oferta**. Seria pedir que a criança convença o adulto, o que o CBAP (art. 37) e a Resolução Conanda 163/2014 tratam como abusivo, e esbarra também no CDC (art. 37, §2º; art. 39, IV). Basta "Você usou as explicações deste mês. Elas voltam em [data]." e parar aí.

### 2. Tutor por voz / roleplay / pronúncia (B: Pro; C: Premium)

- **Risco:** é o **maior** do pacote.
  - A conversa aberta, falada e com papel ("roleplay a partir da cena") é o formato que mais cria vínculo emocional e mais escapa de filtro.
  - A cena de origem pode ser violenta ou adulta, porque a pessoa assiste a qualquer coisa.
  - A voz da pessoa é dado pessoal. **Se a pronúncia ou o intérprete automático usarem assinatura de voz para reconhecer quem fala, isso pode ser dado biométrico, portanto sensível (LGPD art. 5º, II)**, e exige base específica e, para criança, consentimento destacado do responsável (art. 14, §1º).
- **Salvaguardas mínimas:**
  - (a) Em **menores de 16 anos, ou em qualquer perfil protegido**, desligar por padrão. Ligar só com consentimento expresso do responsável no painel, com explicação do que é gravado e por quanto tempo. Suponho que o corte em 16 anos seja razoável; dá para ser mais conservador e liberar só para adultos no lançamento.
  - (b) Roleplay só com cenários fixos e seguros (restaurante, aeroporto, entrevista). Nada de "a partir da cena" sem filtrar o conteúdo da cena antes.
  - (c) Áudio processado e descartado, sem gravação guardada e com retenção zero no provedor.
  - (d) Limite de sessão (por exemplo, 20 a 30 min) com pausa sugerida. Nada de "só mais uma".
  - (e) Transparência de IA no início de cada conversa e na voz: não imitar pessoa real nem celebridade.
- **Proibido:** IA que se apresente como humano, que simule relação afetiva ou que peça dado pessoal no papel ("qual sua escola?"). Também é proibido mandar ou mostrar a gravação ao responsável sem que o adolescente saiba.

### 3. Intérprete automático (reconhece quem fala)

- O risco envolve **terceiros**: a outra pessoa da conversa frente a frente não é usuária e não consentiu.
- **Salvaguardas:** aviso visível e falado de que a conversa está sendo transcrita; separação de falantes sem identificar ninguém (sem perfil de voz persistente); nada guardado além da sessão, salvo o que a própria pessoa escolher salvar como cartão.
- Se o reconhecimento for por embedding de voz, vale o mesmo alerta de biometria do item 2.

### 4. Resumo do conteúdo ouvido → cartões

- O conteúdo ouvido pode ter dados de terceiros (aula, conversa) e dados sensíveis.
- **Salvaguardas:**
  - resumo gerado sob retenção zero;
  - guardado só na conta da pessoa;
  - **nunca enviado ao painel do responsável**: o B já diz "sem o conteúdo ouvido", e isso tem de valer também para o C;
  - apagamento fácil;
  - botão "não resumir esta sessão".
- Nunca usar o conteúdo ouvido para perfilar ou recomendar oferta. O ECA Digital veda perfilamento de criança e adolescente para publicidade, e a LGPD art. 14 exige melhor interesse.

### 5. Painel do responsável (B e C)

- O que está certo: mostra tempo de estudo e palavras aprendidas, **sem o conteúdo ouvido**. A supervisão parental é desejada pelo ECA Digital, mas tem de ser proporcional e respeitar a autonomia progressiva do adolescente.
- **Salvaguardas:**
  - o adolescente **sabe** que existe o painel e vê o mesmo que o responsável (aviso no perfil dele);
  - nada de histórico de frases, conversas com o tutor nem lista de vídeos;
  - preferir "palavras aprendidas" e "dias de revisão" a "tempo de uso", porque **tempo como meta incentiva uso prolongado**, que o ECA Digital manda evitar.
- **Metas sem pressão:**
  - nada de sequência que se perde nem notificação de "você está atrasado";
  - sem aviso à noite: suponho um horário de silêncio padrão para menores, das 22h às 7h;
  - nenhuma recompensa por tempo de tela.

### 6. Plano Família (B: 4 perfis; C: 5 perfis)

- **Salvaguardas:**
  - o titular pagante é adulto verificado: já existe "menor não compra; o responsável paga por vínculo";
  - cada perfil tem dados isolados, e um membro não vê o estudo do outro, exceto o responsável vendo os menores que estão sob ele;
  - um adulto convidado não pode ver o painel de um menor que não é dele;
  - a idade de cada perfil vem de mecanismo confiável, não só autodeclaração (exigência central do ECA Digital);
  - sair do plano não apaga o progresso do membro.
- **Proibido:** mostrar oferta, upgrade ou "convide amigos" dentro do perfil do menor. A compra e a gestão ficam só no perfil do responsável.

### 7. Cobrança e tela de planos (CDC)

- **Anual em 12x (A e o Premium de hoje):** a tela mostra o **total** e a parcela, e deixa claro que a renovação não é automática ou, se for, avisa com antecedência (CDC art. 6º, III; art. 39).
- **Direito de arrependimento:** 7 dias com devolução integral (CDC art. 49). Para o anual cancelado depois disso, suponho que o justo seja reembolso proporcional, e é recomendável deixar escrito.
- **Pix Automático:** a autorização do responsável fica explícita, com valor e periodicidade; o cancelamento é feito em um clique dentro do app e no banco.
- **Teste de 14 dias sem cartão:** está correto, porque não há conversão automática. Terminado o teste, volta ao Grátis sem perder nada e com uma mensagem neutra, sem contagem regressiva. No perfil protegido, o teste só pode ser ativado pelo responsável.
- **Valores únicos por plano:** é uma restrição técnica, mas a tela não pode usar centavos estranhos que confundam.

## Escolha

Eu escolheria a **B**, com condições. Ela é a única que deixa o recurso de maior risco (voz/roleplay) num degrau separado, o Pro, que pode ser restrito a adultos ou liberado com consentimento parental expresso, enquanto a Família entrega a menores só o Plus, que é texto e tem escopo controlável. As condições: Pro só para adultos no lançamento, painel sem tempo como meta e nenhuma oferta no perfil protegido. A A é a mais segura, mas não sustenta o negócio. A C é a mais clara, mas põe conversa aberta por voz com IA na mão de todo adolescente pago, e isso a torna a mais frágil juridicamente.

## Até 5 recursos ou mudanças que me fariam pagar (como responsável)

1. **Painel do responsável honesto e enxuto**: palavras aprendidas e revisões feitas, sem conteúdo ouvido, com o adolescente vendo o mesmo e um relatório mensal simples. Plano: Família. Preço justo: R$ 24,90/mês, como na B.
2. **Explicação contextual da frase e resumo → cartões, com escopo travado no idioma**: é o valor educacional real, de risco baixo. Plano: Plus. Preço justo: R$ 14,90/mês.
3. **Controles parentais por recurso de IA** (ligar ou desligar tutor, voz e intérprete automático em cada perfil menor, com explicação do que cada um trata): é isso que faria eu confiar o suficiente para pagar. Plano: Família, incluso sem custo extra.
4. **Conversa por voz com cenários fixos e seguros para adolescentes 16+, com limite de sessão e consentimento parental**: só depois de moderação testada. Plano: Pro, ou add-on da Família. Preço justo: R$ 34,90 individual, ou cerca de +R$ 10/mês por perfil adolescente na Família (suponho).
5. **Página "Como a IA trata seus dados" curta e verificável**: retenção zero, sem treino, provedores listados, sem Gemini e sem gravação de voz. Vale para todos os planos, inclusive o Grátis, porque transparência não se vende.

## O que me faria desistir, cancelar ou desconfiar

1. Qualquer oferta, cadeado de "desbloqueie" ou "peça aos seus pais" aparecendo no perfil do meu filho.
2. O painel mostrar o que meu filho ouviu ou conversou com o tutor, ou o tutor por voz conversando com ele em roleplay livre sem que eu tenha autorizado.
3. Renovação anual sem aviso, cancelamento fora do app ou Pix Automático sem valor e data claros.

## Frase que eu gostaria de ler na tela de planos

"Seu filho nunca vê ofertas, a IA não guarda o que ele ouve ou fala, e você escolhe quais recursos de IA ficam ligados para ele."
