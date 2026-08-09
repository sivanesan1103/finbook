// Regression test for MOB-003: tokens must live in secure storage, and an
// existing install that logged in before this fix (tokens still in
// SharedPreferences) must migrate on next launch instead of being logged
// out. No device/emulator needed — mocks the flutter_secure_storage
// platform channel with an in-memory map so this runs on the Dart VM.
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:finbook/core/api_client.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel =
      MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  late Map<String, String> secureStore;

  setUp(() {
    secureStore = {};
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      switch (call.method) {
        case 'read':
          return secureStore[call.arguments['key']];
        case 'write':
          secureStore[call.arguments['key']] = call.arguments['value'];
          return null;
        case 'delete':
          secureStore.remove(call.arguments['key']);
          return null;
        case 'containsKey':
          return secureStore.containsKey(call.arguments['key']);
        case 'readAll':
          return secureStore;
        case 'deleteAll':
          secureStore.clear();
          return null;
      }
      return null;
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('fresh session: saveTokens writes to secure storage, not prefs', () async {
    SharedPreferences.setMockInitialValues({});
    final api = ApiClient.instance;

    await api.saveTokens('access1', 'refresh1');

    expect(secureStore['bk_access'], 'access1');
    expect(secureStore['bk_refresh'], 'refresh1');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('bk_access'), isNull,
        reason: 'tokens must not be written to plain SharedPreferences');

    await api.clearTokens();
    expect(api.hasSession, isFalse);
    expect(secureStore.containsKey('bk_access'), isFalse);
  });

  test('legacy install: loadTokens migrates SharedPreferences tokens into secure storage',
      () async {
    // Simulates a user who logged in before this fix — tokens are sitting
    // in plain SharedPreferences, secure storage is empty.
    SharedPreferences.setMockInitialValues({
      'bk_access': 'legacy_access_token',
      'bk_refresh': 'legacy_refresh_token',
    });
    secureStore.clear();
    final api = ApiClient.instance;

    await api.loadTokens();

    // Session must survive the migration — this is the whole point: no
    // silent logout on upgrade.
    expect(api.hasSession, isTrue);
    // The legacy value must now live in secure storage...
    expect(secureStore['bk_access'], 'legacy_access_token');
    expect(secureStore['bk_refresh'], 'legacy_refresh_token');
    // ...and be gone from the unencrypted SharedPreferences file.
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('bk_access'), isNull);
    expect(prefs.getString('bk_refresh'), isNull);

    await api.clearTokens();
  });

  test('already-migrated install: loadTokens reads straight from secure storage',
      () async {
    SharedPreferences.setMockInitialValues({});
    secureStore = {'bk_access': 'secure_access', 'bk_refresh': 'secure_refresh'};
    final api = ApiClient.instance;

    await api.loadTokens();

    expect(api.hasSession, isTrue);
    await api.clearTokens();
  });
}
