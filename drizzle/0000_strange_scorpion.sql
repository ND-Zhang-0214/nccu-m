CREATE TABLE "access_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_key" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_lineage" (
	"id" text PRIMARY KEY NOT NULL,
	"from_account_id" text NOT NULL,
	"to_account_id" text NOT NULL,
	"link_type" text NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agreement_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"doc_type" text NOT NULL,
	"version" text NOT NULL,
	"ip" text NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"prev_hash" text DEFAULT '' NOT NULL,
	"hash" text DEFAULT '' NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" text PRIMARY KEY NOT NULL,
	"posting_id" text NOT NULL,
	"applicant_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"motivation" text NOT NULL,
	"motivation_summary" text DEFAULT '' NOT NULL,
	"payload" text DEFAULT '{}' NOT NULL,
	"applied_at_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"application_id" text,
	"group_id" text,
	"original_name" text DEFAULT '' NOT NULL,
	"stored_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"scan_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"expiry_reminded_at" timestamp with time zone,
	CONSTRAINT "attachments_stored_filename_unique" UNIQUE("stored_filename")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text DEFAULT '' NOT NULL,
	"target_id" text DEFAULT '' NOT NULL,
	"meta" text DEFAULT '{}' NOT NULL,
	"prev_hash" text DEFAULT '' NOT NULL,
	"hash" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "colleges" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "colleges_name_unique" UNIQUE("name"),
	CONSTRAINT "colleges_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "contact_disclosures" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"discloser_id" text NOT NULL,
	"kind" text NOT NULL,
	"value_enc" text NOT NULL,
	"disclosed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_members" (
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"status_note" text DEFAULT '' NOT NULL,
	"last_read_at" timestamp with time zone,
	CONSTRAINT "conversation_members_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"context_type" text NOT NULL,
	"context_id" text DEFAULT '' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_export_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"downloaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_export_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"college_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dual_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"requester_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text DEFAULT '' NOT NULL,
	"target_id" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approver_id" text,
	"approved_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fields" (
	"id" text PRIMARY KEY NOT NULL,
	"department_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_download_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"attachment_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_download_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "group_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "human_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_key" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "human_checks_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "ics_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ics_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "interview_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"posting_id" text NOT NULL,
	"professor_id" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"is_booked" boolean DEFAULT false NOT NULL,
	"application_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"ip" text NOT NULL,
	"ok" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posting_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"posting_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"structured_fields" text DEFAULT '{}' NOT NULL,
	"edited_by_user_id" text NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "postings" (
	"id" text PRIMARY KEY NOT NULL,
	"poster_type" text DEFAULT 'PROFESSOR' NOT NULL,
	"professor_id" text,
	"unit_id" text,
	"student_poster_id" text,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"structured_fields" text DEFAULT '{}' NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"closed_reason" text DEFAULT '' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professor_intake_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"professor_id" text NOT NULL,
	"type" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"condition_text" text DEFAULT '' NOT NULL,
	"quota_note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professor_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"display_name" text NOT NULL,
	"title" text DEFAULT '教授' NOT NULL,
	"department_id" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"research_page" text DEFAULT '' NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"verify_status" text DEFAULT 'SEED' NOT NULL,
	CONSTRAINT "professor_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "professor_relinquishments" (
	"id" text PRIMARY KEY NOT NULL,
	"professor_id" text NOT NULL,
	"initiated_by_id" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"relinquish_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professor_specialties" (
	"professor_id" text NOT NULL,
	"subfield_id" text NOT NULL,
	CONSTRAINT "professor_specialties_professor_id_subfield_id_pk" PRIMARY KEY("professor_id","subfield_id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"actor_id" text,
	"ip" text DEFAULT '' NOT NULL,
	"detail" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"step_up_at" timestamp with time zone,
	"user_agent" text DEFAULT '' NOT NULL,
	"created_ip" text DEFAULT '' NOT NULL,
	"provider" text DEFAULT 'mock-email-code' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "student_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"student_id" text NOT NULL,
	"professor_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subfields" (
	"id" text PRIMARY KEY NOT NULL,
	"field_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"contact_email" text NOT NULL,
	"extension" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"value_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_hides" (
	"id" text PRIMARY KEY NOT NULL,
	"hider_user_id" text NOT NULL,
	"hidden_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"real_name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'STUDENT_BACHELOR' NOT NULL,
	"sub_roles" text DEFAULT '[]' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"degree_level" text,
	"degree_level_verified_at" timestamp with time zone,
	"totp_secret_enc" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"lifecycle_buffer_ends_at" timestamp with time zone,
	"lifecycle_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "account_lineage" ADD CONSTRAINT "account_lineage_from_account_id_users_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_lineage" ADD CONSTRAINT "account_lineage_to_account_id_users_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_logs" ADD CONSTRAINT "agreement_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_applicant_id_users_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_disclosures" ADD CONSTRAINT "contact_disclosures_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_disclosures" ADD CONSTRAINT "contact_disclosures_discloser_id_users_id_fk" FOREIGN KEY ("discloser_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_export_tokens" ADD CONSTRAINT "data_export_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_college_id_colleges_id_fk" FOREIGN KEY ("college_id") REFERENCES "public"."colleges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dual_approvals" ADD CONSTRAINT "dual_approvals_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dual_approvals" ADD CONSTRAINT "dual_approvals_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_download_tokens" ADD CONSTRAINT "file_download_tokens_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_posts" ADD CONSTRAINT "group_posts_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_posts" ADD CONSTRAINT "group_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ics_tokens" ADD CONSTRAINT "ics_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_slots" ADD CONSTRAINT "interview_slots_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_slots" ADD CONSTRAINT "interview_slots_professor_id_professor_profiles_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professor_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_slots" ADD CONSTRAINT "interview_slots_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posting_versions" ADD CONSTRAINT "posting_versions_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posting_versions" ADD CONSTRAINT "posting_versions_edited_by_user_id_users_id_fk" FOREIGN KEY ("edited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_professor_id_professor_profiles_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_unit_id_unit_profiles_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_student_poster_id_users_id_fk" FOREIGN KEY ("student_poster_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_intake_settings" ADD CONSTRAINT "professor_intake_settings_professor_id_professor_profiles_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_profiles" ADD CONSTRAINT "professor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_profiles" ADD CONSTRAINT "professor_profiles_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_relinquishments" ADD CONSTRAINT "professor_relinquishments_professor_id_professor_profiles_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professor_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_relinquishments" ADD CONSTRAINT "professor_relinquishments_initiated_by_id_users_id_fk" FOREIGN KEY ("initiated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_specialties" ADD CONSTRAINT "professor_specialties_professor_id_professor_profiles_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_specialties" ADD CONSTRAINT "professor_specialties_subfield_id_subfields_id_fk" FOREIGN KEY ("subfield_id") REFERENCES "public"."subfields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_requests" ADD CONSTRAINT "student_requests_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_requests" ADD CONSTRAINT "student_requests_professor_id_professor_profiles_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subfields" ADD CONSTRAINT "subfields_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_profiles" ADD CONSTRAINT "unit_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_contacts" ADD CONSTRAINT "user_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hides" ADD CONSTRAINT "user_hides_hider_user_id_users_id_fk" FOREIGN KEY ("hider_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hides" ADD CONSTRAINT "user_hides_hidden_user_id_users_id_fk" FOREIGN KEY ("hidden_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ae_actor_time" ON "access_events" USING btree ("actor_key","created_at");--> statement-breakpoint
CREATE INDEX "al_from" ON "account_lineage" USING btree ("from_account_id");--> statement-breakpoint
CREATE INDEX "al_to" ON "account_lineage" USING btree ("to_account_id");--> statement-breakpoint
CREATE INDEX "ag_user_doc" ON "agreement_logs" USING btree ("user_id","doc_type");--> statement-breakpoint
CREATE UNIQUE INDEX "a_posting_applicant" ON "applications" USING btree ("posting_id","applicant_id");--> statement-breakpoint
CREATE INDEX "a_applicant" ON "applications" USING btree ("applicant_id","created_at");--> statement-breakpoint
CREATE INDEX "att_owner" ON "attachments" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "att_app" ON "attachments" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "att_group" ON "attachments" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "al_time" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cd_conv" ON "contact_disclosures" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "cm_user" ON "conversation_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conv_context" ON "conversations" USING btree ("context_type","context_id");--> statement-breakpoint
CREATE INDEX "det_user" ON "data_export_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "d_college_slug" ON "departments" USING btree ("college_id","slug");--> statement-breakpoint
CREATE INDEX "d_college" ON "departments" USING btree ("college_id");--> statement-breakpoint
CREATE INDEX "da_status" ON "dual_approvals" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ev_email_code" ON "email_verifications" USING btree ("email","code");--> statement-breakpoint
CREATE INDEX "f_dept" ON "fields" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "fdt_att" ON "file_download_tokens" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "gm_user" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gp_group" ON "group_posts" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "hc_actor" ON "human_checks" USING btree ("actor_key");--> statement-breakpoint
CREATE INDEX "ics_user" ON "ics_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "is_posting" ON "interview_slots" USING btree ("posting_id","is_booked");--> statement-breakpoint
CREATE INDEX "la_email_time" ON "login_attempts" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "la_ip_time" ON "login_attempts" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "msg_conv_time" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "n_user" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "pv_posting" ON "posting_versions" USING btree ("posting_id","version_number");--> statement-breakpoint
CREATE INDEX "po_open_cat" ON "postings" USING btree ("is_open","category");--> statement-breakpoint
CREATE INDEX "po_prof" ON "postings" USING btree ("professor_id");--> statement-breakpoint
CREATE INDEX "po_unit" ON "postings" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "po_student" ON "postings" USING btree ("student_poster_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pis_prof_type" ON "professor_intake_settings" USING btree ("professor_id","type");--> statement-breakpoint
CREATE INDEX "p_dept" ON "professor_profiles" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "pr_status" ON "professor_relinquishments" USING btree ("status","relinquish_at");--> statement-breakpoint
CREATE INDEX "ps_sub" ON "professor_specialties" USING btree ("subfield_id");--> statement-breakpoint
CREATE INDEX "r_status" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "se_type_time" ON "security_events" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "s_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sr_prof_status" ON "student_requests" USING btree ("professor_id","status");--> statement-breakpoint
CREATE INDEX "sr_student" ON "student_requests" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "sf_field" ON "subfields" USING btree ("field_id");--> statement-breakpoint
CREATE INDEX "uc_user" ON "user_contacts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uh_pair" ON "user_hides" USING btree ("hider_user_id","hidden_user_id");--> statement-breakpoint
CREATE INDEX "uh_hider" ON "user_hides" USING btree ("hider_user_id");--> statement-breakpoint
CREATE INDEX "uh_hidden" ON "user_hides" USING btree ("hidden_user_id");