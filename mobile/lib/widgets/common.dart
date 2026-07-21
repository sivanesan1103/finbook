import 'package:flutter/material.dart';
import '../core/formatters.dart';
import '../core/theme.dart';
import '../l10n/translations.dart';

class MoneyText extends StatelessWidget {
  final double value;
  final double size;
  final Color? color;
  const MoneyText(this.value, {super.key, this.size = 16, this.color});

  @override
  Widget build(BuildContext context) {
    final c = color ??
        (value > 0 ? AppColors.gave : value < 0 ? AppColors.got : Colors.grey);
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
            _cell(context.tr('common.youWillGive'), give, AppColors.got),
            Container(width: 1, height: 40, color: Colors.grey.shade200),
            _cell(context.tr('common.youWillGet'), get, AppColors.gave),
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
