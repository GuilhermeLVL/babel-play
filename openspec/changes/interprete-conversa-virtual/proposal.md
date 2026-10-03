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
