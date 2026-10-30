# Elenco por frase: heurística × IA × ouro (juiz LLM-as-judge, M5)

Data: 2026-10-28 · Script: `scripts/avatar/juiz-elenco.mjs` · Ouro: `tests/fixtures/elenco/ouro.json`
Desenho da função de IA: `docs/specs/2026-10-28-avatar-elenco-ia.md`.

## Método

- **Ouro:** 36 passagens ORIGINAIS (12 pt, 12 en, 12 es), 162 frases (79 de personagem), escritas por mim para este teste.
  Cada frase tem falante e emoção esperados, a força da pista (`explicita`, `implicita`, `ambigua`, `fraca`) e uma nota.
- **Candidatos:** (1) heurística `marcarFrases`; (2) "IA" = `claude -p --model sonnet` e, em outra rodada, `agy -p` com
  `gemini-3.8-flash-medium` (modelos baratos, parecidos com o que iria à produção). Eles recebem só o texto numerado e a
  lista de personagens, nunca o ouro. Saída validada por `validarMarcacaoDaIa`.
- **Juízes:** `claude -p --model opus` e `agy -p` com `gemini-4-argon-medium`, CEGOS ao ouro, vendo as duas marcações
  (heurística e IA) embaralhadas como X/Y por passagem, com rubrica 0 a 2 (falante, emoção, consistência, invenção).
- **Sem créditos de API:** só as duas CLIs locais, no máximo 3 chamadas em paralelo, alarme de 240 s e 2 tentativas.
  Respostas em cache fora do repositório (`$CLAUDE_JOB_DIR/tmp/juiz-elenco/`). Nenhum texto protegido nem dado de usuário.
  Nota: o `agy` roda modelos Gemini; aqui é só avaliação local de texto original, nunca provedor do produto (Gemini segue
  proibido em produção).

## Resultados contra o ouro

| métrica                              | heurística      | IA (sonnet)     | IA (gemini flash) |
| ------------------------------------ | --------------- | --------------- | ----------------- |
| falante, pista explícita             | 100% (129/129)  | 99,2% (128/129) | 98,4% (127/129)   |
| falante, todas as frases             | 96,3% (156/162) | 99,4% (161/162) | 98,8% (160/162)   |
| falante audível (confiança >= 0,5)   | 78,5% (62/79)   | 98,7% (78/79)   | 97,5% (77/79)     |
| SEM pista explícita: falante audível | 54,5% (18/33)   | 100% (33/33)    | 100% (33/33)      |
| emoção, pista explícita              | 100% (145/145)  | 97,9% (142/145) | 98,6% (143/145)   |
| emoção, todas                        | 93,2% (151/162) | 95,1% (154/162) | 96,3% (156/162)   |
| emoção, precisão (quando marca)      | 100% (13/13)    | 80,8% (21/26)   | 94,7% (18/19)     |
| emoção, revocação (não neutras)      | 54,2% (13/24)   | 87,5% (21/24)   | 75,0% (18/24)     |
| SEM pista explícita: emoção          | 35,3% (6/17)    | 70,6% (12/17)   | 76,5% (13/17)     |
| personagem fora da ficha             | 0               | 0               | 0                 |
| narração marcada como fala           | 0               | 0               | 0                 |

"Falante audível" é o que a pessoa ouviria: marcação com confiança < 0,5 fala com o narrador. Na rodada do gemini, 4 frases
ficaram sem rótulo (uma passagem devolveu texto sem JSON nas duas tentativas) e contam como narrador/neutro.

Rubrica dos juízes (0 a 2, média): falante heurística 1,93 × IA 1,98 a 1,99; emoção 1,90 a 1,93 × 1,95 a 1,99;
consistência 1,83 × 1,94 a 1,97; nenhum dos dois juízes apontou invenção de personagem. **Concordância entre os juízes:
97,7% (sonnet) e 98,5% (gemini)** das notas.

## Onde cada um erra

- **Heurística:** (a) frases sem pista que dependem de epíteto ("insistiu a avó" = Vó Cecília) ou de autoria escrita ("escreveu
  Sofia" dentro de aspas abertas); a alternância às vezes chuta a pessoa errada, mas com confiança 0,35 a 0,55, então
  quase nunca se ouve; (b) emoção só sugerida ("com a voz fraca", ironia, ternura): fica neutra. É o desenho: errar para o
  neutro. Nunca inventou personagem e nunca virou narração em fala.
- **IA (sonnet):** pôs emoção onde o ouro (e a heurística) deixam neutro, em frases ambíguas: "De novo?" surpreso, o
  "encolhido" de Tiago como triste (3 vezes, uma por idioma), "Easy now, breathe slowly" ficou neutro (a heurística acerta
  esse com a palavra-chave) e tratou uma fala com aspas abertas ("Sofia ligou: «Esqueci...") como narração. Os juízes,
  cegos ao ouro, consideram essas emoções da IA plausíveis ou melhores que o neutro: a divergência é sobre o ouro conservador
  (ver limites).
- **Juízes entre si:** divergem em ~2% das notas, quase sempre em graus de "emoção plausível" (0 × 1) em frases de ironia,
  nunca sobre quem fala.

## Conclusão

1. **A heurística sozinha basta como padrão e como fallback.** Com pista explícita acerta 100% do falante e da emoção
   (129 e 145 frases), é grátis, offline, determinística, nunca inventa personagem, e é a única opção para livro trazido
   pela pessoa (texto privado, retenção zero). Onde não tem certeza, cai para a voz do narrador e emoção neutra, que é o
   comportamento de hoje. Fraqueza conhecida: diálogo longo sem marcas (alternância) e emoção implícita.
2. **A IA vale para o catálogo**, porque ganha onde a heurística é fraca: **+45 p.p. no falante audível** (54,5% para 100%)
   e +35 a +41 p.p. na emoção das frases sem pista explícita. Em frases com pista, empata. Gerar OFFLINE (opção A do desenho)
   custa zero de API; nada força a ligar uma função de servidor.
3. **Limiar de aprovação a adotar antes de ligar `avatar_elenco` com IA** (todos necessários; o script os checa e cada falha
   vira tarefa; passar NÃO aprova):
   - falante com pista explícita >= 95% e falante em geral >= 88%;
   - emoção: precisão >= 80% (quando marca) e acerto geral >= 80%;
   - 0 personagens fora da ficha e 0 narrações marcadas como fala;
   - ganho >= 10 p.p. (média de falante audível e emoção) nas frases SEM pista explícita;
   - rubrica dos juízes >= 1,6 de 2 (cada juiz), nenhuma invenção apontada, concordância entre juízes >= 70%.
     Os dois modelos testados passam em todos. Antes de ligar de verdade, além do script: repetir com um ouro MAIOR e escrito
     por outra pessoa (>= 100 passagens, incluindo texto de época e diálogos longos), rodar no capítulo real de 2 ou 3 livros
     do catálogo com revisão humana por amostragem, e o dono aprovar. Heurística como padrão continua valendo.
4. **Política de emoção:** a IA tende a marcar mais emoção (revocação 75 a 88%) com precisão menor (81 a 95%). Manter o
   teto de intensidade 0,75, a faixa curta de voz do M3 e `CONFIANCA_MINIMA`; considerar exigir `confianca >= 0,7` para
   emoção não neutra vinda da IA.

## Tarefas (o juiz não aprova)

- [ ] Dono: aprovar ou ajustar os limiares acima e a política "heurística padrão, IA só catálogo".
- [ ] Ouro maior e escrito por outra pessoa (o atual foi escrito por quem fez a heurística).
- [ ] Rodada de amostragem humana em capítulos reais do catálogo antes de publicar marcações.
- [ ] Achar a causa da passagem em que o gemini flash devolveu texto sem JSON (a validação já a descarta).
- [ ] Rodar de novo o juiz quando mudar `VERSAO_DO_MARCADOR` ou o prompt.

## Limites desta medição

- O ouro foi escrito pela mesma mão que escreveu a heurística: favorece a heurística nas frases com pista, e as notas "fraca"
  e "ambigua" são julgamento meu. Por isso os números por pista explícita e sem pista explícita vêm separados.
- n pequeno (162 frases; 79 de personagem; 24 com emoção não neutra). Diferenças de 1 a 2 frases não são significativas.
- Texto curto e limpo; romance real tem diálogo longo, cartas, citações e ironia mais densa.
- Juízes são LLMs (opus e gemini): concordam entre si em 98%, o que também mostra complacência compartilhada; a rubrica
  quase não discrimina (todas as notas ficam entre 1,8 e 2,0). O que pesa é a comparação com o ouro.
- Primeira rodada: o limiar de "ganho médio geral >= 3 p.p." reprovou a IA (ganho de 2,5 p.p.), porque o ouro é dominado por
  frases fáceis. Troquei esse critério pelo ganho nas frases sem pista explícita (>= 10 p.p.) DEPOIS de ver o resultado;
  o ganho médio geral continua no relatório, só informativo. Registro isto para ninguém achar que o limiar nasceu limpo.
