## Abordagem escolhida: decidir por documento e por medida mínima, antes de código

Ordem pensada para gastar o menos possível antes de saber se a resposta é "não":

1. **Triagem em papel** (zero custo): matriz de 3 a 4 provedores lida nos CONTRATOS. Elimina quem não aceita retenção zero, não
   treina sem opt-out por escrito, não cobre os idiomas do produto ou cobra mínimo por sessão que inviabiliza o bloco de 30 s.
2. **Simulação de custo** (zero custo): com os minutos reais por sessão do medidor (`nivelDeServico.ts` já conta minutos por nível) e
   as tarifas, simular o plano de 10 h/mês e o pior caso (uso justo de 2 h/dia). Se a margem do `aovivo` não fecha com o provedor
   mais barato que passou na triagem, parar aqui.
3. **Spike curto na finalista** (centavos): 10 min de áudio sintético ou de teste do dono em pt, en, es, zh, com a chave do dono e
   custo declarado antes (regra "IA paga só com custo declarado"). Mede latência até o parcial e a taxa de erro por idioma com a
   bancada `scripts/eval-fala/bancada/nuvem.mjs`.
4. **Só então** a implementação (transporte em fluxo, reserva em blocos de 30 s, corte no servidor, adaptador no gateway, degrau
   `nuvem-ao-vivo`), que já está desenhada em `planos-v3` §10.

Proxy no servidor, sempre: a chave do provedor nunca vai ao navegador; o áudio de um perfil protegido não entra no proxy (recusa
na borda, antes de abrir o socket). Cota e plano continuam só em `src/core/planos.ts`.

## Alternativa descartada: usar o provedor "grátis" ou o mais barato sem DPA e liberar só para adultos

Descartada: o preço de entrada engana, o produto promete retenção zero, e um provedor sem contrato de não-treino transforma voz de
adulto em passivo de LGPD também. Além disso a separação adulto/menor depende da idade declarada, e um erro ali mandaria voz de menor a um terceiro sem contrato. O contrato vem antes do preço.

## Alternativa registrada, não escolhida agora: streaming no aparelho

Já existe o caminho local (Whisper/Parakeet/Moonshine com parciais incrementais, change arquivada `parciais-incrementais`). O Ao
Vivo na nuvem só se justifica onde o aparelho não alcança (celular fraco, idiomas pesados). A medição de campo da change
`latencia-publicada-por-aparelho` ajuda a dimensionar esse público; sem ela, a demanda do Ao Vivo é hipótese.

## Pontos para a implementação futura (não são tarefas desta change)

- Reserva em blocos de 30 s e corte quando o teto do plano ou o orçamento global (`AI_BUDGET_USD_*`) acabar.
- Contador próprio `sttAoVivoSegundosMes` (já existe na matriz) e tokens de tradução do plano.
- Telemetria só com contagem e custo, sem texto, no mesmo padrão de `custo_por_plano`.
