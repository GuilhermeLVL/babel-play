## Context

A documentação do Gemini Live API para tradução ao vivo descreve um pipeline de **fluxo contínuo** (não por turnos): o cliente
manda áudio, recebe áudio traduzido, e pode pedir transcrição de entrada e de saída. A configuração tem `targetLanguageCode`
(**um** idioma de destino por sessão) e `echoTargetLanguage` (repetir ou calar quando a fala já está no idioma de destino).
Limitações declaradas: voz pode trocar após pausas, errar o gênero conforme o começo da fala, travar numa voz em conversa
rápida; detecção de idioma fraca com sotaque forte ou idiomas parecidos (ES/PT). Hibiki (Kyutai) é aberto, com voz transferida
e perto de tempo real em aparelho, mas cobre francês→inglês (e quatro idiomas→inglês no Hibiki-Zero), o que não fecha os
pares bidirecionais do produto. SeamlessStreaming chega a <2 s com política de leitura/escrita aprendida. No produto, a
chave Groq é da camada gratuita e não aguenta produção; o provedor deste nível exige chave do dono.

## Goals / Non-Goals

**Goals:**
- Decidir com número se o nível "Ao vivo" vale o custo e a complexidade.
- Se valer, entregar com proxy no servidor, queda para a cascata e teto de horas.

**Non-Goals:**
- Hospedar um modelo próprio (GPU) agora. Clonagem de voz. Substituir a cascata (ela segue como base).
- Prometer qualidade igual à humana ou "ilimitado".

## Decisions

1. **O spike vem primeiro e não gera código de produto.** Um script na bancada (`ao-vivo.mjs`) alimenta o mesmo áudio
   (FLEURS e conversa curta) à cascata e ao provedor; mede End Offset, LAAL e custo/hora; pontua com COMET e conta erros de
   voz e de gênero ouvindo uma amostra. O resultado vira relatório com IC 95% pareado, como o resto da bancada.
2. **Portão para virar produto.** Só entra se: (a) atraso médio ≥ 1 s menor que a cascata já otimizada; (b) qualidade não pior
   que a cascata no conjunto de conversa; (c) custo por hora ≤ o limite aprovado (referência US$ 0,12/h) com margem no
   Premium; (d) cobre pt, en, es e zh nos dois sentidos. Falhou um item, o nível não é lançado e o relatório diz por quê.
3. **Duas sessões, uma por sentido.** Como o destino é um só por sessão, a conversa usa uma sessão com destino = idioma do
   outro (para o que eu falo) e outra com destino = o meu (para o que o outro fala), cada uma ligada a uma fonte (presencial:
   dois lados do mesmo microfone com a decisão de lado atual; virtual: "Você" e "Eles"). `echoTargetLanguage: false`.
4. **Proxy no servidor.** O navegador abre o WebSocket com o nosso servidor, que autentica, conta minutos, aplica o teto e fala
   com o provedor. Nenhuma chave no cliente. No site estático (sem servidor) o nível "Ao vivo" fica oculto, como o automático.
5. **Queda automática para a cascata.** Erro de rede, de crédito, idioma fora da cobertura ou latência acima do limite por
   três falas trocam para o nível "Precisão" sem fechar a conversa e avisam a pessoa uma vez.
6. **Teto e cobrança.** Horas inclusas no Premium e pacote por Pix; medidor visível; ao atingir o teto, queda para "Precisão".
   Nunca "ilimitado". Preço final só depois do custo medido.
7. **Transcrição ligada.** Pedir `inputAudioTranscription` e `outputAudioTranscription` para alimentar o histórico da Fase 1 e a
   exportação, sem custo de reconhecimento extra.

## Risks / Trade-offs

- [Custo por hora estoura o plano] → portão (c), teto de horas, queda para "Precisão", medidor.
- [Voz troca ou erra o gênero] → relatório do spike conta o erro; documentar na tela como limite; opção de voltar à cascata.
- [Cobertura de idiomas e pares] → portão (d); fora dela, cascata.
- [Dependência de um provedor] → camada fina atrás de uma interface (`ProvedorAoVivo`), com a cascata como alternativa sempre pronta.
- [Privacidade: áudio vai ao provedor] → aviso e consentimento como na conversa virtual; só com sessão ativa; sem gravação.
- [Modelo em prévia muda] → versão fixada na configuração e teste de contrato.

## Migration Plan

Spike sem produto. Se passar: atrás de `babel.interprete.aoVivo` e do entitlement; liberar para o dono, depois para o
Premium. Reversão = desligar a chave; a cascata nunca sai do ar.

## Open Questions

- Há chave e termos do provedor aprovados pelo dono? (a chave Groq atual é gratuita e não serve; a do provedor do nível "Ao vivo" é outra)
- Qual o preço do pacote de horas por Pix? Definir só com o custo medido.
