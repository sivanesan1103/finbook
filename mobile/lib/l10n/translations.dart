import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';
import '../providers/locale_provider.dart';
import 'en.dart';
import 'ta.dart';

const Map<String, Map<String, String>> translations = {'en': en, 'ta': ta};

/// Translation keys for payment modes — use with `context.tr(modeLabelKeys[mode]!)`.
const Map<String, String> modeLabelKeys = {
  'CASH': 'common.modeCash',
  'ONLINE': 'common.modeOnline',
  'UPI': 'common.modeUpi',
  'BANK': 'common.modeBank',
  'CHEQUE': 'common.modeCheque',
};

/// Localized relative-time string, e.g. "5 minutes ago".
String trTimeAgo(BuildContext context, DateTime d) {
  final diff = DateTime.now().difference(d.toLocal());
  if (diff.inSeconds < 60) return context.tr('common.secondsAgo', {'count': diff.inSeconds});
  if (diff.inMinutes < 60) return context.tr('common.minutesAgo', {'count': diff.inMinutes});
  if (diff.inHours < 24) return context.tr('common.hoursAgo', {'count': diff.inHours});
  return context.tr('common.daysAgo', {'count': diff.inDays});
}

/// Translation keys for invoice statuses — use with `context.tr(statusLabelKeys[status]!)`.
const Map<String, String> statusLabelKeys = {
  'PAID': 'common.statusPaid',
  'PARTIAL': 'common.statusPartial',
  'UNPAID': 'common.statusUnpaid',
  'DRAFT': 'common.statusDraft',
  'CANCELLED': 'common.statusCancelled',
};

String interpolate(String s, Map<String, dynamic>? vars) {
  if (vars == null) return s;
  var out = s;
  vars.forEach((k, v) => out = out.replaceAll('{$k}', '$v'));
  return out;
}

/// Ergonomic lookup: `Text(context.tr('settings.title'))`. Uses `listen:
/// false` — wrap the screen in `context.watch<LocaleProvider>()` (or a
/// `Consumer`) once at the top of `build()` so it rebuilds on language change.
extension Tr on BuildContext {
  String tr(String key, [Map<String, dynamic>? vars]) {
    final code = Provider.of<LocaleProvider>(this, listen: false).code;
    final raw = translations[code]?[key] ?? translations['en']![key] ?? key;
    return interpolate(raw, vars);
  }
}
