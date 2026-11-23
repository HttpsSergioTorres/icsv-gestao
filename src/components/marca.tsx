import { Church } from "lucide-react";

export function Marca({ compacta = false }: { compacta?: boolean }) {
  return (
    <span className="marca">
      <span className="marca-simbolo" aria-hidden="true"><Church size={22} strokeWidth={1.7} /></span>
      <span className="marca-nome">
        <strong>ICSV Gestão</strong>
        {!compacta && <small>Campo San Vale</small>}
      </span>
    </span>
  );
}
