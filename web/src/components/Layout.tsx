import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Avatar, Modal } from './ui';
import { api, apiMessage } from '../api/client';

const LEDGER_NAV = [
  { to: '/customers', label: 'Customers', icon: '👥' },
  { to: '/suppliers', label: 'Suppliers', icon: '🚚' },
  { to: '/expenses', label: 'Expenses', icon: '🧾' },
  { to: '/cashbook', label: 'Cashbook', icon: '📔' },
  { to: '/staff', label: 'Staff', icon: '🧑‍💼' },
  { to: '/reports', label: 'Reports - Parties', icon: '📊' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

const BILLS_NAV = [
  { to: '/invoices', label: 'Sales', icon: '🧮' },
  { to: '/items', label: 'Items', icon: '📦' },
];

/** In-app tutorial topics — screenshots live in web/public/tutorials. */
const TUTORIALS = [
  {
    icon: '👥',
    title: 'Customers & Khata Ledger',
    blurb: 'Add parties and track You’ll Give / You’ll Get',
    images: [
      { src: '/tutorials/customers-1.png', alt: 'Customers page' },
      { src: '/tutorials/customers-2.png', alt: 'Customer khata ledger' },
    ],
    steps: [
      <>Open <strong>Customers</strong> (or <strong>Suppliers</strong>) from the left sidebar.</>,
      <>Click <strong>+ Add Customer</strong> and fill in name, phone and address.</>,
      <>Select a customer to open their khata on the right — record <strong>You Gave</strong> (red) and <strong>You Got</strong> (green) entries.</>,
      <>The running balance shows who owes whom; use <strong>View Report</strong> to download a statement PDF.</>,
    ],
  },
  {
    icon: '🧾',
    title: 'Record an Expense',
    blurb: 'Reusable expense items with quantities and bills',
    images: [
      { src: '/tutorials/expenses-1.png', alt: 'Expenses page with summary and list' },
      { src: '/tutorials/expenses-2.png', alt: 'Select Expense Items panel' },
    ],
    steps: [
      <>Go to <strong>Expenses</strong> and click <strong>+ Add Expense</strong>.</>,
      <>Click <strong>+ Select Expense Items</strong>, then pick items or create new ones (eg- Petrol, Rent) with <strong>+ Add new expense item</strong>.</>,
      <>Use the <strong>− / +</strong> stepper to set quantities, then press <strong>Continue</strong>.</>,
      <>Check the auto-filled <strong>Amount Paid</strong>, attach a bill photo (PNG/JPG) and hit <strong>Save</strong>.</>,
    ],
  },
  {
    icon: '📔',
    title: 'Cashbook Entry',
    blurb: 'Daily cash IN / OUT with running balances',
    images: [
      { src: '/tutorials/cashbook-1.png', alt: 'Cashbook page' },
      { src: '/tutorials/cashbook-2.png', alt: 'In Entry form' },
    ],
    steps: [
      <>Open <strong>Cashbook</strong> — the header shows <strong>Total Balance</strong> and <strong>Todays Balance</strong>.</>,
      <>Click the green <strong>IN</strong> button for money received, or the red <strong>OUT</strong> button for money paid.</>,
      <>Enter the amount, description, payment mode (Cash/Online/UPI…) and date, then <strong>Save</strong>.</>,
      <>Click any entry to view details, <strong>Edit</strong> or <strong>Delete</strong> it; filter the list by date and payment mode.</>,
    ],
  },
  {
    icon: '🧮',
    title: 'Sales & Tax Invoices',
    blurb: 'GST invoices, payments and PDF download',
    images: [
      { src: '/tutorials/sales-1.png', alt: 'Sales page' },
      { src: '/tutorials/sales-2.png', alt: 'Invoice detail panel' },
    ],
    steps: [
      <>Open <strong>Sales</strong> and click <strong>+ Add Sale</strong>.</>,
      <>Choose the customer, add item lines (pick from your Items or type custom ones) with qty, rate and GST%.</>,
      <>Save — the invoice gets a number and appears with its <strong>UNPAID / PARTIAL / PAID</strong> status.</>,
      <>Select an invoice to <strong>Collect Payment</strong>, download the <strong>Tax Invoice PDF</strong>, or cancel it.</>,
    ],
  },
  {
    icon: '📦',
    title: 'Items & Inventory',
    blurb: 'Products, services, stock value and low-stock alerts',
    images: [
      { src: '/tutorials/items-1.png', alt: 'Items page with stock summary' },
      { src: '/tutorials/items-2.png', alt: 'Item detail panel' },
    ],
    steps: [
      <>Open <strong>Items</strong> — switch between the <strong>Products</strong> and <strong>Services</strong> tabs.</>,
      <>Click <strong>+ Add Product</strong> (or Service) and set prices, GST%, opening stock and a low-stock alert.</>,
      <>Select an item to see its stock value and use <strong>Adjust Stock</strong> for purchases, sales or corrections.</>,
      <>The header shows your <strong>Total Stock value</strong> and how many products are running low.</>,
    ],
  },
  {
    icon: '📊',
    title: 'Reports',
    blurb: 'Party, sales, purchases and cashbook reports',
    images: [
      { src: '/tutorials/reports-1.png', alt: 'Reports page' },
    ],
    steps: [
      <>Open <strong>Reports - Parties</strong> from the sidebar.</>,
      <>Pick a report type — party statements, sales, purchases or cashbook.</>,
      <>Choose your date range to see totals and entries.</>,
      <>Download the report as a <strong>PDF</strong> to share on WhatsApp or email.</>,
    ],
  },
];

export default function Layout() {
  const { user, business, businesses, switchBusiness, reloadBusinesses, logout } = useAuth();
  const [switcher, setSwitcher] = useState(false);
  const [newBook, setNewBook] = useState('');
  const [err, setErr] = useState('');
  const [appModal, setAppModal] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const navigate = useNavigate();

  const createBook = async () => {
    if (!newBook.trim()) return;
    try {
      const res = await api.post('/businesses', { name: newBook.trim() });
      await reloadBusinesses();
      switchBusiness(res.data.data);
      setNewBook('');
      setSwitcher(false);
    } catch (e) {
      setErr(apiMessage(e));
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-64 bg-navy-900 flex flex-col shrink-0">
        <div className="px-5 py-4 flex items-center gap-2">
          <span className="text-white font-extrabold text-xl tracking-tight">FinBook</span>
        </div>

        {/* Active book card */}
        <button
          onClick={() => setSwitcher(true)}
          className="mx-4 mb-4 bg-navy-800 rounded-xl p-3 flex items-center gap-3 text-left hover:bg-navy-700 transition"
        >
          <Avatar name={business?.name || '?'} size={38} />
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-semibold truncate">{business?.name}</p>
            <p className="text-slate-400 text-xs">{business?.email || user?.email}</p>
            <p className="text-green-400 text-xs">● Online</p>
          </div>
          <span className="text-slate-400">⇅</span>
        </button>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          <p className="px-2 text-[11px] font-bold text-slate-400 tracking-wider mb-2">LEDGER MANAGEMENT</p>
          {LEDGER_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
            >
              <span>{n.icon}</span> {n.label}
            </NavLink>
          ))}
          <p className="px-2 pt-4 text-[11px] font-bold text-slate-400 tracking-wider">BILLS AND INVENTORY</p>
          <p className="px-2 pb-2 text-[10px] text-slate-400">(To be discontinued)</p>
          {BILLS_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
            >
              <span>{n.icon}</span> {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-navy-700 flex items-center gap-3">
          <Avatar name={user?.name || '?'} url={user?.avatarUrl} size={34} />
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm truncate">{user?.name}</p>
            <p className="text-slate-400 text-xs truncate">{user?.email}</p>
          </div>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            title="Logout"
            className="text-slate-400 hover:text-white"
          >
            ⎋
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top header bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center gap-3 px-6 shrink-0">
          <button className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900"
            onClick={() => setSwitcher(true)}>
            <Avatar name={business?.name || '?'} size={26} />
            <span className="max-w-[220px] truncate">{business?.name}</span>
            <span className="text-slate-400 text-xs">▾</span>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button className="btn-outline text-xs" onClick={() => setAppModal(true)}>📲 Use on Mobile</button>
            <button className="text-sm text-slate-500 hover:text-slate-800 px-2" onClick={() => setHelpOpen(true)}>📚 Tutorials</button>
            <div className="relative">
              <button className="flex items-center gap-2" onClick={() => setUserMenu((v) => !v)}>
                <Avatar name={user?.name || '?'} url={user?.avatarUrl} size={30} />
              </button>
              {userMenu && (
                <div className="absolute right-0 top-10 w-56 card p-2 z-40" onMouseLeave={() => setUserMenu(false)}>
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="font-semibold text-sm truncate">{user?.name}</p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                  </div>
                  <button className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-50"
                    onClick={() => { setUserMenu(false); navigate('/settings'); }}>⚙️ Settings</button>
                  <button className="w-full text-left px-3 py-2 text-sm rounded-lg text-red-600 hover:bg-red-50"
                    onClick={() => { logout(); navigate('/login'); }}>⎋ Logout</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto min-h-0">
          <Outlet />
        </div>
      </main>

      {/* ── Mobile app modal ── */}
      <Modal open={appModal} title="Use FinBook on your phone" onClose={() => setAppModal(false)}>
        <div className="text-center space-y-3">
          <div className="mx-auto w-40 h-40 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center text-6xl">
            📱
          </div>
          <p className="text-sm text-slate-600">
            Your khata syncs automatically. Install the FinBook mobile app (Flutter) from
            the <code className="text-xs bg-slate-100 px-1 rounded">mobile/</code> project and log in with the same account.
          </p>
          <p className="text-xs text-slate-400">100% Safe & Secure · Data backed up to your server</p>
        </div>
      </Modal>

      {/* ── Book switcher ── */}
      <Modal open={switcher} title="Your FinBook" onClose={() => setSwitcher(false)}>
        <div className="space-y-2">
          {businesses.map((b) => (
            <button
              key={b.id}
              onClick={() => { switchBusiness(b); setSwitcher(false); }}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition ${
                b.id === business?.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Avatar name={b.name} size={36} />
              <div className="flex-1">
                <p className="font-semibold text-sm">{b.name}</p>
                <p className="text-xs text-slate-500">{b.partyCount ?? 0} parties · {b.role}</p>
              </div>
              {b.id === business?.id && <span className="text-brand-600 font-bold">✓</span>}
            </button>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <input
            className="input"
            placeholder="New FinBook name"
            value={newBook}
            onChange={(e) => setNewBook(e.target.value)}
          />
          <button className="btn-primary whitespace-nowrap" onClick={createBook}>+ Create</button>
        </div>
        {err && <p className="text-red-600 text-sm mt-2">{err}</p>}
      </Modal>

      {/* ── Help & Documentation ── */}
      <Modal open={helpOpen} title="📚 FinBook Help & Tutorials" onClose={() => { setHelpOpen(false); setTutorialStep(0); }} wide>
        {tutorialStep === 0 ? (
          <div className="text-center space-y-4">
            <div className="text-6xl">🚀</div>
            <h3 className="text-lg font-bold text-slate-900">Welcome to FinBook!</h3>
            <p className="text-sm text-slate-600">Your complete business management solution. Pick a topic — every guide has real screenshots from the app.</p>
            <div className="grid grid-cols-2 gap-3 text-left">
              {TUTORIALS.map((t, i) => (
                <button key={t.title}
                  className="p-3 rounded-lg border border-slate-200 hover:border-brand-500 text-left transition"
                  onClick={() => setTutorialStep(i + 1)}>
                  <div className="text-2xl mb-2">{t.icon}</div>
                  <p className="font-semibold text-sm">{t.title}</p>
                  <p className="text-xs text-slate-500">{t.blurb}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <TutorialTopic step={tutorialStep} onStep={setTutorialStep} />
        )}
      </Modal>
    </div>
  );
}

/** One tutorial topic: screenshots, numbered steps, prev/next navigation. */
function TutorialTopic({ step, onStep }: { step: number; onStep: (s: number) => void }) {
  const t = TUTORIALS[step - 1];
  const last = step === TUTORIALS.length;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <button onClick={() => onStep(0)} className="hover:text-slate-700">← All topics</button>
        <span>·</span>
        <span>Topic {step} of {TUTORIALS.length}</span>
      </div>
      <h3 className="text-lg font-bold text-slate-900">{t.icon} {t.title}</h3>
      <div className="space-y-3">
        {t.images.map((img) => (
          <img key={img.src} src={img.src} alt={img.alt} loading="lazy"
            className="w-full rounded-xl border border-slate-200 shadow-sm" />
        ))}
      </div>
      <ol className="space-y-3 text-sm text-slate-700">
        {t.steps.map((s, idx) => (
          <li key={idx} className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-500 text-white flex items-center justify-center text-xs font-bold">{idx + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        {step > 1 && (
          <button className="btn-outline flex-1 justify-center" onClick={() => onStep(step - 1)}>← Previous</button>
        )}
        <button className="btn-primary flex-1 justify-center" onClick={() => onStep(last ? 0 : step + 1)}>
          {last ? '← Back to all topics' : `Next: ${TUTORIALS[step].title} →`}
        </button>
      </div>
    </div>
  );
}
