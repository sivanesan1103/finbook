import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/theme.dart';
import '../l10n/translations.dart';
import '../providers/app_state.dart';
import '../providers/locale_provider.dart';
import '../widgets/common.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  // Sign In (password) controllers
  final signInIdCtrl = TextEditingController();
  final signInPassCtrl = TextEditingController();
  // Sign Up controllers
  final nameCtrl = TextEditingController();
  final emailCtrl = TextEditingController();
  final signUpPassCtrl = TextEditingController();

  bool busy = false;

  Future<void> _loginPassword() async {
    setState(() => busy = true);
    try {
      await context.read<AppState>().loginPassword(
            signInIdCtrl.text.trim(),
            signInPassCtrl.text.trim(),
          );
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _register() async {
    setState(() => busy = true);
    try {
      await context.read<AppState>().register(
            nameCtrl.text.trim(),
            emailCtrl.text.trim(),
            signUpPassCtrl.text.trim(),
          );
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget _signInTab() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SizedBox(height: 4),
      TextField(
        controller: signInIdCtrl,
        keyboardType: TextInputType.emailAddress,
        textInputAction: TextInputAction.next,
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(
          labelText: context.tr('login.emailAddress'),
          prefixIcon: const Icon(Icons.email_outlined),
        ),
      ),
      const SizedBox(height: 16),
      TextField(
        controller: signInPassCtrl,
        obscureText: true,
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(
          labelText: context.tr('login.password'),
          prefixIcon: const Icon(Icons.lock_outline),
        ),
      ),
      const SizedBox(height: 20),
      ElevatedButton(
        onPressed:
            busy || signInIdCtrl.text.isEmpty || signInPassCtrl.text.isEmpty
                ? null
                : _loginPassword,
        child: Text(busy ? context.tr('login.signingInDots') : context.tr('login.signInButton')),
      ),
      const SizedBox(height: 12),
      Text(context.tr('login.signInHint'),
          style: const TextStyle(color: Colors.black54, fontSize: 12)),
    ]);
  }

  Widget _signUpTab() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SizedBox(height: 4),
      TextField(
        controller: nameCtrl,
        textCapitalization: TextCapitalization.words,
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(
            labelText: context.tr('login.fullName'), prefixIcon: const Icon(Icons.person_outline)),
      ),
      const SizedBox(height: 16),
      TextField(
        controller: emailCtrl,
        keyboardType: TextInputType.emailAddress,
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(
            labelText: context.tr('login.emailAddress'), prefixIcon: const Icon(Icons.email_outlined)),
      ),
      const SizedBox(height: 16),
      TextField(
        controller: signUpPassCtrl,
        obscureText: true,
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(
            labelText: context.tr('login.passwordMinChars'),
            prefixIcon: const Icon(Icons.lock_outline)),
      ),
      const SizedBox(height: 20),
      ElevatedButton(
        onPressed: busy ||
                nameCtrl.text.trim().length < 2 ||
                !emailCtrl.text.contains('@') ||
                signUpPassCtrl.text.length < 6
            ? null
            : _register,
        child: Text(busy ? context.tr('login.creatingDots') : context.tr('login.createAccountButton')),
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final locale = context.watch<LocaleProvider>();
    return Scaffold(
      backgroundColor: AppColors.primary,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            return SingleChildScrollView(
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(height: 24),
                    Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                      TextButton(
                        onPressed: () => context.read<LocaleProvider>().setLang('en'),
                        child: Text('English',
                            style: TextStyle(
                                color: locale.code == 'en' ? Colors.white : Colors.white54,
                                fontWeight: locale.code == 'en' ? FontWeight.w800 : FontWeight.normal)),
                      ),
                      const Text('|', style: TextStyle(color: Colors.white54)),
                      TextButton(
                        onPressed: () => context.read<LocaleProvider>().setLang('ta'),
                        child: Text('தமிழ்',
                            style: TextStyle(
                                color: locale.code == 'ta' ? Colors.white : Colors.white54,
                                fontWeight: locale.code == 'ta' ? FontWeight.w800 : FontWeight.normal)),
                      ),
                    ]),
                    const SizedBox(height: 8),
                    const Icon(Icons.menu_book_rounded,
                        color: Colors.white, size: 64),
                    const SizedBox(height: 8),
                    Text(context.tr('login.appName'),
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 30,
                            fontWeight: FontWeight.w800)),
                    Text(context.tr('login.subtitle'),
                        style: const TextStyle(color: Colors.white70, fontSize: 14)),
                    const SizedBox(height: 40),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        borderRadius:
                            BorderRadius.vertical(top: Radius.circular(28)),
                      ),
                      child: DefaultTabController(
                        length: 2,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            TabBar(
                              labelColor: AppColors.primary,
                              unselectedLabelColor: Colors.black54,
                              indicatorColor: AppColors.primary,
                              tabs: [
                                Tab(text: context.tr('login.signInTab')),
                                Tab(text: context.tr('login.createAccountTab'))
                              ],
                            ),
                            const SizedBox(height: 16),
                            SizedBox(
                              height: 400,
                              child: TabBarView(
                                children: [
                                  SingleChildScrollView(child: _signInTab()),
                                  SingleChildScrollView(child: _signUpTab()),
                                ],
                              ),
                            ),
                            const SizedBox(height: 12),
                            Center(
                              child: Text(context.tr('login.safeSecure'),
                                  style: const TextStyle(
                                      color: Colors.green,
                                      fontWeight: FontWeight.w600)),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
