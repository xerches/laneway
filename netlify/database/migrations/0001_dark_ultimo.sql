CREATE TABLE "item_label" (
	"item_id" text NOT NULL,
	"label_id" text NOT NULL,
	CONSTRAINT "item_label_item_id_label_id_pk" PRIMARY KEY("item_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "item_link" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "label" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'gray' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_label" ADD CONSTRAINT "item_label_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_label" ADD CONSTRAINT "item_label_label_id_label_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."label"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_link" ADD CONSTRAINT "item_link_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_link" ADD CONSTRAINT "item_link_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_link" ADD CONSTRAINT "item_link_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label" ADD CONSTRAINT "label_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_label_label_idx" ON "item_label" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "item_link_item_idx" ON "item_link" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "label_workspace_idx" ON "label" USING btree ("workspace_id");