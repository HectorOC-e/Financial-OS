/**
 * US5 — overpayment rejected, balance unchanged (T087 / FR-020b). Requires a live RLS-enabled
 * PostgreSQL.
 */
import { DomainErrorCode } from '../../src/common/errors';
import { SharedElementsTestKit } from './helpers/shared-elements-test-kit';

describe('US5 overpayment — payment may not exceed outstanding (FR-020b)', () => {
  const kit = new SharedElementsTestKit();

  beforeAll(() => kit.setup());
  afterAll(() => kit.teardown());

  it('rejects a payment greater than the outstanding balance and leaves it unchanged', async () => {
    const a = await kit.profileWithOwner({ currency: 'USD' });
    const debt = kit.unwrapOk(await kit.elements.createSharedDebt(a.owner, a.profile.id, 'DEBT', 'Card', 100_00n));

    // A valid partial payment reduces the balance.
    const paid = kit.unwrapOk(await kit.elements.paySharedDebt(a.owner, debt.id, 40_00n, debt.version));
    expect(paid.outstandingBalance).toBe(60_00n);

    // Overpayment is rejected and the balance is untouched.
    const over = await kit.elements.paySharedDebt(a.owner, debt.id, 60_01n, paid.version);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.code).toBe(DomainErrorCode.OVERPAYMENT);

    const reloaded = await kit.seRead.debtById(a.owner, debt.id);
    expect(reloaded.outstandingBalance.amountCents).toBe(60_00n);
  });
});
