CREATE TABLE "dashboard" (
	"user_id" text NOT NULL,
	"scope" text NOT NULL,
	"widgets" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_user_id_scope_pk" PRIMARY KEY("user_id","scope")
);
--> statement-breakpoint
ALTER TABLE "dashboard" ADD CONSTRAINT "dashboard_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;