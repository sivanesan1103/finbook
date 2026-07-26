import 'package:flutter/foundation.dart';
import '../core/api_client.dart';
import '../models/models.dart';

/// Session + active book state shared across the app.
class AppState extends ChangeNotifier {
  final _api = ApiClient.instance;

  User? user;
  List<Business> businesses = [];
  Business? business;
  bool booting = true;

  Future<void> boot() async {
    _api.onSessionExpired = logout;
    await _api.loadTokens();
    if (_api.hasSession) {
      try {
        final me = await _api.get('/auth/me');
        user = User.fromJson(me['data']);
        await loadBusinesses();
      } catch (_) {
        await _api.clearTokens();
      }
    }
    booting = false;
    notifyListeners();
  }

  Future<void> loginPassword(String email, String password) async {
    final res =
        await _api.post('/auth/login', {'email': email, 'password': password});
    final data = res['data'];
    await _api.saveTokens(data['accessToken'], data['refreshToken']);
    user = User.fromJson(data['user']);
    await loadBusinesses();
    notifyListeners();
  }

  Future<void> register(String name, String email, String password) async {
    final res = await _api.post('/auth/register',
        {'name': name, 'email': email, 'password': password});
    final data = res['data'];
    await _api.saveTokens(data['accessToken'], data['refreshToken']);
    user = User.fromJson(data['user']);
    await loadBusinesses();
    notifyListeners();
  }

  Future<void> loadBusinesses() async {
    final res = await _api.get('/businesses');
    businesses =
        (res['data'] as List).map((b) => Business.fromJson(b)).toList();
    if (business == null || !businesses.any((b) => b.id == business!.id)) {
      business = businesses.isEmpty ? null : businesses.first;
    } else {
      business = businesses.firstWhere((b) => b.id == business!.id);
    }
    notifyListeners();
  }

  void switchBusiness(Business b) {
    business = b;
    notifyListeners();
  }

  Future<void> createBusiness(String name) async {
    final res = await _api.post('/businesses', {'name': name});
    await loadBusinesses();
    switchBusiness(Business.fromJson(res['data']));
  }

  Future<void> renameBusiness(String name) async {
    if (business == null) return;
    await _api.patch('/businesses/${business!.id}', {'name': name});
    await loadBusinesses();
  }

  Future<void> logout() async {
    await _api.clearTokens();
    user = null;
    businesses = [];
    business = null;
    notifyListeners();
  }

  String get basePath => '/businesses/${business!.id}';
}
