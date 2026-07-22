import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/api_client.dart';
import '../core/theme.dart';
import '../l10n/translations.dart';
import '../providers/app_state.dart';

/// Shown right after registration, before entering the app. Verifying (or
/// skipping) both call [AppState.completeAuth] to finish the sign-in.
class OtpVerifyScreen extends StatefulWidget {
  final String email;
  final Map<String, dynamic> pendingAuthData;
  const OtpVerifyScreen({super.key, required this.email, required this.pendingAuthData});

  @override
  State<OtpVerifyScreen> createState() => _OtpVerifyScreenState();
}

class _OtpVerifyScreenState extends State<OtpVerifyScreen> {
  final code = TextEditingController();
  String? error;
  String? resendMsg;
  bool busy = false;
  bool resendBusy = false;

  Future<void> _enterApp() async {
    await context.read<AppState>().completeAuth(widget.pendingAuthData);
    // main.dart's Consumer<AppState> swaps to HomeScreen once user is set.
    if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
  }

  Future<void> _verify() async {
    if (code.text.trim().length != 6) {
      setState(() => error = context.tr('login.otpInvalid'));
      return;
    }
    setState(() { busy = true; error = null; });
    try {
      await ApiClient.instance.post('/auth/verify-email', {'email': widget.email, 'code': code.text.trim()});
      final appState = context.read<AppState>();
      await appState.completeAuth(widget.pendingAuthData);
      // pendingAuthData.user predates verification, so it still has
      // emailVerifiedAt: null — refresh from the server before entering the
      // app, or the profile keeps showing "not verified" until next boot.
      await appState.refreshUser();
      if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _resend() async {
    setState(() { resendBusy = true; resendMsg = null; error = null; });
    try {
      await ApiClient.instance.post('/auth/resend-otp', {'email': widget.email});
      if (mounted) setState(() => resendMsg = context.tr('login.otpResent'));
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => resendBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.primary,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Icon(Icons.mark_email_read_outlined, color: Colors.white, size: 64),
            const SizedBox(height: 16),
            Text(context.tr('login.otpTitle'),
                style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(context.tr('login.otpSubtitle', {'email': widget.email}),
                style: const TextStyle(color: Colors.white70, fontSize: 14), textAlign: TextAlign.center),
            const SizedBox(height: 32),
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
              child: Column(children: [
                TextField(
                  controller: code,
                  autofocus: true,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: 8),
                  decoration: InputDecoration(hintText: context.tr('login.otpHint'), counterText: ''),
                  onChanged: (_) => setState(() {}),
                ),
                if (error != null) Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(error!, style: const TextStyle(color: Colors.red, fontSize: 12), textAlign: TextAlign.center),
                ),
                if (resendMsg != null) Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(resendMsg!, style: const TextStyle(color: Colors.green, fontSize: 12), textAlign: TextAlign.center),
                ),
                const SizedBox(height: 16),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  onPressed: busy || code.text.trim().length != 6 ? null : _verify,
                  child: Text(busy ? context.tr('login.otpVerifying') : context.tr('login.otpVerify')),
                ),
                const SizedBox(height: 8),
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  TextButton(
                    onPressed: resendBusy ? null : _resend,
                    child: Text(resendBusy ? context.tr('login.otpResending') : context.tr('login.otpResend')),
                  ),
                  TextButton(
                    onPressed: _enterApp,
                    child: Text(context.tr('login.otpSkip'), style: const TextStyle(color: Colors.black54)),
                  ),
                ]),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}
