import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowRightLeft, BellRing, HeartHandshake } from "lucide-react";
import { ComunicacaoHome } from "@/components/comunicacao";

const guides = [
  {
    title: "Trocar de perfil",
    icon: ArrowRightLeft,
    action: "Ver meus perfis",
    href: "/selecionar-perfil",
    steps: [
      "Abra o menu da sua conta, no canto superior da tela.",
      "Escolha Trocar perfil.",
      "Selecione um perfil disponível e confirme para abrir a página inicial dele.",
    ],
  },
  {
    title: "Consultar avisos",
    icon: BellRing,
    action: "Abrir mural de avisos",
    href: "#mural-avisos",
    steps: [
      "Na página inicial, encontre Mural de lembretes e avisos.",
      "Leia os recados publicados pela administração para o seu perfil.",
    ],
  },
  {
    title: "Enviar um pedido de oração",
    icon: HeartHandshake,
    action: "Abrir pedidos de oração",
    href: "#pedidos-oracao",
    steps: [
      "Na seção Pedidos de oração, escreva o pedido.",
      "Escolha enviar com identificação ou como Anônimo.",
      "Envie o pedido. A moderação analisa antes de publicar.",
    ],
  },
] as const;

export function Tutorial({ canUseCommunications }: { canUseCommunications: boolean }) {
  const visibleGuides = canUseCommunications ? guides : guides.slice(0, 1);

  return (
    <div className="tutorial">
      <header className="tutorial-opening">
        <div>
          <h1>Tutorial do Sistema</h1>
          <p>Aprenda a usar os recursos disponíveis no seu perfil.</p>
        </div>
        <Image
          className="tutorial-mascot"
          src="/marca/mascote-farol.png"
          alt="Mascote Farol"
          width={360}
          height={300}
          unoptimized
        />
      </header>
      <section aria-labelledby="tutorial-guides">
        <h2 id="tutorial-guides" className="tutorial-title">Passo a passo</h2>
        <div className="tutorial-guides">
          {visibleGuides.map(({ title, icon: Icon, action, href, steps }) => (
            <article className="tutorial-guide" key={title}>
              <span className="tutorial-guide-icon"><Icon size={22} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <ol>{steps.map((step) => <li key={step}>{step}</li>)}</ol>
              <Link href={href} className="btn btn-secondary">
                {action}<ArrowRight size={16} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </section>
      {canUseCommunications && <ComunicacaoHome />}
    </div>
  );
}
