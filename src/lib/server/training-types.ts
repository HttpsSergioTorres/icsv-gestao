export type TrainingLesson = {
  id: string;
  titulo: string;
  conteudo: string;
  videoUrl?: string;
  obrigatoria: boolean;
};

export type TrainingQuestion = {
  id: string;
  enunciado: string;
  opcoes: string[];
};

export type TrainingSummary = {
  id: string;
  ministerioId: string;
  ministerio: string;
  titulo: string;
  descricao: string;
  notaMinima: number;
  publicado: boolean;
  podeGerenciar: boolean;
  podeAprender: boolean;
};

export type TrainingCatalog = {
  courses: TrainingSummary[];
  ministries: { id: string; nome: string }[];
  canManage: boolean;
};

export type TrainingCertificate = {
  id: string;
  nome: string;
  curso: string;
  ministerio: string;
  emitidoEm: string;
};

export type TrainingProgress = {
  aulasConcluidas: string[];
  tentativas: { ordem: number; nota: number; aprovada: boolean; enviadoEm: string }[];
  tentativasRestantes: number;
  status: "nao_iniciado" | "em_andamento" | "aprovado" | "nao_concluido" | "concluido";
  certificado: TrainingCertificate | null;
};

export type TrainingDetail = {
  course: TrainingSummary & {
    aulas: TrainingLesson[];
    questoes: TrainingQuestion[];
    conteudoBloqueado: boolean;
  };
  progresso: TrainingProgress | null;
};
