/// GraphQL documents for US2/US3 contributions (T055/T067). Presentation only — the cap, period
/// snapshots, and standings are computed server-side (Principle VII). Money is the BigInt-scalar
/// string; never compute money on the client.
library;

const String remainingAllocationQuery = r'''
  query RemainingAllocation { remainingAllocationPercentageBp }
''';

const String contributionDashboardQuery = r'''
  query ContributionDashboard($id: UUID!) {
    sharedProfile(id: $id) {
      id
      name
      baseCurrency
      status
      poolTotal { amountCents currency }
      currentPeriod { id startDate endDate status }
      members {
        id
        role
        status
        allocationPercentageBp
        declaredIncome { amountCents currency }
        standing { expected { amountCents } actual { amountCents } variance { amountCents } state }
        user { id displayName }
      }
    }
  }
''';

const String setDeclaredIncomeMutation = r'''
  mutation SetDeclaredIncome($input: SetDeclaredIncomeInput!) {
    setDeclaredIncome(input: $input) { id declaredIncome { amountCents currency } }
  }
''';

const String setAllocationMutation = r'''
  mutation SetAllocation($input: SetAllocationInput!) {
    setAllocation(input: $input) {
      id version
      allocations { id percentageBp membership { id } }
    }
  }
''';

const String recordContributionMutation = r'''
  mutation RecordContribution($input: RecordContributionInput!) {
    recordContribution(input: $input) { id amount { amountCents currency } recordedAt }
  }
''';

const String poolTotalChangedSubscription = r'''
  subscription PoolTotalChanged($sharedProfileId: UUID!) {
    poolTotalChanged(sharedProfileId: $sharedProfileId) { amountCents currency }
  }
''';

const String standingChangedSubscription = r'''
  subscription StandingChanged($sharedProfileId: UUID!) {
    contributionStandingChanged(sharedProfileId: $sharedProfileId) {
      expected { amountCents } actual { amountCents } variance { amountCents } state
    }
  }
''';
