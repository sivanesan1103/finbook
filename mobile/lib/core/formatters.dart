import 'package:intl/intl.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹ ', decimalDigits: 0);
final _inrPaise = NumberFormat.currency(locale: 'en_IN', symbol: '₹ ', decimalDigits: 2);

String inr(num value) {
  final v = value.abs();
  return v == v.roundToDouble() ? _inr.format(v) : _inrPaise.format(v);
}

String fmtDate(DateTime d) => DateFormat('dd MMM yy').format(d.toLocal());
String fmtDateTime(DateTime d) => DateFormat('dd MMM yy · hh:mm a').format(d.toLocal());

String timeAgo(DateTime d) {
  final diff = DateTime.now().difference(d.toLocal());
  if (diff.inSeconds < 60) return '${diff.inSeconds} seconds ago';
  if (diff.inMinutes < 60) return '${diff.inMinutes} minutes ago';
  if (diff.inHours < 24) return '${diff.inHours} hours ago';
  return '${diff.inDays} days ago';
}
