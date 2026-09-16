CREATE TABLE `centers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`city` text NOT NULL,
	`address` text NOT NULL,
	`phone` text NOT NULL,
	`emergency_phone` text NOT NULL,
	`latitude` text,
	`longitude` text,
	`pci_available` integer DEFAULT false NOT NULL,
	`accepting_patients` integer DEFAULT false NOT NULL,
	`manager_user_id` text NOT NULL,
	`manager_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `center_handovers` (
	`id` text PRIMARY KEY NOT NULL,
	`center_id` text NOT NULL,
	`clinician_user_id` text NOT NULL,
	`clinician_email` text NOT NULL,
	`patient_json` text NOT NULL,
	`ecg_object_key` text NOT NULL,
	`ecg_content_type` text NOT NULL,
	`ecg_bytes` integer NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`acknowledged_at` text,
	FOREIGN KEY (`center_id`) REFERENCES `centers`(`id`) ON UPDATE no action ON DELETE no action
);
