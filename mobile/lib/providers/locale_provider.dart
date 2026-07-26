import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/api_client.dart';

/// App language selection ('en' / 'ta'), persisted locally and, once
/// logged in, on the user's profile — the backend uses that to compose
/// reminder/WhatsApp/SMS text in the right language, since those go out
/// server-side and have no other way to know which language the sender's
/// app is set to.
class LocaleProvider extends ChangeNotifier {
  String _code = 'en';
  String get code => _code;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _code = prefs.getString('bk_lang') ?? 'en';
    notifyListeners();
  }

  Future<void> setLang(String code) async {
    _code = code;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('bk_lang', code);
    if (ApiClient.instance.hasSession) {
      // Best-effort — a logged-out toggle (e.g. on the sign-in screen) or a
      // flaky connection shouldn't block switching the UI language locally.
      try {
        await ApiClient.instance.patch('/auth/me', {'language': code});
      } catch (_) {}
    }
  }
}
