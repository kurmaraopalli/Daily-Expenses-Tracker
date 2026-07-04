// IndexedDB Constants
const DB_NAME = 'ExpensesTrackerDB';
const DB_VERSION = 1;

let db;
let transactions = [];
let categories = [];
let recurringBills = [];
let budgetLimit = 3000;
let charts = {};
let currentView = 'dashboard';
let activeOcrFile = null;
let editingExpenseId = null;
let syncSettings = {
  username: '',
  repo: '',
  token: '',
  filepath: 'data.json',
  active: false
};
let syncSha = '';
let activeTheme = 'cosmic';

// Initial Seeding Data
const DEFAULT_CATEGORIES = [
  { id: 'cat-food', name: 'Food & Dining', color: '#05ffc4' },
  { id: 'cat-groceries', name: 'Groceries', color: '#00f5ff' },
  { id: 'cat-housing', name: 'Rent & Housing', color: '#b388ff' },
  { id: 'cat-utilities', name: 'Utilities', color: '#ffaa00' },
  { id: 'cat-entertainment', name: 'Entertainment', color: '#ff2a6d' },
  { id: 'cat-transport', name: 'Transportation', color: '#3a86ff' },
  { id: 'cat-sub', name: 'Subscriptions', color: '#ff007f' },
  { id: 'cat-misc', name: 'Miscellaneous', color: '#71717a' }
];

const SAMPLE_TRANSACTIONS = [];
const SAMPLE_RECURRING = [];

// Helper to calculate relative date strings
function getOffsetDate(daysOffset) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split('T')[0];
}

// ----------------------------------------------------
// 1. DATABASE SETUP
// ----------------------------------------------------
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      showToast('Database failed to load', 'error');
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const dbInstance = event.target.result;
      
      // Store houses
      if (!dbInstance.objectStoreNames.contains('expenses')) {
        dbInstance.createObjectStore('expenses', { keyPath: 'id' });
      }
      if (!dbInstance.objectStoreNames.contains('categories')) {
        dbInstance.createObjectStore('categories', { keyPath: 'id' });
      }
      if (!dbInstance.objectStoreNames.contains('recurring')) {
        dbInstance.createObjectStore('recurring', { keyPath: 'id' });
      }
      if (!dbInstance.objectStoreNames.contains('settings')) {
        dbInstance.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
}

// Generic CRUD operations
function dbGetAll(storeName) {
  return new Promise((resolve) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
  });
}

function dbPut(storeName, data) {
  return new Promise((resolve) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve();
  });
}

function dbDelete(storeName, key) {
  return new Promise((resolve) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
  });
}

// ----------------------------------------------------
// 2. STATE INITIALIZATION & SEEDING
// ----------------------------------------------------
async function initializeApp() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('env') === 'desktop') {
    document.body.classList.add('desktop-app');
  }

  await initDB();

  // Load configuration/settings
  const settings = await dbGetAll('settings');
  const budgetConfig = settings.find(s => s.key === 'budgetLimit');
  if (budgetConfig) {
    budgetLimit = budgetConfig.value;
  } else {
    await dbPut('settings', { key: 'budgetLimit', value: budgetLimit });
  }

  // Load sync configuration
  const syncConfig = settings.find(s => s.key === 'syncSettings');
  if (syncConfig) {
    syncSettings = syncConfig.value;
  }

  // Load active theme
  const themeConfig = settings.find(s => s.key === 'activeTheme');
  if (themeConfig) {
    activeTheme = themeConfig.value;
  }
  changeTheme(activeTheme);

  // Load and seed categories
  categories = await dbGetAll('categories');
  if (categories.length === 0) {
    for (const cat of DEFAULT_CATEGORIES) {
      await dbPut('categories', cat);
    }
    categories = await dbGetAll('categories');
  }

  // Load and seed expenses (transactions)
  transactions = await dbGetAll('expenses');
  if (transactions.length === 0) {
    for (const tx of SAMPLE_TRANSACTIONS) {
      await dbPut('expenses', tx);
    }
    transactions = await dbGetAll('expenses');
  }

  // Load and seed recurring items
  recurringBills = await dbGetAll('recurring');
  if (recurringBills.length === 0) {
    for (const rec of SAMPLE_RECURRING) {
      await dbPut('recurring', rec);
    }
    recurringBills = await dbGetAll('recurring');
  }

  // If GitHub sync is active, perform pull
  if (syncSettings && syncSettings.active) {
    updateSyncBadge('syncing', 'Syncing...');
    await fetchFromGitHub();
  } else {
    updateSyncBadge('offline', 'Local Mode');
  }

  // Process any due recurring expenses
  await checkRecurringExpenses();

  // Purge transaction logs older than 2 years
  await purgeOldTransactions();

  // Load Lucide Icons
  lucide.createIcons();

  // Set up forms categories lists
  populateCategorySelects();
  
  // Render views & charts
  renderSidebarCategories();
  renderAllViews();
  initCharts();
}

async function purgeOldTransactions() {
  const limitDate = new Date();
  limitDate.setFullYear(limitDate.getFullYear() - 2);
  const limitStr = limitDate.toISOString().split('T')[0];

  const oldTransactions = transactions.filter(t => t.date < limitStr);
  
  if (oldTransactions.length > 0) {
    return new Promise((resolve) => {
      const tx = db.transaction(['expenses'], 'readwrite');
      const store = tx.objectStore('expenses');
      
      oldTransactions.forEach(t => {
        store.delete(t.id);
      });
      
      tx.oncomplete = () => {
        transactions = transactions.filter(t => t.date >= limitStr);
        showToast(`Auto-purged ${oldTransactions.length} transaction logs older than 2 years.`, 'warning');
        resolve();
      };
      
      tx.onerror = () => {
        console.error('Error during auto-purge');
        resolve();
      };
    });
  }
}

// Check if recurring expenses should be posted
async function checkRecurringExpenses() {
  const today = new Date().toISOString().split('T')[0];
  let updated = false;

  for (const bill of recurringBills) {
    while (bill.nextDate <= today) {
      // Auto post transaction
      const newTx = {
        id: 't-auto-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        merchant: bill.name,
        amount: parseFloat(bill.amount),
        date: bill.nextDate,
        category: bill.category,
        class: bill.class,
        notes: `Auto-generated recurring payment`
      };

      await dbPut('expenses', newTx);
      transactions.push(newTx);

      // Increment nextDate depending on frequency
      const next = new Date(bill.nextDate);
      if (bill.frequency === 'weekly') {
        next.setDate(next.getDate() + 7);
      } else if (bill.frequency === 'monthly') {
        next.setMonth(next.getMonth() + 1);
      } else if (bill.frequency === 'annually') {
        next.setFullYear(next.getFullYear() + 1);
      }
      
      const prevDate = bill.nextDate;
      bill.nextDate = next.toISOString().split('T')[0];
      await dbPut('recurring', bill);
      updated = true;

      showToast(`Auto-posted recurring bill: "${bill.name}" for ₹${bill.amount} on ${prevDate}`, 'success');
    }
  }

  if (updated) {
    transactions = await dbGetAll('expenses');
    if (syncSettings.active) pushToGitHub();
  }
}

// ----------------------------------------------------
// 3. UI RENDERING LOGIC
// ----------------------------------------------------
function renderAllViews() {
  renderSidebarBudget();
  renderDashboardStats();
  renderDashboardRecentTable();
  renderBoard();
  renderLogsTable();
  renderRecurringTable();
}

function switchView(viewName) {
  currentView = viewName;
  
  // Update desktop sidebar nav links active class
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });
  const deskLink = document.getElementById(`nav-${viewName}`);
  if (deskLink) deskLink.classList.add('active');

  // Update mobile bottom nav links active class
  document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.classList.remove('active');
  });
  const mobLink = document.getElementById(`m-nav-${viewName}`);
  if (mobLink) mobLink.classList.add('active');

  // Update views display class
  document.querySelectorAll('.view-container').forEach(view => {
    view.classList.remove('active-view');
  });
  document.getElementById(`view-${viewName}`).classList.add('active-view');

  // Update header content
  const viewTitles = {
    dashboard: { title: 'Dashboard', subtitle: 'Overview of your monthly spending habits.' },
    board: { title: 'DND Budgeting Board', subtitle: 'Drag transactions to classify under Needs, Wants, or Savings.' },
    logs: { title: 'Expense Logs', subtitle: 'Search, filter, and review historical logs.' },
    recurring: { title: 'Recurring Bills', subtitle: 'Schedule and manage periodic subscription expenses.' }
  };
  
  document.getElementById('view-title').innerText = viewTitles[viewName].title;
  document.getElementById('view-subtitle').innerText = viewTitles[viewName].subtitle;

  // Refresh view specific components
  if (viewName === 'dashboard') {
    updateCharts();
  } else if (viewName === 'board') {
    renderBoard();
  } else if (viewName === 'logs') {
    applyFilters();
  } else if (viewName === 'recurring') {
    renderRecurringTable();
  }

  lucide.createIcons();
}

// Sidebar Renderings
function renderSidebarBudget() {
  const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
  const currentMonthTotal = transactions
    .filter(t => t.date.substring(0, 7) === currentMonth)
    .reduce((sum, t) => sum + t.amount, 0);

  const percent = Math.min(Math.round((currentMonthTotal / budgetLimit) * 100), 100);
  
  document.getElementById('sidebar-budget-text').innerText = `₹${currentMonthTotal.toFixed(2)} / ₹${budgetLimit.toFixed(0)}`;
  const prg = document.getElementById('sidebar-budget-progress');
  prg.style.width = `${percent}%`;

  // Color coding budget bar
  if (percent >= 100) {
    prg.style.background = 'var(--danger)';
  } else if (percent >= 80) {
    prg.style.background = 'var(--warning)';
  } else {
    prg.style.background = 'linear-gradient(90deg, var(--accent), var(--primary))';
  }

  document.getElementById('sidebar-budget-percentage').innerText = `${percent}% spent`;
}

function renderSidebarCategories() {
  const list = document.getElementById('sidebar-category-list');
  list.innerHTML = '';
  
  categories.forEach(cat => {
    const row = document.createElement('div');
    row.className = 'category-item-row';
    row.innerHTML = `
      <div class="category-badge-pill">
        <span class="category-color-dot" style="background-color: ${cat.color}"></span>
        <span>${cat.name}</span>
      </div>
      <button class="category-delete-btn" onclick="deleteCategory('${cat.id}')">
        <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
      </button>
    `;
    list.appendChild(row);
  });
  
  lucide.createIcons();
}

function populateCategorySelects() {
  const select1 = document.getElementById('expense-category');
  const select2 = document.getElementById('recurring-category');
  const select3 = document.getElementById('filter-category');
  
  const optionsHtml = categories.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('');
  
  select1.innerHTML = optionsHtml;
  select2.innerHTML = optionsHtml;
  select3.innerHTML = `<option value="">All Categories</option>` + optionsHtml;
}

// Dashboard Views Renderings
function renderDashboardStats() {
  const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
  const prevMonth = getOffsetDate(-30).substring(0, 7);

  const monthExpenses = transactions.filter(t => t.date.substring(0, 7) === currentMonth);
  const prevMonthExpenses = transactions.filter(t => t.date.substring(0, 7) === prevMonth);

  const totalSpend = monthExpenses.reduce((sum, t) => sum + t.amount, 0);
  const prevTotalSpend = prevMonthExpenses.reduce((sum, t) => sum + t.amount, 0);

  const needsSpend = monthExpenses.filter(t => t.class === 'need').reduce((sum, t) => sum + t.amount, 0);
  const wantsSpend = monthExpenses.filter(t => t.class === 'want').reduce((sum, t) => sum + t.amount, 0);
  const savingsSpend = monthExpenses.filter(t => t.class === 'saving').reduce((sum, t) => sum + t.amount, 0);

  document.getElementById('stats-total-spend').innerText = `₹${totalSpend.toFixed(2)}`;
  document.getElementById('stats-needs-spend').innerText = `₹${needsSpend.toFixed(2)}`;
  document.getElementById('stats-wants-spend').innerText = `₹${wantsSpend.toFixed(2)}`;
  document.getElementById('stats-savings-spend').innerText = `₹${savingsSpend.toFixed(2)}`;

  // Set Percentage labels
  const getPercent = (amount) => totalSpend > 0 ? Math.round((amount / totalSpend) * 100) : 0;
  document.getElementById('stats-needs-percent').innerText = `${getPercent(needsSpend)}% of total`;
  document.getElementById('stats-wants-percent').innerText = `${getPercent(wantsSpend)}% of total`;
  document.getElementById('stats-savings-percent').innerText = `${getPercent(savingsSpend)}% of total`;

  // Compare trends vs last month
  const trendSpan = document.getElementById('stats-trend-compare');
  if (prevTotalSpend > 0) {
    const diff = ((totalSpend - prevTotalSpend) / prevTotalSpend) * 100;
    if (diff > 0) {
      trendSpan.className = 'card-trend trend-up';
      trendSpan.innerHTML = `<i data-lucide="trending-up"></i> <span>+${diff.toFixed(1)}% vs last month</span>`;
    } else {
      trendSpan.className = 'card-trend trend-down';
      trendSpan.innerHTML = `<i data-lucide="trending-down"></i> <span>${diff.toFixed(1)}% vs last month</span>`;
    }
  } else {
    trendSpan.className = 'card-trend';
    trendSpan.innerHTML = `<span>No previous data</span>`;
  }
}

function renderDashboardRecentTable() {
  const tbody = document.getElementById('dashboard-recent-tbody');
  tbody.innerHTML = '';

  const recent = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No recent transactions log.</td></tr>`;
    return;
  }

  recent.forEach(tx => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-date">${tx.date}</td>
      <td class="td-merchant">${tx.merchant}</td>
      <td>${tx.category}</td>
      <td><span class="badge badge-${tx.class}">${tx.class.toUpperCase()}</span></td>
      <td class="item-amount">₹${tx.amount.toFixed(2)}</td>
      <td class="table-actions">
        <button class="action-btn edit" onclick="editExpense('${tx.id}')"><i data-lucide="pencil"></i></button>
        <button class="action-btn delete" onclick="deleteExpense('${tx.id}')"><i data-lucide="trash-2"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Expense Logs Views Renderings
function renderLogsTable(filteredData = transactions) {
  const tbody = document.getElementById('logs-tbody');
  tbody.innerHTML = '';

  const sorted = [...filteredData].sort((a, b) => b.date.localeCompare(a.date));

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><i data-lucide="inbox"></i><p>No matching expenses found.</p></td></tr>`;
    lucide.createIcons();
    return;
  }

  sorted.forEach(tx => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-date">${tx.date}</td>
      <td class="td-merchant">${tx.merchant}</td>
      <td>${tx.category}</td>
      <td><span class="badge badge-${tx.class}">${tx.class.toUpperCase()}</span></td>
      <td class="item-amount">₹${tx.amount.toFixed(2)}</td>
      <td class="table-actions">
        <button class="action-btn edit" onclick="editExpense('${tx.id}')"><i data-lucide="pencil"></i></button>
        <button class="action-btn delete" onclick="deleteExpense('${tx.id}')"><i data-lucide="trash-2"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  lucide.createIcons();
}

function applyFilters() {
  const query = document.getElementById('search-logs-input').value.toLowerCase();
  const cat = document.getElementById('filter-category').value;
  const cls = document.getElementById('filter-class').value;
  const start = document.getElementById('filter-date-start').value;
  const end = document.getElementById('filter-date-end').value;

  const filtered = transactions.filter(t => {
    const matchQuery = t.merchant.toLowerCase().includes(query) || (t.notes && t.notes.toLowerCase().includes(query));
    const matchCat = cat ? t.category === cat : true;
    const matchCls = cls ? t.class === cls : true;
    const matchStart = start ? t.date >= start : true;
    const matchEnd = end ? t.date <= end : true;
    return matchQuery && matchCat && matchCls && matchStart && matchEnd;
  });

  renderLogsTable(filtered);
}

function clearAllFilters() {
  document.getElementById('search-logs-input').value = '';
  document.getElementById('filter-category').value = '';
  document.getElementById('filter-class').value = '';
  document.getElementById('filter-date-start').value = '';
  document.getElementById('filter-date-end').value = '';
  renderLogsTable(transactions);
}

// Drag & Drop Board Rendering
function renderBoard() {
  const colNeed = document.getElementById('list-need');
  const colWant = document.getElementById('list-want');
  const colSaving = document.getElementById('list-saving');

  colNeed.innerHTML = '';
  colWant.innerHTML = '';
  colSaving.innerHTML = '';

  const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
  const monthExpenses = transactions.filter(t => t.date.substring(0, 7) === currentMonth);

  const needs = monthExpenses.filter(t => t.class === 'need');
  const wants = monthExpenses.filter(t => t.class === 'want');
  const savings = monthExpenses.filter(t => t.class === 'saving');

  // Update counts
  document.getElementById('count-need').innerText = needs.length;
  document.getElementById('count-want').innerText = wants.length;
  document.getElementById('count-saving').innerText = savings.length;

  const createItemEl = (tx) => {
    const el = document.createElement('div');
    el.className = 'dnd-item';
    el.draggable = true;
    el.id = `dnd-${tx.id}`;
    el.ondragstart = (e) => handleDragStart(e, tx.id);
    el.ondragend = handleDragEnd;
    el.innerHTML = `
      <div class="item-merchant">${tx.merchant}</div>
      <div class="item-meta">
        <span class="item-category">${tx.category}</span>
        <span class="item-amount">₹${tx.amount.toFixed(2)}</span>
      </div>
    `;
    return el;
  };

  needs.forEach(tx => colNeed.appendChild(createItemEl(tx)));
  wants.forEach(tx => colWant.appendChild(createItemEl(tx)));
  savings.forEach(tx => colSaving.appendChild(createItemEl(tx)));
}

// Recurring View Renderings
function renderRecurringTable() {
  const tbody = document.getElementById('recurring-tbody');
  tbody.innerHTML = '';

  if (recurringBills.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><i data-lucide="calendar"></i><p>No active recurring bills or subscriptions scheduled.</p></td></tr>`;
    lucide.createIcons();
    return;
  }

  recurringBills.forEach(bill => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-merchant">${bill.name}</td>
      <td style="text-transform: capitalize;">${bill.frequency}</td>
      <td>${bill.category}</td>
      <td><span class="badge badge-${bill.class}">${bill.class.toUpperCase()}</span></td>
      <td class="item-amount">₹${parseFloat(bill.amount).toFixed(2)}</td>
      <td class="td-date">${bill.nextDate}</td>
      <td class="table-actions">
        <button class="action-btn delete" onclick="deleteRecurring('${bill.id}')"><i data-lucide="trash-2"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  lucide.createIcons();
}

// ----------------------------------------------------
// 4. ACTION & EVENT HANDLERS
// ----------------------------------------------------
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const iconName = type === 'success' ? 'check-circle' : type === 'warning' ? 'alert-triangle' : 'x-circle';
  toast.innerHTML = `
    <i class="toast-icon" data-lucide="${iconName}"></i>
    <span class="toast-message">${message}</span>
  `;
  
  container.appendChild(toast);
  lucide.createIcons();

  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 50);

  // Auto remove
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Category Management
async function addNewCategory() {
  const input = document.getElementById('new-category-input');
  const name = input.value.trim();
  if (!name) return;

  // Check unique
  if (categories.find(c => c.name.toLowerCase() === name.toLowerCase())) {
    showToast('Category already exists!', 'warning');
    return;
  }

  // Assign a random color
  const palette = ['#8b5cf6', '#06b6d4', '#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#ec4899', '#f43f5e', '#14b8a6', '#f97316'];
  const color = palette[categories.length % palette.length];
  const newCat = {
    id: 'cat-' + Date.now(),
    name,
    color
  };

  await dbPut('categories', newCat);
  categories.push(newCat);
  input.value = '';

  populateCategorySelects();
  renderSidebarCategories();
  showToast(`Added category: "${name}"`, 'success');
  if (syncSettings.active) pushToGitHub();
}

async function deleteCategory(id) {
  await dbDelete('categories', id);
  categories = categories.filter(c => c.id !== id);
  populateCategorySelects();
  renderSidebarCategories();
  showToast('Category removed', 'warning');
  if (syncSettings.active) pushToGitHub();
}

// Expense Manual Entry Actions
function openAddExpenseModal() {
  editingExpenseId = null;
  document.getElementById('expense-modal-title').innerHTML = `<i data-lucide="plus-circle"></i> Log Expense`;
  document.getElementById('expense-id').value = '';
  document.getElementById('expense-merchant').value = '';
  document.getElementById('expense-amount').value = '';
  document.getElementById('expense-notes').value = '';
  document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
  
  document.getElementById('expense-modal').classList.add('active');
  lucide.createIcons();
}

async function editExpense(id) {
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;

  editingExpenseId = id;
  document.getElementById('expense-modal-title').innerHTML = `<i data-lucide="pencil"></i> Edit Expense`;
  document.getElementById('expense-id').value = tx.id;
  document.getElementById('expense-merchant').value = tx.merchant;
  document.getElementById('expense-amount').value = tx.amount;
  document.getElementById('expense-date').value = tx.date;
  document.getElementById('expense-category').value = tx.category;
  document.getElementById('expense-class').value = tx.class;
  document.getElementById('expense-notes').value = tx.notes || '';

  document.getElementById('expense-modal').classList.add('active');
  lucide.createIcons();
}

function closeExpenseModal() {
  document.getElementById('expense-modal').classList.remove('active');
  editingExpenseId = null;
}

async function saveExpense(event) {
  event.preventDefault();
  
  const id = document.getElementById('expense-id').value || 't-' + Date.now();
  const merchant = document.getElementById('expense-merchant').value.trim();
  const amount = parseFloat(document.getElementById('expense-amount').value);
  const date = document.getElementById('expense-date').value;
  const category = document.getElementById('expense-category').value;
  const cls = document.getElementById('expense-class').value;
  const notes = document.getElementById('expense-notes').value.trim();

  if (!merchant || isNaN(amount) || !date || !category || !cls) {
    showToast('Please fill in all required fields.', 'warning');
    return;
  }

  const expenseItem = { id, merchant, amount, date, category, class: cls, notes };
  
  await dbPut('expenses', expenseItem);
  
  if (editingExpenseId) {
    transactions = transactions.map(t => t.id === id ? expenseItem : t);
    showToast('Expense updated successfully!', 'success');
  } else {
    transactions.push(expenseItem);
    showToast('New expense logged!', 'success');
  }

  closeExpenseModal();
  renderAllViews();
  updateCharts();
  if (syncSettings.active) pushToGitHub();
}

async function deleteExpense(id) {
  if (confirm('Are you sure you want to delete this expense?')) {
    await dbDelete('expenses', id);
    transactions = transactions.filter(t => t.id !== id);
    renderAllViews();
    updateCharts();
    showToast('Expense transaction deleted', 'warning');
    if (syncSettings.active) pushToGitHub();
  }
}

// Auto-Categorization Helper
function suggestCategory() {
  const merchant = document.getElementById('expense-merchant').value.toLowerCase();
  const select = document.getElementById('expense-category');
  
  const ruleMapping = {
    'groceries': ['walmart', 'grocery', 'whole foods', 'target', 'supermarket', 'safeway', 'kroger', 'aldi', 'trader joe'],
    'food': ['mcdonald', 'starbucks', 'sushi', 'pizza', 'restaurant', 'cafe', 'burger', 'eats', 'uber eats', 'doordash', 'bistro'],
    'housing': ['rent', 'landlord', 'mortgage', 'housing', 'lease'],
    'utilities': ['electricity', 'power', 'water', 'sewer', 'gas', 'internet', 'comcast', 'verizon', 't-mobile', 'at&t'],
    'entertainment': ['cinema', 'movie', 'concert', 'steam', 'game', 'spotify', 'disney', 'playstation', 'nintendo'],
    'transport': ['uber', 'lyft', 'subway', 'metro', 'transit', 'gasoline', 'shell', 'chevron', 'parking'],
    'sub': ['netflix', 'apple', 'amazon prime', 'patreon', 'adobe', 'office 365', 'github']
  };

  for (const [catName, keywords] of Object.entries(ruleMapping)) {
    if (keywords.some(kw => merchant.includes(kw))) {
      // Find matching category object
      const found = categories.find(c => c.name.toLowerCase().includes(catName));
      if (found) {
        select.value = found.name;
        break;
      }
    }
  }
}

// Settings Modal Actions
function openBudgetModal() {
  document.getElementById('budget-limit-input').value = budgetLimit;
  const selector = document.getElementById('theme-selector');
  if (selector) selector.value = activeTheme;
  document.getElementById('budget-modal').classList.add('active');
}

function closeBudgetModal() {
  document.getElementById('budget-modal').classList.remove('active');
}

async function saveBudgetLimit(event) {
  event.preventDefault();
  const limit = parseInt(document.getElementById('budget-limit-input').value);
  if (isNaN(limit) || limit <= 0) return;

  budgetLimit = limit;
  await dbPut('settings', { key: 'budgetLimit', value: limit });
  closeBudgetModal();
  renderSidebarBudget();
  showToast(`Monthly budget limit set to ₹${limit}`, 'success');
  if (syncSettings.active) pushToGitHub();
}

async function changeTheme(themeName) {
  document.body.classList.remove('theme-cosmic', 'theme-emerald', 'theme-cyberpunk', 'theme-ocean', 'theme-slate');
  document.body.classList.add('theme-' + themeName);
  activeTheme = themeName;
  
  await dbPut('settings', { key: 'activeTheme', value: themeName });
  
  // Update dropdown selector in settings modal
  const selector = document.getElementById('theme-selector');
  if (selector) {
    selector.value = themeName;
  }
  
  // Update sidebar theme picker dots
  document.querySelectorAll('.theme-dot').forEach(dot => {
    dot.classList.remove('active');
    if (dot.getAttribute('data-theme') === themeName) {
      dot.classList.add('active');
    }
  });
  
  updateChartsColorTheme();
}

function updateChartsColorTheme() {
  if (!charts.trend) return;
  
  const style = getComputedStyle(document.body);
  const primary = style.getPropertyValue('--primary').trim();
  
  charts.trend.data.datasets[0].borderColor = primary;
  charts.trend.data.datasets[0].backgroundColor = primary + '1a'; // 10% opacity
  charts.trend.update();
}

// Recurring Modal Actions
function openAddRecurringModal() {
  document.getElementById('recurring-name').value = '';
  document.getElementById('recurring-amount').value = '';
  document.getElementById('recurring-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('recurring-modal').classList.add('active');
}

function closeRecurringModal() {
  document.getElementById('recurring-modal').classList.remove('active');
}

async function saveRecurring(event) {
  event.preventDefault();
  
  const name = document.getElementById('recurring-name').value.trim();
  const amount = parseFloat(document.getElementById('recurring-amount').value);
  const frequency = document.getElementById('recurring-frequency').value;
  const category = document.getElementById('recurring-category').value;
  const cls = document.getElementById('recurring-class').value;
  const date = document.getElementById('recurring-date').value;

  if (!name || isNaN(amount) || !date) return;

  const newBill = {
    id: 'r-' + Date.now(),
    name,
    amount,
    frequency,
    category,
    class: cls,
    nextDate: date
  };

  await dbPut('recurring', newBill);
  recurringBills.push(newBill);
  closeRecurringModal();
  renderRecurringTable();
  showToast(`Scheduled bill: ${name}`, 'success');
  if (syncSettings.active) pushToGitHub();
}

async function deleteRecurring(id) {
  if (confirm('Cancel this recurring schedule?')) {
    await dbDelete('recurring', id);
    recurringBills = recurringBills.filter(r => r.id !== id);
    renderRecurringTable();
    showToast('Recurring bill cancelled', 'warning');
    if (syncSettings.active) pushToGitHub();
  }
}

// ----------------------------------------------------
// 5. DRAG & DROP LOGIC
// ----------------------------------------------------
let draggedId = null;

function handleDragStart(e, id) {
  draggedId = id;
  e.dataTransfer.setData('text/plain', id);
  e.target.classList.add('dragging');
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.dnd-column').forEach(c => c.classList.remove('drag-over'));
  draggedId = null;
}

function allowDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function handleDrop(e, targetClass) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  
  const id = e.dataTransfer.getData('text/plain') || draggedId;
  if (!id) return;

  const tx = transactions.find(t => t.id === id);
  if (tx && tx.class !== targetClass) {
    tx.class = targetClass;
    await dbPut('expenses', tx);
    showToast(`Updated "${tx.merchant}" budget classification to ${targetClass.toUpperCase()}`, 'success');
    renderAllViews();
    updateCharts();
    if (syncSettings.active) pushToGitHub();
  }
}

// ----------------------------------------------------
// 6. OCR SCANNER HANDLERS
// ----------------------------------------------------
let currentOcrTab = 'upload';
let cameraStream = null;

function openOcrModal() {
  activeOcrFile = null;
  currentOcrTab = 'upload';
  
  // Show base structure
  document.getElementById('ocr-preview-container').style.display = 'none';
  document.getElementById('ocr-progress').style.display = 'none';
  document.getElementById('ocr-upload-content').style.display = 'block';
  document.getElementById('ocr-camera-content').style.display = 'none';
  document.querySelector('.ocr-tabs').style.display = 'flex';
  
  // Active classes
  document.getElementById('tab-ocr-upload').classList.add('active-tab');
  document.getElementById('tab-ocr-camera').classList.remove('active-tab');

  document.getElementById('ocr-btn-action').disabled = true;
  document.getElementById('ocr-btn-action').innerText = 'Start Extracting';
  document.getElementById('ocr-modal').classList.add('active');
}

function closeOcrModal() {
  stopCamera();
  document.getElementById('ocr-modal').classList.remove('active');
}

function switchOcrTab(tabName) {
  currentOcrTab = tabName;
  
  // Update buttons
  document.getElementById('tab-ocr-upload').classList.remove('active-tab');
  document.getElementById('tab-ocr-camera').classList.remove('active-tab');
  document.getElementById(`tab-ocr-${tabName}`).classList.add('active-tab');

  // Update tabs
  if (tabName === 'upload') {
    document.getElementById('ocr-upload-content').style.display = 'block';
    document.getElementById('ocr-camera-content').style.display = 'none';
    stopCamera();
  } else {
    document.getElementById('ocr-upload-content').style.display = 'none';
    document.getElementById('ocr-camera-content').style.display = 'flex';
  }
}

async function startCamera() {
  const video = document.getElementById('ocr-video');
  const placeholder = document.getElementById('camera-placeholder');
  const btnCapture = document.getElementById('btn-capture-photo');
  const btnStart = document.getElementById('btn-start-camera');

  try {
    stopCamera(); // Stop active tracks

    const constraints = {
      video: {
        facingMode: 'environment', // Ask for back camera on smartphones
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = cameraStream;
    
    // UI Update
    placeholder.style.display = 'none';
    btnCapture.disabled = false;
    btnStart.innerHTML = `<i data-lucide="square" style="width: 14px; height: 14px;"></i> Turn Off Camera`;
    
    // Bind click to stop
    btnStart.onclick = stopCamera;
    lucide.createIcons();
    showToast('Camera feed connected!', 'success');
  } catch (err) {
    console.error('Camera access failed:', err);
    showToast('Failed to access device camera.', 'error');
  }
}

function stopCamera() {
  const video = document.getElementById('ocr-video');
  const placeholder = document.getElementById('camera-placeholder');
  const btnCapture = document.getElementById('btn-capture-photo');
  const btnStart = document.getElementById('btn-start-camera');

  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  
  if (video) video.srcObject = null;
  if (placeholder) placeholder.style.display = 'flex';
  if (btnCapture) btnCapture.disabled = true;
  
  if (btnStart) {
    btnStart.innerHTML = `<i data-lucide="play" style="width: 14px; height: 14px;"></i> Turn On Camera`;
    btnStart.onclick = startCamera;
    lucide.createIcons();
  }
}

function capturePhoto() {
  const video = document.getElementById('ocr-video');
  const canvas = document.getElementById('ocr-canvas');
  const context = canvas.getContext('2d');
  
  if (!cameraStream) return;

  // Set snapshot canvas size
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;

  // Capture frame
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Convert to dataUrl
  const dataUrl = canvas.toDataURL('image/jpeg');
  activeOcrFile = dataUrl;
  
  // Update preview
  const img = document.getElementById('ocr-img-preview');
  img.src = dataUrl;
  
  // Transition screens inside modal
  document.getElementById('ocr-upload-content').style.display = 'none';
  document.getElementById('ocr-camera-content').style.display = 'none';
  document.querySelector('.ocr-tabs').style.display = 'none';
  
  document.getElementById('ocr-preview-container').style.display = 'flex';
  document.getElementById('ocr-btn-action').disabled = false;
  
  stopCamera();
  showToast('Photo captured!', 'success');
}

function triggerOcrUpload() {
  document.getElementById('ocr-file-input').click();
}

function handleOcrDragOver(e) {
  e.preventDefault();
  document.getElementById('ocr-dropzone').classList.add('drag-active');
}

function handleOcrDragLeave(e) {
  e.preventDefault();
  document.getElementById('ocr-dropzone').classList.remove('drag-active');
}

function handleOcrDrop(e) {
  e.preventDefault();
  document.getElementById('ocr-dropzone').classList.remove('drag-active');
  
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    loadOcrFile(e.dataTransfer.files[0]);
  }
}

function processOcrFile(event) {
  if (event.target.files && event.target.files[0]) {
    loadOcrFile(event.target.files[0]);
  }
}

function loadOcrFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('File must be an image', 'error');
    return;
  }
  activeOcrFile = file;

  // Show preview
  const img = document.getElementById('ocr-img-preview');
  img.src = URL.createObjectURL(file);
  
  // Transition screens inside modal
  document.getElementById('ocr-upload-content').style.display = 'none';
  document.getElementById('ocr-camera-content').style.display = 'none';
  document.querySelector('.ocr-tabs').style.display = 'none';
  
  document.getElementById('ocr-preview-container').style.display = 'flex';
  document.getElementById('ocr-btn-action').disabled = false;
}

async function startScanner() {
  if (!activeOcrFile) return;

  document.getElementById('ocr-btn-action').disabled = true;
  document.getElementById('scanner-overlay').style.display = 'block';
  document.getElementById('ocr-progress').style.display = 'block';
  
  const progressBar = document.getElementById('ocr-progress-bar');
  const progressText = document.getElementById('ocr-progress-text');

  progressBar.style.width = '10%';
  progressText.innerText = 'Setting up OCR Sandbox...';

  try {
    const worker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          const progress = Math.round(m.progress * 100);
          progressBar.style.width = `${progress}%`;
          progressText.innerText = `Scanning: ${progress}% completed`;
        }
      }
    });

    const ret = await worker.recognize(activeOcrFile);
    await worker.terminate();

    progressBar.style.width = '100%';
    progressText.innerText = 'Completed. Extracting fields...';
    
    // Scan and parse values
    const parsed = parseReceiptText(ret.data.text);
    
    setTimeout(() => {
      closeOcrModal();
      openAddExpenseModal();
      
      // Auto fill values
      document.getElementById('expense-merchant').value = parsed.merchant;
      document.getElementById('expense-amount').value = parsed.amount.toFixed(2);
      document.getElementById('expense-date').value = parsed.date;
      document.getElementById('expense-notes').value = `OCR Scanned Receipt`;
      suggestCategory();
      
      showToast('Receipt scanned! Verify and adjust extracted fields.', 'success');
    }, 800);

  } catch (error) {
    console.error(error);
    showToast('OCR recognition failed. Please input manually.', 'error');
    document.getElementById('scanner-overlay').style.display = 'none';
    document.getElementById('ocr-btn-action').disabled = false;
  }
}

// Regex scanning algorithm for receipts
function parseReceiptText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let merchant = 'Unknown Merchant';
  let total = 0.00;
  let date = new Date().toISOString().split('T')[0];

  // Try to find merchant name (first lines with clean letters)
  if (lines.length > 0) {
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const cleanLine = lines[i].replace(/[^a-zA-Z\s]/g, '').trim();
      if (cleanLine.length > 3) {
        merchant = cleanLine;
        break;
      }
    }
  }

  // Expanded total keywords matching typical invoice/receipt footers
  const totalKeywords = /(?:total|grand\s*total|net|amount|due|payment|charge|items|qty|invoice\s*value|value|taxable|val|inr|rs)/i;
  
  // Match numbers with optional decimal fractions (dot or comma)
  const pricePattern = /\b\d+(?:[.,]\d{2})?\b/g;
  let possibleAmounts = [];

  for (let line of lines) {
    // Clean currency and special notations
    const cleanLine = line.replace(/[₹$Rs.\-\/]/gi, ' ').trim();
    const matches = cleanLine.match(pricePattern);
    if (matches) {
      matches.forEach(m => {
        const val = parseFloat(m.replace(',', '.'));
        if (!isNaN(val) && val > 0 && val < 200000) {
          possibleAmounts.push(val);
        }
      });
    }
    
    // Scan keyword matched lines for potential total amounts
    if (totalKeywords.test(cleanLine)) {
      const lineMatches = cleanLine.match(/\b\d+(?:[.,]\d{2})?\b/g);
      if (lineMatches) {
        lineMatches.forEach(m => {
          const val = parseFloat(m.replace(',', '.'));
          // Take the largest value on total lines
          if (val > total && val < 200000) {
            total = val;
          }
        });
      }
    }
  }

  // Fallback 1: If no total keyword matched, take the maximum matched price
  if (total === 0 && possibleAmounts.length > 0) {
    total = Math.max(...possibleAmounts);
  }
  
  // Fallback 2: Handle specific grocery receipt formats: "Items: XX Qty: YY TOTAL_AMOUNT"
  if (total === 0 || total < 10) { // Check if total is suspiciously low
    for (let line of lines) {
      if (/items|qty/i.test(line)) {
        const numbers = line.match(/\d+(?:[.,]\d{2})?/g);
        if (numbers && numbers.length >= 2) {
          const lastNum = parseFloat(numbers[numbers.length - 1].replace(',', '.'));
          if (lastNum > total && lastNum < 200000) {
            total = lastNum;
          }
        }
      }
    }
  }

  // Date parsing with support for DD/MM/YYYY and YYYY-MM-DD
  const datePattern = /(\d{4}[-/]\d{2}[-/]\d{2})|(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/g;
  for (let line of lines) {
    const match = line.match(datePattern);
    if (match) {
      try {
        const rawDate = match[0].replace(/\//g, '-');
        const parts = rawDate.split('-');
        let parsed = new Date(rawDate);
        
        // Handle DD-MM-YYYY format
        if (parts.length === 3 && parts[0].length <= 2 && parts[2].length === 4) {
          parsed = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        }
        
        if (!isNaN(parsed)) {
          date = parsed.toISOString().split('T')[0];
          break;
        }
      } catch (e) {}
    }
  }

  return { merchant, amount: total, date };
}

// ----------------------------------------------------
// 7. CHART.JS VISUALIZATIONS
// ----------------------------------------------------
function initCharts() {
  // Config fonts/defaults
  Chart.defaults.color = '#9ca3af';
  Chart.defaults.font.family = "'Inter', sans-serif";

  // Category Doughnut Chart
  const categoryCtx = document.getElementById('categoryChart').getContext('2d');
  charts.category = new Chart(categoryCtx, {
    type: 'doughnut',
    data: getCategoryChartData(),
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { padding: 15, boxWidth: 12 }
        }
      },
      cutout: '65%'
    }
  });

  // History Trend Line/Bar Chart
  const trendCtx = document.getElementById('trendChart').getContext('2d');
  charts.trend = new Chart(trendCtx, {
    type: 'line',
    data: getTrendChartData(),
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          border: { dashed: [5, 5] },
          ticks: { callback: value => `₹${value}` }
        },
        x: {
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function updateCharts() {
  if (!charts.category || !charts.trend) return;
  
  charts.category.data = getCategoryChartData();
  charts.category.update();

  charts.trend.data = getTrendChartData();
  charts.trend.update();
}

function getCategoryChartData() {
  const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
  const monthExpenses = transactions.filter(t => t.date.substring(0, 7) === currentMonth);

  // Group by category name
  const groupings = {};
  monthExpenses.forEach(tx => {
    groupings[tx.category] = (groupings[tx.category] || 0) + tx.amount;
  });

  const labels = Object.keys(groupings);
  const data = Object.values(groupings);
  
  // Assign color schemes dynamically
  const backgroundColors = labels.map(label => {
    const cat = categories.find(c => c.name === label);
    return cat ? cat.color : '#8b5cf6';
  });

  return {
    labels,
    datasets: [{
      data,
      backgroundColor: backgroundColors,
      borderWidth: 0,
      hoverOffset: 4
    }]
  };
}

function getTrendChartData() {
  // Aggregate last 14 days of spending
  const dates = [];
  const amounts = [];

  for (let i = 13; i >= 0; i--) {
    const d = getOffsetDate(-i);
    dates.push(d.substring(5)); // MM-DD
    
    const dayTotal = transactions
      .filter(t => t.date === d)
      .reduce((sum, t) => sum + t.amount, 0);
    
    amounts.push(dayTotal);
  }

  // Theme-aware gradient for trend fill
  const style = getComputedStyle(document.body);
  const primary = style.getPropertyValue('--primary').trim() || '#9d4edd';
  
  let gradient = null;
  const canvas = document.getElementById('trendChart');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, primary + '40'); // 25% opacity
    gradient.addColorStop(1, primary + '00'); // 0% opacity
  }

  return {
    labels: dates,
    datasets: [{
      label: 'Daily Spending (₹)',
      data: amounts,
      borderColor: primary,
      borderWidth: 3,
      backgroundColor: gradient || (primary + '0d'),
      fill: true,
      tension: 0.35,
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBackgroundColor: primary
    }]
  };
}

// ----------------------------------------------------
// 8. DATA IMPORT & EXPORT
// ----------------------------------------------------
function exportData() {
  const backup = {
    transactions,
    categories,
    recurringBills,
    budgetLimit,
    exportVersion: 1,
    exportedAt: new Date().toISOString()
  };

  const str = JSON.stringify(backup, null, 2);
  const blob = new Blob([str], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `spendwise_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  showToast('Backups downloaded as JSON file', 'success');
}

function triggerImport() {
  document.getElementById('import-file-input').click();
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  const fileType = file.name.split('.').pop().toLowerCase();

  reader.onload = async (e) => {
    try {
      const text = e.target.result;

      if (fileType === 'csv') {
        const parsedCsv = parseCSV(text);
        if (parsedCsv.length === 0) {
          return; // Message already shown by parseCSV
        }

        if (!confirm(`Found ${parsedCsv.length} transaction entries in this Excel CSV. Append them to your active database?`)) {
          return;
        }

        // Add to database and local memory (Merge)
        const tx = db.transaction(['expenses'], 'readwrite');
        const store = tx.objectStore('expenses');
        for (const item of parsedCsv) {
          store.put(item);
          transactions.push(item);
        }
        
        tx.oncomplete = () => {
          renderAllViews();
          updateCharts();
          showToast(`Successfully imported ${parsedCsv.length} records from Excel!`, 'success');
          if (syncSettings.active) pushToGitHub();
        };
        
      } else {
        // Standard JSON Restore
        const data = JSON.parse(text);
        if (!data.transactions || !data.categories || !data.recurringBills) {
          showToast('Invalid backup file structure.', 'error');
          return;
        }

        if (!confirm('This will overwrite all active transactions and categories with values in backup file. Continue?')) {
          return;
        }

        // Clear DB then write new values in a single transaction
        await new Promise((resolve, reject) => {
          const restoreTx = db.transaction(['expenses', 'categories', 'recurring', 'settings'], 'readwrite');
          restoreTx.objectStore('expenses').clear();
          restoreTx.objectStore('categories').clear();
          restoreTx.objectStore('recurring').clear();
          restoreTx.objectStore('settings').clear();

          // Put new values into the same transaction
          for (const cat of data.categories) {
            restoreTx.objectStore('categories').put(cat);
          }
          for (const t of data.transactions) {
            restoreTx.objectStore('expenses').put(t);
          }
          for (const rec of data.recurringBills) {
            restoreTx.objectStore('recurring').put(rec);
          }
          
          const bLimit = data.budgetLimit || 3000;
          restoreTx.objectStore('settings').put({ key: 'budgetLimit', value: bLimit });

          restoreTx.oncomplete = () => resolve(bLimit);
          restoreTx.onerror = () => reject(restoreTx.error);
        }).then(bLimit => {
          // Refresh memory
          transactions = data.transactions;
          categories = data.categories;
          recurringBills = data.recurringBills;
          budgetLimit = bLimit;

          renderAllViews();
          populateCategorySelects();
          updateCharts();
          showToast('Restore backup successful!', 'success');
          if (syncSettings.active) pushToGitHub();
        });
      }
    } catch (err) {
      console.error(err);
      showToast('Error parsing file contents.', 'error');
    }
  };
  reader.readAsText(file);
  // Reset input so re-importing the same file triggers onchange
  event.target.value = '';
}

function exportToCSV() {
  if (transactions.length === 0) {
    showToast('No transaction logs to export.', 'warning');
    return;
  }

  // Headers
  const headers = ['Date', 'Merchant', 'Category', 'Budget Class', 'Amount (₹)', 'Notes'];
  
  // Format cells
  const rows = transactions.map(tx => [
    tx.date,
    `"${tx.merchant.replace(/"/g, '""')}"`,
    `"${tx.category.replace(/"/g, '""')}"`,
    tx.class.toUpperCase(),
    tx.amount.toFixed(2),
    `"${(tx.notes || '').replace(/"/g, '""')}"`
  ]);

  // Combine rows, prepend UTF-8 BOM byte sequence
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `spendwise_expenses_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast('Excel CSV download complete!', 'success');
}

function parseCSV(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length < 2) return [];

  // Parse headers by removing symbols
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/["'\s₹$()]/g, ''));
  
  const dateIdx = headers.findIndex(h => h.includes('date'));
  const merchantIdx = headers.findIndex(h => h.includes('merchant') || h.includes('title') || h.includes('payee') || h.includes('name'));
  const amountIdx = headers.findIndex(h => h.includes('amount') || h.includes('price') || h.includes('value'));
  const categoryIdx = headers.findIndex(h => h.includes('category') || h.includes('type'));
  const classIdx = headers.findIndex(h => h.includes('class') || h.includes('budget'));
  const notesIdx = headers.findIndex(h => h.includes('note') || h.includes('desc'));

  if (dateIdx === -1 || merchantIdx === -1 || amountIdx === -1) {
    showToast('CSV must include at least: Date, Merchant, and Amount columns.', 'error');
    return [];
  }

  const parsedItems = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length <= Math.max(dateIdx, merchantIdx, amountIdx)) continue;

    const dateVal = row[dateIdx] ? row[dateIdx].trim() : new Date().toISOString().split('T')[0];
    const merchantVal = row[merchantIdx] ? row[merchantIdx].trim() : 'Unknown Merchant';
    const amountVal = parseFloat(row[amountIdx] ? row[amountIdx].replace(/[^\d.]/g, '') : '0');
    
    let categoryVal = categoryIdx !== -1 && row[categoryIdx] ? row[categoryIdx].trim() : 'Miscellaneous';
    let classVal = classIdx !== -1 && row[classIdx] ? row[classIdx].trim().toLowerCase() : 'need';
    if (!['need', 'want', 'saving'].includes(classVal)) {
      classVal = 'need';
    }
    const notesVal = notesIdx !== -1 && row[notesIdx] ? row[notesIdx].trim() : '';

    if (isNaN(amountVal) || amountVal <= 0) continue;

    parsedItems.push({
      id: 't-csv-' + Date.now() + '-' + i,
      merchant: merchantVal,
      amount: amountVal,
      date: dateVal,
      category: categoryVal,
      class: classVal,
      notes: notesVal
    });
  }
  return parsedItems;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// ----------------------------------------------------
// 9. GITHUB STORAGE SYNC
// ----------------------------------------------------
function openSyncModal() {
  document.getElementById('sync-username').value = syncSettings.username || '';
  document.getElementById('sync-repo').value = syncSettings.repo || '';
  document.getElementById('sync-token').value = syncSettings.token || '';
  document.getElementById('sync-filepath').value = syncSettings.filepath || 'data.json';
  
  const disconnectBtn = document.getElementById('btn-disconnect-sync');
  if (syncSettings.active) {
    disconnectBtn.style.display = 'block';
  } else {
    disconnectBtn.style.display = 'none';
  }

  document.getElementById('sync-modal').classList.add('active');
}

function closeSyncModal() {
  document.getElementById('sync-modal').classList.remove('active');
}

function updateSyncBadge(status, text) {
  const badge = document.getElementById('sync-status-badge');
  if (!badge) return;

  badge.className = `sync-badge ${status}`;
  document.getElementById('sync-status-text').innerText = text;
}

async function saveSyncSettings(event) {
  event.preventDefault();
  
  const username = document.getElementById('sync-username').value.trim();
  const repo = document.getElementById('sync-repo').value.trim();
  const token = document.getElementById('sync-token').value.trim();
  const filepath = document.getElementById('sync-filepath').value.trim() || 'data.json';

  updateSyncBadge('syncing', 'Connecting...');
  
  const tempSettings = { username, repo, token, filepath, active: true };
  
  try {
    const success = await testAndFetchGitHub(tempSettings);
    if (success) {
      syncSettings = tempSettings;
      await dbPut('settings', { key: 'syncSettings', value: syncSettings });
      showToast('GitHub Sync Connected Successfully!', 'success');
      closeSyncModal();
    } else {
      updateSyncBadge('failed', 'Sync Failed');
      showToast('Failed to connect to repository. Verify credentials.', 'error');
    }
  } catch (err) {
    console.error(err);
    updateSyncBadge('failed', 'Sync Failed');
    showToast('Failed to connect. Ensure your token is valid.', 'error');
  }
}

async function disconnectSync() {
  if (confirm('Disconnect from GitHub Sync? Your data will remain stored in local browser, but will not sync across other devices.')) {
    syncSettings = { username: '', repo: '', token: '', filepath: 'data.json', active: false };
    syncSha = '';
    await dbPut('settings', { key: 'syncSettings', value: syncSettings });
    updateSyncBadge('offline', 'Local Mode');
    showToast('Disconnected from GitHub Sync.', 'warning');
    closeSyncModal();
  }
}

async function fetchFromGitHub() {
  if (!syncSettings.active) return;
  
  const { username, repo, token, filepath } = syncSettings;
  const url = `https://api.github.com/repos/${username}/${repo}/contents/${filepath}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github+json',
        'Cache-Control': 'no-cache'
      }
    });

    if (res.status === 200) {
      const dataJson = await res.json();
      syncSha = dataJson.sha;
      
      const base64 = dataJson.content.replace(/\s/g, '');
      const decodedString = decodeURIComponent(escape(atob(base64)));
      const data = JSON.parse(decodedString);

      if (data.transactions && data.categories) {
        const tx = db.transaction(['expenses', 'categories', 'recurring', 'settings'], 'readwrite');
        tx.objectStore('expenses').clear();
        tx.objectStore('categories').clear();
        tx.objectStore('recurring').clear();

        for (const cat of data.categories) {
          tx.objectStore('categories').put(cat);
        }
        for (const t of data.transactions) {
          tx.objectStore('expenses').put(t);
        }
        if (data.recurringBills) {
          for (const rec of data.recurringBills) {
            tx.objectStore('recurring').put(rec);
          }
        }
        
        budgetLimit = data.budgetLimit || 3000;
        tx.objectStore('settings').put({ key: 'budgetLimit', value: budgetLimit });

        tx.oncomplete = () => {
          transactions = data.transactions;
          categories = data.categories;
          recurringBills = data.recurringBills || [];
          
          renderAllViews();
          populateCategorySelects();
          updateCharts();
          updateSyncBadge('synced', 'Synced');
        };
      }
    } else if (res.status === 404) {
      updateSyncBadge('syncing', 'Initializing...');
      await pushToGitHub();
    } else {
      updateSyncBadge('failed', 'Sync Failed');
      showToast('Error syncing with GitHub repository.', 'error');
    }
  } catch (err) {
    console.error('GitHub fetch failed:', err);
    updateSyncBadge('failed', 'Offline Mode');
  }
}

async function pushToGitHub() {
  if (!syncSettings.active) return;
  
  const { username, repo, token, filepath } = syncSettings;
  const url = `https://api.github.com/repos/${username}/${repo}/contents/${filepath}`;
  
  updateSyncBadge('syncing', 'Syncing...');

  const payload = {
    transactions,
    categories,
    recurringBills,
    budgetLimit,
    lastSyncedAt: new Date().toISOString()
  };

  const jsonString = JSON.stringify(payload);
  const base64Content = btoa(unescape(encodeURIComponent(jsonString)));

  const requestBody = {
    message: 'sync: update SpendWise transactions log',
    content: base64Content
  };

  if (syncSha) {
    requestBody.sha = syncSha;
  }

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (res.status === 200 || res.status === 201) {
      const dataJson = await res.json();
      syncSha = dataJson.content.sha;
      updateSyncBadge('synced', 'Synced');
    } else {
      if (res.status === 409) {
        console.warn('SHA conflict. Pulling latest remote state to resolve conflict.');
        await fetchFromGitHub();
      } else {
        updateSyncBadge('failed', 'Sync Failed');
        showToast('Push to GitHub failed.', 'error');
      }
    }
  } catch (err) {
    console.error('GitHub push failed:', err);
    updateSyncBadge('failed', 'Sync Failed');
  }
}

async function testAndFetchGitHub(settingsObj) {
  const { username, repo, token, filepath } = settingsObj;
  const url = `https://api.github.com/repos/${username}/${repo}/contents/${filepath}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github+json'
      }
    });

    if (res.status === 200) {
      const dataJson = await res.json();
      syncSha = dataJson.sha;
      const base64 = dataJson.content.replace(/\s/g, '');
      const decodedString = decodeURIComponent(escape(atob(base64)));
      const data = JSON.parse(decodedString);

      const tx = db.transaction(['expenses', 'categories', 'recurring', 'settings'], 'readwrite');
      tx.objectStore('expenses').clear();
      tx.objectStore('categories').clear();
      tx.objectStore('recurring').clear();

      for (const cat of data.categories) {
        tx.objectStore('categories').put(cat);
      }
      for (const t of data.transactions) {
        tx.objectStore('expenses').put(t);
      }
      if (data.recurringBills) {
        for (const rec of data.recurringBills) {
          tx.objectStore('recurring').put(rec);
        }
      }
      budgetLimit = data.budgetLimit || 3000;
      tx.objectStore('settings').put({ key: 'budgetLimit', value: budgetLimit });

      await new Promise((resolve) => {
        tx.oncomplete = () => {
          transactions = data.transactions;
          categories = data.categories;
          recurringBills = data.recurringBills || [];
          
          renderAllViews();
          populateCategorySelects();
          updateCharts();
          updateSyncBadge('synced', 'Synced');
          resolve();
        };
      });
      return true;
    } else if (res.status === 404) {
      syncSettings = settingsObj;
      await pushToGitHub();
      return true;
    }
  } catch (err) {
    console.error('Connection test failed:', err);
  }
  return false;
}

async function resetDatabase() {
  if (confirm('Are you sure you want to permanently clear all transaction logs, categories, budget limits, and recurring bills? This action cannot be undone.')) {
    const tx = db.transaction(['expenses', 'categories', 'recurring', 'settings'], 'readwrite');
    tx.objectStore('expenses').clear();
    tx.objectStore('categories').clear();
    tx.objectStore('recurring').clear();
    tx.objectStore('settings').clear();
    
    tx.oncomplete = async () => {
      transactions = [];
      categories = [];
      recurringBills = [];
      budgetLimit = 3000;

      if (syncSettings.active) {
        await pushToGitHub();
      }

      showToast('Database wiped clean. Reloading...', 'warning');
      setTimeout(() => location.reload(), 1000);
    };
  }
}

// Run app init
window.addEventListener('DOMContentLoaded', initializeApp);
