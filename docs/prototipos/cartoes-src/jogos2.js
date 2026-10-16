  /* ==========================================================================
     Rodada 11 (continuação) — os jogos culturais e os de voz.
     Mesmo motor de jogos.js; cada bloco é a regra de um componente real.
     ========================================================================== */
  const pistaFalada = (t) => `<span class="pj-pista">${ij('volume-2')}${eqHtml(5)}<span>${t}</span></span>`;
  const falando = (m, p) => {
    const el = $('.pj-pista, .pj-grande', m);
    el?.classList.add('falando', 'tocando');
    p.then(() => el?.classList.remove('falando', 'tocando'));
  };

  /* ---- Karuta: ouça o significado e pegue a carta ----------------------------- */
  JOGOS.karuta = {
    titulo: 'Karuta: ouça e pegue a carta', curto: 'Karuta', icone: 'volume-2', rodada: 'Rodada · 6 cartas', unidade: 'cartas', n: 6,
    instr: 'O narrador diz o significado. Toque na palavra que ele descreve antes de o tempo acabar.',
    ajudas: [['ouvir', 'volume-2', 'Ouvir de novo', Infinity]],
    passos: ['O narrador fala o significado de uma das cartas da mesa.', 'Toque na carta certa antes de o relógio zerar (8 segundos por carta).', 'Tocou errado? A carta pisca em vermelho e você pode tentar outra.'],
    montar(m) {
      pj.resposta = () => fila[i]?.[0];
      const fila = emb(VOC).slice(0, nv(4, 6, 6));
      pj.total = fila.length;
      const mesa = emb(fila.map((v) => v[0]));
      let i = 0;
      m.innerHTML = `<div data-pista></div><div class="pj-mesa">${mesa.map((w, k) => `<button type="button" class="pj-carta" data-op="${w}" style="--i:${k}">${w}</button>`).join('')}</div>`;
      const narrar = () => falando(m, dizer(fila[i][1], { lang: 'pt-BR' }));
      const prox = () => {
        if (i >= fila.length) return pjFim();
        pj.trava = false;
        $('[data-pista]', m).innerHTML = pistaFalada(fila[i][1]);
        narrar();
        pjRelogio(pjSeg(8), () => {
          pj.trava = true;
          const c = $(`[data-op="${fila[i][0]}"]`, m);
          c.classList.add('certa', 'pega');
          c.disabled = true;
          pjErro($('.pj-mesa', m), 'o tempo acabou', { conta: true });
          i++;
          pjDepois(1000, prox);
        });
      };
      pj.clique = (b) => {
        if (pj.trava || b.dataset.op == null) return;
        if (b.dataset.op !== fila[i][0]) {
          b.classList.add('errada');
          pjDepois(420, () => b.classList.remove('errada'));
          return pjErro(b);
        }
        pj.trava = true;
        pjPararRelogio();
        b.classList.add('certa');
        b.disabled = true;
        pjAcerto(b);
        dizer(fila[i][0]);
        i++;
        pjDepois(800, () => (b.classList.add('pega'), prox()));
      };
      pj.ajuda = () => void narrar();
      prox();
    },
  };

  /* ---- Choseong: só as consoantes à vista ------------------------------------- */
  JOGOS.choseong = {
    titulo: 'Choseong: consoantes à vista', curto: 'Choseong', icone: 'keyboard', rodada: 'Rodada · 6 palavras', unidade: 'palavras', n: 6,
    instr: 'As consoantes já estão na mesa. Complete as vogais.',
    ajudas: [['vogal', 'lightbulb', 'Abrir uma vogal', 2, true]],
    passos: ['A palavra aparece só com as consoantes; as vogais são caixas vazias.', 'Toque em A, E, I, O, U na ordem para preencher. O apagar desfaz a última.', 'Ao preencher a última caixa, a palavra é conferida sozinha. São 15 segundos por palavra.'],
    montar(m) {
      const fila = emb(VOC.filter((v) => v[0].length >= 4 && /[aeiou]/.test(v[0]))).slice(0, 6);
      let i = 0, alvo, pos, vog;
      const caixas = () => $$('.pj-vaga', m);
      const pintar = () =>
        caixas().forEach((c, k) => {
          c.textContent = vog[k] || '';
          c.classList.toggle('cheia', !!vog[k]);
        });
      const prox = () => {
        if (i >= fila.length) return pjFim();
        pj.trava = false;
        alvo = fila[i][0].toUpperCase();
        pos = [...alvo].map((c, k) => ('AEIOU'.includes(c) ? k : -1)).filter((k) => k >= 0);
        vog = [];
        m.innerHTML = `<div class="termo-dica"><span class="label-mono">Significa</span><b>${fila[i][1]}</b></div>
          <div class="linha-termo pj-cho">${[...alvo].map((c, k) => (pos.includes(k) ? `<span class="letra pj-vaga" style="--i:${k}"></span>` : `<span class="letra pj-cons" style="--i:${k}">${c}</span>`)).join('')}</div>
          ${tecladoHtml(['AEIOU'], 'apagar', 'vogais')}`;
        pjRelogio(pjSeg(15), () => {
          pj.trava = true;
          caixas().forEach((c, k) => {
            c.textContent = alvo[pos[k]];
            c.classList.add('lugar');
          });
          pjErro($('.pj-cho', m), 'o tempo acabou', { conta: true });
          i++;
          pjDepois(1300, prox);
        });
      };
      const por = (v) => {
        if (pj.trava || vog.length >= pos.length) return;
        vog.push(v);
        sentir('tecla');
        pintar();
        if (vog.length < pos.length) return;
        if (vog.every((x, k) => x === alvo[pos[k]])) {
          pj.trava = true;
          pjPararRelogio();
          caixas().forEach((c) => c.classList.add('certa'));
          $('.pj-cho', m).classList.add('venceu');
          pjAcerto($('.pj-cho', m));
          dizer(alvo.toLowerCase());
          i++;
          return pjDepois(1100, prox);
        }
        pj.trava = true;
        pjErro($('.pj-cho', m));
        pjDepois(420, () => {
          vog = [];
          pintar();
          pj.trava = false;
        });
      };
      const apagar = () => {
        if (pj.trava || !vog.length) return;
        vog.pop();
        sentir('solta');
        pintar();
      };
      pj.clique = (b) => b.dataset.tecla && (b.dataset.tecla === 'Backspace' ? apagar() : por(b.dataset.tecla));
      pj.tecla = (e) => {
        if (e.key === 'Backspace') return apagar();
        if (/^[aeiouAEIOU]$/.test(e.key)) por(e.key.toUpperCase());
      };
      pj.ajuda = () => {
        if (vog.length >= pos.length) return false;
        /* a dica corrige o que estiver errado até ali e abre a próxima vogal certa */
        let n = 0;
        while (n < vog.length && vog[n] === alvo[pos[n]]) n++;
        vog = vog.slice(0, n);
        pjDepois(0, () => por(alvo[pos[n]]));
      };
      prox();
    },
  };

  /* ---- Rali cronometrado ------------------------------------------------------ */
  JOGOS.tenis = {
    titulo: 'Rali cronometrado', curto: 'Rali', icone: 'zap', rodada: 'Rodada · 8 bolas', unidade: 'bolas', n: 8,
    instr: 'Devolva escrevendo a palavra antes de a bola cair. A cada devolução, a bola vem mais rápida.',
    ajudas: [['letra', 'lightbulb', 'Primeira letra', 2, true]],
    passos: ['A bola traz o significado. Escreva a palavra em inglês e toque em Devolver (ou Enter).', 'Cada devolução certa aumenta o rali e encurta o tempo da próxima bola.', 'Errou ou a bola caiu? O rali volta a zero e a resposta aparece.'],
    montar(m) {
      const fila = emb(VOC).slice(0, 8);
      const BASE = 8;
      let i = 0, rali = 0, queda = null;
      m.innerHTML = `<div class="pj-quadra"><div class="pj-bola"><small>Bola em jogo</small><span></span></div><div class="pj-rede"></div><span class="pj-rali" hidden></span></div>
        <div class="pj-entrada"><input type="text" aria-label="Sua devolução" placeholder="escreva a palavra" autocomplete="off" autocapitalize="off" spellcheck="false" lang="en"><button type="button" class="btn btn-solid" data-pj="devolver">Devolver</button></div>
        <p class="pj-aviso erro" role="status"></p>`;
      const bola = $('.pj-bola', m);
      const campo = $('input', m);
      const quadra = $('.pj-quadra', m);
      const prox = () => {
        if (i >= fila.length) return pjFim();
        pj.trava = false;
        const seg = Math.max(Math.ceil(BASE / 2), BASE - rali);
        $('span', bola).textContent = fila[i][1];
        campo.value = '';
        campo.disabled = false;
        if (!EMBUTIDO || document.hasFocus()) campo.focus({ preventScroll: true });
        const r = $('.pj-rali', m);
        r.hidden = rali < 2;
        r.innerHTML = `${ij('flame')} ${rali} no rali`;
        limpar(bola);
        const h = quadra.clientHeight - bola.offsetHeight - 22;
        /* A bola é o relógio: cai do alto até a linha de fundo no tempo que a pessoa tem. */
        queda = bola.animate([{ transform: 'translateY(0) scale(1)' }, { transform: `translateY(${h}px) scale(1.06)` }], { duration: seg * 1000, easing: 'cubic-bezier(0.45, 0, 0.9, 0.7)', fill: 'forwards' });
        pjRelogio(seg, () => {
          pj.trava = true;
          campo.disabled = true;
          rali = 0;
          sentir('quique');
          $('.pj-aviso', m).textContent = `A bola caiu na quadra. Era: ${fila[i][0]}`;
          pjErro(quadra, null, { conta: true });
          i++;
          pjDepois(1500, () => (($('.pj-aviso', m).textContent = ''), prox()));
        });
      };
      const devolver = () => {
        if (pj.trava || !campo.value.trim()) return;
        pj.trava = true;
        campo.disabled = true;
        pjPararRelogio();
        const y = new DOMMatrix(getComputedStyle(bola).transform).m42;
        queda?.cancel();
        if (liso(campo.value) === fila[i][0]) {
          rali++;
          sentir('quique');
          pjAcerto(bola);
          bola.animate([{ transform: `translateY(${y}px) scale(1.06)` }, { transform: `translateY(${y - 30}px) scale(0.9)`, offset: 0.25 }, { transform: 'translateY(-140px) scale(0.5)', opacity: 0 }], { duration: 520 * K(), easing: EO, fill: 'forwards' });
          i++;
          return pjDepois(700, prox);
        }
        rali = 0;
        bola.style.transform = `translateY(${y}px)`;
        $('.pj-aviso', m).textContent = `Fora! Era: ${fila[i][0]}`;
        pjErro(quadra, null, { conta: true });
        i++;
        pjDepois(1500, () => ((bola.style.transform = ''), ($('.pj-aviso', m).textContent = ''), prox()));
      };
      pj.clique = (b) => b.dataset.pj === 'devolver' && devolver();
      pj.tecla = (e, emCampo) => emCampo && e.key === 'Enter' && devolver();
      pj.ajuda = () => {
        if (pj.trava) return false;
        campo.value = fila[i][0][0];
        campo.focus();
      };
      pj.aoSair = () => queda?.cancel();
      prox();
    },
  };

  /* ---- Mala cumulativa -------------------------------------------------------- */
  JOGOS.koffer = {
    titulo: 'Mala cumulativa de memória', curto: 'Mala', icone: 'briefcase', rodada: 'Rodada · 5 níveis', unidade: 'níveis', n: 5,
    instr: 'A cada nível entra uma palavra. Reconstrua a mala na ordem em que ela foi feita.',
    ajudas: [['espiar', 'eye', 'Espiar', Infinity, true]],
    passos: ['A mala abre e mostra as palavras na ordem em que entraram. Guarde a ordem.', 'A mala fecha. Toque nas palavras uma a uma, na mesma ordem.', 'Cada erro custa uma vida (são 3). Espiar reabre a mala por um instante, uma vez por nível.'],
    montar(m) {
      const pal = emb(VOC).slice(0, 5);
      const paleta = emb(pal);
      let nivel = 1, passo = 0, vidas = 3, fase, espiou;
      const desenhar = () => {
        const aberta = fase === 'entrando';
        m.innerHTML = `<div class="pj-mala ${aberta ? 'aberta' : 'fechada'}"><header><span class="label-mono">${ij('briefcase')} ${nivel} ${nivel === 1 ? 'palavra' : 'palavras'} na mala</span><span class="pj-selo ${aberta ? 'ok' : 'erro'}">${ij(aberta ? 'lock-open' : 'lock')} ${aberta ? 'Mala aberta' : 'Mala fechada'}</span>
            <span class="vidas" aria-label="${vidas} vidas">${[0, 1, 2].map((v) => `<span class="${v < vidas ? '' : 'perdida'}">${ij('heart')}</span>`).join('')}</span></header>
          ${aberta ? `<ol class="pj-itens">${pal.slice(0, nivel).map((p, k) => `<li class="${k === nivel - 1 && !espiou ? 'nova' : ''}" style="--i:${k}"><i>${k + 1}</i>${p[0]}<small>${p[1]}</small></li>`).join('')}</ol>` : `<p class="pj-pergunta">Passo ${passo + 1} de ${nivel}: qual palavra entrou nesta posição?</p><ol class="pj-itens">${pal.slice(0, passo).map((p, k) => `<li class="ok"><i>${k + 1}</i>${p[0]}</li>`).join('')}</ol>`}</div>
          <span class="label-mono">${aberta ? 'Guarde a ordem…' : 'Toque na palavra desta posição'}</span>
          <div class="pj-paleta">${paleta.map((p) => `<button type="button" class="pj-opcao" data-op="${p[0]}" ${aberta ? 'disabled' : ''}>${p[0]}<small>${p[1]}</small></button>`).join('')}</div>`;
      };
      const entrar = () => {
        fase = 'entrando';
        passo = 0;
        espiou = false;
        desenhar();
        sentir('abre');
        dizer(pal[nivel - 1][0]);
        pjDepois(2200, () => {
          fase = 'lembrando';
          sentir('fecha');
          desenhar();
        });
      };
      pj.clique = (b) => {
        if (fase !== 'lembrando' || b.dataset.op == null) return;
        if (b.dataset.op !== pal[passo][0]) {
          vidas--;
          pjErro(b, '−1 vida');
          $$('.vidas span', m).forEach((v, k) => v.classList.toggle('perdida', k >= vidas));
          if (!vidas) pjFim();
          return;
        }
        passo++;
        dizer(b.dataset.op);
        if (passo < nivel) {
          sentir('encaixa');
          return desenhar();
        }
        fase = 'pausa';
        pjAcerto(b);
        if (++nivel > pal.length) return pjFim();
        pjDepois(700, entrar);
      };
      pj.ajuda = () => {
        if (fase !== 'lembrando' || espiou) return false;
        espiou = true;
        fase = 'entrando';
        desenhar();
        pjDepois(1300, () => {
          fase = 'lembrando';
          desenhar();
        });
      };
      entrar();
    },
  };

  /* ---- Bao: semeie os pedaços na ordem ---------------------------------------- */
  JOGOS.bao = {
    titulo: 'Bao: semeie os pedaços', curto: 'Bao', icone: 'sprout', rodada: 'Rodada · 4 palavras', unidade: 'palavras', n: 4,
    instr: 'As covas trazem os pedaços da palavra fora de ordem. Semeie na ordem certa.',
    ajudas: [['dica', 'lightbulb', 'Dica', Infinity, true]],
    passos: ['A pista diz o significado. A palavra está partida em pedaços, um em cada cova.', 'Toque nas covas na ordem que remonta a palavra.', 'São 3 erros por palavra. A Dica semeia o próximo pedaço, uma vez por palavra.'],
    montar(m) {
      pj.resposta = () => fila[i]?.[0];
      const fila = emb(VOC.filter((v) => v[0].length >= 5)).slice(0, 4);
      let i = 0, ped, feito, erros, dica;
      const partir = (w) => {
        /* No app o corte é a cada 2,5 letras, o que dá só 2 pedaços em palavra curta (vira cara ou coroa).
           Aqui o corte é a cada 2 letras, com no mínimo 3 pedaços. */
        const n = Math.max(3, Math.min(6, Math.ceil(w.length / 2)));
        const out = [];
        for (let k = 0, p = 0; k < n; k++) {
          const t = Math.ceil((w.length - p) / (n - k));
          out.push(w.slice(p, p + t));
          p += t;
        }
        return out;
      };
      const montada = () => {
        $('[data-montada]', m).innerHTML = ped.slice(0, feito).join('') + `<i>${'·'.repeat(ped.slice(feito).join('').length)}</i>`;
        $('[data-conta]', m).textContent = `${feito} de ${ped.length} pedaços`;
      };
      const prox = () => {
        if (i >= fila.length) return pjFim();
        pj.trava = false;
        ped = partir(fila[i][0].toUpperCase());
        feito = erros = 0;
        dica = false;
        let ordem;
        do ordem = emb(ped.map((t, k) => ({ t, k })));
        while (ordem.every((x, k) => x.k === k));
        m.innerHTML = `<div class="termo-dica"><span class="label-mono">Pista</span><b>${fila[i][1]}</b></div>
          <div class="pj-bao"><div class="pj-montada"><span class="label-mono">${ij('sprout')} Palavra montada</span><b data-montada></b><small data-conta></small></div>
            <div class="pj-covas">${ordem.map((x) => `<button type="button" class="pj-cova" data-ped="${x.k}">${x.t}</button>`).join('')}</div><p class="pj-aviso erro" role="status"></p></div>`;
        montada();
      };
      const semear = (b) => {
        const de = b.getBoundingClientRect();
        const texto = b.textContent;
        b.classList.remove('errada');
        b.classList.add('semeada');
        b.disabled = true;
        b.innerHTML = ij('check');
        $$('.pj-cova.errada', m).forEach((x) => x.classList.remove('errada'));
        $('.pj-aviso', m).textContent = '';
        feito++;
        montada();
        if (polido() && !reduz()) {
          /* O pedaço voa da cova até a palavra montada. */
          const alvo = $('[data-montada]', m).getBoundingClientRect();
          document.body.insertAdjacentHTML('beforeend', `<span class="ganho" style="left:${de.left + de.width / 2}px;top:${de.top + de.height / 2}px;animation:none;translate:-50% -50%;font-size:22px">${texto}</span>`);
          const v = document.body.lastElementChild;
          anima(v, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${alvo.left + alvo.width / 2 - de.left - de.width / 2}px, ${alvo.top + alvo.height / 2 - de.top - de.height / 2}px) scale(1.3)`, opacity: 0.2 }], { d: 420, e: EIO, fill: 'forwards' }).finished.then(() => v.remove(), () => v.remove());
        }
        if (feito < ped.length) return sentir('encaixa');
        pj.trava = true;
        pjAcerto($('[data-montada]', m));
        dizer(fila[i][0]);
        i++;
        pjDepois(1000, prox);
      };
      pj.clique = (b) => {
        if (pj.trava || b.dataset.ped == null) return;
        if (+b.dataset.ped === feito) return semear(b);
        erros++;
        b.classList.add('errada');
        /* a cova errada desmarca sozinha */
        pjDepois(700, () => b.classList.remove('errada'));
        pj.seq = 0;
        pjHud();
        sentir('erro');
        tremer(b);
        if (erros < nv(4, 3, 2)) return ($('.pj-aviso', m).textContent = `Este pedaço não abre a palavra aqui. Restam ${nv(4, 3, 2) - erros}.`);
        pj.trava = true;
        $('.pj-aviso', m).textContent = `A palavra era ${fila[i][0].toUpperCase()}.`;
        pjErro($('.pj-bao', m), null, { conta: true });
        i++;
        pjDepois(1600, prox);
      };
      pj.ajuda = () => {
        if (dica || pj.trava) return false;
        dica = true;
        pjDepois(0, () => semear($(`[data-ped="${feito}"]`, m)));
      };
      prox();
    },
  };

  /* ---- Vitendawili: a frase com lacuna ---------------------------------------- */
  JOGOS.vitendawili = {
    titulo: 'Vitendawili: a frase com lacuna', curto: 'Vitendawili', icone: 'puzzle', rodada: 'Rodada · 5 enigmas', unidade: 'enigmas', n: 5,
    instr: 'O enigma é uma frase sua com a palavra apagada. Qual palavra a fecha?',
    ajudas: [['ouvir', 'volume-2', 'Ouvir', Infinity]],
    passos: ['A frase aparece com um traço no lugar de uma palavra.', 'Escolha, entre as quatro, a palavra que fecha a frase.', 'Errou? A alternativa é riscada e você tenta de novo. Ouvir não custa nada.'],
    montar(m) {
      pj.resposta = () => fr[i]?.alvo;
      const fr = emb(FRASES).slice(0, 5);
      let i = 0, partes;
      const narrar = () => dizer(partes.join(', '));
      const prox = () => {
        if (i >= fr.length) return pjFim();
        pj.trava = false;
        partes = fr[i].en.split(new RegExp(`\\b${fr[i].alvo}\\b`, 'i'));
        m.innerHTML = `<p class="pj-enigma">${partes[0]}<span class="pj-lacuna" aria-label="palavra apagada">&nbsp;</span>${partes[1]}</p>${pjNivel === 'facil' ? `<p class="mut" style="text-align:center">${fr[i].pt}</p>` : ''}${opcoesHtml(distr(fr[i].alvo, FRASES.map((f) => f.alvo)))}`;
        narrar();
      };
      pj.clique = (b) => {
        if (pj.trava || b.dataset.op == null) return;
        if (b.dataset.op !== fr[i].alvo) {
          b.classList.add('pj-fora');
          b.disabled = true;
          if (pjNivel !== 'dificil') return pjErro(b);
          /* no Difícil é uma tentativa só por enigma */
          pj.trava = true;
          $(`[data-op="${fr[i].alvo}"]`, m).classList.add('certa');
          pjErro(b, null, { conta: true });
          i++;
          return pjDepois(1400, prox);
        }
        pj.trava = true;
        const l = $('.pj-lacuna', m);
        const de = b.getBoundingClientRect();
        l.textContent = fr[i].alvo;
        l.classList.add('cheia');
        b.classList.add('certa');
        if (polido() && !reduz()) {
          /* A palavra sai do botão e encaixa na lacuna. */
          const para = l.getBoundingClientRect();
          anima(l, [{ transform: `translate(${de.left + de.width / 2 - para.left - para.width / 2}px, ${de.top + de.height / 2 - para.top - para.height / 2}px) scale(0.8)`, opacity: 0.4 }, { transform: 'translate(0,0) scale(1)', opacity: 1 }], { d: 520, e: MOLA_SUAVE });
        }
        pjAcerto(l);
        dizer(fr[i].en);
        i++;
        pjDepois(1300, prox);
      };
      pj.ajuda = () => void narrar();
      prox();
    },
  };

  /* ---- Shiritori: encadeie pela última letra ---------------------------------- */
  JOGOS.shiritori = {
    titulo: 'Shiritori: encadeie pela última letra', curto: 'Shiritori', icone: 'link-2', rodada: 'Rodada · 6 elos', unidade: 'elos', n: 6,
    instr: 'Cada palavra começa com a última letra da anterior.',
    ajudas: [['letra', 'lightbulb', 'Ver a letra', Infinity]],
    passos: ['A palavra na ponta da corrente tem a última letra em destaque.', 'Escolha, entre as três, a palavra que começa com essa letra.', 'São 15 segundos por elo. Ver a letra não custa nada.'],
    montar(m) {
      pj.resposta = () => C[i]?.[0];
      const C = [['storm', 'tempestade'], ['medicine', 'medicina'], ['earth', 'terra'], ['hate', 'ódio'], ['east', 'leste'], ['towel', 'toalha'], ['light', 'luz']];
      let i = 1;
      const prox = () => {
        if (i >= C.length) return pjFim();
        pj.trava = false;
        const [w, pt] = C[i - 1];
        const L = w.at(-1);
        const ops = emb([C[i][0], ...emb(VOC.map((v) => v[0]).filter((x) => x[0] !== L && !C.slice(0, i + 1).some((c) => c[0] === x))).slice(0, 2)]);
        m.innerHTML = `<div class="pj-corrente"><span class="label-mono">A corrente até aqui (${i} de ${C.length})</span><div class="pj-elos">${C.slice(0, i).map((c) => `<span>${c[0]}</span>`).join(ij('arrow-right'))}</div></div>
          <div class="pj-centro"><span class="label-mono">Palavra na ponta</span><p class="pj-ponta">${w.slice(0, -1)}<u>${L}</u></p><span class="mut">${pt}</span>
            <p class="pj-letra"${pjNivel === 'facil' ? '' : ' hidden'}>${ij('link-2')} A próxima começa com <b>${L.toUpperCase()}</b></p></div>${opcoesHtml(ops, { classe: 'tres' })}`;
        const e = $('.pj-elos', m);
        e.scrollLeft = e.scrollWidth;
        pjRelogio(pjSeg(15), () => {
          pj.trava = true;
          $(`[data-op="${C[i][0]}"]`, m)?.classList.add('certa');
          pjErro($('.opcoes-blitz', m), 'o tempo acabou', { conta: true });
          i++;
          pjDepois(1100, prox);
        });
      };
      pj.clique = (b) => {
        if (pj.trava || b.dataset.op == null) return;
        if (b.dataset.op !== C[i][0]) {
          b.classList.add('pj-fora');
          b.disabled = true;
          return pjErro(b);
        }
        pj.trava = true;
        pjPararRelogio();
        b.classList.add('certa');
        pjAcerto(b);
        dizer(C[i][0]);
        i++;
        pjDepois(650, prox);
      };
      pj.ajuda = () => {
        const l = $('.pj-letra', m);
        if (!l || !l.hidden) return false;
        l.hidden = false;
      };
      prox();
    },
  };

  /* ---- Cadavre exquis: uma frase sua com quatro palavras ---------------------- */
  JOGOS.cadavre = {
    titulo: 'Cadavre exquis: produção livre', curto: 'Cadavre exquis', icone: 'pen-line', rodada: 'Rodada · 4 palavras', unidade: 'palavras', n: 4,
    instr: 'Uma frase sua com as quatro palavras. Não conta para a revisão.',
    passos: ['Você recebe quatro palavras da leva.', 'Escreva uma única frase, em inglês, que use as quatro. Pode ser absurda.', 'Ao conferir, as palavras usadas ficam verdes. Esta rodada não agenda revisão.'],
    montar(m) {
      const pal = emb(VOC).slice(0, 4);
      m.innerHTML = `<div class="pj-quatro">${pal.map((p) => `<div class="pj-cartao" data-w="${p[0]}"><b>${p[0]}</b><small>${p[1]}</small></div>`).join('')}</div>
        <span class="label-mono">Escreva UMA frase que use as quatro palavras</span>
        <textarea class="pj-texto" rows="3" aria-label="Sua frase" placeholder="A sua frase pode ser absurda, só precisa usar as quatro." lang="en"></textarea>
        <div class="pj-acoes"><button type="button" class="btn btn-solid" data-pj="conferir" disabled>${ij('pen-line')} Conferir</button></div><div class="pj-correcao"></div>`;
      const campo = $('textarea', m);
      const marcar = () => {
        /* Enquanto escreve, cada palavra já usada acende: a pessoa vê o que falta sem conferir. */
        const t = ` ${liso(campo.value)} `;
        $$('.pj-cartao', m).forEach((c) => {
          const tem = t.includes(c.dataset.w);
          if (tem && !c.classList.contains('usada')) sentir('encaixa');
          c.classList.toggle('usada', tem);
        });
        $('[data-pj="conferir"]', m).disabled = !campo.value.trim();
      };
      campo.addEventListener('input', marcar);
      pj.clique = (b) => {
        if (b.dataset.pj === 'continuar') return pjFim({ ja: true });
        if (b.dataset.pj !== 'conferir' || pj.trava) return;
        pj.trava = true;
        campo.disabled = true;
        b.hidden = true;
        marcar();
        const usadas = $$('.pj-cartao.usada', m);
        $$('.pj-cartao:not(.usada)', m).forEach((c) => c.classList.add('faltou'));
        pj.erros += 4 - usadas.length;
        usadas.forEach((c, k) => pjDepois(k * 220, () => pjAcerto(c)));
        pj.feitos += 4 - usadas.length;
        if (!usadas.length) pjHud();
        $('.pj-correcao', m).innerHTML = `<p>palavras usadas: <b>${usadas.length}/4</b>. Produção livre: esta rodada não agenda revisão.</p><div class="pj-acoes"><button type="button" class="btn btn-outline" data-pj="ouvir-frase">${ij('volume-2')} Ouvir</button><button type="button" class="btn btn-solid" data-pj="continuar">Continuar</button></div>`;
      };
      const antes = pj.clique;
      pj.clique = (b) => (b.dataset.pj === 'ouvir-frase' ? void dizer(campo.value) : antes(b));
    },
  };

  /* ---- Tabu: a definição sem os termos óbvios --------------------------------- */
  JOGOS.taboo = {
    titulo: 'Tabu: a definição sem os termos óbvios', curto: 'Tabu', icone: 'triangle-alert', rodada: 'Rodada · 5 cartas', unidade: 'cartas', n: 5,
    instr: 'A definição vem sem os termos mais óbvios. Descubra a palavra.',
    ajudas: [['liberar', 'lightbulb', 'Liberar 1', Infinity, true]],
    passos: ['A definição aparece com os termos mais óbvios riscados.', 'Escolha a palavra entre as quatro. É uma tentativa só por carta, com 30 segundos.', 'Liberar 1 devolve uma das palavras riscadas (sobra sempre pelo menos uma).'],
    montar(m) {
      pj.resposta = () => T[i]?.r;
      const T = emb([
        { d: 'Um {móvel} {plano}, preso à parede, onde se {guardam} livros e objetos.', r: 'shelf' },
        { d: '{Chuva} forte, com {vento}, {raios} e trovões.', r: 'storm' },
        { d: '{Pano} felpudo que se usa para {secar} o corpo depois do {banho}.', r: 'towel' },
        { d: 'Faixa de {terra} que fica à {beira} do {mar}.', r: 'coast' },
        { d: 'Construção que {liga} as duas {margens} de um {rio}.', r: 'bridge' },
      ]);
      let i = 0;
      const prox = () => {
        if (i >= T.length) return pjFim();
        pj.trava = false;
        const n = (T[i].d.match(/\{/g) || []).length;
        m.innerHTML = `<div class="pj-tabu"><header><span class="label-mono">Definição (${i + 1} de ${T.length})</span><span>${ij('triangle-alert')} <span data-n>${n} proibidas</span></span></header><p>${T[i].d.replace(/\{(.+?)\}/g, '<s>$1</s>')}</p></div>${opcoesHtml(distr(T[i].r, VOC.map((v) => v[0])))}`;
        pjRelogio(pjSeg(30), () => responder(null));
        if (pjNivel === 'facil') {
          $('.pj-tabu s', m).classList.add('livre');
          $('[data-n]', m).textContent = `${n - 1} ${n - 1 === 1 ? 'proibida' : 'proibidas'}`;
        }
      };
      const responder = (b) => {
        if (pj.trava) return;
        pj.trava = true;
        pjPararRelogio();
        $(`[data-op="${T[i].r}"]`, m).classList.add('certa');
        $$('.opcoes-blitz button', m).forEach((x) => (x.disabled = true));
        if (b?.dataset.op === T[i].r) pjAcerto(b);
        else {
          b?.classList.add('errada');
          pjErro(b || $('.pj-tabu', m), b ? null : 'o tempo acabou', { conta: true });
        }
        i++;
        pjDepois(b?.dataset.op === T[i - 1].r ? 700 : 1300, prox);
      };
      pj.clique = (b) => b.dataset.op != null && responder(b);
      pj.ajuda = () => {
        const s = $$('.pj-tabu s:not(.livre)', m);
        if (pj.trava || s.length <= 1) return false;
        s[0].classList.add('livre');
        $('[data-n]', m).textContent = `${s.length - 1} ${s.length - 1 === 1 ? 'proibida' : 'proibidas'}`;
        sentir('liga');
      };
      prox();
    },
  };

  /* ---- Karaokê da fala -------------------------------------------------------- */
  JOGOS.karaoke = {
    titulo: 'Karaokê da fala', curto: 'Karaokê', icone: 'mic', rodada: 'Rodada · 4 falas', unidade: 'falas', n: 4,
    instr: 'Ouça a fala, repita em voz alta e receba a nota, palavra por palavra.',
    passos: ['Toque em Ouvir: as palavras acendem no ritmo da voz. Devagar toca a 60% da velocidade.', 'Toque em Falar agora e repita a frase.', 'A nota mostra quais palavras saíram bem e quais escaparam. Dá para regravar.'],
    montar(m) {
      const fr = emb(FRASES).slice(0, 4);
      let i = 0, feita, tocando = 0;
      const pal = () => $$('.pj-frase span', m);
      const tocar = (devagar) => {
        if (!fr[i]) return;
        const vez = ++tocando;
        const passo = devagar ? 560 : 340;
        dizer(fr[i].en, { devagar });
        pal().forEach((s) => s.classList.remove('ativa', 'passou', 'certa', 'escapou'));
        pal().forEach((s, k) =>
          pjDepois(k * passo, () => {
            if (vez !== tocando) return;
            pal()[k - 1]?.classList.replace('ativa', 'passou');
            s.classList.add('ativa');
            sentir('fala');
          }),
        );
        pjDepois(pal().length * passo, () => vez === tocando && pal().forEach((s) => (s.classList.remove('ativa'), s.classList.add('passou'))));
      };
      const prox = () => {
        if (i >= fr.length) return pjFim();
        feita = false;
        pj.trava = false;
        m.innerHTML = `<p class="pj-frase">${fr[i].en.split(' ').map((w) => `<span>${w}</span>`).join('')}</p><p class="mut">${fr[i].pt}</p>
          <div class="pj-acoes"><button type="button" class="btn btn-outline" data-pj="ouvir">${ij('play')} Ouvir</button><button type="button" class="btn btn-outline" data-pj="devagar" title="Toca a mesma fala mais devagar, sem mudar o tom da voz">${ij('gauge')} devagar</button><button type="button" class="btn btn-solid" data-pj="falar">${ij('mic')} Falar agora</button></div>
          <div class="pj-nota" role="status"></div><button type="button" class="btn btn-outline peq" data-pj="pular">${i === fr.length - 1 ? 'Terminar' : 'Próxima'} ${ij('skip-forward')}</button>`;
        pjDepois(350, () => tocar(false));
      };
      pj.clique = (b) => {
        const a = b.dataset.pj;
        if (a === 'ouvir' || a === 'devagar') return !pj.trava && tocar(a === 'devagar');
        if (a === 'pular') {
          if (pj.trava) return;
          tocando++;
          if (!feita) pjErro(null, null, { conta: true });
          i++;
          return prox();
        }
        if (a !== 'falar' || pj.trava) return;
        pj.trava = true;
        tocando++;
        if (temVoz) speechSynthesis.cancel();
        sentir('grava');
        pal().forEach((s) => s.classList.remove('ativa', 'passou', 'certa', 'escapou'));
        $('.pj-nota', m).innerHTML = `<span class="pj-ouvindo">${eqHtml(7)} ouvindo você…</span>`;
        pjDepois(2400, () => {
          /* Neste protótipo o microfone não é ligado: a nota é sorteada para mostrar a tela de correção. */
          const nota = 72 + Math.floor(Math.random() * 27);
          const escapou = nota < 90 ? Math.floor(Math.random() * pal().length) : -1;
          pal().forEach((s, k) => pjDepois(k * 90, () => s.classList.add(k === escapou ? 'escapou' : 'certa')));
          $('.pj-nota', m).innerHTML = `<b class="pj-pct" style="color:var(--${nota >= 80 ? 'good' : 'warn'})">${nota}%</b><p>${pal().length - (escapou >= 0 ? 1 : 0)} de ${pal().length} palavras${escapou >= 0 ? ` · escapou: ${pal()[escapou].textContent}` : ''}</p><small>Nota de exemplo: no protótipo o microfone não é ligado.</small>`;
          if (!feita) {
            feita = true;
            pjAcerto($('.pj-pct', m));
          } else sentir('acerto');
          pj.trava = false;
        });
      };
      prox();
    },
  };

  /* ---- Qual foi a fala? ------------------------------------------------------- */
  JOGOS.escuta = {
    titulo: 'Qual foi a fala? (escuta)', curto: 'Qual foi a fala?', icone: 'volume-2', rodada: 'Rodada · 4 falas', unidade: 'falas', n: 4,
    instr: 'Ouça quantas vezes quiser, isso não tira ponto. Depois escolha o que foi dito.',
    passos: ['A fala toca sozinha. Dá para ouvir de novo e também devagar.', 'As alternativas são parecidas: muda uma palavra de som próximo.', 'Toque na fala que você ouviu. A tradução aparece depois da resposta.'],
    montar(m) {
      pj.resposta = () => E[i]?.[0];
      const E = emb([
        ['We ship the order today', ['We shape the order today', 'We chip the order today', 'We shop the order today'], 'Enviamos o pedido hoje'],
        ['I left the towel on the shelf', ['I left the tower on the shelf', 'I left the towel on the shell', 'I left the tunnel on the shelf'], 'Deixei a toalha na prateleira'],
        ['The storm hit the coast', ['The storm hit the cost', 'The store hit the coast', 'The storm hid the coast'], 'A tempestade atingiu a costa'],
        ['She had a strange dream', ['She had a strange drum', 'She hid a strange dream', 'She had a strong dream'], 'Ela teve um sonho estranho'],
      ]);
      let i = 0;
      const tocar = (devagar) => E[i] && !pj.trava && falando(m, dizer(E[i][0], { devagar }));
      const prox = () => {
        if (i >= E.length) return pjFim();
        pj.trava = false;
        m.innerHTML = `<div class="pj-acoes"><button type="button" class="btn btn-solid pj-grande" data-pj="ouvir">${ij('play')} Ouvir de novo</button>${pjNivel === 'dificil' ? '' : `<button type="button" class="btn btn-outline" data-pj="devagar">${ij('gauge')} devagar</button>`}</div>
          <div class="pj-lista">${emb([E[i][0], ...E[i][1].slice(0, nv(2, 3, 3))]).map((t) => `<button type="button" data-op="${t}">${t}</button>`).join('')}</div><p class="mut pj-aviso" style="color:var(--ink-muted)"></p>`;
        pjDepois(350, () => tocar(false));
      };
      pj.clique = (b) => {
        if (b.dataset.pj === 'ouvir' || b.dataset.pj === 'devagar') return tocar(b.dataset.pj === 'devagar');
        if (pj.trava || b.dataset.op == null) return;
        pj.trava = true;
        const ok = b.dataset.op === E[i][0];
        $$('.pj-lista button', m).forEach((x) => {
          if (x.dataset.op === E[i][0]) x.classList.add('certa');
          x.disabled = true;
        });
        $('.pj-aviso', m).textContent = E[i][2];
        if (ok) pjAcerto(b);
        else {
          b.classList.add('errada');
          pjErro(b, 'Ouça novamente', { conta: true });
          dizer(E[i][0]);
        }
        i++;
        pjDepois(ok ? 1000 : 2200, prox);
      };
      prox();
    },
  };

  /* ---- Ditado ----------------------------------------------------------------- */
  JOGOS.ditado = {
    titulo: 'Ditado', curto: 'Ditado', icone: 'pen-line', rodada: 'Rodada · 4 falas', unidade: 'falas', n: 4,
    instr: 'Escute com atenção e escreva o que ouviu. Acento e pontuação não contam.',
    ajudas: [['palavra', 'lightbulb', 'Dica', 3, true]],
    passos: ['A fala toca sozinha. Ouça de novo ou devagar quantas vezes quiser.', 'Escreva o que ouviu e toque em Conferir (ou Enter).', 'A correção mostra palavra por palavra. Com 80% ou mais, conta como acerto.'],
    montar(m) {
      pj.resposta = () => fr[i]?.en;
      const fr = emb(FRASES).slice(0, 4);
      let i = 0;
      const tocar = (devagar) => fr[i] && !pj.trava && falando(m, dizer(fr[i].en, { devagar }));
      const campo = () => $('input', m);
      const prox = () => {
        if (i >= fr.length) return pjFim();
        pj.trava = false;
        m.innerHTML = `<div class="pj-acoes"><button type="button" class="btn btn-solid pj-grande" data-pj="ouvir">${ij('play')} Ouvir fala</button><button type="button" class="btn btn-outline" data-pj="devagar">${ij('gauge')} devagar</button></div>
          <div class="pj-entrada"><input type="text" placeholder="escreva o que ouviu…" aria-label="O que você ouviu" autocomplete="off" autocapitalize="off" spellcheck="false" lang="en"><button type="button" class="btn btn-solid" data-pj="conferir">${ij('corner-down-left')} Conferir</button></div>
          <div class="pj-correcao"></div><button type="button" class="pj-link" data-pj="pular">${ij('skip-forward')} não consigo, pular</button>`;
        if (!EMBUTIDO || document.hasFocus()) campo().focus({ preventScroll: true });
        pjDepois(350, () => tocar(false));
      };
      const conferir = (pulou) => {
        if (pj.trava) return;
        pj.trava = true;
        const esp = liso(fr[i].en).split(' ');
        const orig = fr[i].en.split(' ');
        const esc2 = liso(campo().value).split(' ').filter(Boolean);
        const certas = esp.filter((w, k) => esc2[k] === w).length;
        const pct = Math.round((certas / esp.length) * 100);
        const LIM = nv(70, 80, 90);
        if (pct < LIM && pjNivel !== 'dificil' && pj.segunda !== i && !pulou) {
          /* Segunda chance: o começo certo fica, o resto sai sozinho, e a fala toca de novo. */
          pj.segunda = i;
          let n = 0;
          while (n < esp.length && esc2[n] === esp[n]) n++;
          campo().value = n ? orig.slice(0, n).join(' ') + ' ' : '';
          $('.pj-correcao', m).innerHTML = `<p class="pj-aviso">${n ? `${n === 1 ? 'A primeira palavra ficou' : 'As ' + n + ' primeiras palavras ficaram'}; o resto saiu.` : 'Ainda não.'} Ouça de novo e complete: você tem mais uma tentativa.</p>`;
          pj.seq = 0;
          pjHud();
          sentir('erro');
          tremer($('.pj-entrada', m));
          pj.trava = false;
          campo().focus();
          return void tocar(false);
        }
        campo().disabled = true;
        $('[data-pj="pular"]', m).hidden = true;
        $('.pj-correcao', m).innerHTML = `<p>${certas} de ${esp.length} palavras, ${pct}%</p><div class="pj-palavras">${esp.map((w, k) => `<span class="${esc2[k] === w ? 'ok' : 'no'}" style="--i:${k}">${orig[k]}${esc2[k] === w ? '' : `<small>${esc(esc2[k] || '-')}</small>`}</span>`).join('')}</div><p>${fr[i].pt}</p>`;
        if (pct >= LIM) pjAcerto($('.pj-correcao', m));
        else pjErro($('.pj-entrada', m), `Abaixo de ${LIM}%`, { conta: true });
        i++;
        pjDepois(pct >= LIM ? 1700 : 3400, prox);
      };
      pj.clique = (b) => {
        const a = b.dataset.pj;
        if (a === 'ouvir' || a === 'devagar') return tocar(a === 'devagar');
        if (a === 'conferir' || a === 'pular') conferir(a === 'pular');
      };
      pj.tecla = (e, emCampo) => emCampo && e.key === 'Enter' && conferir(false);
      pj.ajuda = () => {
        if (pj.trava) return false;
        const orig = fr[i].en.split(' ');
        const esc2 = liso(campo().value).split(' ').filter(Boolean);
        let n = 0;
        while (n < esc2.length && esc2[n] === liso(orig[n] || '')) n++;
        if (n >= orig.length) return false;
        campo().value = orig.slice(0, n + 1).join(' ') + ' ';
        campo().focus();
        flutuar(campo(), `palavra ${n + 1}`, '');
      };
      prox();
    },
  };

  /* ---- Caça-conectores -------------------------------------------------------- */
  JOGOS.conectores = {
    titulo: 'Caça-conectores', curto: 'Caça-conectores', icone: 'link-2', rodada: 'Rodada · 4 frases', unidade: 'frases', n: 4,
    instr: 'Marque as palavras que amarram as ideias, as que mudam o rumo da frase.',
    passos: ['Cada palavra da frase é um botão. Toque nas que ligam uma ideia à outra (but, because, so…).', 'Pode marcar e desmarcar à vontade antes de conferir.', 'A nota pesa igual deixar passar e marcar à toa. Com 70 ou mais, conta como acerto.'],
    montar(m) {
      pj.resposta = () => C[i]?.a.join(', ');
      const C = emb([
        { f: 'We wanted to ship today but the tests failed', a: ['but'], pt: 'Queríamos enviar hoje, mas os testes falharam' },
        { f: 'I stayed home because it was raining so I read a book', a: ['because', 'so'], pt: 'Fiquei em casa porque estava chovendo, então li um livro' },
        { f: 'Although she was tired she kept working until midnight', a: ['although', 'until'], pt: 'Embora estivesse cansada, ela continuou trabalhando até a meia-noite' },
        { f: 'You can call me or send a message if you need help', a: ['or', 'if'], pt: 'Você pode me ligar ou mandar uma mensagem se precisar de ajuda' },
      ]);
      let i = 0;
      const prox = () => {
        if (i >= C.length) return pjFim();
        pj.trava = false;
        m.innerHTML = `<p class="pj-conect">${C[i].f.split(' ').map((w) => `<button type="button" data-w="${w.toLowerCase()}" aria-pressed="false">${w}</button>`).join('')}</p><p class="mut" style="text-align:center;max-width:52ch">${C[i].pt}</p>${pjNivel === 'facil' ? `<span class="label-mono">${C[i].a.length} ${C[i].a.length === 1 ? 'conector' : 'conectores'} nesta frase</span>` : ''}
          <div class="pj-acoes"><button type="button" class="btn btn-solid" data-pj="conferir">${ij('check')} Conferir</button></div><div class="pj-nota" role="status" style="min-height:56px"></div>`;
      };
      pj.clique = (b) => {
        if (pj.trava) return;
        if (b.dataset.w != null) {
          const on = b.getAttribute('aria-pressed') !== 'true';
          b.setAttribute('aria-pressed', on);
          return sentir(on ? 'encaixa' : 'solta');
        }
        if (b.dataset.pj !== 'conferir') return;
        pj.trava = true;
        b.hidden = true;
        let [c, f, p] = [0, 0, 0];
        $$('.pj-conect button', m).forEach((x) => {
          const alvo = C[i].a.includes(x.dataset.w);
          const on = x.getAttribute('aria-pressed') === 'true';
          x.disabled = true;
          x.setAttribute('aria-pressed', 'false');
          if (alvo && on) c++, x.classList.add('alvo-ok');
          else if (alvo) p++, x.classList.add('alvo-perdido');
          else if (on) f++, x.classList.add('a-toa');
        });
        const f1 = c ? Math.round((200 * c) / (2 * c + f + p)) : 0;
        $('.pj-nota', m).innerHTML = `<p style="font:900 19px var(--font-display)">${f1} pontos de precisão</p><small>${c} ${c === 1 ? 'certo' : 'certos'}${f ? ` · ${f} marcado à toa` : ''}${p ? ` · ${p} passou batido` : ''}</small>`;
        if (f1 >= nv(60, 70, 80)) pjAcerto($('.pj-conect', m));
        else pjErro($('.pj-conect', m), 'Revise os conectores', { conta: true });
        i++;
        pjDepois(f1 >= nv(60, 70, 80) ? 1500 : 2800, prox);
      };
      prox();
    },
  };

  /* Atalho para abrir um jogo direto pelo endereço: ?jogo=termo (útil para testar e mostrar). */
  window.pxJogo = abrirJogo;
  if (QS.get('jogo')) setTimeout(() => abrirJogo(QS.get('jogo')), 700);
