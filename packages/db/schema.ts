import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const deploymentStateEnum = pgEnum("deployment_state", [
  "queued",
  "building",
  "failed",
  "deploying",
  "live",
  "stopped",
  "rolled_back",
]);

export const projectTypeEnum = pgEnum("project_type", ["static", "container"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubId: text("github_id").notNull().unique(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  repoUrl: text("repo_url"),
  buildCommand: text("build_command").notNull().default("npm install && npm run build"),
  outputDir: text("output_dir").notNull().default("dist"),
  projectType: projectTypeEnum("project_type").notNull().default("static"),
  containerPort: integer("container_port").notNull().default(3000),
  githubWebhookSecret: text("github_webhook_secret"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  domain: text("domain").notNull().unique(),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deployments = pgTable("deployments", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  commitSha: text("commit_sha").notNull(),
  state: deploymentStateEnum("state").notNull().default("queued"),
  artifactPath: text("artifact_path"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const buildLogs = pgTable("build_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  deploymentId: uuid("deployment_id").notNull().references(() => deployments.id, { onDelete: "cascade" }),
  line: text("line").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const environmentVariables = pgTable(
  "environment_variables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    valueEncrypted: text("value_encrypted").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniqProjectKey: unique().on(t.projectId, t.key) }),
);

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Domain = typeof domains.$inferSelect;
export type Deployment = typeof deployments.$inferSelect;
export type BuildLog = typeof buildLogs.$inferSelect;
export type EnvironmentVariable = typeof environmentVariables.$inferSelect;
export type DeploymentState = (typeof deploymentStateEnum.enumValues)[number];
export type ProjectType = (typeof projectTypeEnum.enumValues)[number];
