import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'api_client.dart';
import '../widgets/common.dart';

/// Downloads an authenticated file (PDF report, JSON backup) from the API
/// and hands it to the OS share sheet — the same "download" a browser tab
/// gives the web app, adapted to how a phone actually saves/sends files.
Future<void> downloadAndShare(
  BuildContext context, {
  required String path,
  required String filename,
  String subject = '',
}) async {
  final messenger = ScaffoldMessenger.of(context);
  messenger.showSnackBar(const SnackBar(content: Text('Preparing file…'), duration: Duration(seconds: 1)));
  try {
    final bytes = await ApiClient.instance.getBytes(path);
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/$filename');
    await file.writeAsBytes(bytes, flush: true);
    await Share.shareXFiles([XFile(file.path)], subject: subject);
  } catch (e) {
    if (context.mounted) showSnack(context, 'Could not prepare file: $e', error: true);
  }
}
