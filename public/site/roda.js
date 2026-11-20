/*
 * A RODA DO MOUSE NORMALIZADA, para o filme da home (`rolo.js`) não pular capítulo.
 *
 * Por quê: no Windows a roda manda degraus grandes e discretos (100–125 px por clique com 3 linhas; 300–600+
 * com mais linhas; `deltaMode` 1 = linhas no Firefox; `deltaMode` 2 = página com "rolar uma tela por vez";
 * alguns drivers mandam rajadas). Um clique atravessava boa parte de um capítulo e o filme saltava. O
 * trackpad (Mac e precision touchpad) manda deltas pequenos e contínuos, e esses passam quase intocados.
 *
 * `normalizarRoda(evento, estado, opcoes)` é PURA (só lê o evento e atualiza o `estado` que recebe):
 *  1. Converte para pixels: linhas × 100/3 (o que o Chrome/Edge do Windows dá por linha) e páginas × altura
 *     da tela.
 *  2. Classifica: `roda` (degrau discreto) ou `trackpad` (fluxo contínuo). É roda quando vem em linhas ou
 *     páginas, quando `wheelDeltaY` é múltiplo de 120 (o clique clássico) com degrau grande, ou quando um
 *     degrau grande (≥ 50 px) chega isolado; é trackpad quando o delta é pequeno ou quando um delta grande
 *     continua um fluxo de trackpad a menos de 30 ms (a inércia do gesto).
 *  3. Teto por evento: `tetoRoda` px (120) para a roda; `tetoTrackpad` telas (0,4) para o trackpad.
 *  4. Só dentro do filme (`limitar`): teto de velocidade por um balde que enche `velocidade` telas por
 *     segundo (3) até `rajada` telas (0,4), que trocar de sentido reenche; e, com Lenis, o alvo não fica mais
 *     que `adianteMax` telas (0,5) à frente do que está na tela (`adiante`). Com `lerp` 0,1 do Lenis, isso
 *     dá no máximo ~3 telas por segundo: um capítulo (1,5 tela) fica ativo por ~0,5 s no mínimo.
 * Devolve `{ px, bruto, tipo }`: `px` é o quanto rolar; `bruto` é o delta só convertido para pixels.
 */
(function (raiz) {
  const PX_POR_LINHA = 100 / 3;
  const PADRAO = {
    tetoRoda: 120,
    tetoTrackpad: 0.4,
    velocidade: 3,
    rajada: 0.4,
    adianteMax: 0.5,
  };
  const DEGRAU = 50;
  const FLUXO_MS = 30;

  const novoEstadoDaRoda = () => ({ ultimoT: -Infinity, ultimoTipo: null, saldo: null, tSaldo: 0, sentido: 0 });

  const emPixels = (ev, alturaTela) =>
    ev.deltaY * (ev.deltaMode === 1 ? PX_POR_LINHA : ev.deltaMode === 2 ? alturaTela : 1);

  function tipoDeRoda(ev, estado, agora) {
    if (ev.deltaMode === 1 || ev.deltaMode === 2) return 'roda';
    const dy = Math.abs(ev.deltaY);
    if (dy >= DEGRAU && ev.wheelDeltaY && Math.abs(ev.wheelDeltaY) % 120 === 0) return 'roda';
    if (dy < DEGRAU) return 'trackpad';
    return agora - estado.ultimoT < FLUXO_MS && estado.ultimoTipo === 'trackpad' ? 'trackpad' : 'roda';
  }

  function normalizarRoda(ev, estado, opcoes) {
    const o = Object.assign({}, PADRAO, opcoes);
    const tela = o.alturaTela;
    const agora = o.agora !== undefined ? o.agora : ev.timeStamp;
    const bruto = emPixels(ev, tela);
    const tipo = tipoDeRoda(ev, estado, agora);
    estado.ultimoT = agora;
    estado.ultimoTipo = tipo;
    const sentido = Math.sign(bruto);
    const teto = tipo === 'roda' ? o.tetoRoda : o.tetoTrackpad * tela;
    let mod = Math.min(Math.abs(bruto), teto);
    if (o.limitar && sentido) {
      const cheio = o.rajada * tela;
      estado.saldo =
        estado.saldo === null || sentido !== estado.sentido
          ? cheio
          : Math.min(cheio, estado.saldo + (Math.max(0, agora - estado.tSaldo) / 1000) * o.velocidade * tela);
      estado.tSaldo = agora;
      estado.sentido = sentido;
      const adiante = o.adiante || 0;
      if (Math.sign(adiante) === sentido) mod = Math.min(mod, Math.max(0, o.adianteMax * tela - Math.abs(adiante)));
      mod = Math.min(mod, estado.saldo);
      estado.saldo -= mod;
    }
    return { px: sentido * mod, bruto, tipo };
  }

  raiz.FrasyRoda = { normalizarRoda, novoEstadoDaRoda, tipoDeRoda, emPixels, PADRAO, PX_POR_LINHA };
})(typeof window !== 'undefined' ? window : globalThis);
