import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// FinancialOS mobile client entrypoint. Presentation only — all financial logic and
/// validation live server-side (constitution Principle VII). Feature modules
/// (profiles, contributions, shared_elements, accounts, coaching) are added in Phase 2+.
void main() {
  runApp(const ProviderScope(child: FinancialOsApp()));
}

class FinancialOsApp extends StatelessWidget {
  const FinancialOsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FinancialOS',
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.indigo),
      home: const Scaffold(
        body: Center(child: Text('FinancialOS')),
      ),
    );
  }
}
