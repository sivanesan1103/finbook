import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ApiException implements Exception {
  final int status;
  final String message;
  ApiException(this.status, this.message);
  @override
  String toString() => message;
}

/// Thin HTTP wrapper over the shared FinBook REST API with JWT storage
/// and automatic refresh-token rotation on 401.
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  /// Hosted FinBook API (HTTPS via Cloudflare — proper SNI/TLS so devices
  /// connect reliably). Override for local dev with:
  /// flutter run --dart-define=API_URL=http://10.0.2.2:4000 (Android emulator)
  /// flutter run --dart-define=API_URL=http://localhost:4000 (iOS simulator)
  static const baseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://apifinbook.sivaprj.online',
  );

  /// Some mobile networks fail to resolve [baseUrl]'s domain via system DNS
  /// even though the host is reachable. When that happens we fall back to
  /// resolving the A record via Cloudflare's DNS-over-HTTPS endpoint (queried
  /// by IP, so the fallback itself doesn't depend on DNS) and connect to that
  /// IP directly.
  ///
  /// [HttpClient.connectionFactory] hands back a plain [Socket] — for a
  /// direct (non-proxy) https:// connection, Dart does NOT auto-upgrade that
  /// to TLS the way it would a normal connection, so we upgrade it ourselves
  /// via [SecureSocket.secure], passing the *domain* as `host` so SNI and
  /// certificate hostname validation still target it even though the raw
  /// socket connected to the resolved IP.
  static final http.Client _client =
      IOClient(HttpClient()..connectionFactory = _connect);

  static Future<ConnectionTask<Socket>> _connect(
      Uri url, String? proxyHost, int? proxyPort) {
    return Future.value(
        ConnectionTask.fromSocket(_connectSocket(url), () {}));
  }

  /// DNS-over-HTTPS resolvers to try in order, each queried by literal IP so
  /// the fallback itself never depends on system DNS.
  static const _dohEndpoints = [
    'https://1.1.1.1/dns-query',
    'https://8.8.8.8/resolve',
  ];

  static Future<Socket> _connectSocket(Uri url) async {
    InternetAddress address;
    try {
      final addresses = await InternetAddress.lookup(url.host)
          .timeout(const Duration(seconds: 5));
      address = addresses.first;
    } catch (_) {
      address = InternetAddress(await _resolveViaDoh(url.host));
    }
    final raw = await Socket.connect(address, url.port)
        .timeout(const Duration(seconds: 8));
    if (url.scheme != 'https') return raw;
    return SecureSocket.secure(raw, host: url.host);
  }

  static Future<String> _resolveViaDoh(String host) async {
    Object? lastError;
    for (final endpoint in _dohEndpoints) {
      try {
        final res = await http.Client()
            .get(
              Uri.parse('$endpoint?name=$host&type=A'),
              headers: {'accept': 'application/dns-json'},
            )
            .timeout(const Duration(seconds: 5));
        final answers = (jsonDecode(res.body)['Answer'] as List)
            .where((a) => a['type'] == 1);
        return answers.first['data'] as String;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError ?? SocketException('DNS resolution failed for $host');
  }

  String? _access;
  String? _refresh;

  Future<void> loadTokens() async {
    final prefs = await SharedPreferences.getInstance();
    _access = prefs.getString('bk_access');
    _refresh = prefs.getString('bk_refresh');
  }

  bool get hasSession => _access != null;

  Future<void> saveTokens(String access, String refresh) async {
    _access = access;
    _refresh = refresh;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('bk_access', access);
    await prefs.setString('bk_refresh', refresh);
  }

  Future<void> clearTokens() async {
    _access = null;
    _refresh = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('bk_access');
    await prefs.remove('bk_refresh');
  }

  Uri _uri(String path) => Uri.parse('$baseUrl/api/v1$path');

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_access != null) 'Authorization': 'Bearer $_access',
      };

  Future<dynamic> _send(String method, String path,
      {Map<String, dynamic>? body, bool retried = false}) async {
    late http.Response res;
    final encoded = body == null ? null : jsonEncode(body);
    final uri = _uri(path);
    switch (method) {
      case 'GET':
        res = await _client.get(uri, headers: _headers);
      case 'POST':
        res = await _client.post(uri, headers: _headers, body: encoded);
      case 'PATCH':
        res = await _client.patch(uri, headers: _headers, body: encoded);
      case 'DELETE':
        res = await _client.delete(uri, headers: _headers);
    }

    if (res.statusCode == 401 && !retried && _refresh != null) {
      await _tryRefresh();
      return _send(method, path, body: body, retried: true);
    }

    final json = _decodeOrNull(res.body);
    if (res.statusCode >= 400) {
      final message = (json is Map && json['message'] != null)
          ? json['message'] as String
          : _fallbackErrorMessage(res.statusCode);
      throw ApiException(res.statusCode, message);
    }
    // A 2xx with a non-JSON body (e.g. an upstream proxy/CDN error page that
    // slipped through with a success-looking status) shouldn't crash the UI.
    return json ?? {};
  }

  /// The server and Cloudflare (in front of it) always reply with JSON on
  /// success or a handled error. A non-JSON body means something in between
  /// — the tunnel, DNS, or the origin itself — is down, not our API.
  dynamic _decodeOrNull(String body) {
    if (body.isEmpty) return {};
    try {
      return jsonDecode(body);
    } catch (_) {
      return null;
    }
  }

  String _fallbackErrorMessage(int status) {
    if (status >= 520 && status < 530 || status == 530) {
      return 'Server is unreachable right now. Please try again shortly.';
    }
    if (status == 502 || status == 503 || status == 504) {
      return 'Server is temporarily unavailable. Please try again.';
    }
    return 'Request failed (status $status)';
  }

  Future<void> _tryRefresh() async {
    final res = await _client.post(
      _uri('/auth/refresh'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'refreshToken': _refresh}),
    );
    final json = _decodeOrNull(res.body);
    if (res.statusCode == 200 && json is Map && json['data'] is Map) {
      final data = json['data'] as Map;
      await saveTokens(data['accessToken'], data['refreshToken']);
    } else {
      await clearTokens();
    }
  }

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) =>
      _send('POST', path, body: body);
  Future<dynamic> patch(String path, [Map<String, dynamic>? body]) =>
      _send('PATCH', path, body: body);
  Future<dynamic> delete(String path) => _send('DELETE', path);

  /// Downloads a binary response (PDF, backup export) with the auth header,
  /// retrying once after a token refresh on 401 — same rules as [_send].
  Future<List<int>> getBytes(String path, {bool retried = false}) async {
    final res = await _client.get(_uri(path), headers: _headers);
    if (res.statusCode == 401 && !retried && _refresh != null) {
      await _tryRefresh();
      return getBytes(path, retried: true);
    }
    if (res.statusCode >= 400) {
      throw ApiException(res.statusCode, 'Download failed (${res.statusCode})');
    }
    return res.bodyBytes;
  }
}
