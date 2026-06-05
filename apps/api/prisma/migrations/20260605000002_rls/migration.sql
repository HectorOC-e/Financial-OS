-- Row-Level Security for multi-tenant isolation (tasks.md T016 / R3 / Principle IX).
--
-- Every tenant-scoped table is keyed on the per-request `app.tenant_id` session GUC, set by the
-- TenancyModule inside each transaction (T017). `current_setting('app.tenant_id', true)` returns NULL
-- when unset, so an un-scoped connection sees NO rows (default-deny). FORCE ROW LEVEL SECURITY ensures
-- the policy applies even when the application connects as the table owner.
--
-- NOTE: the application database role MUST NOT be a superuser (superusers bypass RLS entirely).

-- Tenant-scoped tables: visible only when row.tenantId = app.tenant_id.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'User', 'PersonalProfile', 'SharedProfile', 'Membership', 'Account',
    'ContributionPlan', 'ContributionAllocation', 'ContributionPeriod', 'ContributionRecord',
    'SharedGoal', 'SharedDebt', 'DebtResponsibility', 'SharedInvestment', 'SharedBudget',
    'AuditEntry', 'OutboxEvent'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true));',
      t
    );
  END LOOP;
END $$;

-- The Tenant table itself is keyed on its own id.
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self_isolation ON "Tenant"
  USING ("id" = current_setting('app.tenant_id', true))
  WITH CHECK ("id" = current_setting('app.tenant_id', true));
