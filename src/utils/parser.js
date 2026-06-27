// Parser function to extract M-Pesa or Bank details from SMS body
export const parseMpesaSms = (body, smsId, smsDate, senderAddress = "") => {
  const bodyLower = body.toLowerCase();
  const senderUpper = senderAddress ? senderAddress.toUpperCase() : "";

  // Check if it's a bank alert (Equity, KCB, Co-op, ABSA, NCBA, etc.)
  const isBank = 
    senderUpper.includes("EQUITY") || 
    senderUpper.includes("EQUITEL") || 
    senderUpper.includes("KCB") || 
    senderUpper.includes("COOP") || 
    senderUpper.includes("NCBA") || 
    senderUpper.includes("ABSA") || 
    bodyLower.includes("equity bank") || 
    bodyLower.includes("kcb alert") || 
    bodyLower.includes("co-op bank");

  if (isBank) {
    // 1. Amount Extraction
    const amountRegex = /(?:Ksh|KES)\s*([\d,]+\.\d{2})/i;
    const amountMatch = body.match(amountRegex);
    if (!amountMatch) {
      return { confidence: "none", parsed: null };
    }
    const parsedAmount = parseFloat(amountMatch[1].replace(/,/g, ""));

    // 2. Direction Extraction (Debited/Sent -> Expense, Credited/Received -> Income)
    const isIncome = 
      bodyLower.includes("credited") || 
      bodyLower.includes("received") || 
      bodyLower.includes("deposited") || 
      bodyLower.includes("inward");
    const finalAmount = isIncome ? parsedAmount : -parsedAmount;

    // 3. Transaction ID Extraction
    const refRegex = /(?:ref|reference|txn|transaction|id)(?:\s+no\.?|:|\s+)?\s*([A-Z0-9]+)/i;
    const refMatch = body.match(refRegex);
    const transactionId = refMatch ? refMatch[1] : (smsId || "B_" + Date.now());

    // 4. Counterparty Name Extraction
    let title = "";
    if (isIncome) {
      const fromMatch = body.match(/from\s+(.+?)(?=\s+\d{9,12}|\s+on\s+|\s+A\/C|\.|$)/i);
      if (fromMatch) title = fromMatch[1].trim();
    } else {
      const toMatch = body.match(/to\s+(.+?)(?=\s+\d{9,12}|\s+on\s+|\s+A\/C|\.|$)/i);
      const paidMatch = body.match(/paid\s+(.+?)(?=\s+\d{9,12}|\s+on\s+|\s+A\/C|\.|$)/i);
      if (toMatch) title = toMatch[1].trim();
      else if (paidMatch) title = paidMatch[1].trim();
    }

    // Cleaning and formatting title
    title = title.replace(/\s+\d{10}.*$/, "").replace(/\.$/, "").trim();
    if (title.length > 30) {
      title = title.substring(0, 30) + "...";
    }

    let defaultTitle = "Bank Transfer";
    if (senderUpper.includes("EQUITY")) defaultTitle = isIncome ? "Equity Deposit" : "Equity Debit";
    else if (senderUpper.includes("KCB")) defaultTitle = isIncome ? "KCB Deposit" : "KCB Debit";
    else if (senderUpper.includes("COOP")) defaultTitle = isIncome ? "Co-op Deposit" : "Co-op Debit";

    return {
      confidence: refMatch ? "high" : "low",
      parsed: {
        id: transactionId,
        title: title || defaultTitle,
        amount: finalAmount,
        icon: isIncome ? "cash-outline" : "swap-horizontal",
        date: smsDate || Date.now(),
        source: "sms",
      }
    };
  }

  // -------------------------------------------------------------
  // M-Pesa Parsing Flow
  // -------------------------------------------------------------
  const idRegex = /^([A-Z0-9]{10})\s+Confirmed/i;
  const fulizaTxRegex = /Transaction\s+ID:\s*([A-Z0-9]{10})/i;
  const amountRegex = /(?:Ksh|KES)\s*([\d,]+\.\d{2})/i;
  
  const idMatch = body.match(idRegex);
  const fulizaTxMatch = body.match(fulizaTxRegex);
  const amountMatch = body.match(amountRegex);
  
  if (!amountMatch) {
    return { confidence: "none", parsed: null };
  }
  
  const transactionId = idMatch ? idMatch[1] : (fulizaTxMatch ? fulizaTxMatch[1] : smsId);
  const parsedAmount = parseFloat(amountMatch[1].replace(/,/g, ""));
  
  const isIncome = bodyLower.includes("received") || bodyLower.includes("received from");
  const finalAmount = isIncome ? parsedAmount : -parsedAmount;

  // Extract sender or recipient name
  let title = "";
  if (isIncome) {
    const fromMatch = body.match(/from\s+(.+?)(?=\s+\d{9,12}|\s+\bon\b|\.|$)/i);
    if (fromMatch) title = fromMatch[1].trim();
  } else {
    const paidMatch = body.match(/paid\s+to\s+(.+?)(?=\s+\d{9,12}|\s+\bon\b|\.|$)/i);
    const toMatch = body.match(/sent\s+to\s+(.+?)(?=\s+\d{9,12}|\s+\bon\b|\.|$)/i);
    const boughtMatch = body.match(/bought\s+for\s+(.+?)(?=\s+\d{9,12}|\s+\bon\b|\.|$)/i);
    const withdrawnMatch = body.match(/withdrawn\s+from\s+(.+?)(?=\s+\d{9,12}|\s+\bon\b|\.|$)/i);
    const overdraftMatch = body.match(/overdraft\s+of\s+(?:KES|Ksh)\s*[\d,.]+\s+to\s+pay\s+(.+?)(?=\s+\d{9,12}|\s+\bon\b|\.|$)/i);

    if (paidMatch) title = paidMatch[1].trim();
    else if (toMatch) title = toMatch[1].trim();
    else if (overdraftMatch) title = overdraftMatch[1].trim();
    else if (boughtMatch) title = boughtMatch[1].trim();
    else if (withdrawnMatch) title = withdrawnMatch[1].trim();
  }

  // Clean title
  title = title.replace(/\s+\d{10}.*$/, "").replace(/\.$/, "").trim();
  if (title.length > 30) {
    title = title.substring(0, 30) + "...";
  }

  // Icon Selection
  let icon = "swap-horizontal";
  const titleLower = title.toLowerCase();
  
  if (isIncome) {
    icon = "cash-outline";
  } else {
    if (bodyLower.includes("paid to") || bodyLower.includes("buy goods") || bodyLower.includes("paybill") || bodyLower.includes("overdraft")) {
      icon = "cart-outline";
    } else if (bodyLower.includes("sent to")) {
      icon = "send";
    } else if (bodyLower.includes("withdrawn")) {
      icon = "wallet";
    }
  }

  const isSavings = titleLower.includes("ziidi");
  if (isSavings) {
    icon = "trending-up-outline";
  }

  // Extract Fuliza outstanding balance if present
  const fulizaRegex = /(?:outstanding\s+)?Fuliza\s+balance\s+is\s+(?:KES|Ksh)\s*([\d,]+\.\d{2})/i;
  const fulizaMatch = body.match(fulizaRegex);
  const fulizaBalance = fulizaMatch ? parseFloat(fulizaMatch[1].replace(/,/g, "")) : undefined;

  const parsed = {
    id: transactionId,
    title: title || (isIncome ? "M-Pesa Received" : "M-Pesa Sent"),
    amount: finalAmount,
    icon: icon,
    date: smsDate || Date.now(),
    isSavings: isSavings,
    fulizaBalance: fulizaBalance, // can be undefined
    source: "sms",
  };

  const confidence = (idMatch || fulizaTxMatch) ? "high" : "low";

  return { confidence, parsed };
};
