/// GraphQL documents for US5 shared elements (T090). Presentation only — money integrity, the 100%
/// responsibility rule, overpayment rejection, and optimistic concurrency are all server-side.
library;

const String sharedElementsQuery = r'''
  query SharedElements($id: UUID!) {
    sharedProfile(id: $id) {
      id
      baseCurrency
      status
      sharedGoals { id name version targetAmount { amountCents currency } fundedAmount { amountCents currency } }
      sharedDebts {
        id kind name version outstandingBalance { amountCents currency }
        responsibilities { id percentageBp membership { id user { id displayName } } }
      }
      sharedInvestments { id name version valueAsOf currentValue { amountCents currency } }
      sharedBudgets {
        id category version periodId
        limit { amountCents currency } spent { amountCents currency } remaining { amountCents currency }
      }
    }
  }
''';

const String createSharedGoalMutation = r'''
  mutation CreateSharedGoal($sharedProfileId: UUID!, $name: String!, $targetAmountCents: BigInt!) {
    createSharedGoal(sharedProfileId: $sharedProfileId, name: $name, targetAmountCents: $targetAmountCents) { id }
  }
''';

const String fundGoalMutation = r'''
  mutation FundGoal($input: FundGoalInput!) {
    fundGoal(input: $input) { id version fundedAmount { amountCents } }
  }
''';

const String createSharedDebtMutation = r'''
  mutation CreateSharedDebt($sharedProfileId: UUID!, $kind: SharedDebtKind!, $name: String!, $outstandingBalanceCents: BigInt!) {
    createSharedDebt(sharedProfileId: $sharedProfileId, kind: $kind, name: $name, outstandingBalanceCents: $outstandingBalanceCents) { id }
  }
''';

const String paySharedDebtMutation = r'''
  mutation PaySharedDebt($input: PaySharedDebtInput!) {
    paySharedDebt(input: $input) { id version outstandingBalance { amountCents } }
  }
''';

const String createSharedBudgetMutation = r'''
  mutation CreateSharedBudget($sharedProfileId: UUID!, $category: String!, $limitCents: BigInt!) {
    createSharedBudget(sharedProfileId: $sharedProfileId, category: $category, limitCents: $limitCents) { id }
  }
''';

const String recordBudgetSpendMutation = r'''
  mutation RecordBudgetSpend($budgetId: UUID!, $amountCents: BigInt!, $expectedVersion: Int!) {
    recordBudgetSpend(budgetId: $budgetId, amountCents: $amountCents, expectedVersion: $expectedVersion) {
      id version spent { amountCents } remaining { amountCents }
    }
  }
''';
