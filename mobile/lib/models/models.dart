double _num(dynamic v) => v == null ? 0 : double.tryParse(v.toString()) ?? 0;

class User {
  final String id, name;
  final String? phone, email, avatarUrl;
  User({required this.id, required this.name, this.phone, this.email, this.avatarUrl});
  factory User.fromJson(Map<String, dynamic> j) => User(
        id: j['id'], name: j['name'], phone: j['phone'],
        email: j['email'], avatarUrl: j['avatarUrl'],
      );
}

class Business {
  final String id, name;
  final String? phone, address, gstin, category;
  final String? upiId, bankName, bankAccountName, bankAccountNo, bankIfsc, invoiceTerms;
  final String role;
  final int partyCount;
  Business({
    required this.id, required this.name, this.phone, this.address,
    this.gstin, this.category, this.upiId, this.bankName, this.bankAccountName,
    this.bankAccountNo, this.bankIfsc, this.invoiceTerms,
    this.role = 'OWNER', this.partyCount = 0,
  });
  factory Business.fromJson(Map<String, dynamic> j) => Business(
        id: j['id'], name: j['name'], phone: j['phone'], address: j['address'],
        gstin: j['gstin'], category: j['category'],
        upiId: j['upiId'], bankName: j['bankName'], bankAccountName: j['bankAccountName'],
        bankAccountNo: j['bankAccountNo'], bankIfsc: j['bankIfsc'], invoiceTerms: j['invoiceTerms'],
        role: j['role'] ?? 'OWNER', partyCount: j['partyCount'] ?? 0,
      );
}

class Party {
  final String id, name, type;
  final String? phone, gstin, addressLine, area, city, state, pincode;
  final bool smsEnabled;
  final double balance; // >0 you will get, <0 you will give
  final DateTime updatedAt;
  Party({
    required this.id, required this.name, required this.type, this.phone,
    this.gstin, this.addressLine, this.area, this.city, this.state, this.pincode,
    this.smsEnabled = true, this.balance = 0, required this.updatedAt,
  });
  factory Party.fromJson(Map<String, dynamic> j) => Party(
        id: j['id'], name: j['name'], type: j['type'], phone: j['phone'],
        gstin: j['gstin'], addressLine: j['addressLine'], area: j['area'],
        city: j['city'], state: j['state'], pincode: j['pincode'],
        smsEnabled: j['smsEnabled'] ?? true, balance: _num(j['balance']),
        updatedAt: DateTime.parse(j['updatedAt']),
      );

  String get address => [addressLine, area, city, state, pincode]
      .where((p) => p != null && p.isNotEmpty)
      .join(', ');
}

class TxEntry {
  final String id, type, paymentMode;
  final String? description;
  final double amount;
  final double runningBalance;
  final bool smsSent;
  final DateTime entryDate;
  TxEntry({
    required this.id, required this.type, required this.paymentMode,
    this.description, required this.amount, this.runningBalance = 0,
    this.smsSent = false, required this.entryDate,
  });
  factory TxEntry.fromJson(Map<String, dynamic> j) => TxEntry(
        id: j['id'], type: j['type'], paymentMode: j['paymentMode'] ?? 'CASH',
        description: j['description'], amount: _num(j['amount']),
        runningBalance: _num(j['runningBalance']), smsSent: j['smsSent'] ?? false,
        entryDate: DateTime.parse(j['entryDate']),
      );
}

class LedgerData {
  final Party party;
  final List<TxEntry> entries;
  final double gave, got, balance;
  LedgerData({required this.party, required this.entries, required this.gave, required this.got, required this.balance});
  factory LedgerData.fromJson(Map<String, dynamic> j) => LedgerData(
        party: Party.fromJson(j['party']),
        entries: (j['entries'] as List).map((e) => TxEntry.fromJson(e)).toList(),
        gave: _num(j['totals']['gave']),
        got: _num(j['totals']['got']),
        balance: _num(j['totals']['balance']),
      );
}

class PartySummary {
  final double youWillGet, youWillGive;
  final int partyCount;
  PartySummary({this.youWillGet = 0, this.youWillGive = 0, this.partyCount = 0});
  factory PartySummary.fromJson(Map<String, dynamic> j) => PartySummary(
        youWillGet: _num(j['youWillGet']),
        youWillGive: _num(j['youWillGive']),
        partyCount: j['partyCount'] ?? 0,
      );
}

/// SERVICE unit marks an Item as a service rather than a stocked product —
/// mirrors the web app's Products/Services split without a schema change.
const kServiceUnit = 'SERVICE';

class Item {
  final String id, name, unit;
  final String? sku;
  final double salePrice, stockQty, taxRate;
  final double? purchasePrice, lowStockAlert;
  Item({required this.id, required this.name, required this.unit, this.sku,
      required this.salePrice, required this.stockQty, required this.taxRate,
      this.purchasePrice, this.lowStockAlert});
  factory Item.fromJson(Map<String, dynamic> j) => Item(
        id: j['id'], name: j['name'], unit: j['unit'] ?? 'PCS', sku: j['sku'],
        salePrice: _num(j['salePrice']), stockQty: _num(j['stockQty']),
        taxRate: _num(j['taxRate']),
        purchasePrice: j['purchasePrice'] == null ? null : _num(j['purchasePrice']),
        lowStockAlert: j['lowStockAlert'] == null ? null : _num(j['lowStockAlert']),
      );
  bool get isService => unit == kServiceUnit;
  bool get isLow => !isService && lowStockAlert != null && stockQty <= lowStockAlert!;
}

class InvoiceItem {
  final String name;
  final double qty, price, taxRate, amount;
  InvoiceItem({required this.name, required this.qty, required this.price,
      required this.taxRate, required this.amount});
  factory InvoiceItem.fromJson(Map<String, dynamic> j) => InvoiceItem(
        name: j['name'], qty: _num(j['qty']), price: _num(j['price']),
        taxRate: _num(j['taxRate']), amount: _num(j['amount']),
      );
}

class InvoicePayment {
  final String id, mode;
  final double amount;
  final DateTime paidAt;
  InvoicePayment({required this.id, required this.mode, required this.amount, required this.paidAt});
  factory InvoicePayment.fromJson(Map<String, dynamic> j) => InvoicePayment(
        id: j['id'], mode: j['mode'] ?? 'CASH', amount: _num(j['amount']),
        paidAt: DateTime.parse(j['paidAt']),
      );
}

class Invoice {
  final String id, invoiceNo, status;
  final String partyName;
  final String? partyPhone, notes;
  final double subtotal, taxAmount, discount, total, amountPaid;
  final DateTime issueDate;
  final DateTime? dueDate;
  final List<InvoiceItem> items;
  final List<InvoicePayment> payments;
  Invoice({
    required this.id, required this.invoiceNo, required this.status,
    required this.partyName, this.partyPhone, this.notes,
    this.subtotal = 0, this.taxAmount = 0, this.discount = 0,
    required this.total, required this.amountPaid, required this.issueDate,
    this.dueDate, this.items = const [], this.payments = const [],
  });
  factory Invoice.fromJson(Map<String, dynamic> j) => Invoice(
        id: j['id'], invoiceNo: j['invoiceNo'], status: j['status'],
        partyName: j['party']?['name'] ?? '', partyPhone: j['party']?['phone'],
        notes: j['notes'],
        subtotal: _num(j['subtotal']), taxAmount: _num(j['taxAmount']),
        discount: _num(j['discount']), total: _num(j['total']),
        amountPaid: _num(j['amountPaid']), issueDate: DateTime.parse(j['issueDate']),
        dueDate: j['dueDate'] == null ? null : DateTime.parse(j['dueDate']),
        items: j['items'] == null
            ? const [] : (j['items'] as List).map((i) => InvoiceItem.fromJson(i)).toList(),
        payments: j['payments'] == null
            ? const [] : (j['payments'] as List).map((p) => InvoicePayment.fromJson(p)).toList(),
      );
  double get due => total - amountPaid;
}

class ExpenseItem {
  final String id, name;
  final double? price;
  ExpenseItem({required this.id, required this.name, this.price});
  factory ExpenseItem.fromJson(Map<String, dynamic> j) => ExpenseItem(
        id: j['id'], name: j['name'],
        price: j['price'] == null ? null : _num(j['price']),
      );
}

class Expense {
  final String id, category, paymentMode;
  final String? notes, attachment;
  final double amount;
  final DateTime entryDate;
  Expense({required this.id, required this.category, required this.paymentMode,
      this.notes, this.attachment, required this.amount, required this.entryDate});
  factory Expense.fromJson(Map<String, dynamic> j) => Expense(
        id: j['id'], category: j['category'] ?? 'General', paymentMode: j['paymentMode'] ?? 'CASH',
        notes: j['notes'], attachment: j['attachment'], amount: _num(j['amount']),
        entryDate: DateTime.parse(j['entryDate']),
      );
}

class StaffMember {
  final String id, role;
  final String userName;
  final String? userEmail, userPhone;
  StaffMember({required this.id, required this.role, required this.userName, this.userEmail, this.userPhone});
  factory StaffMember.fromJson(Map<String, dynamic> j) => StaffMember(
        id: j['id'], role: j['role'] ?? 'STAFF',
        userName: j['user']?['name'] ?? '', userEmail: j['user']?['email'], userPhone: j['user']?['phone'],
      );
}

class CashEntry {
  final String id, direction, paymentMode;
  final String? description;
  final double amount;
  final DateTime entryDate;
  CashEntry({required this.id, required this.direction, required this.paymentMode,
      this.description, required this.amount, required this.entryDate});
  factory CashEntry.fromJson(Map<String, dynamic> j) => CashEntry(
        id: j['id'], direction: j['direction'], paymentMode: j['paymentMode'] ?? 'CASH',
        description: j['description'], amount: _num(j['amount']),
        entryDate: DateTime.parse(j['entryDate']),
      );
}
