CREATE TABLE "api_token" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"workspace_ids" jsonb,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_hook" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"secret" text NOT NULL,
	"on_merge" text DEFAULT 'done' NOT NULL,
	"created_by" text,
	"last_delivery_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_hook" ADD CONSTRAINT "github_hook_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_hook" ADD CONSTRAINT "github_hook_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_token_hash_idx" ON "api_token" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "api_token_user_idx" ON "api_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "github_hook_workspace_idx" ON "github_hook" USING btree ("workspace_id");