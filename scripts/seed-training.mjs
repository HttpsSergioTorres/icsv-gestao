export async function seedTraining(client, { id, ministryId, volunteerPersonId }) {
  const courses = [
    {
      id: id(1100), titulo: 'Acolhimento na prática', descricao: 'Atendimento e cuidado na equipe de recepção fictícia.',
      notaMinima: 70,
      aulas: [
        { id: id(1101), titulo: 'Receber e orientar', conteudo: 'Cumprimente quem chega e pergunte, com cordialidade, se precisa de ajuda para encontrar o local da atividade.', obrigatoria: true },
        { id: id(1102), titulo: 'Cuidar das informações pessoais', conteudo: 'Use apenas os canais autorizados para encaminhar informações ao responsável da equipe e evite expor dados pessoais.', obrigatoria: true },
      ],
      questoes: [
        { id: id(1103), enunciado: 'Como acolher uma pessoa que chega pela primeira vez?', opcoes: ['Cumprimentar e oferecer orientação.', 'Ignorar a chegada.'], gabarito: 0 },
        { id: id(1104), enunciado: 'Onde encaminhar dados pessoais quando for necessário?', opcoes: ['Em qualquer grupo público.', 'Em canal autorizado da equipe.'], gabarito: 1 },
      ],
    },
    {
      id: id(1110), titulo: 'Introdução ao voluntariado', descricao: 'Curso fictício de primeiros passos na equipe.',
      notaMinima: 70,
      aulas: [
        { id: id(1111), titulo: 'Combinados da equipe', conteudo: 'Confirme os horários da escala e avise a liderança caso precise de ajuda ou de uma substituição.', obrigatoria: true },
      ],
      questoes: [
        { id: id(1112), enunciado: 'O que fazer se precisar faltar a uma escala?', opcoes: ['Avisar a liderança.', 'Deixar de comparecer sem avisar.'], gabarito: 0 },
      ],
    },
  ];

  for (const course of courses) {
    await client.query(`
      INSERT INTO icsv_training_courses
        (id, ministry_id, title, description, minimum_score, published, lessons, questions)
      VALUES ($1, $2, $3, $4, $5, true, $6, $7)
      ON CONFLICT (id) DO NOTHING
    `, [course.id, ministryId, course.titulo, course.descricao, course.notaMinima,
      JSON.stringify(course.aulas), JSON.stringify(course.questoes)]);
  }

  const completed = courses[1];
  await client.query(`
    INSERT INTO icsv_training_progress (course_id, person_id, lesson_id)
    VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
  `, [completed.id, volunteerPersonId, completed.aulas[0].id]);
  await client.query(`
    INSERT INTO icsv_training_attempts
      (id, course_id, person_id, submission_id, ordinal, score, passed, answers)
    VALUES ($1, $2, $3, $4, 1, 100, true, $5)
    ON CONFLICT DO NOTHING
  `, [id(1113), completed.id, volunteerPersonId, id(1114), JSON.stringify({ [completed.questoes[0].id]: 0 })]);
  await client.query(`
    INSERT INTO icsv_training_certificates
      (id, course_id, person_id, person_name, course_title, ministry_name)
    SELECT $1, $2, p.id, p.data->>'nome', c.title, m.data->>'nome'
    FROM icsv_training_courses c JOIN icsv_records m ON m.id = c.ministry_id
    JOIN icsv_records p ON p.id = $3 AND p.resource = 'pessoas'
    WHERE c.id = $2
    ON CONFLICT DO NOTHING
  `, [id(1115), completed.id, volunteerPersonId]);
}
