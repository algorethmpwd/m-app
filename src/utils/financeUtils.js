// Financial analysis utilities for Vault offline cashflow forecasting

/**
 * 1. Automatically detect recurring bills from transaction history
 * It looks for counterparties appearing at regular weekly or monthly intervals.
 */
export const detectRecurringBills = (transactions) => {
  if (!transactions || transactions.length < 5) return [];

  // Group transactions by counterparties (clean titles)
  const counterpartyGroups = {};
  transactions.forEach((t) => {
    // Only look at expenses/debits
    if (t.amount >= 0 || !t.title) return;
    const cleanTitle = t.title.trim().toUpperCase();
    if (!counterpartyGroups[cleanTitle]) {
      counterpartyGroups[cleanTitle] = [];
    }
    counterpartyGroups[cleanTitle].push(t);
  });

  const recurringBills = [];
  const oneDay = 24 * 60 * 60 * 1000;

  Object.entries(counterpartyGroups).forEach(([title, txs]) => {
    // Sort transactions by date descending (latest first)
    txs.sort((a, b) => b.date - a.date);

    if (txs.length < 2) return;

    // Calculate dates intervals in days
    const intervals = [];
    for (let i = 0; i < txs.length - 1; i++) {
      const diffDays = Math.round((txs[i].date - txs[i + 1].date) / oneDay);
      intervals.push(diffDays);
    }

    // Calculate average interval
    const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;

    // Determine periodicity (e.g. monthly: 25-35 days, weekly: 6-8 days)
    let frequency = "";
    if (avgInterval >= 25 && avgInterval <= 35) {
      frequency = "monthly";
    } else if (avgInterval >= 5 && avgInterval <= 9) {
      frequency = "weekly";
    }

    if (frequency) {
      const latestTx = txs[0];
      const avgAmount = Math.abs(txs.reduce((sum, t) => sum + t.amount, 0) / txs.length);

      // Forecast next due date
      const intervalMs = avgInterval * oneDay;
      const nextDueDateMs = latestTx.date + intervalMs;
      const daysLeft = Math.round((nextDueDateMs - Date.now()) / oneDay);

      // Look for linked Paybill/Account or Till numbers
      const paybillTx = txs.find((t) => t.paybill !== undefined);
      const tillTx = txs.find((t) => t.till !== undefined);

      recurringBills.push({
        title: title.charAt(0) + title.slice(1).toLowerCase(),
        amount: avgAmount,
        frequency,
        intervalDays: Math.round(avgInterval),
        lastDate: latestTx.date,
        nextDueDate: nextDueDateMs,
        daysLeft: daysLeft < 0 ? 0 : daysLeft,
        paybill: paybillTx ? paybillTx.paybill : undefined,
        account: paybillTx ? paybillTx.account : undefined,
        till: tillTx ? tillTx.till : undefined,
      });
    }
  });

  // Sort by upcoming due dates (daysLeft ascending)
  return recurringBills.sort((a, b) => a.daysLeft - b.daysLeft);
};

/**
 * 2. Forecast cashflow & predict potential overdrafts (Fuliza) in the next 7 days
 */
export const predictOverdraft = (currentBalance, recurringBills, dailyBurnRate = 0) => {
  const upcomingBills = recurringBills.filter((bill) => bill.daysLeft <= 7);
  let predictedBalance = currentBalance;
  let willOverdraft = false;
  let overdraftDate = null;

  // Let's project day-by-day for the next 7 days
  const oneDay = 24 * 60 * 60 * 1000;
  
  for (let day = 1; day <= 7; day++) {
    // Subtract daily burn rate
    predictedBalance -= dailyBurnRate;

    // Subtract bills due on this relative day
    upcomingBills.forEach((bill) => {
      if (bill.daysLeft === day) {
        predictedBalance -= bill.amount;
      }
    });

    if (predictedBalance < 0 && !willOverdraft) {
      willOverdraft = true;
      overdraftDate = new Date(Date.now() + day * oneDay).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  }

  return {
    willOverdraft,
    overdraftDate,
    expectedBalanceIn7Days: predictedBalance,
  };
};

/**
 * 3. Extract Paybill and Till directory
 */
export const buildUtilityDirectory = (transactions) => {
  if (!transactions) return { paybills: [], tills: [] };

  const paybillsMap = {};
  const tillsMap = {};

  transactions.forEach((t) => {
    if (t.paybill) {
      const key = `${t.paybill}-${t.account || ""}`;
      if (!paybillsMap[key]) {
        paybillsMap[key] = {
          name: t.title || "Utility Paybill",
          number: t.paybill,
          account: t.account || "",
          count: 0,
        };
      }
      paybillsMap[key].count += 1;
    } else if (t.till) {
      const key = t.till;
      if (!tillsMap[key]) {
        tillsMap[key] = {
          name: t.title || "Buy Goods Merchant",
          number: t.till,
          count: 0,
        };
      }
      tillsMap[key].count += 1;
    }
  });

  // Sort by usage count descending
  const paybills = Object.values(paybillsMap).sort((a, b) => b.count - a.count);
  const tills = Object.values(tillsMap).sort((a, b) => b.count - a.count);

  return { paybills, tills };
};

/**
 * 4. Calculate Average Daily Expenditure Burn Rate (based on last 14 days)
 */
export const calculateDailyBurnRate = (transactions) => {
  if (!transactions || transactions.length === 0) return 0;

  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const recentExpenses = transactions.filter(
    (t) => t.date >= fourteenDaysAgo && t.amount < 0 && !t.isSavings
  );

  if (recentExpenses.length === 0) return 0;

  const totalSpent = recentExpenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  return totalSpent / 14;
};
