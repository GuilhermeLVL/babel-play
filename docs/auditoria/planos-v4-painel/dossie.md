# Dossiê para o painel de avaliação de planos — Frasy (23/10/2026)

## O produto

App web brasileiro para aprender idioma com o que a pessoa já assiste e conversa. Legenda bilíngue ao vivo de qualquer áudio (vídeo, aula, jogo, conversa), intérprete de conversa frente a frente, cartões com repetição espaçada, jogos de vocabulário, leitura, biblioteca, exportação Anki. Roda no navegador; computador, celular, Quest. Atende menores (ECA Digital Lei 15.211/2025, em vigor desde 17/03/2026; LGPD art. 14): menor não compra; o responsável paga por vínculo; perfil protegido não recebe oferta promocional nem anúncio.

## O que mudou agora (out/2026)

O Grátis ganhou um modelo local "Preciso" (Parakeet v3) que erra ~6 em 100 palavras em pt/es (antes ~19) sem placa de vídeo, em computador com 8 GB. Legenda e tradução no aparelho são sem limite e sem custo para nós. A nuvem do pago, que era o principal motivo para pagar em PC bom, perdeu força.

## Planos hoje (v3, no ar no staging)

|                                                                                                         | Grátis                                        | Essencial R$ 9,90/mês (R$ 79,90/ano) | Premium R$ 19,90 (R$ 149,90/ano, 12x) | Ao Vivo R$ 39,90 (fechado)         |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------ | ------------------------------------- | ---------------------------------- |
| Legenda/tradução no aparelho                                                                            | sem limite                                    | sem limite                           | sem limite                            | sem limite                         |
| Nuvem (Precisão)                                                                                        | 3 h/mês só em aparelho fraco (flag desligada) | 5 h/mês                              | 20 h/mês, até 2 h/dia                 | 20 h + 10 h "texto durante a fala" |
| Tradução Nuance (outras formas de dizer, formal/informal, polir sessão, glossário)                      | não                                           | sim                                  | sim                                   | sim                                |
| Tutor iChat (explicar palavra, resumir sessão, frase de exemplo, montar revisão)                        | não                                           | sim (cota de tokens)                 | sim                                   | sim                                |
| Intérprete automático (reconhece quem fala)                                                             | não (cada um toca o seu lado)                 | não                                  | sim                                   | sim                                |
| Voz natural (TTS)                                                                                       | voz do aparelho                               | não                                  | sim (pronta, desligada)               | melhor                             |
| Jogos, cartões, leitura, biblioteca, Anki, importação PDF/DOCX/legenda/web, estatísticas, sincronização | sim                                           | sim                                  | sim                                   | sim                                |

Teste: 14 dias de Premium sem cartão (ou 3 h de nuvem). Anúncios: prontos e desligados (só adultos, nunca na captura).

## Custos (estimativas do código)

- Hora de legenda na nuvem ≈ US$ 0,03–0,08 (STT + tradução). LLM gpt-oss-120b ~150 mil tokens por hora de fala ≈ US$ 0,036. Mensagem de tutor estimada ≈ US$ 0,0003–0,001. Voz natural ≈ US$ 0,054/h (≤ US$ 0,60/mês por assinante).
- Líquido por assinante (após Asaas ~R$ 1,09 e Simples ~6%): Essencial ≈ R$ 8,22 (US$ 1,47); Premium ≈ R$ 17,62 (US$ 3,15); Ao Vivo ≈ R$ 36,42. Câmbio R$ 5,60.
- Fixo ≈ R$ 165/mês. Pix Automático disponível (taxa Pix ~R$ 0,99).

## Mercado (pesquisa, preços BR ago/2025 quando houver)

Duolingo Super R$ 14,99/mês (R$ 179,90/ano); Família R$ 27,91 (5 pessoas); Max R$ 33,33 (IA: conversa por voz e roleplay; "Explain My Answer" virou GRÁTIS em 01/2026). Language Reactor Pro ~US$ 5–10; Lingopie US$ 6,99; LingQ US$ 14,99; Migaku ~US$ 9; Trancy US$ 3,5–6; Speak US$ 17,99–39,99 (tutor por voz). Tutor por voz é o que sustenta ticket alto; família é degrau comprovado (~1,9× o individual). Mediana de apps US$ 12,99/mês.

## Restrições inegociáveis

- Nada do que o Grátis tem hoje é retirado. Sem urgência falsa, contagem regressiva, culpa, sorteio pago, cobrança surpresa, cancelamento difícil. Sem oferta para perfil protegido (menor/idade não declarada). Gemini proibido. Retenção zero nos provedores de IA. Cada preço cobrável precisa ser um valor único (o servidor identifica o plano pelo valor).

## Alternativas em avaliação

### A — "v3 com o texto certo" (mexer pouco)

Mesmos preços e cotas. Corrige a tela para o novo Grátis. Essencial passa a nomear o tutor iChat como benefício ("explica e resume com IA"). Premium liga a voz natural. Ao Vivo segue fechado.

### B — "Estudar com IA" (reorganizar por objetivo)

- **Grátis** (igual a hoje): tudo no aparelho sem limite, intérprete manual, jogos/cartões/Anki, 3 h de nuvem em aparelho fraco.
- **Plus R$ 14,90/mês (R$ 119,90/ano)** — "estude o que você assiste com IA": explicação contextual de cada frase (por que essa tradução, gramática da cena), Nuance + polir sessão, resumo da sessão que vira cartões automáticos com exemplos, tutor por texto (~300 mensagens/mês), correção de frases escritas, plano de revisão semanal, 10 h de nuvem.
- **Família R$ 24,90/mês (R$ 199,90/ano)** — o Plus para até 4 perfis + painel do responsável (tempo de estudo, palavras aprendidas, sem o conteúdo ouvido), metas sem pressão; o responsável paga.
- **Pro R$ 34,90/mês (R$ 279,90/ano)** — conversa por voz com tutor (roleplay a partir da cena que a pessoa viu), pronúncia, voz natural, intérprete automático com voz, 30 h de nuvem, texto durante a fala quando existir.

### C — "Um pago só + família" (simplicidade)

- **Grátis** igual a hoje.
- **Premium R$ 19,90/mês (R$ 159,90/ano)**: tudo de IA (Nuance, explicação contextual, resumo→cartões, tutor texto e voz com cota justa, correção), voz natural, intérprete automático, 20 h de nuvem.
- **Família R$ 34,90/mês (R$ 279,90/ano)**: Premium para até 5 perfis + painel do responsável.
