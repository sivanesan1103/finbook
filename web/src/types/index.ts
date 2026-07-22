export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: 'ADMIN' | 'STAFF' | 'USER';
  avatarUrl?: string | null;
  language: string;
}

export interface Business {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  category?: string | null;
  logoUrl?: string | null;
  currency: string;
  upiId?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNo?: string | null;
  bankIfsc?: string | null;
  invoiceTerms?: string | null;
  role?: MemberRole;
  permissions?: PermissionFlags | null;
  partyCount?: number;
}

export type MemberRole = 'OWNER' | 'PARTNER' | 'STAFF';
export type PartyType = 'CUSTOMER' | 'SUPPLIER';
export type TxType = 'GAVE' | 'GOT';
export type PaymentMode = 'CASH' | 'ONLINE' | 'CHEQUE' | 'UPI' | 'BANK';

export interface PermissionFlags {
  parties?: boolean;
  bills?: boolean;
  items?: boolean;
  cashbook?: boolean;
  reports?: boolean;
}

export interface Party {
  id: string;
  type: PartyType;
  name: string;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  photoUrl?: string | null;
  addressLine?: string | null;
  area?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  smsEnabled: boolean;
  balance: number; // >0 you will get, <0 you will give
  updatedAt: string;
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  description?: string | null;
  billImage?: string | null;
  paymentMode: PaymentMode;
  entryDate: string;
  smsSent: boolean;
  runningBalance?: number;
  party?: { name: string };
  createdBy?: { id: string; name: string };
}

export interface LedgerResponse {
  party: Party;
  entries: Transaction[];
  totals: { gave: number; got: number; balance: number };
}

export interface CashbookEntry {
  id: string;
  direction: 'IN' | 'OUT';
  amount: string | number;
  paymentMode: PaymentMode;
  description?: string | null;
  entryDate: string;
}

export interface ExpenseItem {
  id: string;
  name: string;
  price?: string | number | null;
}

export interface Expense {
  id: string;
  category: string;
  amount: string | number;
  notes?: string | null;
  attachment?: string | null;
  paymentMode: PaymentMode;
  entryDate: string;
}

export interface Item {
  id: string;
  name: string;
  sku?: string | null;
  unit: string;
  salePrice: string | number;
  purchasePrice?: string | number | null;
  taxRate: string | number;
  stockQty: string | number;
  lowStockAlert?: string | number | null;
  imageUrl?: string | null;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  docType?: 'INVOICE' | 'PROFORMA';
  status: 'DRAFT' | 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED' | 'OPEN' | 'CONVERTED';
  convertedTo?: { id: string; invoiceNo: string } | null;
  issueDate: string;
  dueDate?: string | null;
  subtotal: string | number;
  taxAmount: string | number;
  discount: string | number;
  total: string | number;
  amountPaid: string | number;
  notes?: string | null;
  party?: { id: string; name: string; phone?: string | null };
  items?: InvoiceItem[];
  payments?: { id: string; amount: string | number; mode: PaymentMode; paidAt: string }[];
}

export interface InvoiceItem {
  id?: string;
  itemId?: string | null;
  name: string;
  qty: number;
  price: number;
  taxRate: number;
  amount?: number;
}

export interface StaffMember {
  id: string;
  role: MemberRole;
  permissions?: PermissionFlags | null;
  user: { id: string; name: string; phone?: string | null; email?: string | null; avatarUrl?: string | null };
}

export interface Reminder {
  id: string;
  message?: string | null;
  dueDate: string;
  status: 'PENDING' | 'SENT' | 'CANCELLED';
  sentAt?: string | null;
  party: { id: string; name: string; phone?: string | null };
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  readAt?: string | null;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown> | null;
  createdAt: string;
  user?: { id: string; name: string } | null;
}

export interface DashboardData {
  ledger: { gave: number; got: number; youWillGet: number; youWillGive: number };
  cash: { in: number; out: number };
  expenses: number;
  sales: { invoiceCount: number; billed: number; collected: number };
  parties: { customers: number; suppliers: number };
  recentTransactions: Transaction[];
}

export interface SalesReportEntry {
  id: string;
  invoiceNo: string;
  date: string;
  partyName: string;
  partyType: PartyType;
  status: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  itemCount: number;
  payments: { amount: number; mode: string; paidAt: string }[];
}

export interface SalesReportData {
  range: { from: Date; to: Date };
  totals: { count: number; billed: number; collected: number; pending: number };
  entries: SalesReportEntry[];
}

export interface PurchasesReportEntry {
  id: string;
  entryDate: string;
  type: string;
  amount: number;
  description: string | null;
  paymentMode: string;
  party?: { id: string; name: string; type: string };
}

export interface PurchasesReportData {
  range: { from: Date; to: Date };
  totals: { count: number; gave: number; got: number; net: number; gaveCount: number; gotCount: number };
  entries: PurchasesReportEntry[];
}

export interface PartiesSummaryEntry {
  id: string;
  name: string;
  type: PartyType;
  phone: string | null;
  city: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartiesSummaryData {
  parties: PartiesSummaryEntry[];
  totals: { count: number; totalReceivable: number; totalPayable: number };
}
