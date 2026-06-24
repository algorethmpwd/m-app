// Parser function to extract M-Pesa details from SMS body
export const parseMpesaSms = (body, smsId, smsDate) => {
  // Examples of standard M-Pesa messages:
  // ABC123DEF4 Confirmed. Ksh100.00 sent to John Doe 0712345678 on 24/6/26 at 3:00 PM.
  // ABC123DEF5 Confirmed. Ksh250.00 paid to KPLC.
  // ABC123DEF6 Confirmed. You have received Ksh1,000.00 from Jane Doe.
  
  const idRegex = /^([A-Z0-9]{10})\s+Confirmed/;
  const amountRegex = /Ksh\s*([\d,]+\.\d{2})/;
  
  const idMatch = body.match(idRegex);
  const amountMatch = body.match(amountRegex);
  
  // If we can't find an amount, parsing fails completely
  if (!amountMatch) {
    return { confidence: "none", parsed: null };
  }
  
  const transactionId = idMatch ? idMatch[1] : smsId;
  const parsedAmount = parseFloat(amountMatch[1].replace(/,/g, ""));
  
  const bodyLower = body.toLowerCase();
  const isIncome = bodyLower.includes("received") || bodyLower.includes("received from");
  const finalAmount = isIncome ? parsedAmount : -parsedAmount;

  // Extract sender or recipient name
  let title = "";
  if (isIncome) {
    const fromMatch = body.match(/from\s+([^on\d]+)/i);
    if (fromMatch) title = fromMatch[1].trim();
  } else {
    const toMatch = body.match(/sent\s+to\s+([^on\d]+)/i);
    const paidMatch = body.match(/paid\s+to\s+([^on\d]+)/i);
    const boughtMatch = body.match(/bought\s+for\s+([^on\d]+)/i);
    const withdrawnMatch = body.match(/withdrawn\s+from\s+([^on\d]+)/i);

    if (paidMatch) title = paidMatch[1].trim();
    else if (toMatch) title = toMatch[1].trim();
    else if (boughtMatch) title = boughtMatch[1].trim();
    else if (withdrawnMatch) title = withdrawnMatch[1].trim();
  }

  // Clean title (remove trailing dot/newlines/numbers)
  title = title.replace(/\s+\d{10}.*$/, "").replace(/\.$/, "").trim();
  if (title.length > 25) {
    title = title.substring(0, 25) + "...";
  }

  // Dynamic icon selection
  let icon = "swap-horizontal";
  if (isIncome) {
    icon = "cash-outline";
  } else {
    if (bodyLower.includes("paid to") || bodyLower.includes("buy goods") || bodyLower.includes("paybill")) {
      icon = "cart-outline";
    } else if (bodyLower.includes("sent to")) {
      icon = "send";
    } else if (bodyLower.includes("withdrawn")) {
      icon = "wallet";
    }
  }

  const parsed = {
    id: transactionId,
    title: title || (isIncome ? "M-Pesa Received" : "M-Pesa Sent"),
    amount: finalAmount,
    icon: icon,
    date: smsDate || Date.now(),
  };

  // Confidence is high if we have a valid 10-char M-Pesa transaction ID
  const confidence = idMatch ? "high" : "low";

  return { confidence, parsed };
};
