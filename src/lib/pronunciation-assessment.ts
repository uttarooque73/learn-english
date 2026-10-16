export type TranscriptAssessment = {
  score: number;
  expectedWords: string[];
  spokenWords: string[];
  missingWords: string[];
  extraWords: string[];
};

function tokenize(text: string) {
  return text.toLocaleLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
}

/**
 * Compares the browser's speech transcript with the target in word order.
 * This is transcript similarity, not acoustic or phoneme-level pronunciation scoring.
 */
export function assessTranscript(target: string, spoken: string): TranscriptAssessment {
  const expectedWords = tokenize(target);
  const spokenWords = tokenize(spoken);
  const rows = expectedWords.length + 1;
  const columns = spokenWords.length + 1;
  const costs = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: columns }, (_, j) => i === 0 ? j : j === 0 ? i : 0),
  );

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      const substitutionCost = expectedWords[i - 1] === spokenWords[j - 1] ? 0 : 1;
      costs[i][j] = Math.min(costs[i - 1][j] + 1, costs[i][j - 1] + 1, costs[i - 1][j - 1] + substitutionCost);
    }
  }

  const missingWords: string[] = [];
  const extraWords: string[] = [];
  let i = expectedWords.length;
  let j = spokenWords.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && expectedWords[i - 1] === spokenWords[j - 1] && costs[i][j] === costs[i - 1][j - 1]) {
      i -= 1; j -= 1;
    } else if (i > 0 && j > 0 && costs[i][j] === costs[i - 1][j - 1] + 1) {
      missingWords.unshift(expectedWords[i - 1]);
      extraWords.unshift(spokenWords[j - 1]);
      i -= 1; j -= 1;
    } else if (i > 0 && costs[i][j] === costs[i - 1][j] + 1) {
      missingWords.unshift(expectedWords[i - 1]);
      i -= 1;
    } else {
      extraWords.unshift(spokenWords[j - 1]);
      j -= 1;
    }
  }

  const denominator = Math.max(expectedWords.length, spokenWords.length);
  const score = denominator === 0 ? 0 : Math.round(((denominator - costs[expectedWords.length][spokenWords.length]) / denominator) * 100);
  return { score, expectedWords, spokenWords, missingWords, extraWords };
}
