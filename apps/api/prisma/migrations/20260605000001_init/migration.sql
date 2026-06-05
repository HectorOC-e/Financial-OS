-- FinancialOS initial schema (tasks.md T015). Schema only — NO business logic (Architectural Constraints).
-- Mirrors prisma/schema.prisma. Authoritative regeneration: `prisma migrate dev --name init` once a
-- database is reachable; this hand-authored baseline lets the migration history exist before then.

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'CONTRIBUTOR', 'VIEWER');
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'DECLINED', 'EXPIRED', 'LEFT');
CREATE TYPE "ProfileStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "ProfileType" AS ENUM ('PERSONAL', 'SHARED');
CREATE TYPE "AccountType" AS ENUM ('WALLET', 'ACCOUNT', 'INVESTMENT', 'EMERGENCY_FUND', 'CREDIT_CARD', 'DEBT');
CREATE TYPE "PeriodLength" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "SharedDebtKind" AS ENUM ('DEBT', 'CREDIT_CARD');
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "authSubject" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PersonalProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonalProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SharedProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerMembershipId" TEXT,
    "baseCurrency" TEXT NOT NULL,
    "periodLength" "PeriodLength" NOT NULL DEFAULT 'MONTHLY',
    "status" "ProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sharedProfileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'VIEWER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "pendingOwnerNominee" BOOLEAN NOT NULL DEFAULT false,
    "declaredIncomeCents" BIGINT NOT NULL DEFAULT 0,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitationExpiresAt" TIMESTAMP(3) NOT NULL,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileType" "ProfileType" NOT NULL,
    "profileId" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "name" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContributionPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sharedProfileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFromPeriodId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContributionPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContributionAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contributionPlanId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "percentageBp" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ContributionAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContributionPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sharedProfileId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "planVersionSnapshot" INTEGER NOT NULL,
    "incomeSnapshot" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContributionPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContributionRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sharedProfileId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceAccountId" TEXT,
    CONSTRAINT "ContributionRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SharedGoal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sharedProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" BIGINT NOT NULL,
    "fundedAmount" BIGINT NOT NULL DEFAULT 0,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedGoal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SharedDebt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sharedProfileId" TEXT NOT NULL,
    "kind" "SharedDebtKind" NOT NULL DEFAULT 'DEBT',
    "name" TEXT NOT NULL,
    "outstandingBalance" BIGINT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedDebt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DebtResponsibility" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sharedDebtId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "percentageBp" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DebtResponsibility_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SharedInvestment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sharedProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentValue" BIGINT NOT NULL,
    "valueAsOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedInvestment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SharedBudget" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sharedProfileId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "limit" BIGINT NOT NULL,
    "spent" BIGINT NOT NULL DEFAULT 0,
    "periodId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedBudget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sharedProfileId" TEXT,
    "actorMembershipId" TEXT,
    "action" TEXT NOT NULL,
    "beforeValue" JSONB,
    "afterValue" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
CREATE UNIQUE INDEX "User_tenantId_authSubject_key" ON "User"("tenantId", "authSubject");
CREATE INDEX "PersonalProfile_tenantId_idx" ON "PersonalProfile"("tenantId");
CREATE UNIQUE INDEX "PersonalProfile_userId_key" ON "PersonalProfile"("userId");
CREATE INDEX "SharedProfile_tenantId_idx" ON "SharedProfile"("tenantId");
CREATE INDEX "Membership_tenantId_idx" ON "Membership"("tenantId");
CREATE INDEX "Membership_status_invitationExpiresAt_idx" ON "Membership"("status", "invitationExpiresAt");
CREATE UNIQUE INDEX "Membership_sharedProfileId_userId_key" ON "Membership"("sharedProfileId", "userId");
CREATE INDEX "Account_tenantId_idx" ON "Account"("tenantId");
CREATE INDEX "Account_profileType_profileId_idx" ON "Account"("profileType", "profileId");
CREATE INDEX "ContributionPlan_tenantId_idx" ON "ContributionPlan"("tenantId");
CREATE UNIQUE INDEX "ContributionPlan_sharedProfileId_version_key" ON "ContributionPlan"("sharedProfileId", "version");
CREATE INDEX "ContributionAllocation_tenantId_idx" ON "ContributionAllocation"("tenantId");
CREATE UNIQUE INDEX "ContributionAllocation_contributionPlanId_membershipId_key" ON "ContributionAllocation"("contributionPlanId", "membershipId");
CREATE INDEX "ContributionPeriod_tenantId_idx" ON "ContributionPeriod"("tenantId");
CREATE INDEX "ContributionPeriod_status_endDate_idx" ON "ContributionPeriod"("status", "endDate");
CREATE INDEX "ContributionRecord_tenantId_idx" ON "ContributionRecord"("tenantId");
CREATE INDEX "ContributionRecord_periodId_idx" ON "ContributionRecord"("periodId");
CREATE INDEX "SharedGoal_tenantId_idx" ON "SharedGoal"("tenantId");
CREATE INDEX "SharedDebt_tenantId_idx" ON "SharedDebt"("tenantId");
CREATE INDEX "DebtResponsibility_tenantId_idx" ON "DebtResponsibility"("tenantId");
CREATE UNIQUE INDEX "DebtResponsibility_sharedDebtId_membershipId_key" ON "DebtResponsibility"("sharedDebtId", "membershipId");
CREATE INDEX "SharedInvestment_tenantId_idx" ON "SharedInvestment"("tenantId");
CREATE INDEX "SharedBudget_tenantId_idx" ON "SharedBudget"("tenantId");
CREATE UNIQUE INDEX "SharedBudget_sharedProfileId_periodId_category_key" ON "SharedBudget"("sharedProfileId", "periodId", "category");
CREATE INDEX "AuditEntry_tenantId_idx" ON "AuditEntry"("tenantId");
CREATE INDEX "AuditEntry_sharedProfileId_idx" ON "AuditEntry"("sharedProfileId");
CREATE INDEX "OutboxEvent_tenantId_idx" ON "OutboxEvent"("tenantId");
CREATE INDEX "OutboxEvent_dispatchedAt_idx" ON "OutboxEvent"("dispatchedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonalProfile" ADD CONSTRAINT "PersonalProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonalProfile" ADD CONSTRAINT "PersonalProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SharedProfile" ADD CONSTRAINT "SharedProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_sharedProfileId_fkey" FOREIGN KEY ("sharedProfileId") REFERENCES "SharedProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContributionPlan" ADD CONSTRAINT "ContributionPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContributionPlan" ADD CONSTRAINT "ContributionPlan_sharedProfileId_fkey" FOREIGN KEY ("sharedProfileId") REFERENCES "SharedProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContributionAllocation" ADD CONSTRAINT "ContributionAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContributionAllocation" ADD CONSTRAINT "ContributionAllocation_contributionPlanId_fkey" FOREIGN KEY ("contributionPlanId") REFERENCES "ContributionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContributionAllocation" ADD CONSTRAINT "ContributionAllocation_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContributionPeriod" ADD CONSTRAINT "ContributionPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContributionPeriod" ADD CONSTRAINT "ContributionPeriod_sharedProfileId_fkey" FOREIGN KEY ("sharedProfileId") REFERENCES "SharedProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContributionRecord" ADD CONSTRAINT "ContributionRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContributionRecord" ADD CONSTRAINT "ContributionRecord_sharedProfileId_fkey" FOREIGN KEY ("sharedProfileId") REFERENCES "SharedProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContributionRecord" ADD CONSTRAINT "ContributionRecord_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ContributionPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContributionRecord" ADD CONSTRAINT "ContributionRecord_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SharedGoal" ADD CONSTRAINT "SharedGoal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SharedGoal" ADD CONSTRAINT "SharedGoal_sharedProfileId_fkey" FOREIGN KEY ("sharedProfileId") REFERENCES "SharedProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SharedDebt" ADD CONSTRAINT "SharedDebt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SharedDebt" ADD CONSTRAINT "SharedDebt_sharedProfileId_fkey" FOREIGN KEY ("sharedProfileId") REFERENCES "SharedProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DebtResponsibility" ADD CONSTRAINT "DebtResponsibility_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DebtResponsibility" ADD CONSTRAINT "DebtResponsibility_sharedDebtId_fkey" FOREIGN KEY ("sharedDebtId") REFERENCES "SharedDebt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DebtResponsibility" ADD CONSTRAINT "DebtResponsibility_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SharedInvestment" ADD CONSTRAINT "SharedInvestment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SharedInvestment" ADD CONSTRAINT "SharedInvestment_sharedProfileId_fkey" FOREIGN KEY ("sharedProfileId") REFERENCES "SharedProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SharedBudget" ADD CONSTRAINT "SharedBudget_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SharedBudget" ADD CONSTRAINT "SharedBudget_sharedProfileId_fkey" FOREIGN KEY ("sharedProfileId") REFERENCES "SharedProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_sharedProfileId_fkey" FOREIGN KEY ("sharedProfileId") REFERENCES "SharedProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
