ALTER TABLE "projects" ADD COLUMN "repo_url" text;
ALTER TABLE "projects" ADD COLUMN "build_command" text DEFAULT 'npm install && npm run build' NOT NULL;
ALTER TABLE "projects" ADD COLUMN "output_dir" text DEFAULT 'dist' NOT NULL;
