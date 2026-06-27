// Parser function to extract M-Pesa details from SMS body
export const parseMpesaSms = (body, smsId, smsDate) => {
  // Examples of standard M-Pesa messages:
  // ABC123DEF4 Confirmed. Ksh100.00 sent to John Doe 0712345678 on 24/6/26 at 3:00 PM.
  // ABC123DEF5 Confirmed. Ksh250.00 paid to KPLC.
  // ABC123DEF6 Confirmed. You have received Ksh1,000.00 from Jane Doe.
  // Fuliza M-PESA: You have successfully used an overdraft of KES 200.00 to pay Grace Wanjiku. Your outstanding Fuliza balance is KES 200.00. Transaction ID: ABC123DEF7.

  const idRegex = /^([A-Z0-9]{10})\s+Confirmed/i;
  const fulizaTxRegex = /Transaction\s+ID:\s*([A-Z0-9]{10})/i;
  const amountRegex = /(?:Ksh|KES)\s*([\d,]+\.\d{2})/i;
  
  const idMatch = body.match(idRegex);
  const fulizaTxMatch = body.match(fulizaTxRegex);
  const amountMatch = body.match(amountRegex);
  
  // If we can't find an amount, parsing fails completely
  if (!amountMatch) {
    return { confidence: "none", parsed: null };
  }
  
  const transactionId = idMatch ? idMatch[1] : (fulizaTxMatch ? fulizaTxMatch[1] : smsId);
  const parsedAmount = parseFloat(amountMatch[1].replace(/,/g, ""));
  
  const bodyLower = body.toLowerCase();
  const isIncome = bodyLower.includes("received") || bodyLower.includes("received from");
  const finalAmount = isIncome ? parsedAmount : -parsedAmount;

  // Extract sender or recipient name
  let title = "";
  if (isIncome) {
    // Match name, stopping at phone number (9-12 digits), the word "on", period, or end of line
    const fromMatch = body.match(/from\s+(.+?)(?=\s+\d{9,12}|\s+\bon\b|\.|$)/i);
    if (fromMatch) title = fromMatch[1].trim();
  } else {
    // Check multiple patterns
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

  // Clean title (remove trailing dot/newlines/numbers/special chars)
  title = title.replace(/\s+\d{10}.*$/, "").replace(/\.$/, "").trim();
  if (title.length > 30) {
    title = title.substring(0, 30) + "...";
  }

  // Dynamic icon selection
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

  // Specific categorizations
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

  // Confidence is high if we have a valid 10-char M-Pesa transaction ID
  const confidence = (idMatch || fulizaTxMatch) ? "high" : "low";

  return { confidence, parsed };
};
