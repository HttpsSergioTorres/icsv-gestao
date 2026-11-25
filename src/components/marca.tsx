import Image from "next/image";

export function Marca({ compacta = false }: { compacta?: boolean }) {
  return (
    <span className="marca">
      <span className="marca-simbolo" aria-hidden="true">
        <Image src="/marca/icsv-icone.png" alt="" width={180} height={180} loading="eager" unoptimized />
      </span>
      <span className="marca-nome">
        <strong>ICSV Gestão</strong>
        {!compacta && <small>Campo San Vale</small>}
      </span>
    </span>
  );
}
