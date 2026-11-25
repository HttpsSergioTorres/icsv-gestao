"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Gamepad2, Sparkles } from "lucide-react";
import { ComunicacaoHome } from "./comunicacao";
import "./kids.css";

const stories = [
  {
    id: "arca",
    title: "Noé e a arca",
    passage: "Gênesis 6–9",
    image: "Uma arca sobre a água, com morros, nuvens e um arco-íris.",
    paragraphs: [
      "Deus orientou Noé a construir uma arca, um barco muito grande. Noé fez como Deus havia pedido. Ele entrou na arca com sua família, e animais também entraram.",
      "Depois da chuva, a água baixou e todos puderam sair. Deus fez uma promessa a Noé e colocou o arco-íris no céu como sinal dessa promessa.",
    ],
  },
  {
    id: "amanhecer",
    title: "Jesus acolhe as crianças",
    passage: "Marcos 10:13–16",
    image: "Três figuras se aproximam de braços abertos em um caminho entre árvores.",
    paragraphs: [
      "Algumas pessoas trouxeram crianças para perto de Jesus. Os discípulos tentaram impedi-las, mas Jesus disse que elas podiam se aproximar.",
      "Jesus recebeu as crianças, tomou-as nos braços e as abençoou.",
    ],
  },
  {
    id: "mar",
    title: "Jesus acalma a tempestade",
    passage: "Marcos 4:35–41",
    image: "Um pequeno barco à vela sobre ondas, com nuvens e raios ao fundo.",
    paragraphs: [
      "Jesus e seus discípulos atravessavam o lago num barco. Enquanto Jesus dormia, um vento forte levantou ondas. Com medo, os discípulos o acordaram.",
      "Jesus deu uma ordem ao vento e à água. O vento parou, e tudo ficou calmo. Os discípulos ficaram admirados com o que viram.",
    ],
  },
] as const;

const questions = [
  {
    prompt: "O que Deus pediu a Noé que construísse?",
    choices: ["Uma torre", "Uma arca", "Uma ponte"],
    answer: 1,
    note: "Noé construiu uma arca para sua família e os animais. Gênesis 6:14–22.",
  },
  {
    prompt: "Depois da chuva, qual sinal apareceu no céu?",
    choices: ["Um arco-íris", "Uma estrela", "Uma pomba"],
    answer: 0,
    note: "Deus colocou o arco-íris como sinal de sua promessa. Gênesis 9:12–17.",
  },
  {
    prompt: "O que Jesus fez quando as crianças se aproximaram?",
    choices: ["Pediu que fossem embora", "Entrou em um barco", "Recebeu e abençoou as crianças"],
    answer: 2,
    note: "Jesus recebeu as crianças e as abençoou. Marcos 10:13–16.",
  },
  {
    prompt: "O que aconteceu quando Jesus deu uma ordem ao vento e à água?",
    choices: ["A tempestade se acalmou", "A chuva ficou mais forte", "O barco virou"],
    answer: 0,
    note: "O vento parou, e as águas ficaram calmas. Marcos 4:35–41.",
  },
] as const;

function Ilustracao({ id, label }: { id: string; label: string }) {
  return <div className={`kids-illustration kids-illustration-${id}`} role="img" aria-label={label}>
    <span className="kids-figure-sky" /><span className="kids-figure-cloud" /><span className="kids-figure-hill" />
    <span className="kids-figure-water" /><span className="kids-figure-focus" /><span className="kids-figure-extra" />
  </div>;
}

function Historias() {
  const [position, setPosition] = useState(0);
  const story = stories[position];

  return <section className="kids-adventure-card" aria-labelledby="kids-stories-title">
    <header><span className="kids-feature-icon"><BookOpen size={22} aria-hidden="true" /></span>
      <div><h2 id="kids-stories-title">Mini bíblias ilustradas</h2><p>Histórias curtas para ler em família.</p></div>
    </header>
    <article className="kids-story">
      <Ilustracao id={story.id} label={story.image} />
      <div className="kids-story-body">
        <h3>{story.title}</h3>
        <p className="kids-reference">{story.passage}</p>
        {story.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </div>
    </article>
    <div className="kids-story-controls">
      <button className="btn btn-secondary" type="button" disabled={position === 0} onClick={() => setPosition((value) => value - 1)}>
        <ChevronLeft size={17} aria-hidden="true" />Anterior
      </button>
      <span aria-live="polite">História {position + 1} de {stories.length}</span>
      <button className="btn btn-primary" type="button" disabled={position === stories.length - 1} onClick={() => setPosition((value) => value + 1)}>
        Próxima<ChevronRight size={17} aria-hidden="true" />
      </button>
    </div>
  </section>;
}

function JogoBiblico() {
  const [position, setPosition] = useState(0);
  const [answer, setAnswer] = useState<number>();
  const [points, setPoints] = useState(0);
  const [completed, setCompleted] = useState(false);
  const question = questions[position];

  function select(choice: number) {
    if (answer !== undefined || completed) return;
    setAnswer(choice);
    if (choice === question.answer) setPoints((value) => value + 1);
  }

  function next() {
    if (position === questions.length - 1) {
      setCompleted(true);
      return;
    }
    setPosition((value) => value + 1);
    setAnswer(undefined);
  }

  function restart() {
    setPoints(0);
    setPosition(0);
    setAnswer(undefined);
    setCompleted(false);
  }

  return <section className="kids-adventure-card kids-game" aria-labelledby="kids-game-title">
    <header><span className="kids-feature-icon kids-feature-game"><Gamepad2 size={22} aria-hidden="true" /></span>
      <div><h2 id="kids-game-title">Desafio bíblico</h2><p>Leia as histórias e jogue!</p></div>
    </header>
    <div className="kids-game-body">
      {completed
        ? <div className="kids-game-finish"><Sparkles size={30} aria-hidden="true" />
          <h3>Desafio concluído!</h3><p role="status">Você acertou {points} de {questions.length} perguntas.</p>
          <button className="btn btn-primary" onClick={restart} type="button">Jogar novamente</button></div>
        : <>
          <p className="kids-reference">Pergunta {position + 1} de {questions.length}</p>
          <h3>{question.prompt}</h3>
          <div className="kids-game-choices">
            {question.choices.map((choice, index) => <button type="button" key={choice}
              disabled={answer !== undefined} onClick={() => select(index)}
              className={answer === undefined ? undefined : question.answer === index ? "kids-choice-correct" : answer === index ? "kids-choice-incorrect" : undefined}>
              <span>{String.fromCharCode(65 + index)}</span>{choice}
            </button>)}
          </div>
          {answer !== undefined && <div className="kids-game-feedback" role="status">
            <strong>{answer === question.answer ? "Você acertou!" : "Vamos aprender juntos."}</strong><p>{question.note}</p>
          </div>}
          {answer !== undefined && <button type="button" className="btn btn-primary" onClick={next}>
            {position === questions.length - 1 ? "Ver resultado" : "Próxima pergunta"}<ChevronRight size={17} aria-hidden="true" />
          </button>}
        </>}
    </div>
  </section>;
}

export function EspacoKids() {
  return <div className="kids-space">
    <header className="kids-hero">
      <div><p><Sparkles size={16} aria-hidden="true" /> ICSV San Vale</p><h1>Espaço Kids</h1>
        <p>Descubra histórias da Bíblia e coloque o que aprendeu à prova.</p></div>
      <div className="kids-hero-actions"><Link href="/selecionar-perfil" className="btn btn-secondary">Trocar perfil</Link></div>
    </header>
    <div className="kids-activities"><Historias /><JogoBiblico /></div>
    <ComunicacaoHome audience="kids" />
  </div>;
}
