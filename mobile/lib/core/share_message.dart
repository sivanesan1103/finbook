import 'package:url_launcher/url_launcher.dart';

/// Prepares a message + the customer's phone number and hands off to
/// WhatsApp or SMS via their respective deep links — the OS opens the
/// chosen app with the chat and text already filled in, and the user taps
/// send themselves. No messaging API, no backend dispatch.

/// Digits-only phone number with country code, defaulting to India (91).
String _toIntlPhone(String phone) {
  final digits = phone.replaceAll(RegExp(r'[^\d]'), '');
  return digits.length == 10 ? '91$digits' : digits;
}

Future<bool> shareViaWhatsApp(String phone, String text) {
  final uri = Uri.parse('https://wa.me/${_toIntlPhone(phone)}?text=${Uri.encodeComponent(text)}');
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}

Future<bool> shareViaSms(String phone, String text) {
  final uri = Uri(scheme: 'sms', path: _toIntlPhone(phone), queryParameters: {'body': text});
  return launchUrl(uri);
}
