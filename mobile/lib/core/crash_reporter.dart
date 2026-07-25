import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'api_client.dart';

/// Reports uncaught Flutter/Dart errors to the backend's logging pipeline
/// (see backend/src/modules/clientLogs), feeding the Grafana dashboard's
/// "Client errors & crashes" panel. Uses a plain http POST rather than
/// [ApiClient] — a crash is exactly the moment we don't want error reporting
/// itself to depend on app state (tokens, DNS fallback, etc.) being healthy.
DateTime? _lastSent;

void reportCrash(String message, String stack) {
  final now = DateTime.now();
  if (_lastSent != null && now.difference(_lastSent!) < const Duration(seconds: 2)) return;
  _lastSent = now;

  final uri = Uri.parse('${ApiClient.baseUrl}/api/v1/client-logs');
  http
      .post(
        uri,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'platform': 'mobile',
          'level': 'crash',
          'message': message.length > 2000 ? message.substring(0, 2000) : message,
          'stack': stack.length > 8000 ? stack.substring(0, 8000) : stack,
          'device': Platform.operatingSystem,
        }),
      )
      .timeout(const Duration(seconds: 5))
      .catchError((_) {
        // Nothing more useful to do if the report itself can't be sent.
        return http.Response('', 0);
      });
}

/// Wires Flutter framework errors and uncaught async/platform errors into
/// [reportCrash]. Call once from main() before runApp.
void installCrashReporting() {
  FlutterError.onError = (FlutterErrorDetails details) {
    FlutterError.presentError(details);
    reportCrash(details.exceptionAsString(), details.stack?.toString() ?? '');
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    reportCrash(error.toString(), stack.toString());
    return true;
  };
}
