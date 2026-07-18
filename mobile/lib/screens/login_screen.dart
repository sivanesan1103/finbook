import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/theme.dart';
import '../providers/app_state.dart';
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
        decoration: const InputDecoration(
          labelText: 'Email address',
          prefixIcon: Icon(Icons.email_outlined),
        ),
      ),
      const SizedBox(height: 16),
      TextField(
        controller: signInPassCtrl,
        obscureText: true,
        onChanged: (_) => setState(() {}),
        decoration: const InputDecoration(
          labelText: 'Password',
          prefixIcon: Icon(Icons.lock_outline),
        ),
      ),
      const SizedBox(height: 20),
      ElevatedButton(
        onPressed:
            busy || signInIdCtrl.text.isEmpty || signInPassCtrl.text.isEmpty
                ? null
                : _loginPassword,
        child: Text(busy ? 'SIGNING IN…' : 'SIGN IN'),
      ),
      const SizedBox(height: 12),
      const Text('Sign in with your email and password.',
          style: TextStyle(color: Colors.black54, fontSize: 12)),
    ]);
  }

  Widget _signUpTab() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SizedBox(height: 4),
      TextField(
        controller: nameCtrl,
        textCapitalization: TextCapitalization.words,
        onChanged: (_) => setState(() {}),
        decoration: const InputDecoration(
            labelText: 'Full Name', prefixIcon: Icon(Icons.person_outline)),
      ),
      const SizedBox(height: 16),
      TextField(
        controller: emailCtrl,
        keyboardType: TextInputType.emailAddress,
        onChanged: (_) => setState(() {}),
        decoration: const InputDecoration(
            labelText: 'Email address', prefixIcon: Icon(Icons.email_outlined)),
      ),
      const SizedBox(height: 16),
      TextField(
        controller: signUpPassCtrl,
        obscureText: true,
        onChanged: (_) => setState(() {}),
        decoration: const InputDecoration(
            labelText: 'Password (min 6 chars)',
            prefixIcon: Icon(Icons.lock_outline)),
      ),
      const SizedBox(height: 20),
      ElevatedButton(
        onPressed: busy ||
                nameCtrl.text.trim().length < 2 ||
                !emailCtrl.text.contains('@') ||
                signUpPassCtrl.text.length < 6
            ? null
            : _register,
        child: Text(busy ? 'CREATING…' : 'CREATE ACCOUNT'),
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
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
                    const SizedBox(height: 48),
                    const Icon(Icons.menu_book_rounded,
                        color: Colors.white, size: 64),
                    const SizedBox(height: 8),
                    const Text('FinBook',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 30,
                            fontWeight: FontWeight.w800)),
                    const Text('Digital ledger for your business',
                        style: TextStyle(color: Colors.white70, fontSize: 14)),
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
                            const TabBar(
                              labelColor: AppColors.primary,
                              unselectedLabelColor: Colors.black54,
                              indicatorColor: AppColors.primary,
                              tabs: [
                                Tab(text: 'Sign In'),
                                Tab(text: 'Create Account')
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
                            const Center(
                              child: Text('🔒 100% Safe and Secure',
                                  style: TextStyle(
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
