CREATE TABLE `deleted_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media_deletion_jobs` (
	`key` text PRIMARY KEY NOT NULL
);

--> statement-breakpoint
CREATE TRIGGER profiles_deleted_insert BEFORE INSERT ON profiles WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.id) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER profiles_deleted_update BEFORE UPDATE ON profiles WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.id) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER entries_deleted_insert BEFORE INSERT ON entries WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.owner) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER entries_deleted_update BEFORE UPDATE ON entries WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.owner) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER avatars_deleted_insert BEFORE INSERT ON avatars WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.owner) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER avatars_deleted_update BEFORE UPDATE ON avatars WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.owner) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER sessions_deleted_insert BEFORE INSERT ON sessions WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER sessions_deleted_update BEFORE UPDATE ON sessions WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER identities_deleted_insert BEFORE INSERT ON identities WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER identities_deleted_update BEFORE UPDATE ON identities WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER votes_deleted_insert BEFORE INSERT ON votes WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.voter) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER votes_deleted_update BEFORE UPDATE ON votes WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.voter) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER motors_deleted_insert BEFORE INSERT ON motors WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.voter) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER motors_deleted_update BEFORE UPDATE ON motors WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.voter) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER comments_deleted_insert BEFORE INSERT ON comments WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.author) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER comments_deleted_update BEFORE UPDATE ON comments WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.author) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER commerce_orders_deleted_insert BEFORE INSERT ON commerce_orders WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.owner) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER commerce_orders_deleted_update BEFORE UPDATE ON commerce_orders WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.owner) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER commerce_entitlements_deleted_insert BEFORE INSERT ON commerce_entitlements WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.owner) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER commerce_entitlements_deleted_update BEFORE UPDATE ON commerce_entitlements WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.owner) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER partner_leads_deleted_insert BEFORE INSERT ON partner_leads WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.owner) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER partner_leads_deleted_update BEFORE UPDATE ON partner_leads WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.owner) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER organizers_deleted_insert BEFORE INSERT ON organizers WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER organizers_deleted_update BEFORE UPDATE ON organizers WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER rounds_deleted_insert BEFORE INSERT ON rounds WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.owner) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;

--> statement-breakpoint
CREATE TRIGGER rounds_deleted_update BEFORE UPDATE ON rounds WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE user_id=NEW.owner) BEGIN SELECT RAISE(ABORT,'account_deleted'); END;
