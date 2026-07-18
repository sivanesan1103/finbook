import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:finbook/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('login via domain (release parity)', (tester) async {
    app.main();
    await tester.pumpAndSettle(const Duration(seconds: 3));
    final email = find.widgetWithText(TextField, 'Email address');
    final password = find.widgetWithText(TextField, 'Password');
    await tester.enterText(email, 'owner@finbook.dev');
    await tester.enterText(password, 'demo123');
    await tester.pumpAndSettle();
    final signIn = find.widgetWithText(ElevatedButton, 'SIGN IN');
    await tester.ensureVisible(signIn);
    await tester.pumpAndSettle();
    await tester.tap(signIn, warnIfMissed: false);
    await tester.pumpAndSettle(const Duration(seconds: 12));
    debugPrint('RESULT still_login=${tester.any(find.text('FinBook'))} parties=${tester.any(find.text('Parties'))}');
  });
}
