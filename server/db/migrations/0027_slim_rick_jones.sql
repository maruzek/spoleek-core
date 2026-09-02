DROP INDEX "group_workspace_links_group_target_idx";--> statement-breakpoint
DROP INDEX "group_workspace_links_org_group_idx";--> statement-breakpoint
DROP INDEX "group_workspace_links_org_target_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "group_workspace_links_group_idx" ON "group_workspace_links" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_workspace_links_org_target_idx" ON "group_workspace_links" USING btree ("org_id","workspace_group_id");