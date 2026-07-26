import 'package:url_launcher/url_launcher.dart';

/// Prepares a message + the customer's phone number and hands off to
/// WhatsApp or SMS via their respective deep links — the OS opens the
/// chosen app with the chat and text already filled in, and the user taps
/// send themselves. No messaging API, no backend dispatch.

/// Digits-only phone number with country code, defaulting to India (91).
/// Numbers can reach here with a leading trunk "0" (11 digits) if they were
/// typed/edited without going through contact-import cleaning — left as-is,
/// that malformed number is what makes wa.me fall back to the "Send to"
/// chat picker instead of opening the exact chat.
String _toIntlPhone(String phone) {
  var digits = phone.replaceAll(RegExp(r'[^\d]'), '');
  if (digits.startsWith('91') && digits.length == 12) return digits;
  if (digits.startsWith('0') && digits.length == 11) digits = digits.substring(1);
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

/// Opens the phone's own dialer pre-filled with the party's number — a
/// plain `tel:` link, same as tapping a phone number in Contacts. The user
/// still has to tap the actual call button themselves.
Future<bool> callParty(String phone) {
  final uri = Uri(scheme: 'tel', path: phone.trim());
  return launchUrl(uri);
}
