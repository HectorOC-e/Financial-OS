/// GraphQL documents for US6 personal accounts (T098). Presentation only — accounts are isolated and
/// only the contributed amount enters a shared pool (server-enforced, FR-010).
library;

const String myAccountsQuery = r'''
  query MyAccounts {
    me {
      id
      personalProfile {
        id
        accounts { id type name currency balance { amountCents currency } }
      }
    }
  }
''';

const String createPersonalAccountMutation = r'''
  mutation CreatePersonalAccount($input: CreatePersonalAccountInput!) {
    createPersonalAccount(input: $input) { id name balance { amountCents currency } }
  }
''';

const String contributeFromAccountMutation = r'''
  mutation ContributeFromAccount($input: ContributeFromAccountInput!) {
    contributeFromAccount(input: $input) { id balance { amountCents currency } }
  }
''';
