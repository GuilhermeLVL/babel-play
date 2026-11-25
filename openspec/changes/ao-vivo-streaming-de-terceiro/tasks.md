## 1. Papel: o que decide antes de qualquer dinheiro (a mais arriscada primeiro: o DPA)

- [ ] 1.1 **[D]** Consulta jurídica sobre voz de menor em terceiro (LGPD art. 14, ECA Digital, transferência internacional art. 33):
      pode, com que base e com que aviso. Verificar: parecer anexado em `docs/auditoria/` e a regra de menores da tarefa 2.3
      atualizada para refletir o parecer.
- [ ] 1.2 **[D]** Escolher 3 a 4 candidatos a avaliar (sugestão: AssemblyAI, Deepgram, Soniox, Speechmatics; Gladia e Gemini
      fora). Verificar: lista assinada pelo dono em `docs/` antes de qualquer contato comercial.
- [ ] 1.3 **[D]** Pedir a cada candidato o DPA e a política de retenção e treino POR ESCRITO. Verificar: os 3 a 4 documentos
      arquivados (fora do repositório se tiverem cláusula de confidencialidade) e um resumo de uma linha por cláusula na matriz.

## 2. Matriz e simulação (sem custo de IA)

- [ ] 2.1 Matriz de escolha em `docs/auditoria/` (preço/h, mínimo por sessão, idiomas pt/en/es/zh/ja, latência até o parcial,
      retenção, treino, região, subprocessadores, cláusula de menores). Verificar: cada célula com fonte (contrato, página
      datada ou medição) e as não confirmadas marcadas como tal; revisão pelo subagente `revisor-critico`.
- [ ] 2.2 Simulação de custo e margem do plano `aovivo` por provedor (uso típico, uso justo de 2 h/dia, pior caso) a partir do
      medidor de minutos e da matriz de `src/core/planos.ts`. Verificar: planilha ou script em `scripts/custo/` com saída
      reproduzível e a margem líquida em R$ e US$; marcar quem fecha e quem não fecha.
- [ ] 2.3 Regra de menores escrita como requisito testável (recusa na borda, sem áudio no proxy, queda para trechos ou aparelho).
      Verificar: os cenários de `specs/ao-vivo-streaming/spec.md` revisados contra o parecer da 1.1.
- [ ] 2.4 **[D]** Decidir o lugar do produto: (a) plano Ao Vivo legado volta, (b) complemento do Pro, (c) arquivar. Verificar:
      decisão com data em `docs/pendencias-do-dono.md` e `planos-v3` §10 atualizada (10.1 por referência, ou §10 abandonada).

## 3. Spike curto (só com a finalista, só com custo declarado)

- [ ] 3.1 **[D]** Declarar provedor, chave (em `~/.config/ai-kit/keys.env`, nunca no repositório) e teto de gasto do spike
      (sugestão: US$ 2). Verificar: o teto escrito na change antes do primeiro pedido pago.
- [ ] 3.2 **[R]** 10 min de áudio de teste (pt, en, es, zh) pelo provedor, com a bancada `scripts/eval-fala/bancada/nuvem.mjs`
      estendida só com o adaptador de fluxo do spike (fora de `src/`). Verificar: latência até o parcial (p50 e p95), erro por
      idioma e custo medido por hora; relatório em `docs/auditoria/eval/` com a diferença contra a estimativa.
- [ ] 3.3 **[D]** Decidir seguir, trocar de provedor ou parar, com base na 2.2 e na 3.2. Verificar: a decisão registrada com os
      números; se "seguir", abrir a change de implementação (ou retomar `planos-v3` §10.2 a 10.4).

## 4. Preparação para a implementação (só se a 3.3 for "seguir")

- [ ] 4.1 Reconciliar com `planos-v3-e-rota-inteligente` §10 e `interprete-ao-vivo` (sem duplicar tarefas) e com os planos v4
      (o `aovivo` está `encerradoPor` a venda v4). Verificar: lista de tarefas movidas ou riscadas nas duas changes.
- [ ] 4.2 Fatias da implementação, a mais arriscada primeiro: (1) proxy WebSocket com recusa de perfil protegido e corte por teto;
      (2) adaptador e degrau `nuvem-ao-vivo`; (3) reserva em blocos de 30 s e medidor; (4) UI do nível "Ao vivo"; (5) venda.
      Verificar: cada fatia com teste de rede mostrando zero byte de áudio saindo para perfil protegido ou sem consentimento.
- [ ] 4.3 **[D]** Aprovar o texto da política de privacidade com o novo subprocessador e liberar `stt_ao_vivo` no staging.
      Verificar: política publicada e `flags listar` no staging; produção só depois do 10 min estável **[R]** no Quest e num
      celular.
