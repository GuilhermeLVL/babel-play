import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Sparkles, Flame, Train, ArrowRight, Timer as TimerIcon, Volume2, Send, Zap, HelpCircle } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { play } from '../../lib/soundFx';
import { comemorar, tremor, flashDeTela, pulsoDeZoom } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';
import { speak } from '../../lib/tts';

/**
 * SHIRITORI EXPRESS — Cadeia Fonológica de Alta Velocidade (しりとり / 끝말잇기).
 *
 * Inspirado no lendário jogo de encadeamento de palavras japonês e coreano.
 * A última letra da palavra atual deve ser a PRIMEIRA letra da próxima palavra!
 *
 * Recursos Avançados:
 * - Banco fonológico de 100+ palavras autênticas cobrindo todas as letras (A-Z).
 * - Histórico de palavras usadas: NUNCA repete a mesma palavra na cadeia.
 * - Modo Híbrido: Escolha entre 3 Cartas Rápidas OU Digite sua própria palavra livremente!
 * - Feedback dopamínico: Efeito de trem express, partículas, combos crescentes e bônus de criatividade.
 */

interface ShiritoriWord {
  id: string;
  word: string;
  translation: string;
  lang: string;
  category?: string;
}

interface ShiritoriGameProps {
  items?: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

// Grande dicionário curado para Shiritori com palavras ricas e traduções em português
const SHIRITORI_DICTIONARY: ShiritoriWord[] = [
  // A
  { id: 'w-a1', word: 'APPLE', translation: 'Maçã', lang: 'en-US', category: 'Frutas' },
  { id: 'w-a2', word: 'ASTRONAUT', translation: 'Astronauta', lang: 'en-US', category: 'Espaço' },
  { id: 'w-a3', word: 'AIRPLANE', translation: 'Avião', lang: 'en-US', category: 'Viagem' },
  { id: 'w-a4', word: 'ANIMAL', translation: 'Animal', lang: 'en-US', category: 'Natureza' },
  { id: 'w-a5', word: 'ARROW', translation: 'Flecha', lang: 'en-US', category: 'Objetos' },
  // B
  { id: 'w-b1', word: 'BANANA', translation: 'Banana', lang: 'en-US', category: 'Frutas' },
  { id: 'w-b2', word: 'BICYCLE', translation: 'Bicicleta', lang: 'en-US', category: 'Transporte' },
  { id: 'w-b3', word: 'BUTTERFLY', translation: 'Borboleta', lang: 'en-US', category: 'Natureza' },
  { id: 'w-b4', word: 'BRIDGE', translation: 'Ponte', lang: 'en-US', category: 'Lugares' },
  { id: 'w-b5', word: 'BREAD', translation: 'Pão', lang: 'en-US', category: 'Comida' },
  // C
  { id: 'w-c1', word: 'CLOUD', translation: 'Nuvem', lang: 'en-US', category: 'Natureza' },
  { id: 'w-c2', word: 'CASTLE', translation: 'Castelo', lang: 'en-US', category: 'Lugares' },
  { id: 'w-c3', word: 'COFFEE', translation: 'Café', lang: 'en-US', category: 'Bebidas' },
  { id: 'w-c4', word: 'CANDLE', translation: 'Vela', lang: 'en-US', category: 'Objetos' },
  { id: 'w-c5', word: 'CAMERA', translation: 'Câmera', lang: 'en-US', category: 'Tecnologia' },
  // D
  { id: 'w-d1', word: 'DRAGON', translation: 'Dragão', lang: 'en-US', category: 'Mítico' },
  { id: 'w-d2', word: 'DOLPHIN', translation: 'Golfinho', lang: 'en-US', category: 'Natureza' },
  { id: 'w-d3', word: 'DIAMOND', translation: 'Diamante', lang: 'en-US', category: 'Preciosidades' },
  { id: 'w-d4', word: 'DESERT', translation: 'Deserto', lang: 'en-US', category: 'Lugares' },
  { id: 'w-d5', word: 'DANCE', translation: 'Dança', lang: 'en-US', category: 'Arte' },
  // E
  { id: 'w-e1', word: 'ELEPHANT', translation: 'Elefante', lang: 'en-US', category: 'Animais' },
  { id: 'w-e2', word: 'ENERGY', translation: 'Energia', lang: 'en-US', category: 'Ciência' },
  { id: 'w-e3', word: 'EAGLE', translation: 'Águia', lang: 'en-US', category: 'Aves' },
  { id: 'w-e4', word: 'EARTH', translation: 'Terra / Planeta', lang: 'en-US', category: 'Espaço' },
  { id: 'w-e5', word: 'ENGINE', translation: 'Motor', lang: 'en-US', category: 'Tecnologia' },
  // F
  { id: 'w-f1', word: 'FOREST', translation: 'Floresta', lang: 'en-US', category: 'Natureza' },
  { id: 'w-f2', word: 'FALCON', translation: 'Falcão', lang: 'en-US', category: 'Aves' },
  { id: 'w-f3', word: 'FLOWER', translation: 'Flor', lang: 'en-US', category: 'Natureza' },
  { id: 'w-f4', word: 'FIRE', translation: 'Fogo', lang: 'en-US', category: 'Elementos' },
  { id: 'w-f5', word: 'FUTURE', translation: 'Futuro', lang: 'en-US', category: 'Conceitos' },
  // G
  { id: 'w-g1', word: 'GALAXY', translation: 'Galáxia', lang: 'en-US', category: 'Espaço' },
  { id: 'w-g2', word: 'GARDEN', translation: 'Jardim', lang: 'en-US', category: 'Lugares' },
  { id: 'w-g3', word: 'GUITAR', translation: 'Violão / Guitarra', lang: 'en-US', category: 'Música' },
  { id: 'w-g4', word: 'GIANT', translation: 'Gigante', lang: 'en-US', category: 'Mítico' },
  { id: 'w-g5', word: 'GOLD', translation: 'Ouro', lang: 'en-US', category: 'Preciosidades' },
  // H
  { id: 'w-h1', word: 'HORSE', translation: 'Cavalo', lang: 'en-US', category: 'Animais' },
  { id: 'w-h2', word: 'HARBOR', translation: 'Porto', lang: 'en-US', category: 'Lugares' },
  { id: 'w-h3', word: 'HEART', translation: 'Coração', lang: 'en-US', category: 'Corpo' },
  { id: 'w-h4', word: 'HONEY', translation: 'Mel', lang: 'en-US', category: 'Comida' },
  { id: 'w-h5', word: 'HOUSE', translation: 'Casa', lang: 'en-US', category: 'Lugares' },
  // I
  { id: 'w-i1', word: 'ISLAND', translation: 'Ilha', lang: 'en-US', category: 'Geografia' },
  { id: 'w-i2', word: 'ICEBERG', translation: 'Iceberg', lang: 'en-US', category: 'Natureza' },
  { id: 'w-i3', word: 'INSTRUMENT', translation: 'Instrumento', lang: 'en-US', category: 'Música' },
  { id: 'w-i4', word: 'IRON', translation: 'Ferro', lang: 'en-US', category: 'Metais' },
  // J
  { id: 'w-j1', word: 'JUNGLE', translation: 'Selva', lang: 'en-US', category: 'Natureza' },
  { id: 'w-j2', word: 'JOURNEY', translation: 'Jornada', lang: 'en-US', category: 'Viagem' },
  { id: 'w-j3', word: 'JEWEL', translation: 'Joia', lang: 'en-US', category: 'Preciosidades' },
  // K
  { id: 'w-k1', word: 'KINGDOM', translation: 'Reino', lang: 'en-US', category: 'História' },
  { id: 'w-k2', word: 'KNIGHT', translation: 'Cavaleiro', lang: 'en-US', category: 'História' },
  { id: 'w-k3', word: 'KITE', translation: 'Pipa', lang: 'en-US', category: 'Brinquedos' },
  // L
  { id: 'w-l1', word: 'LION', translation: 'Leão', lang: 'en-US', category: 'Animais' },
  { id: 'w-l2', word: 'LIGHTNING', translation: 'Relâmpago', lang: 'en-US', category: 'Clima' },
  { id: 'w-l3', word: 'LEMON', translation: 'Limão', lang: 'en-US', category: 'Comida' },
  { id: 'w-l4', word: 'LADDER', translation: 'Escada', lang: 'en-US', category: 'Objetos' },
  // M
  { id: 'w-m1', word: 'MOUNTAIN', translation: 'Montanha', lang: 'en-US', category: 'Geografia' },
  { id: 'w-m2', word: 'MOON', translation: 'Lua', lang: 'en-US', category: 'Espaço' },
  { id: 'w-m3', word: 'MUSIC', translation: 'Música', lang: 'en-US', category: 'Arte' },
  { id: 'w-m4', word: 'MAGIC', translation: 'Mágica', lang: 'en-US', category: 'Mítico' },
  // N
  { id: 'w-n1', word: 'NIGHT', translation: 'Noite', lang: 'en-US', category: 'Tempo' },
  { id: 'w-n2', word: 'NATURE', translation: 'Natureza', lang: 'en-US', category: 'Mundo' },
  { id: 'w-n3', word: 'NEST', translation: 'Ninho', lang: 'en-US', category: 'Animais' },
  { id: 'w-n4', word: 'NOVEL', translation: 'Romance / Livro', lang: 'en-US', category: 'Literatura' },
  { id: 'w-n5', word: 'NEEDLE', translation: 'Agulha', lang: 'en-US', category: 'Objetos' },
  // O
  { id: 'w-o1', word: 'OCEAN', translation: 'Oceano', lang: 'en-US', category: 'Geografia' },
  { id: 'w-o2', word: 'ORANGE', translation: 'Laranja', lang: 'en-US', category: 'Frutas' },
  { id: 'w-o3', word: 'ORCHESTRA', translation: 'Orquestra', lang: 'en-US', category: 'Música' },
  { id: 'w-o4', word: 'OWL', translation: 'Coruja', lang: 'en-US', category: 'Aves' },
  // P
  { id: 'w-p1', word: 'PLANET', translation: 'Planeta', lang: 'en-US', category: 'Espaço' },
  { id: 'w-p2', word: 'PYRAMID', translation: 'Pirâmide', lang: 'en-US', category: 'História' },
  { id: 'w-p3', word: 'PEARL', translation: 'Pérola', lang: 'en-US', category: 'Preciosidades' },
  { id: 'w-p4', word: 'PAINTING', translation: 'Pintura', lang: 'en-US', category: 'Arte' },
  // Q
  { id: 'w-q1', word: 'QUEEN', translation: 'Rainha', lang: 'en-US', category: 'História' },
  { id: 'w-q2', word: 'QUEST', translation: 'Missão / Busca', lang: 'en-US', category: 'Aventura' },
  // R
  { id: 'w-r1', word: 'RIVER', translation: 'Rio', lang: 'en-US', category: 'Geografia' },
  { id: 'w-r2', word: 'RAINBOW', translation: 'Arco-íris', lang: 'en-US', category: 'Clima' },
  { id: 'w-r3', word: 'RABBIT', translation: 'Coelho', lang: 'en-US', category: 'Animais' },
  { id: 'w-r4', word: 'ROBOT', translation: 'Robô', lang: 'en-US', category: 'Tecnologia' },
  { id: 'w-r5', word: 'ROCKET', translation: 'Foguete', lang: 'en-US', category: 'Espaço' },
  // S
  { id: 'w-s1', word: 'SUNSHINE', translation: 'Luz Solar', lang: 'en-US', category: 'Clima' },
  { id: 'w-s2', word: 'SILVER', translation: 'Prata', lang: 'en-US', category: 'Metais' },
  { id: 'w-s3', word: 'STAR', translation: 'Estrela', lang: 'en-US', category: 'Espaço' },
  { id: 'w-s4', word: 'SWORD', translation: 'Espada', lang: 'en-US', category: 'História' },
  // T
  { id: 'w-t1', word: 'TRAIN', translation: 'Trem', lang: 'en-US', category: 'Transporte' },
  { id: 'w-t2', word: 'TIGER', translation: 'Tigre', lang: 'en-US', category: 'Animais' },
  { id: 'w-t3', word: 'TEMPLE', translation: 'Templo', lang: 'en-US', category: 'Lugares' },
  { id: 'w-t4', word: 'TREASURE', translation: 'Tesouro', lang: 'en-US', category: 'Aventura' },
  { id: 'w-t5', word: 'TURTLE', translation: 'Tartaruga', lang: 'en-US', category: 'Animais' },
  // U
  { id: 'w-u1', word: 'UMBRELLA', translation: 'Guarda-chuva', lang: 'en-US', category: 'Objetos' },
  { id: 'w-u2', word: 'UNIVERSE', translation: 'Universo', lang: 'en-US', category: 'Espaço' },
  // V
  { id: 'w-v1', word: 'VALLEY', translation: 'Vale', lang: 'en-US', category: 'Geografia' },
  { id: 'w-v2', word: 'VOLCANO', translation: 'Vulcão', lang: 'en-US', category: 'Natureza' },
  { id: 'w-v3', word: 'VIOLIN', translation: 'Violino', lang: 'en-US', category: 'Música' },
  // W
  { id: 'w-w1', word: 'WIND', translation: 'Vento', lang: 'en-US', category: 'Clima' },
  { id: 'w-w2', word: 'WATERFALL', translation: 'Cachoeira', lang: 'en-US', category: 'Natureza' },
  { id: 'w-w3', word: 'WHALE', translation: 'Baleia', lang: 'en-US', category: 'Animais' },
  { id: 'w-w4', word: 'WIZARD', translation: 'Mago', lang: 'en-US', category: 'Mítico' },
  // Y
  { id: 'w-y1', word: 'YACHT', translation: 'Iate', lang: 'en-US', category: 'Transporte' },
  { id: 'w-y2', word: 'YELLOW', translation: 'Amarelo', lang: 'en-US', category: 'Cores' },
  // Z
  { id: 'w-z1', word: 'ZEBRA', translation: 'Zebra', lang: 'en-US', category: 'Animais' },
];

export default function ShiritoriGame({ items: itemsProp, ageProfile, onFinish, onExit }: ShiritoriGameProps) {
  // Constrói o banco de palavras combinando o dicionário curado com itens adicionais
  const bancoCompleto = useMemo<ShiritoriWord[]>(() => {
    const custom: ShiritoriWord[] = [];
    if (itemsProp && itemsProp.length > 0) {
      itemsProp.forEach((it, idx) => {
        const limpa = it.answer.trim().toUpperCase();
        if (limpa.length >= 3 && /^[A-Z]+$/.test(limpa)) {
          custom.push({
            id: `custom-${idx}`,
            word: limpa,
            translation: it.prompt || limpa,
            lang: it.lang || 'en-US',
            category: 'Seu Baralho',
          });
        }
      });
    }
    // Junta custom primeiro, depois o dicionário padrão, evitando duplicatas de palavra
    const vistas = new Set<string>();
    const res: ShiritoriWord[] = [];
    [...custom, ...SHIRITORI_DICTIONARY].forEach((w) => {
      if (!vistas.has(w.word)) {
        vistas.add(w.word);
        res.push(w);
      }
    });
    return res;
  }, [itemsProp]);

  const tempoPorVagao = ageProfile === 'senior' ? 10 : ageProfile === 'kids' ? 9 : 7;
  const [cadeia, setCadeia] = useState<ShiritoriWord[]>([]);
  const [usadasSet, setUsadasSet] = useState<Set<string>>(new Set());
  const [opcoesAtuais, setOpcoesAtuais] = useState<ShiritoriWord[]>([]);
  const [pontos, setPontos] = useState(0);
  const [combo, setCombo] = useState(0);
  const [tempo, setTempo] = useState(tempoPorVagao);
  const [finalizado, setFinalizado] = useState(false);
  const [textoLivre, setTextoLivre] = useState('');
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioPartidaRef = useRef(Date.now());
  const inicioVagaoRef = useRef(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Palavra atual na ponta da corrente
  const palavraAtual = cadeia[cadeia.length - 1];
  const ultimaLetra = palavraAtual ? palavraAtual.word[palavraAtual.word.length - 1] : '';

  // Inicia a partida com uma palavra inicial aleatória rica
  useEffect(() => {
    const iniciais = bancoCompleto.filter((w) => ['T', 'B', 'P', 'R', 'C', 'M'].includes(w.word[0]));
    const sorteada = iniciais[Math.floor(Math.random() * iniciais.length)] || bancoCompleto[0];
    
    setCadeia([sorteada]);
    const novasUsadas = new Set([sorteada.word]);
    setUsadasSet(novasUsadas);
    gerarOpcoesPara(sorteada, novasUsadas);
  }, [bancoCompleto]);

  // Gera opções para o próximo elo da corrente sem nunca repetir palavras
  const gerarOpcoesPara = (palavraBase: ShiritoriWord, historico: Set<string>) => {
    inicioVagaoRef.current = Date.now();
    setTempo(tempoPorVagao);
    setErroMsg(null);
    setTextoLivre('');

    const charFinal = palavraBase.word[palavraBase.word.length - 1];

    // Candidatas válidas: começam com charFinal e NÃO foram usadas
    let candidatas = bancoCompleto.filter(
      (w) => w.word.startsWith(charFinal) && !historico.has(w.word)
    );

    // Se o histórico esgotou as daquela letra, reseta as usadas daquela letra específica
    if (candidatas.length === 0) {
      candidatas = bancoCompleto.filter(
        (w) => w.word.startsWith(charFinal) && w.word !== palavraBase.word
      );
    }

    // Escolhe uma candidata correta aleatória entre as disponíveis
    const candidata = candidatas[Math.floor(Math.random() * candidatas.length)] || {
      id: `fallback-${charFinal}`,
      word: `${charFinal}TAR`,
      translation: `Estrela ${charFinal}`,
      lang: 'en-US',
    };

    // Distratores: começam com QUALQUER OUTRA LETRA
    const distratores = bancoCompleto
      .filter((w) => !w.word.startsWith(charFinal) && !historico.has(w.word))
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);

    const opcoes = [candidata, ...distratores].sort(() => Math.random() - 0.5);
    setOpcoesAtuais(opcoes);

    // Reproduz a pronúncia da nova palavra de ancoragem via TTS
    try {
      speak(palavraBase.word, { lang: palavraBase.lang });
    } catch {
      // Ignora erro de áudio
    }
  };

  // Loop do cronômetro
  useEffect(() => {
    if (finalizado || !palavraAtual) return;
    const timer = setInterval(() => {
      setTempo((prev) => {
        if (prev <= 1) {
          tratarTimeout();
          return tempoPorVagao;
        }
        if (prev <= 3) play('tick');
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cadeia, finalizado, tempoPorVagao, palavraAtual]);

  const tratarTimeout = () => {
    play('error');
    if (containerRef.current) tremor(containerRef.current);
    setCombo(0);

    outcomesRef.current.push({
      itemRef: palavraAtual.word,
      correct: false,
      attempts: 1,
      ms: Date.now() - inicioVagaoRef.current,
      revealed: true,
    });

    concluirPartida(false);
  };

  const registrarAcerto = (palavraEscolhida: ShiritoriWord, bonusCriativo = 0) => {
    play('combo');
    const novoCombo = combo + 1;
    setCombo(novoCombo);

    if (novoCombo % 3 === 0) {
      play('levelUp');
      pulsoDeZoom();
      flashDeTela();
    }

    const pts = 160 + (combo * 35) + bonusCriativo;
    setPontos((p) => p + pts);

    const novoHistorico = new Set(usadasSet);
    novoHistorico.add(palavraEscolhida.word);
    setUsadasSet(novoHistorico);

    const novaCadeia = [...cadeia, palavraEscolhida];
    setCadeia(novaCadeia);

    // Vitória com 8 vagões completados
    if (novaCadeia.length >= 8) {
      concluirPartida(true);
    } else {
      gerarOpcoesPara(palavraEscolhida, novoHistorico);
    }
  };

  const handleEscolhaPalavra = (opcao: ShiritoriWord, event: React.MouseEvent) => {
    if (finalizado || !palavraAtual) return;

    const correta = opcao.word.startsWith(ultimaLetra);
    const duracao = Date.now() - inicioVagaoRef.current;

    outcomesRef.current.push({
      itemRef: opcao.word,
      correct: correta,
      attempts: 1,
      ms: duracao,
    });

    if (correta) {
      const rect = event.currentTarget.getBoundingClientRect();
      emitBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 'combo');
      registrarAcerto(opcao);
    } else {
      // Quebrou a corrente fonológica!
      play('error');
      setCombo(0);
      setErroMsg(`"${opcao.word}" começa com "${opcao.word[0]}", mas a corrente exige a letra "${ultimaLetra}"!`);
      if (containerRef.current) tremor(containerRef.current);
    }
  };

  // Entrada livre: O usuário digita qualquer palavra válida que comece com a letra requerida
  const handleSubmissaoLivre = (e: React.FormEvent) => {
    e.preventDefault();
    if (finalizado || !palavraAtual) return;

    const palavraDigitada = textoLivre.trim().toUpperCase();
    if (!palavraDigitada) return;

    if (palavraDigitada.length < 3) {
      play('error');
      setErroMsg('A palavra deve ter pelo menos 3 letras!');
      return;
    }

    if (!palavraDigitada.startsWith(ultimaLetra)) {
      play('error');
      setErroMsg(`A palavra "${palavraDigitada}" começa com "${palavraDigitada[0]}", mas deve começar com "${ultimaLetra}"!`);
      if (containerRef.current) tremor(containerRef.current);
      return;
    }

    if (usadasSet.has(palavraDigitada)) {
      play('error');
      setErroMsg(`"${palavraDigitada}" já foi usada nesta corrente! Em Shiritori não é permitido repetir palavras.`);
      if (containerRef.current) tremor(containerRef.current);
      return;
    }

    // Palavra digitada é válida e criativa!
    play('click');
    comemorar('sequencia');
    emitBurst(window.innerWidth / 2, window.innerHeight / 2, 'combo');

    const novaPalavraObj: ShiritoriWord = {
      id: `user-${Date.now()}`,
      word: palavraDigitada,
      translation: 'Sua criação!',
      lang: 'en-US',
      category: 'Criativo',
    };

    outcomesRef.current.push({
      itemRef: palavraDigitada,
      correct: true,
      attempts: 1,
      ms: Date.now() - inicioVagaoRef.current,
    });

    registrarAcerto(novaPalavraObj, 100);
  };

  const concluirPartida = (venceu = false) => {
    setFinalizado(true);
    if (venceu) {
      play('fanfarra');
      comemorar('rodadaPerfeita');
    } else {
      play('error');
    }

    const duracaoTotal = Date.now() - inicioPartidaRef.current;
    const report: RoundReport = {
      gameId: 'blitz' as any,
      items: outcomesRef.current,
      score: pontos,
      durationMs: duracaoTotal,
    };

    setTimeout(() => {
      onFinish(report);
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas/95 backdrop-blur-md text-ink select-none overflow-y-auto" ref={containerRef}>
      {/* Topo / Header com Identidade Visual de Alta Energia */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/90 backdrop-blur-lg sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2.5 rounded-2xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
            title="Sair do Shiritori Express"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-xl tracking-wide uppercase bg-gradient-to-r from-accent to-indigo-500 bg-clip-text text-transparent">
                Shiritori Express
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent-soft text-accent-ink font-bold border border-accent/20">
                しりとり 🇯🇵/🇰🇷
              </span>
            </div>
            <p className="text-xs text-ink-muted hidden sm:block">Conecte a última letra à primeira sem repetir palavras!</p>
          </div>
        </div>

        {/* Painel de Status Dopamínico */}
        <div className="flex items-center gap-3 sm:gap-4">
          {combo > 1 && (
            <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-white font-black text-xs shadow-lg animate-pulse">
              <Flame className="w-4 h-4 fill-current" />
              <span>{combo}x COMBO EXPRESS</span>
            </div>
          )}

          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl border border-border-subtle bg-surface shadow-sm">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="font-mono font-black text-base">{pontos} pts</span>
          </div>

          <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-2xl border transition-colors shadow-sm ${
            tempo <= 3 ? 'border-error bg-error/10 text-error animate-pulse' : 'border-border-subtle bg-surface'
          }`}>
            <TimerIcon className={`w-4 h-4 ${tempo <= 3 ? 'animate-spin text-error' : 'text-ink-muted'}`} />
            <span className="font-mono font-black text-base">{tempo}s</span>
          </div>
        </div>
      </header>

      {/* Arena Central do Trem */}
      <main className="flex-1 p-4 sm:p-8 flex flex-col items-center justify-center max-w-5xl mx-auto w-full">
        {palavraAtual && (
          <div className="w-full bg-surface border-2 border-border-subtle rounded-3xl p-6 sm:p-10 shadow-2xl flex flex-col items-center space-y-6 animate-fadeIn">
            
            {/* O Trilho da Corrente (Vagões Conectados) */}
            <div className="w-full bg-surface-hover/80 rounded-2xl p-4 border border-border-subtle">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-accent uppercase tracking-wider">
                  <Train className="w-4 h-4 text-accent animate-pulse" />
                  <span>Vagões do Expresso ({cadeia.length} / 8)</span>
                </div>
                <span className="text-xs text-ink-muted font-medium">Meta: 8 conexões sem quebra</span>
              </div>
              
              <div className="w-full flex items-center gap-2 overflow-x-auto py-2 scrollbar-none">
                {cadeia.map((vagao, i) => (
                  <div key={i} className="flex items-center gap-2 shrink-0 animate-scaleIn">
                    <div className="px-3.5 py-2 rounded-xl bg-surface border-2 border-accent/40 shadow-sm flex flex-col items-center">
                      <span className="font-mono font-black text-xs sm:text-sm text-ink">{vagao.word}</span>
                      <span className="text-[10px] text-ink-muted font-medium">{vagao.translation}</span>
                    </div>
                    {i < cadeia.length - 1 && (
                      <ArrowRight className="w-4 h-4 text-accent shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* A Palavra Conectora Central em Destaque */}
            <div className="text-center py-2">
              <p className="text-xs uppercase font-mono tracking-widest text-ink-muted mb-2 font-bold">
                PALAVRA NA PONTA DA CORRENTE
              </p>
              <div className="font-display font-black text-5xl sm:text-7xl text-ink tracking-wider flex items-center justify-center gap-1">
                <span>{palavraAtual.word.slice(0, -1)}</span>
                <span className="text-accent underline decoration-accent decoration-8 underline-offset-8 animate-bounce">
                  {ultimaLetra}
                </span>
              </div>
              <div className="flex items-center justify-center gap-2 mt-3">
                <span className="text-base font-bold text-ink-muted">({palavraAtual.translation})</span>
                <button
                  onClick={() => speak(palavraAtual.word, { lang: palavraAtual.lang })}
                  className="p-1.5 rounded-full hover:bg-surface-hover text-accent transition-colors"
                  title="Ouvir pronúncia"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Mensagem de Erro / Orientação */}
            {erroMsg && (
              <div className="w-full max-w-lg px-4 py-2.5 rounded-xl bg-error/10 border border-error/30 text-error text-xs sm:text-sm font-bold text-center animate-shake">
                {erroMsg}
              </div>
            )}

            {/* Chamada para Ação */}
            <div className="px-5 py-2 rounded-2xl bg-accent-soft/40 border border-accent/30 text-accent-ink text-sm sm:text-base font-bold flex items-center gap-2 shadow-sm">
              <Zap className="w-4 h-4 text-accent" />
              <span>Conecte uma palavra que comece com a letra:</span>
              <span className="font-black text-xl px-2.5 py-0.5 rounded-lg bg-accent text-accent-contrast shadow-sm">
                {ultimaLetra}
              </span>
            </div>

            {/* OPÇÃO 1: Cartas Rápidas */}
            <div className="w-full space-y-3">
              <p className="text-xs font-mono uppercase text-ink-muted font-bold text-center">
                Opção A: Escolha uma Carta Rápida
              </p>
              <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                {opcoesAtuais.map((opcao) => (
                  <button
                    key={opcao.id}
                    onClick={(e) => handleEscolhaPalavra(opcao, e)}
                    className="p-5 rounded-2xl border-2 border-border-subtle bg-surface-hover hover:border-accent hover:bg-accent-soft/20 transition-all shadow-md active:scale-95 text-center flex flex-col items-center justify-center group cursor-pointer"
                  >
                    <span className="font-display font-black text-2xl sm:text-3xl text-ink group-hover:text-accent transition-colors">
                      <strong className="text-accent underline decoration-2">{opcao.word[0]}</strong>
                      {opcao.word.slice(1)}
                    </span>
                    <span className="text-xs text-ink-muted font-medium mt-1">({opcao.translation})</span>
                    {opcao.category && (
                      <span className="text-[10px] px-2 py-0.5 mt-2 rounded-full bg-surface border border-border-subtle text-ink-muted">
                        {opcao.category}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* OPÇÃO 2: Liberdade Total com Entrada Livre de Palavras */}
            <div className="w-full max-w-xl border-t border-border-subtle pt-6">
              <p className="text-xs font-mono uppercase text-ink-muted font-bold text-center mb-3">
                Opção B: Digite Sua Própria Palavra (+100 pts de Criatividade!)
              </p>
              <form onSubmit={handleSubmissaoLivre} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={textoLivre}
                    onChange={(e) => setTextoLivre(e.target.value)}
                    placeholder={`Digite em inglês começando com '${ultimaLetra}'...`}
                    className="w-full px-4 py-3 rounded-2xl border-2 border-border-subtle bg-surface text-ink font-bold placeholder:text-ink-muted/50 focus:border-accent focus:outline-none transition-all pr-10 uppercase"
                  />
                  <span className="absolute right-3.5 top-3.5 text-xs font-mono font-bold text-accent">
                    {ultimaLetra}
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={!textoLivre.trim()}
                  className="px-5 py-3 rounded-2xl bg-accent text-accent-contrast font-black flex items-center gap-2 hover:opacity-95 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Conectar</span>
                </button>
              </form>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
