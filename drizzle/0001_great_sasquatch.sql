CREATE TABLE "file_blobs" (
	"stored_filename" text PRIMARY KEY NOT NULL,
	"data" "bytea" NOT NULL,
	"mime_type" text DEFAULT '' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
