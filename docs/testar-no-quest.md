# Testar o Babel Play no Meta Quest (e no celular)

Roteiro para medir no aparelho de verdade o que a emulação não mede. Cada item abaixo responde a uma
lacuna da pesquisa (`docs/pesquisa/2026-09-auditoria-seguranca-performance-dispositivos.md`, "Lacunas
que a pesquisa NÃO fechou") ou a um número da auditoria `openspec/audits/2026-09-26-dispositivos/relatorio.md`.

Tempo total: uns 30 minutos. Ao final você cola um bloco JSON no chat (seção 6).

## 0. O caminho curto: a página de diagnóstico (sem cabo)

Desde 01/10/2026 o app tem `/diagnostico` (no Quest: **Capturar → "Diagnóstico do aparelho"**, ou o
endereço direto). Ela roda no próprio navegador do headset e responde quase tudo das seções 3 e 4:

1. **Este aparelho**: núcleos, memória, placa de vídeo, Web Speech, tradutor, compartilhar tela.
2. **Microfone**: com um vídeo tocando no alto-falante, o nível com e sem o tratamento de voz.
3. **Compartilhamento de tela**: se o som vem junto, se continua sem a imagem e quanto a tela trava.
4. **Velocidade da transcrição**: o fator de tempo real de cada modelo e as travadas da tela.

Ao final, **Copiar o resultado** (JSON) ou um print da página. As seções abaixo (adb, DevTools remoto)
ficam para o que a página não mede: memória de pico com o modelo carregado e o perfil de desempenho.

## 0.1. As telas novas do headset (maquete de 01/10/2026)

As telas redesenhadas só existem no perfil `quest` e atrás de uma chave: **Mais → Diagnóstico do
aparelho → "Telas novas: ligadas"**. Desligar devolve na hora o menu e as telas de antes.

O que conferir com o headset na cabeça, e contar no chat:

1. **Trilho de ícones** (Início, Capturar, Intérprete, Jogar, Mais): dá para ler os rótulos? Os alvos
   são fáceis de acertar com o laser?
2. **Capturar**: o botão Começar, a escolha da fonte e, ao vivo, as duas falas e a faixa (Encerrar, A−,
   A+). Estreite a janela até o mínimo: deve sobrar só a fala atual, o tempo, A+ e Encerrar.
3. **Encerrar e resumo**: Salvar não pede título nem capa; o resumo mostra quantas falas foram pela
   nuvem e quantas no headset.
4. **Jogar**: a grade com as etiquetas ("Apontar", "Pede teclado"), a Memória com 12 cartas sem rolar,
   as respostas de um jogo de escolha.
5. **Vibração**: em Diagnóstico, "Testar a vibração do controle". Diga o que a página mostrou **e** se
   o controle se mexeu.

A emulação (Chromium com o perfil do Quest, a 1280 × 670 e 500 × 495) confere medidas
e rolagem, mas não a legibilidade a um metro de distância: essa só o aparelho responde.

## 0.2. A voz do intérprete e a resposta ao apontar (02/10/2026)

O navegador do Quest tem a API de voz e nenhuma voz instalada. A tradução do intérprete passou a ser
lida pela função `/quest/tts` do próprio site (Workers AI), **só com "Usar a nuvem" ligado**, em inglês,
espanhol, francês, chinês, japonês e coreano. O português fica em texto até existir o segredo
`DEEPINFRA_API_KEY` no Pages (antes de criá-lo: conferir a retenção no contrato da DeepInfra,
`docs/lgpd/operadores.md`).

O que conferir no headset, depois do deploy:

1. **Intérprete, português ↔ inglês, nuvem ligada.** Fale em português: a outra pessoa tem de OUVIR a
   tradução em inglês. A faixa do meio diz "Voz em English · Português em texto". Quanto tempo leva
   entre parar de falar e a voz começar? A voz soa natural o bastante?
2. **Repetir** e **Parar voz** do lado que ouve.
3. **Japonês e coreano**: o código de idioma que o modelo aceita não pôde ser conferido sem o deploy
   (a função tenta `jp`/`kr` e depois `ja`/`ko`). Se a voz ler japonês com sotaque de outro idioma, avise.
4. **Vibração ao apontar** (Mais → "Vibração ao apontar: forte"): o controle pulsa quando o raio entra
   num botão? E no clique? Em Ajustes → Aparência há o teste com Suave e Forte. Se não vibrar, o app
   toca um tique bem baixo no lugar; diga qual dos dois aconteceu.
5. **Efeito ao apontar**: o alvo cresce um pouco, ganha anel e o ícone acende; nos cartões grandes, um
   brilho segue o raio. Algum deles incomoda ou atrasa?

## 1. Preparar (uma vez)

1. No app Meta Horizon do celular: **Dispositivos → o seu Quest → Configurações do headset → Modo
   desenvolvedor → ligado**. Isso exige uma conta de desenvolvedor Meta (gratuita).
2. No PC: instale as **Android SDK Platform-Tools** (tem o `adb`) e tenha o **Chrome** instalado.
3. Ligue o Quest no PC pelo cabo USB-C. No headset, aceite **"Permitir depuração USB"**.
4. No PC, num terminal: `adb devices` — o Quest tem que aparecer como `device` (não `unauthorized`).

Fonte do passo a passo: https://developers.meta.com/horizon/documentation/web/browser-remote-debugging/
(a página cita `adb devices`, `adb reverse` e `chrome://inspect/#devices`).

## 2. Abrir o DevTools do Quest no PC

1. No Quest, abra o **Meta Quest Browser** no endereço do Babel Play (o do Pages, ou o do seu PC).
   - Para testar o seu PC local: `adb reverse tcp:5173 tcp:5173` (troque pela porta que você usa) e
     abra `http://localhost:5173` no Quest.
2. No Chrome do PC, abra `chrome://inspect/#devices`. O Quest aparece com as abas abertas; clique em
   **inspect** na aba do Babel Play.
3. A partir daqui, "Console" e "Performance" são do Quest, não do PC.

## 3. Sonda de capacidades (cole no Console e dê Enter)

Ela responde às lacunas da pesquisa: WebGPU em página 2D, SharedArrayBuffer/isolamento, Web Speech,
Translator API, captura de tela, memória e cota. Não muda nada no app. No fim, o `copy(...)` põe o
resultado na área de transferência do PC.

```js
(async () => {
  const r = { quando: new Date().toISOString(), ua: navigator.userAgent };
  r.perfilDoApp = {
    tipo: document.documentElement.dataset.dispositivo,
    modoLeve: document.documentElement.dataset.modoLeve,
  };
  r.crossOriginIsolated = self.crossOriginIsolated;
  r.sharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  r.nucleos = navigator.hardwareConcurrency;
  r.deviceMemoryGb = navigator.deviceMemory ?? null;
  r.ponteiroGrosso = matchMedia('(pointer: coarse)').matches;
  r.toques = navigator.maxTouchPoints;
  r.viewport = [innerWidth, innerHeight, devicePixelRatio];
  r.getDisplayMedia = typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  r.webSpeech = !!(self.SpeechRecognition || self.webkitSpeechRecognition);
  r.translatorApi = 'Translator' in self;
  r.webxr = !!navigator.xr;
  r.conexao = navigator.connection
    ? { saveData: navigator.connection.saveData, tipo: navigator.connection.effectiveType }
    : null;
  try {
    const a = await navigator.gpu?.requestAdapter();
    r.webgpu = a
      ? {
          adaptador: true,
          info: a.info ? { vendor: a.info.vendor, arquitetura: a.info.architecture } : null,
          maxBufferSizeMb: Math.round(a.limits.maxBufferSize / 1048576),
          maxStorageBufferBindingSizeMb: Math.round(a.limits.maxStorageBufferBindingSize / 1048576),
        }
      : { adaptador: false, api: !!navigator.gpu };
  } catch (e) {
    r.webgpu = { erro: String(e) };
  }
  r.heapDaJanela = performance.memory
    ? {
        usadoMb: Math.round(performance.memory.usedJSHeapSize / 1048576),
        limiteMb: Math.round(performance.memory.jsHeapSizeLimit / 1048576),
      }
    : null;
  try {
    if (self.crossOriginIsolated && performance.measureUserAgentSpecificMemory) {
      const m = await performance.measureUserAgentSpecificMemory();
      r.memoriaDaAba = { totalMb: Math.round(m.bytes / 1048576) };
    } else r.memoriaDaAba = 'API indisponível';
  } catch (e) {
    r.memoriaDaAba = { erro: String(e) };
  }
  try {
    const est = await navigator.storage.estimate();
    r.cota = { usoMb: Math.round(est.usage / 1048576), cotaMb: Math.round(est.quota / 1048576) };
  } catch {}
  r.persistente = await navigator.storage?.persisted?.().catch(() => null);
  console.log(r);
  copy(JSON.stringify(r));
  return 'copiado para a área de transferência';
})();
```

O que olhar no resultado:

| Campo                                           | Pergunta que responde                                      | O app hoje supõe                |
| ----------------------------------------------- | ---------------------------------------------------------- | ------------------------------- |
| `webgpu.adaptador`                              | WebGPU funciona numa página 2D do Quest? (sem doc oficial) | não; o Quest usa WASM           |
| `crossOriginIsolated` / `sharedArrayBuffer`     | o WASM roda com várias threads?                            | sim (COOP/COEP do Pages)        |
| `nucleos`                                       | quantas threads o Whisper pede                             | até 4                           |
| `webSpeech`                                     | o ditado do navegador existe? (só há relato de 2022)       | não                             |
| `translatorApi`                                 | tradutor embutido do Chrome?                               | não (só Chrome desktop)         |
| `getDisplayMedia`                               | captura de áudio do sistema?                               | não: só microfone               |
| `heapDaJanela.limiteMb`, `memoriaDaAba`, `cota` | quanto cabe por aba e em disco (sem número oficial)        | pouca memória: 1 modelo por vez |
| `perfilDoApp.tipo`                              | o app se reconheceu como Quest?                            | `quest`                         |

## 4. Latência da legenda e memória com o modelo carregado

1. No Babel Play (Quest): **Capturar**. Confira que a tela diz que a legenda vem do microfone e que o
   selo mostra **80 MB** (Whisper base q8). Idiomas: fale português, traduzir para inglês.
2. Clique **Iniciar captura**. Se aparecer "Baixar os modelos desta captura? ... cerca de 193 MB",
   aceite (é uma vez só).
3. Fale 10 frases curtas, com pausa de 2 s entre elas (ou toque um vídeo no alto-falante do Quest).
4. No Console do PC:

```js
copy(
  JSON.stringify({
    resumo: window.__capSummary?.(),
    memoria: performance.memory && Math.round(performance.memory.usedJSHeapSize / 1048576),
  }),
);
```

5. Na aba **Memory** do DevTools remoto, tire um _heap snapshot_ com a captura rodando e anote o
   total. (A pesquisa quer o pico com whisper-base; se quiser, repita em Ajustes → Transcrição
   "preciso" para comparar.)

O que esperar (medido no Quest EMULADO, CPU 4× mais lenta, ver o relatório): legenda ~4 s depois do fim
da fala, tradução ~5 s. Se no aparelho passar de ~8 s, ou a fila crescer ("GUARDADO p/ transcrever
depois" no Console), anote.

## 5. FPS dos jogos e das telas

Abra um jogo (ex.: **Jogar → qualquer minigame**) e cole no Console; ele conta quadros por 10 s:

```js
(async () => {
  let n = 0,
    pior = 0,
    t0 = performance.now(),
    ant = t0;
  await new Promise((ok) => {
    const f = (t) => {
      n++;
      pior = Math.max(pior, t - ant);
      ant = t;
      t - t0 < 10000 ? requestAnimationFrame(f) : ok();
    };
    requestAnimationFrame(f);
  });
  const r = {
    fps: Math.round(n / 10),
    piorQuadroMs: Math.round(pior),
    modoLeve: document.documentElement.dataset.modoLeve,
  };
  console.log(r);
  copy(JSON.stringify(r));
  return r;
})();
```

Meta da Meta para o Quest: 90 Hz, ~11 ms por quadro (QUEST_GUIDELINES). Repita com **Ajustes → Modo
desempenho** desligado para ver a diferença (no Quest ele liga sozinho).

## 6. Colar os resultados

Mande no chat, nesta ordem, os blocos copiados:

```
QUEST: <modelo — Quest 2 / 3 / 3S> · Browser <versão em Configurações → Apps → Navegador>
SONDA: <cole o JSON da seção 3>
CAPTURA: <cole o JSON da seção 4> · heap snapshot: <N> MB · a legenda acompanhou? <sim/não>
FPS: <jogo> <cole o JSON da seção 5> (modo desempenho ligado) / <idem desligado>
OBSERVAÇÕES: travou? esquentou? algum botão difícil de acertar com o controle?
```

## 7. Celular (Android ou iPhone)

- **Android:** ative "Depuração USB" nas opções de desenvolvedor, ligue no PC e use o mesmo
  `chrome://inspect/#devices`. Sonda e passos 4–5 iguais.
- **iPhone:** Ajustes → Safari → Avançado → **Web Inspector** ligado; no Mac, Safari → menu
  Desenvolvedor → o iPhone. Sem Mac não há inspeção remota; nesse caso diga só se a legenda apareceu, em
  quanto tempo, e se a aba recarregou sozinha (sinal de que o iOS a matou por memória).
- No iPhone o esperado hoje é `crossOriginIsolated: false` (o Safari não aceita o COEP `credentialless`
  que o site usa), e com isso o Whisper roda em 1 thread. O relatório explica por que não trocamos
  para `require-corp` ainda.
