CREATE TYPE project_type AS ENUM ('static', 'container');

ALTER TABLE "projects"
  ADD COLUMN "project_type" project_type NOT NULL DEFAULT 'static',
  ADD COLUMN "container_port" integer NOT NULL DEFAULT 3000;
