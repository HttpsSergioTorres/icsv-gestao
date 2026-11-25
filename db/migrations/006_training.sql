CREATE TABLE icsv_training_courses (
  id uuid PRIMARY KEY,
  ministry_id uuid NOT NULL,
  ministry_resource text GENERATED ALWAYS AS ('ministerios') STORED,
  title text NOT NULL,
  description text NOT NULL,
  minimum_score integer NOT NULL CHECK (minimum_score BETWEEN 1 AND 100),
  published boolean NOT NULL DEFAULT false,
  lessons jsonb NOT NULL CHECK (jsonb_typeof(lessons) = 'array' AND jsonb_array_length(lessons) > 0),
  questions jsonb NOT NULL CHECK (jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (ministry_id, ministry_resource) REFERENCES icsv_records(id, resource)
);

CREATE INDEX icsv_training_courses_ministry ON icsv_training_courses (ministry_id);

CREATE TABLE icsv_training_progress (
  course_id uuid NOT NULL REFERENCES icsv_training_courses(id),
  person_id uuid NOT NULL,
  person_resource text GENERATED ALWAYS AS ('pessoas') STORED,
  lesson_id uuid NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, person_id, lesson_id),
  FOREIGN KEY (person_id, person_resource) REFERENCES icsv_records(id, resource)
);

CREATE TABLE icsv_training_attempts (
  id uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES icsv_training_courses(id),
  person_id uuid NOT NULL,
  person_resource text GENERATED ALWAYS AS ('pessoas') STORED,
  submission_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 3),
  score numeric(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  passed boolean NOT NULL,
  answers jsonb NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, person_id, ordinal),
  UNIQUE (course_id, person_id, submission_id),
  FOREIGN KEY (person_id, person_resource) REFERENCES icsv_records(id, resource)
);

CREATE UNIQUE INDEX icsv_training_single_approval ON icsv_training_attempts (course_id, person_id)
  WHERE passed;

CREATE TABLE icsv_training_certificates (
  id uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES icsv_training_courses(id),
  person_id uuid NOT NULL,
  person_resource text GENERATED ALWAYS AS ('pessoas') STORED,
  person_name text NOT NULL,
  course_title text NOT NULL,
  ministry_name text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, person_id),
  FOREIGN KEY (person_id, person_resource) REFERENCES icsv_records(id, resource)
);
