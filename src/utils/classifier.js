// A simple, local Naive Bayes text classifier for transactions
export const classifyTransaction = (title, historicalTransactions) => {
  if (!title || !historicalTransactions || historicalTransactions.length === 0) {
    return null;
  }
  
  const tokenRegex = /[a-z0-9]+/g;
  const tokens = title.toLowerCase().match(tokenRegex) || [];
  if (tokens.length === 0) return null;

  // Filter out manual or automatic transactions that have valid icons
  // Only classify expenses (amount < 0) using other expenses
  const trainingSet = historicalTransactions.filter(
    (t) => t.icon && t.title && t.amount < 0
  );

  if (trainingSet.length < 5) {
    // Too few training transactions, fallback to rules
    return null;
  }

  // Count occurrences of categories and tokens per category
  const categoryCounts = {};
  const tokenCountsPerCategory = {};
  const vocabulary = new Set();
  const totalDocs = trainingSet.length;

  trainingSet.forEach((t) => {
    const cat = t.icon;
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

    if (!tokenCountsPerCategory[cat]) {
      tokenCountsPerCategory[cat] = { _total: 0 };
    }

    const docTokens = t.title.toLowerCase().match(tokenRegex) || [];
    docTokens.forEach((tok) => {
      tokenCountsPerCategory[cat][tok] = (tokenCountsPerCategory[cat][tok] || 0) + 1;
      tokenCountsPerCategory[cat]._total += 1;
      vocabulary.add(tok);
    });
  });

  const vocabSize = vocabulary.size;
  if (vocabSize === 0) return null;

  let bestCategory = null;
  let maxScore = -Infinity;

  // Compute log probability for each category
  Object.keys(categoryCounts).forEach((cat) => {
    // Prior probability P(Cat)
    let score = Math.log(categoryCounts[cat] / totalDocs);

    // Likelihood P(Token | Cat) with Laplace smoothing
    tokens.forEach((tok) => {
      const count = tokenCountsPerCategory[cat][tok] || 0;
      const totalCount = tokenCountsPerCategory[cat]._total || 0;
      score += Math.log((count + 1) / (totalCount + vocabSize));
    });

    if (score > maxScore) {
      maxScore = score;
      bestCategory = cat;
    }
  });

  return bestCategory;
};
