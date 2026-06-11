/**
 * US6 — personal account invisible to other members and excluded from the pool (T097 / FR-004/FR-010/
 * FR-010a). Contributing moves only the contributed amount into the pool, not the account balance.
 * Requires a live RLS-enabled PostgreSQL.
 */
import { AccountsTestKit } from './helpers/accounts-test-kit';

describe('US6 personal accounts — isolation + pool exclusion (FR-010)', () => {
  const kit = new AccountsTestKit();

  beforeAll(() => kit.setup());
  afterAll(() => kit.teardown());

  it('keeps a personal account private and only the contributed amount enters the pool', async () => {
    const a = await kit.profileWithOwner({ currency: 'USD' });
    const other = await kit.addMember(a.owner, a.profile.id, 'CONTRIBUTOR');

    // Owner opens a personal wallet with $1,000.00.
    const account = kit.unwrapOk(
      await kit.accountsSvc.createPersonalAccount(a.owner, { type: 'WALLET', name: 'Wallet', currency: 'USD', openingBalanceCents: 1000_00n }),
    );
    const personalProfileId = account.profileId;

    // Visible to the owner, invisible to any other member (FR-004).
    expect((await kit.accountsSvc.accountsForOwnedProfile(a.owner, personalProfileId)).map((x) => x.id)).toContain(account.id);
    expect(await kit.accountsSvc.accountsForOwnedProfile(other.user, personalProfileId)).toEqual([]);

    // Owner allocates and contributes $100.00 FROM the account.
    kit.unwrapOk(await kit.contributions.setDeclaredIncome(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, amountCents: 100_00n }));
    kit.unwrapOk(await kit.contributions.setAllocation(a.owner, { sharedProfileId: a.profile.id, membershipId: a.ownerMembershipId, percentageBp: 5000 }));
    const result = kit.unwrapOk(
      await kit.accountsSvc.contributeFromAccount(a.owner, {
        accountId: account.id,
        sharedProfileId: a.profile.id,
        membershipId: a.ownerMembershipId,
        amountCents: 100_00n,
      }),
    );

    // Only $100.00 left the account; the rest stays personal.
    expect(result.account.balance).toBe(900_00n);

    // The pool reflects exactly the $100.00 contribution — not the $900.00 still in the account.
    const poolActual = await kit.tenancy.withTenant(kit.tenantId, async (tx) => {
      const period = (await kit.repo.openPeriod(tx, a.profile.id))!;
      const byMember = await kit.repo.actualByMember(tx, period.id);
      return [...byMember.values()].reduce((s, v) => s + v, 0n);
    });
    expect(poolActual).toBe(100_00n);
  });
});
