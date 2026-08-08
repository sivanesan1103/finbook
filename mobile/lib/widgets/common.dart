import 'package:flutter/material.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../l10n/translations.dart';

/// Shown instead of a spinner when a screen's initial load fails, so a
/// network hiccup doesn't leave the user staring at a spinner forever.
class RetryState extends StatelessWidget {
  final VoidCallback onRetry;
  const RetryState({super.key, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.cloud_off, size: 40, color: Colors.black26),
        const SizedBox(height: 10),
        Text(context.tr('common.loadFailed'), style: const TextStyle(color: Colors.black54)),
        const SizedBox(height: 14),
        OutlinedButton(onPressed: onRetry, child: Text(context.tr('common.retry'))),
      ]),
    );
  }
}

class MoneyText extends StatelessWidget {
  final double value;
  final double size;
  final Color? color;
  const MoneyText(this.value, {super.key, this.size = 16, this.color});

  @override
  Widget build(BuildContext context) {
    // Positive balance = owed to you = green; negative = you owe = red.
    // This was inverted, so a customer who owed you money showed red while
    // money you owed showed green — the opposite of the ledger rows and of
    // the web app's dashboard.
    final c = color ??
        (value > 0 ? AppColors.got : value < 0 ? AppColors.gave : Colors.grey);
    return Text(inr(value),
        style: TextStyle(color: c, fontSize: size, fontWeight: FontWeight.w800));
  }
}

class InitialAvatar extends StatelessWidget {
  final String name;
  final double radius;
  final Color? bg;
  const InitialAvatar(this.name, {super.key, this.radius = 22, this.bg});

  @override
  Widget build(BuildContext context) {
    final initials = name.trim().isEmpty
        ? '?'
        : name.trim().split(RegExp(r'\s+')).map((w) => w[0]).take(2).join().toUpperCase();
    return CircleAvatar(
      radius: radius,
      backgroundColor: bg ?? Colors.blueGrey.shade50,
      child: Text(initials,
          style: TextStyle(
              color: AppColors.primary, fontWeight: FontWeight.w700, fontSize: radius * 0.8)),
    );
  }
}

/// White "You will give / You will get" summary card under the blue header.
class GiveGetCard extends StatelessWidget {
  final double give, get;
  final VoidCallback? onReport;
  const GiveGetCard({super.key, required this.give, required this.get, this.onReport});

  Widget _cell(String label, double v, Color c) => Expanded(
        child: Column(children: [
          Text(label, style: const TextStyle(color: Colors.black54, fontSize: 15)),
          const SizedBox(height: 4),
          Text(inr(v), style: TextStyle(color: c, fontSize: 22, fontWeight: FontWeight.w800)),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 14),
      elevation: 3,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Row(children: [
            // You'll Give = you owe = red; You'll Get = owed to you = green.
            _cell(context.tr('common.youWillGive'), give, AppColors.gave),
            Container(width: 1, height: 40, color: Colors.grey.shade200),
            _cell(context.tr('common.youWillGet'), get, AppColors.got),
          ]),
        ),
        if (onReport != null)
          InkWell(
            onTap: onReport,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFE8F0FE),
                borderRadius: const BorderRadius.vertical(bottom: Radius.circular(14)),
              ),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                const Icon(Icons.picture_as_pdf_outlined, size: 18, color: AppColors.primary),
                const SizedBox(width: 8),
                Text(context.tr('common.viewReports'),
                    style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700, fontSize: 16)),
              ]),
            ),
          ),
      ]),
    );
  }
}

void showSnack(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
    content: Text(message),
    backgroundColor: error ? Colors.red.shade700 : Colors.green.shade700,
  ));
}
