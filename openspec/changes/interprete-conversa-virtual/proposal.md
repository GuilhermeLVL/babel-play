> **Fases 4 e 5 de 6 do "Intérprete v3".** A Fase 4 (ouvir a outra pessoa) é entregável sozinha; a Fase 5 (mandar a minha
> voz traduzida para a chamada) fica atrás de um **spike com portão**. Usa o histórico em bolhas da Fase 1.
> Plano: `C:\Users\Guilh\.claude\plans\faca-um-brain-storm-temporal-crystal.md`.
> **Decisão do dono (02/10/2026):** a conversa virtual **também envia a minha voz traduzida para a chamada**.

## Why

Muita conversa entre línguas acontece pela internet (Meet, Zoom, Discord), não frente a frente. O app já sabe capturar o
áudio do PC (`acquireDisplayStream`, loopback, WASAPI do servidor), mas o intérprete só usa o microfone
(`salvarSessao.ts` limita o intérprete a "só no toque"). Falta o modo em que a pessoa **ouve a tradução do que o outro diz**,
**fala no seu idioma** e **o outro ouve a tradução**, sem trocar de ferramenta.

## What Changes

- **Modo "Conversa virtual"** na porta `/interprete`, ao lado do presencial. Dois fluxos rotulados: **Eles** (áudio do PC)
  e **Você** (microfone). A direção é fixa por fonte (sem detectar idioma): mais rápido e mais barato.
- **Captura de "Eles".** Preferir **áudio de aba**; tela inteira (Chrome/Edge no Windows) só com aviso de fone. Remover a
  trava "só no toque" do intérprete. Anti-eco: `restrictOwnAudio`, trilho sem DSP, e volume do original reduzido durante a
  tradução (só quando o app reproduz o original, ou seja, no áudio de aba).
- **Tela em bolhas** (da Fase 1), com "Eles" e "Você" rotulados, nível de cada fonte e "só legenda" (sem voz).
- **Enviar minha voz traduzida à chamada (Fase 5).** A leitura da **minha** tradução sai para um **microfone virtual**
  escolhido na lista de saídas (VB-Cable no Windows, BlackHole no macOS); na chamada, esse dispositivo é o microfone.
  Exige áudio sintetizado que o app controla (nuvem ou voz do site); a voz do aparelho não pode ser roteada por
  dispositivo. Guia de instalação, detecção por nome e tom de teste.
- **Consentimento e privacidade.** Aviso antes de começar ("a outra pessoa não é avisada pelo app: avise-a"), nada gravado
  por padrão, salvar sessão desligado, e o recurso só para maiores de 18.
- **Plano.** Novo entitlement `conversaVirtual` (Premium e selfhost), com o teto de horas de STT e de voz já existentes e
  medidor de minutos visível.

## Capabilities

### New Capabilities

- `conversa-virtual-captura`: modo com duas fontes rotuladas (Eles e Você), captura de aba ou do sistema, anti-eco e ducking.
- `conversa-virtual-saida-para-chamada`: roteamento da minha tradução falada para um microfone virtual, com guia, teste e queda segura.
- `conversa-virtual-consentimento`: avisos, privacidade, restrição de idade e plano da conversa virtual.

### Modified Capabilities

<!-- Nenhuma: o comportamento do modo intérprete ainda mora na change `modo-interprete` (não arquivada). -->

## Impact

- `src/lib/captura/salvarSessao.ts` (`soNoToque`), `LiveCapture.tsx` (fontes do intérprete, 728 e 2692), `fontesDeAudio.ts`,
  `gateway/capture/systemAudio.ts` (`acquireDisplayStream`, `restrictOwnAudio`), `controleDoInterprete.ts` (direção fixa por fonte).
- UI: `PaginaDoInterprete.tsx` (escolha de modo), `ModoInterprete.tsx` (bolhas e rótulos), novo
  `components/views/captura/interprete/ConversaVirtual*.tsx` e a folha do microfone virtual.
- Áudio: novo `src/lib/voz/saidaParaChamada.ts` (`setSinkId`, `AudioContext` de saída, tom de teste, detecção por nome).
- Plano: `core/planos.ts` (`conversaVirtual`), ajuste nos testes da matriz.
- Navegadores: Chrome/Edge no desktop (áudio de sistema só no Windows); Safari e Firefox sem suporte, com explicação.

## Revisão de 25/11/2026

**Estado:** precisa decisão do dono. A Fase 4 (ouvir a outra pessoa) está feita e atrás da chave de teste `virtual`: 1.2, 1.3, 1.4, 1.6,
1.7, 1.8 e 1.10 (`ConversaVirtual.tsx`, `FolhaDaConversaVirtual.tsx`, `interpreteVirtual()`, `tests/conversaVirtual.test.tsx`,
`tests/interprete-virtual.test.ts`). Falta para fechar a Fase 4: o plano (1.1), o medidor (1.9) e o ducking (1.5, só útil com a Fase 5).
A Fase 5 não começou: `src/lib/voz/saidaParaChamada.ts` não existe, e `setSinkId` só aparece em `audioDevices.ts` e na folha de vozes.

**O que ficou velho:**

- **Plano "Premium e selfhost"** (1.1 e spec de consentimento): o Premium saiu de venda na v4. O Plus tem `interpreteAutomatico: false` e
  o Pro (que traria o intérprete automático) está "em breve". A spec foi reescrita para "o plano que a matriz declarar".
- **Voz roteável** (2.3): a pergunta era "Kokoro local no Grátis?". O dono rejeitou o Kokoro (espeak-ng GPL, vozes ruins) e a
  frente de voz no aparelho agora tem Supertonic e Kitten (`voz-no-aparelho` e `voz-natural-no-aparelho-kitten`), que geram áudio
  por `AudioContext` e, portanto, podem ser roteadas. A voz do navegador (Web Speech) continua sem rota.
- **A entrada** mudou de página para folha (10/10) e a conversa usa o desenho novo (`ConversaDoPrototipo`); as tarefas já o dizem.
- **Retenção zero e menores:** a spec já exclui menores de 18 e proíbe gravar; isso segue valendo. A tela agora rola os avisos
  (#205/#206): reconferir que o aviso de consentimento aparece antes da captura no celular (1.10).
- A pergunta sobre app nativo (WASAPI e microfone virtual embutido) continua aberta e só se decide com os números do spike.

**Esforço:** P para fechar a Fase 4 (1.1 e 1.9 dependem só da decisão); M a G para a Fase 5 (spike 2.1 com Meet e Zoom em Windows e
macOS, depois 3.x). **Valor para quem usa:** médio; alto para o adulto que faz reunião em outro idioma, nulo para menores e celular
(só computador).

**Dependências e conflitos:** a voz roteável depende da decisão de `voz-no-aparelho` (README, incerta 3) e de
`voz-natural-no-aparelho-kitten` (#6); o medidor (1.9) depende do plano (planos v4); o fim de fala e os turnos pertencem a
`interprete-fim-de-fala-inteligente` (incerta 2). Arquivos em disputa: `PaginaDoInterprete.tsx`, `ConversaVirtual.tsx`,
`pipelineDeFala.ts` e `src/core/planos.ts` (também mexido por `planos-v3-e-rota-inteligente`); `polimento-movimento` toca a conversa do desenho novo.

**Decisões do dono:**

1. Plano da conversa virtual: (a) legenda dos dois lados livre para 18+ (roda no aparelho, custo zero) e a voz na chamada só no Plus e no
   selfhost; (b) tudo no Plus; (c) tudo livre, com voz só local. **Recomendo (a)**: não há custo de nuvem na legenda, e a voz é o que
   gasta cota.
2. Voz roteável do Grátis (2.3): (a) Kitten ou Supertonic locais, medidas no spike; (b) só a voz da nuvem do Plus; (c) sem voz, só legenda.
   **Recomendo (c) agora e (a) depois do spike**, para não bloquear a Fase 4.
3. Teste real com Meet, Zoom e Discord (2.1 e 4.2): quem roda e quando. Opções: (a) o dono em Windows e macOS, 30 min por plataforma;
   (b) convidar duas pessoas; (c) adiar a Fase 5 e arquivar só a Fase 4. **Recomendo (c)**: a Fase 4 já entrega o valor central, e o
   spike só se paga se houver demanda pela voz na chamada.
