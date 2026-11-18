export interface SuggestedQuery {
  id: string;
  question: string;
  category: "Emissions" | "Energy" | "Water" | "Waste" | "Social" | "Governance" | "Travel";
  keywords: string[];
}

export const ESG_SUGGESTED_QUERIES: SuggestedQuery[] = [
  {
    id: "co2-2024",
    question: "What were total Scope 1 and Scope 2 CO2 emissions in 2024 compared to 2023?",
    category: "Emissions",
    keywords: ["co2", "scope", "emission", "emissions", "2024", "2023", "carbon", "baseline", "reduction"],
  },
  {
    id: "ghg-breakdown",
    question: "What is the breakdown of GHG emissions across CO2, CH4, and N2O?",
    category: "Emissions",
    keywords: ["ghg", "greenhouse", "gas", "co2", "ch4", "n2o", "methane", "nitrous", "breakdown"],
  },
  {
    id: "esrs-target-2030",
    question: "What are the 2030 decarbonization targets under the ESRS E1 climate policy?",
    category: "Governance",
    keywords: ["esrs", "e1", "2030", "target", "targets", "decarbonization", "climate", "policy", "transition", "science"],
  },
  {
    id: "renewable-solar",
    question: "What share of total energy consumption came from Solar PV and renewable sources?",
    category: "Energy",
    keywords: ["energy", "solar", "pv", "renewable", "electricity", "grid", "diesel", "mwh", "power", "mix"],
  },
  {
    id: "water-reuse",
    question: "How much water was consumed and reused across operations and offices in 2024?",
    category: "Water",
    keywords: ["water", "consumption", "reuse", "reused", "intensity", "drinkable", "operations", "offices"],
  },
  {
    id: "waste-hazardous",
    question: "How was hazardous, recyclable, and non-hazardous waste managed and documented?",
    category: "Waste",
    keywords: ["waste", "hazardous", "recyclable", "recycling", "tonnes", "disposal", "manifest", "custody"],
  },
  {
    id: "workforce-diversity",
    question: "What is the workforce gender distribution, age breakdown, and inclusion metrics?",
    category: "Social",
    keywords: ["workforce", "employee", "employees", "gender", "female", "male", "age", "diversity", "inclusion", "disability", "lgbtq", "social"],
  },
  {
    id: "hiring-trend",
    question: "How many new hires joined in 2024 compared to the prior year?",
    category: "Social",
    keywords: ["hire", "hires", "hiring", "headcount", "recruitment", "staff", "2024", "2023"],
  },
  {
    id: "fleet-travel",
    question: "What are the business travel distances and fleet electrification goals?",
    category: "Travel",
    keywords: ["travel", "flight", "air", "rail", "fleet", "vehicle", "vehicles", "ev", "electric", "fuel", "mileage", "transportation"],
  },
  {
    id: "audit-assurance",
    question: "What did the 2024 GHG inventory audit find and what actions were recommended?",
    category: "Governance",
    keywords: ["audit", "assurance", "verification", "memorandum", "hvac", "metering", "ghg", "protocol", "gri"],
  },
];

/**
 * Filter and rank ESG suggested queries based on the user's current input.
 * Matches multi-word partial queries against both question text and keywords.
 */
export function matchSuggestedQueries(rawInput: string, limit = 5): SuggestedQuery[] {
  const trimmed = rawInput.trim().toLowerCase();
  if (!trimmed) return [];

  const tokens = trimmed.split(/\s+/).filter(Boolean);

  const scored = ESG_SUGGESTED_QUERIES.map((item) => {
    const qLower = item.question.toLowerCase();
    const catLower = item.category.toLowerCase();
    let score = 0;

    if (qLower.includes(trimmed)) {
      score += 10;
    }

    let tokenMatches = 0;
    for (const token of tokens) {
      const inQuestion = qLower.includes(token);
      const inCategory = catLower.includes(token);
      const inKeywords = item.keywords.some((kw) => kw.includes(token) || token.includes(kw));

      if (inQuestion || inCategory || inKeywords) {
        tokenMatches += 1;
        score += inQuestion ? 3 : 2;
        if (item.keywords.some((kw) => kw === token)) score += 2;
      }
    }

    if (tokenMatches === 0) return null;
    if (tokenMatches === tokens.length) score += 4;
    return { item, score };
  }).filter((entry): entry is { item: SuggestedQuery; score: number } => entry !== null);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((entry) => entry.item);
}
