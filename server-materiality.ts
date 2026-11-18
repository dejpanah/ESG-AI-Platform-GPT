import crypto from "node:crypto";

export type MaterialityPillar = "Environmental" | "Social" | "Governance";

export type MaterialityClassification =
  | "Double Material"
  | "Impact Material Only"
  | "Financial Material Only"
  | "Not Material (Monitored)";

export type StakeholderGroupId =
  | "investors"
  | "communities"
  | "employees"
  | "customers"
  | "regulators";

export interface TopicStakeholderScore {
  group_id: StakeholderGroupId;
  impact_rating: number; // 1.0 - 5.0
  financial_rating: number; // 1.0 - 5.0
  sample_size: number;
  key_concern: string;
}

export interface MaterialityTopic {
  id: string;
  code: string;
  name: string;
  pillar: MaterialityPillar;
  esrs_topic: string;
  value_chain_stage:
    | "Upstream & Feedstock"
    | "Own Operations (Refining & Cracking)"
    | "Downstream & Product Use"
    | "Full Value Chain";
  time_horizon:
    | "Short-term (<1 yr)"
    | "Medium-term (1-5 yrs)"
    | "Long-term (>5 yrs)";
  // Inside-Out (Impact on society & environment)
  impact_type:
    | "Actual Negative"
    | "Potential Negative"
    | "Actual Positive"
    | "Potential Positive";
  impact_scale: number; // 1.0 - 5.0
  impact_scope: number; // 1.0 - 5.0
  impact_irremediability: number; // 1.0 - 5.0
  impact_likelihood: number; // 0.2 - 1.0 (1.0 for actual impacts)
  impact_score: number; // Computed 0.0 - 5.0
  impact_description: string;
  // Outside-In (Financial impact on enterprise value)
  financial_effect_type:
    | "Transition Risk"
    | "Physical Risk"
    | "Regulatory / Liability Risk"
    | "Capital & Market Opportunity"
    | "Operational Cost Risk";
  financial_magnitude: number; // 1.0 - 5.0
  financial_likelihood: number; // 0.2 - 1.0
  financial_score: number; // Computed 0.0 - 5.0
  financial_driver: string;
  estimated_financial_exposure_musd: number;
  // Computed classification
  classification: MaterialityClassification;
  stakeholder_scores: Record<StakeholderGroupId, TopicStakeholderScore>;
  updated_at: number;
}

export interface StakeholderGroupConfig {
  group_id: StakeholderGroupId;
  name: string;
  description: string;
  weight_pct: number; // 0 - 100
  respondent_count: number;
  engagement_method: string;
  response_rate_pct: number;
  last_surveyed_at: string;
}

export interface StakeholderSurveySubmission {
  id: string;
  topic_id: string;
  topic_code: string;
  topic_name: string;
  group_id: StakeholderGroupId;
  group_name: string;
  respondent_org: string;
  respondent_count: number;
  impact_rating: number;
  financial_rating: number;
  engagement_channel: string;
  comment: string;
  submitted_by: string;
  submitted_at: number;
}

export interface StakeholderWeightChangeLog {
  id: string;
  changed_by: string;
  changed_at: number;
  rationale: string;
  previous_weights: Record<StakeholderGroupId, number>;
  new_weights: Record<StakeholderGroupId, number>;
  affected_topics_count: number;
}

export interface TopicStandardMapping {
  id: string;
  topic_id: string;
  topic_code: string;
  topic_name: string;
  pillar: MaterialityPillar;
  classification: MaterialityClassification;
  esrs_standards: string[];
  gri_standards: string[];
  sasb_metrics: string[];
  industry_metrics: string[];
  linked_calc_engine: string;
  linked_calc_label: string;
  mandatory_datapoints_count: number;
  covered_datapoints_count: number;
  assurance_status:
    | "Reasonable Assurance Ready"
    | "Limited Assurance Ready"
    | "Gap Remediation"
    | "Monitored Only";
  mapping_notes: string;
  updated_at: number;
}

export interface PeriodicCyclePoint {
  topic_id: string;
  topic_code: string;
  topic_name: string;
  pillar: MaterialityPillar;
  impact_score: number;
  financial_score: number;
  classification: MaterialityClassification;
}

export interface PeriodicReviewCycle {
  id: string;
  cycle_label: string; // e.g. "FY 2023 Baseline", "FY 2024 CSRD Pre-Assurance", "FY 2025 Active Cycle"
  review_date: string;
  framework_version: string;
  impact_threshold: number;
  financial_threshold: number;
  approved_by: string;
  status: "Archived Baseline" | "Assurance Verified" | "Active Cycle";
  summary_note: string;
  points: PeriodicCyclePoint[];
}

export interface MaterialityRationaleEntry {
  id: string;
  cycle_label: string;
  topic_id: string;
  topic_code: string;
  topic_name: string;
  decision_type:
    | "Double Material Inclusion"
    | "Impact-Only Inclusion"
    | "Financial-Only Inclusion"
    | "Threshold Exclusion Rationale"
    | "Methodology & Weighting Update"
    | "YoY Score Escalation";
  esrs_iro_reference: string;
  impact_score_snapshot: number;
  financial_score_snapshot: number;
  rationale_statement: string;
  evidence_references: string;
  recorded_by: string;
  reviewer_signoff: string;
  recorded_at: number;
}

export interface MaterialityWorkspaceState {
  workspace_id: string;
  active_cycle: string;
  impact_threshold: number; // default 3.0 on 0-5 scale
  financial_threshold: number; // default 3.0 on 0-5 scale
  stakeholder_blend_ratio: number; // e.g., 0.30 (30% stakeholder survey blend + 70% technical IRO scoring)
  topics: MaterialityTopic[];
  stakeholder_groups: StakeholderGroupConfig[];
  survey_submissions: StakeholderSurveySubmission[];
  weight_change_logs: StakeholderWeightChangeLog[];
  standard_mappings: TopicStandardMapping[];
  periodic_cycles: PeriodicReviewCycle[];
  rationale_log: MaterialityRationaleEntry[];
  updated_at: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function classifyTopicMateriality(
  impactScore: number,
  financialScore: number,
  impactThreshold: number,
  financialThreshold: number,
): MaterialityClassification {
  const isImpact = impactScore >= impactThreshold;
  const isFinancial = financialScore >= financialThreshold;
  if (isImpact && isFinancial) return "Double Material";
  if (isImpact) return "Impact Material Only";
  if (isFinancial) return "Financial Material Only";
  return "Not Material (Monitored)";
}

export function recomputeMaterialityState(
  state: MaterialityWorkspaceState,
): MaterialityWorkspaceState {
  const totalWeight = state.stakeholder_groups.reduce(
    (acc, g) => acc + g.weight_pct,
    0,
  );
  const weightMap: Record<StakeholderGroupId, number> = {
    investors: 0.2,
    communities: 0.2,
    employees: 0.2,
    customers: 0.2,
    regulators: 0.2,
  };
  for (const g of state.stakeholder_groups) {
    weightMap[g.group_id] =
      totalWeight > 0 ? g.weight_pct / totalWeight : 0.2;
  }

  const blend = Math.max(0, Math.min(0.6, state.stakeholder_blend_ratio ?? 0.3));

  state.topics = state.topics.map((topic) => {
    // Intrinsic ESRS 1 IRO severity = average of Scale, Scope, Irremediability * Likelihood factor
    const rawIntrinsicSeverity =
      (topic.impact_scale + topic.impact_scope + topic.impact_irremediability) /
      3;
    const likelihoodFactor =
      topic.impact_type.startsWith("Actual")
        ? 1.0
        : 0.55 + 0.45 * Math.max(0.2, Math.min(1, topic.impact_likelihood));
    const intrinsicImpact = Math.min(5, rawIntrinsicSeverity * likelihoodFactor);

    // Weighted stakeholder impact rating
    let shImpact = 0;
    let shFinancial = 0;
    (Object.keys(weightMap) as StakeholderGroupId[]).forEach((gid) => {
      const entry = topic.stakeholder_scores[gid];
      const w = weightMap[gid] ?? 0.2;
      shImpact += (entry?.impact_rating ?? intrinsicImpact) * w;
      shFinancial += (entry?.financial_rating ?? topic.financial_magnitude) * w;
    });

    const computedImpact = round2(
      Math.min(5, Math.max(1, intrinsicImpact * (1 - blend) + shImpact * blend)),
    );

    const finLikelihoodFactor =
      0.55 + 0.45 * Math.max(0.2, Math.min(1, topic.financial_likelihood));
    const intrinsicFinancial = Math.min(
      5,
      topic.financial_magnitude * finLikelihoodFactor,
    );
    const computedFinancial = round2(
      Math.min(
        5,
        Math.max(1, intrinsicFinancial * (1 - blend) + shFinancial * blend),
      ),
    );

    const classification = classifyTopicMateriality(
      computedImpact,
      computedFinancial,
      state.impact_threshold,
      state.financial_threshold,
    );

    return {
      ...topic,
      impact_score: computedImpact,
      financial_score: computedFinancial,
      classification,
    };
  });

  // Sync classifications onto standard_mappings and the active periodic cycle
  const topicById = new Map(state.topics.map((t) => [t.id, t]));
  state.standard_mappings = state.standard_mappings.map((m) => {
    const t = topicById.get(m.topic_id);
    if (!t) return m;
    return {
      ...m,
      topic_code: t.code,
      topic_name: t.name,
      pillar: t.pillar,
      classification: t.classification,
    };
  });

  const activeCycleIdx = state.periodic_cycles.findIndex(
    (c) => c.status === "Active Cycle" || c.cycle_label === state.active_cycle,
  );
  if (activeCycleIdx >= 0) {
    state.periodic_cycles[activeCycleIdx] = {
      ...state.periodic_cycles[activeCycleIdx],
      impact_threshold: state.impact_threshold,
      financial_threshold: state.financial_threshold,
      points: state.topics.map((t) => ({
        topic_id: t.id,
        topic_code: t.code,
        topic_name: t.name,
        pillar: t.pillar,
        impact_score: t.impact_score,
        financial_score: t.financial_score,
        classification: t.classification,
      })),
    };
  }

  state.updated_at = Date.now();
  return state;
}

export function createInitialMaterialityState(
  workspaceId = "default",
): MaterialityWorkspaceState {
  const now = Date.now();
  const stakeholderGroups: StakeholderGroupConfig[] = [
    {
      group_id: "investors",
      name: "Investors & Institutional Lenders",
      description:
        "Equity holders, sustainability-linked bondholders, and project finance syndicates evaluating transition risk and RoACE.",
      weight_pct: 25,
      respondent_count: 42,
      engagement_method: "Annual ESG Roadshow & TCFD/CSRD Investor Questionnaire",
      response_rate_pct: 88,
      last_surveyed_at: "2025-02-18",
    },
    {
      group_id: "regulators",
      name: "Regulators & Environmental Authorities",
      description:
        "Ministry of Energy, EU CBAM/CSRD authorities, national EPA CEMS inspectorates, and industrial zone authorities.",
      weight_pct: 25,
      respondent_count: 19,
      engagement_method: "Statutory Permit Reviews & Regulatory Consultation Docket",
      response_rate_pct: 95,
      last_surveyed_at: "2025-02-24",
    },
    {
      group_id: "communities",
      name: "Local Communities & Fence-Line NGOs",
      description:
        "Municipal councils, coastal watershed boards, and residents adjacent to petrochemical cracking & terminal complexes.",
      weight_pct: 20,
      respondent_count: 315,
      engagement_method: "Fence-Line Community Panels & Bilingual Digital Survey",
      response_rate_pct: 74,
      last_surveyed_at: "2025-02-10",
    },
    {
      group_id: "employees",
      name: "Employees, Engineers & Trade Unions",
      description:
        "Plant operators, process safety engineers, turnaround contractors, and technical works councils.",
      weight_pct: 15,
      respondent_count: 1240,
      engagement_method: "GlobalHSE Pulse Survey & Joint Safety Committee Workshops",
      response_rate_pct: 82,
      last_surveyed_at: "2025-02-14",
    },
    {
      group_id: "customers",
      name: "Downstream B2B Chemical Customers",
      description:
        "Automotive, packaging, and specialty polymer buyers requiring Product Carbon Footprints (PCF) and circular feedstocks.",
      weight_pct: 15,
      respondent_count: 68,
      engagement_method: "Scope 3 PCF Customer Advisory & EcoVadis Dialogues",
      response_rate_pct: 79,
      last_surveyed_at: "2025-02-20",
    },
  ];

  const topics: MaterialityTopic[] = [
    {
      id: "topic-e1-ghg",
      code: "ESRS-E1-GHG",
      name: "Scope 1, 2 & 3 GHG Emissions & Decarbonization",
      pillar: "Environmental",
      esrs_topic: "ESRS E1 · Climate Change Mitigation",
      value_chain_stage: "Full Value Chain",
      time_horizon: "Short-term (<1 yr)",
      impact_type: "Actual Negative",
      impact_scale: 4.9,
      impact_scope: 4.8,
      impact_irremediability: 4.6,
      impact_likelihood: 1.0,
      impact_score: 4.75,
      impact_description:
        "Direct CO₂ and N₂O emissions from steam cracking furnaces, gas turbines, and upstream/downstream petrochemical value chain.",
      financial_effect_type: "Transition Risk",
      financial_magnitude: 4.8,
      financial_likelihood: 0.95,
      financial_score: 4.68,
      financial_driver:
        "EU CBAM border carbon adjustments, ETS carbon pricing ($90+/tCO₂e), and $420M CapEx for electric furnace & CCS retrofit.",
      estimated_financial_exposure_musd: 420.0,
      classification: "Double Material",
      stakeholder_scores: {
        investors: {
          group_id: "investors",
          impact_rating: 4.8,
          financial_rating: 4.9,
          sample_size: 42,
          key_concern: "Net-zero CapEx allocation & CBAM margin erosion",
        },
        regulators: {
          group_id: "regulators",
          impact_rating: 4.9,
          financial_rating: 4.7,
          sample_size: 19,
          key_concern: "Mandatory Scope 1/2/3 verification under CSRD E1-6",
        },
        communities: {
          group_id: "communities",
          impact_rating: 4.5,
          financial_rating: 3.9,
          sample_size: 315,
          key_concern: "Regional climate resilience & industrial decarbonization",
        },
        employees: {
          group_id: "employees",
          impact_rating: 4.4,
          financial_rating: 4.3,
          sample_size: 1240,
          key_concern: "Long-term plant competitiveness & CCUS job transition",
        },
        customers: {
          group_id: "customers",
          impact_rating: 4.8,
          financial_rating: 4.8,
          sample_size: 68,
          key_concern: "ISO 14067 Product Carbon Footprint (PCF) guarantees",
        },
      },
      updated_at: now,
    },
    {
      id: "topic-e1-methane",
      code: "ESRS-E1-CH4",
      name: "Methane Fugitives & Routine Flaring Elimination",
      pillar: "Environmental",
      esrs_topic: "ESRS E1 · Energy & Fugitive Methane",
      value_chain_stage: "Own Operations (Refining & Cracking)",
      time_horizon: "Short-term (<1 yr)",
      impact_type: "Actual Negative",
      impact_scale: 4.6,
      impact_scope: 4.3,
      impact_irremediability: 4.4,
      impact_likelihood: 1.0,
      impact_score: 4.45,
      impact_description:
        "Near-term radiative forcing from unburned CH₄ slip across flare tips, compressor seals, and storage tank vents (OGMP 2.0 Level 4/5).",
      financial_effect_type: "Regulatory / Liability Risk",
      financial_magnitude: 4.3,
      financial_likelihood: 0.9,
      financial_score: 4.18,
      financial_driver:
        "EU Methane Regulation import intensity rules, World Bank Zero Routine Flaring 2030 covenant, and recovered gas revenue.",
      estimated_financial_exposure_musd: 145.0,
      classification: "Double Material",
      stakeholder_scores: {
        investors: {
          group_id: "investors",
          impact_rating: 4.6,
          financial_rating: 4.5,
          sample_size: 42,
          key_concern: "OGMP 2.0 Gold Standard status & flare gas monetization",
        },
        regulators: {
          group_id: "regulators",
          impact_rating: 4.8,
          financial_rating: 4.4,
          sample_size: 19,
          key_concern: "98% flare DRE enforcement & LDAR aerial verification",
        },
        communities: {
          group_id: "communities",
          impact_rating: 4.7,
          financial_rating: 3.6,
          sample_size: 315,
          key_concern: "Visible flaring events, noise, and local air plumes",
        },
        employees: {
          group_id: "employees",
          impact_rating: 4.2,
          financial_rating: 3.9,
          sample_size: 1240,
          key_concern: "LDAR inspection safety & ultrasonic metering reliability",
        },
        customers: {
          group_id: "customers",
          impact_rating: 4.1,
          financial_rating: 4.0,
          sample_size: 68,
          key_concern: "Upstream methane intensity of ethane/naphtha feedstocks",
        },
      },
      updated_at: now,
    },
    {
      id: "topic-e3-water",
      code: "ESRS-E3-WAT",
      name: "Water Withdrawal in High-Stress Arid Basins",
      pillar: "Environmental",
      esrs_topic: "ESRS E3 · Water and Marine Resources",
      value_chain_stage: "Own Operations (Refining & Cracking)",
      time_horizon: "Medium-term (1-5 yrs)",
      impact_type: "Actual Negative",
      impact_scale: 4.4,
      impact_scope: 4.1,
      impact_irremediability: 4.2,
      impact_likelihood: 1.0,
      impact_score: 4.28,
      impact_description:
        "Freshwater & desalinated water consumption in WRI Aqueduct Extremely High Stress (>80%) coastal basins and effluent COD/TDS load.",
      financial_effect_type: "Physical Risk",
      financial_magnitude: 4.1,
      financial_likelihood: 0.85,
      financial_score: 3.92,
      financial_driver:
        "Cooling tower curtailment risk during heatwaves, desalination tariff escalation, and Zero Liquid Discharge (ZLD) CapEx.",
      estimated_financial_exposure_musd: 112.0,
      classification: "Double Material",
      stakeholder_scores: {
        investors: {
          group_id: "investors",
          impact_rating: 4.0,
          financial_rating: 4.2,
          sample_size: 42,
          key_concern: "Asset interruption risk from cooling water scarcity",
        },
        regulators: {
          group_id: "regulators",
          impact_rating: 4.5,
          financial_rating: 4.1,
          sample_size: 19,
          key_concern: "Outfall COD/phenol limits & groundwater abstraction caps",
        },
        communities: {
          group_id: "communities",
          impact_rating: 4.8,
          financial_rating: 3.8,
          sample_size: 315,
          key_concern: "Shared aquifer depletion & marine outfall thermal plumes",
        },
        employees: {
          group_id: "employees",
          impact_rating: 3.8,
          financial_rating: 3.6,
          sample_size: 1240,
          key_concern: "Reliability of closed-loop condensate recovery",
        },
        customers: {
          group_id: "customers",
          impact_rating: 3.7,
          financial_rating: 3.5,
          sample_size: 68,
          key_concern: "Water footprint per tonne of polymer resin",
        },
      },
      updated_at: now,
    },
    {
      id: "topic-s1-hse",
      code: "ESRS-S1-HSE",
      name: "Process Safety (API 754 PSE) & Workforce Health",
      pillar: "Social",
      esrs_topic: "ESRS S1 · Own Workforce & Process Safety",
      value_chain_stage: "Own Operations (Refining & Cracking)",
      time_horizon: "Short-term (<1 yr)",
      impact_type: "Potential Negative",
      impact_scale: 4.9,
      impact_scope: 4.2,
      impact_irremediability: 4.9,
      impact_likelihood: 0.85,
      impact_score: 4.56,
      impact_description:
        "High-consequence process safety events (Tier 1/2 Loss of Primary Containment), contractor turnaround safety, and heat stress.",
      financial_effect_type: "Operational Cost Risk",
      financial_magnitude: 4.7,
      financial_likelihood: 0.85,
      financial_score: 4.38,
      financial_driver:
        "Unplanned cracker shutdowns ($3.5M/day lost margin), insurance premium spikes, and regulatory operating license suspension.",
      estimated_financial_exposure_musd: 290.0,
      classification: "Double Material",
      stakeholder_scores: {
        investors: {
          group_id: "investors",
          impact_rating: 4.5,
          financial_rating: 4.7,
          sample_size: 42,
          key_concern: "Tier 1 PSE containment & unplanned outage avoidance",
        },
        regulators: {
          group_id: "regulators",
          impact_rating: 4.9,
          financial_rating: 4.5,
          sample_size: 19,
          key_concern: "Process Hazard Analysis (PHA) & Seveso/OSHA compliance",
        },
        communities: {
          group_id: "communities",
          impact_rating: 4.8,
          financial_rating: 4.0,
          sample_size: 315,
          key_concern: "Emergency siren readiness & vapor cloud containment",
        },
        employees: {
          group_id: "employees",
          impact_rating: 5.0,
          financial_rating: 4.4,
          sample_size: 1240,
          key_concern: "Zero fatalities, LTI prevention, and contractor parity",
        },
        customers: {
          group_id: "customers",
          impact_rating: 4.0,
          financial_rating: 4.2,
          sample_size: 68,
          key_concern: "Supply reliability & force majeure prevention",
        },
      },
      updated_at: now,
    },
    {
      id: "topic-e5-circular",
      code: "ESRS-E5-CIR",
      name: "Circular Polymers, Pyrolysis Feedstock & Catalyst Waste",
      pillar: "Environmental",
      esrs_topic: "ESRS E5 · Resource Use & Circular Economy",
      value_chain_stage: "Downstream & Product Use",
      time_horizon: "Medium-term (1-5 yrs)",
      impact_type: "Actual Positive",
      impact_scale: 3.9,
      impact_scope: 3.8,
      impact_irremediability: 3.7,
      impact_likelihood: 1.0,
      impact_score: 3.82,
      impact_description:
        "Diversion of post-consumer plastic waste via ISCC PLUS certified pyrolysis oil cracking and hazardous spent catalyst metal reclamation.",
      financial_effect_type: "Capital & Market Opportunity",
      financial_magnitude: 4.4,
      financial_likelihood: 0.9,
      financial_score: 4.21,
      financial_driver:
        "EU Packaging & Packaging Waste Regulation (PPWR) recycled-content mandates driving 18–25% green premium on circular polyolefins.",
      estimated_financial_exposure_musd: 210.0,
      classification: "Double Material",
      stakeholder_scores: {
        investors: {
          group_id: "investors",
          impact_rating: 3.8,
          financial_rating: 4.5,
          sample_size: 42,
          key_concern: "Circular polymer EBITDA margin & ISCC PLUS off-take",
        },
        regulators: {
          group_id: "regulators",
          impact_rating: 4.1,
          financial_rating: 3.9,
          sample_size: 19,
          key_concern: "Basel Convention hazardous waste & mass-balance rules",
        },
        communities: {
          group_id: "communities",
          impact_rating: 3.9,
          financial_rating: 3.2,
          sample_size: 315,
          key_concern: "Elimination of hazardous landfilling & plastic litter",
        },
        employees: {
          group_id: "employees",
          impact_rating: 3.5,
          financial_rating: 3.7,
          sample_size: 1240,
          key_concern: "Safe catalyst unloading & chemical recycling R&D",
        },
        customers: {
          group_id: "customers",
          impact_rating: 4.4,
          financial_rating: 4.8,
          sample_size: 68,
          key_concern: "2030 mandatory recycled resin quotas for FMCG packaging",
        },
      },
      updated_at: now,
    },
    {
      id: "topic-e2-air",
      code: "ESRS-E2-AIR",
      name: "Non-GHG Criteria Air Pollutants (NOx, SOx, VOC, BTEX)",
      pillar: "Environmental",
      esrs_topic: "ESRS E2 · Pollution of Air",
      value_chain_stage: "Own Operations (Refining & Cracking)",
      time_horizon: "Short-term (<1 yr)",
      impact_type: "Actual Negative",
      impact_scale: 4.2,
      impact_scope: 3.9,
      impact_irremediability: 3.8,
      impact_likelihood: 1.0,
      impact_score: 4.02,
      impact_description:
        "Stack emissions of NOx, SO₂, PM₂.₅, and volatile aromatics (benzene/toluene) affecting regional airshed quality near industrial ports.",
      financial_effect_type: "Regulatory / Liability Risk",
      financial_magnitude: 2.9,
      financial_likelihood: 0.7,
      financial_score: 2.68,
      financial_driver:
        "Low-NOx burner maintenance and SRU tail-gas scrubbing within existing CapEx envelope; moderate permit fine exposure.",
      estimated_financial_exposure_musd: 38.0,
      classification: "Impact Material Only",
      stakeholder_scores: {
        investors: {
          group_id: "investors",
          impact_rating: 3.5,
          financial_rating: 2.7,
          sample_size: 42,
          key_concern: "Permit exceedance avoidance",
        },
        regulators: {
          group_id: "regulators",
          impact_rating: 4.5,
          financial_rating: 3.1,
          sample_size: 19,
          key_concern: "Continuous CEMS stack compliance & BAT-AEL limits",
        },
        communities: {
          group_id: "communities",
          impact_rating: 4.8,
          financial_rating: 2.9,
          sample_size: 315,
          key_concern: "Ambient BTEX odor & respiratory health in port districts",
        },
        employees: {
          group_id: "employees",
          impact_rating: 4.1,
          financial_rating: 2.6,
          sample_size: 1240,
          key_concern: "Occupational benzene exposure monitoring",
        },
        customers: {
          group_id: "customers",
          impact_rating: 3.1,
          financial_rating: 2.4,
          sample_size: 68,
          key_concern: "Environmental compliance of manufacturing sites",
        },
      },
      updated_at: now,
    },
    {
      id: "topic-g1-ethics",
      code: "ESRS-G1-GOV",
      name: "Business Conduct, Anti-Corruption & Tax Transparency",
      pillar: "Governance",
      esrs_topic: "ESRS G1 · Business Conduct",
      value_chain_stage: "Full Value Chain",
      time_horizon: "Short-term (<1 yr)",
      impact_type: "Potential Negative",
      impact_scale: 3.1,
      impact_scope: 2.9,
      impact_irremediability: 3.0,
      impact_likelihood: 0.65,
      impact_score: 2.78,
      impact_description:
        "Governance of third-party customs/shipping intermediaries, whistleblower protection, and GRI 207 country-by-country tax integrity.",
      financial_effect_type: "Regulatory / Liability Risk",
      financial_magnitude: 4.2,
      financial_likelihood: 0.8,
      financial_score: 3.84,
      financial_driver:
        "Sanctions compliance on feedstock cargoes, FCPA/UK Bribery Act penalties, and sovereign credit rating governance covenants.",
      estimated_financial_exposure_musd: 160.0,
      classification: "Financial Material Only",
      stakeholder_scores: {
        investors: {
          group_id: "investors",
          impact_rating: 3.2,
          financial_rating: 4.4,
          sample_size: 42,
          key_concern: "Board independence, ESG-linked executive pay & sanctions",
        },
        regulators: {
          group_id: "regulators",
          impact_rating: 3.4,
          financial_rating: 4.3,
          sample_size: 19,
          key_concern: "ISO 37001 anti-bribery & Country-by-Country Tax reporting",
        },
        communities: {
          group_id: "communities",
          impact_rating: 2.8,
          financial_rating: 3.1,
          sample_size: 315,
          key_concern: "Local municipal tax contribution transparency",
        },
        employees: {
          group_id: "employees",
          impact_rating: 3.0,
          financial_rating: 3.3,
          sample_size: 1240,
          key_concern: "Non-retaliation ethics hotline & speak-up culture",
        },
        customers: {
          group_id: "customers",
          impact_rating: 2.9,
          financial_rating: 3.8,
          sample_size: 68,
          key_concern: "Sanctions screening & KYC vendor integrity",
        },
      },
      updated_at: now,
    },
    {
      id: "topic-s2-supply",
      code: "ESRS-S2-VCW",
      name: "Value Chain Contractor Labor & Human Rights",
      pillar: "Social",
      esrs_topic: "ESRS S2 · Workers in the Value Chain",
      value_chain_stage: "Upstream & Feedstock",
      time_horizon: "Medium-term (1-5 yrs)",
      impact_type: "Potential Negative",
      impact_scale: 3.9,
      impact_scope: 3.6,
      impact_irremediability: 3.5,
      impact_likelihood: 0.75,
      impact_score: 3.48,
      impact_description:
        "Working conditions, living wage, and heat-safety standards for migrant turnaround construction crews and maritime logistics workers.",
      financial_effect_type: "Regulatory / Liability Risk",
      financial_magnitude: 2.8,
      financial_likelihood: 0.65,
      financial_score: 2.55,
      financial_driver:
        "EU Corporate Sustainability Due Diligence Directive (CSDDD) supplier audit obligations and customer social audit requirements.",
      estimated_financial_exposure_musd: 28.0,
      classification: "Impact Material Only",
      stakeholder_scores: {
        investors: {
          group_id: "investors",
          impact_rating: 3.3,
          financial_rating: 2.8,
          sample_size: 42,
          key_concern: "CSDDD supply chain audit coverage",
        },
        regulators: {
          group_id: "regulators",
          impact_rating: 3.8,
          financial_rating: 2.9,
          sample_size: 19,
          key_concern: "Labor welfare standards for EPC contractors",
        },
        communities: {
          group_id: "communities",
          impact_rating: 3.7,
          financial_rating: 2.5,
          sample_size: 315,
          key_concern: "Fair local hiring & contractor housing standards",
        },
        employees: {
          group_id: "employees",
          impact_rating: 3.9,
          financial_rating: 2.6,
          sample_size: 1240,
          key_concern: "Equal welfare standards for on-site EPC contractors",
        },
        customers: {
          group_id: "customers",
          impact_rating: 3.6,
          financial_rating: 2.9,
          sample_size: 68,
          key_concern: "TfS (Together for Sustainability) supplier audit scores",
        },
      },
      updated_at: now,
    },
    {
      id: "topic-e4-biodiversity",
      code: "ESRS-E4-BIO",
      name: "Terrestrial & Marine Biodiversity Near Terminal Sites",
      pillar: "Environmental",
      esrs_topic: "ESRS E4 · Biodiversity and Ecosystems",
      value_chain_stage: "Own Operations (Refining & Cracking)",
      time_horizon: "Long-term (>5 yrs)",
      impact_type: "Potential Negative",
      impact_scale: 2.6,
      impact_scope: 2.4,
      impact_irremediability: 2.7,
      impact_likelihood: 0.55,
      impact_score: 2.32,
      impact_description:
        "Footprint of existing brownfield industrial complex buffered from Natura 2000 / Ramsar wetlands; mangrove restoration offset program active.",
      financial_effect_type: "Regulatory / Liability Risk",
      financial_magnitude: 2.3,
      financial_likelihood: 0.5,
      financial_score: 2.05,
      financial_driver:
        "No greenfield expansion planned in biodiversity-sensitive zones; annual coastal monitoring covered by routine OpEx.",
      estimated_financial_exposure_musd: 9.5,
      classification: "Not Material (Monitored)",
      stakeholder_scores: {
        investors: {
          group_id: "investors",
          impact_rating: 2.4,
          financial_rating: 2.1,
          sample_size: 42,
          key_concern: "TNFD LEAP screening confirmation",
        },
        regulators: {
          group_id: "regulators",
          impact_rating: 2.7,
          financial_rating: 2.3,
          sample_size: 19,
          key_concern: "Coastal buffer zone EIA monitoring",
        },
        communities: {
          group_id: "communities",
          impact_rating: 2.9,
          financial_rating: 2.0,
          sample_size: 315,
          key_concern: "Coastal mangrove belt preservation",
        },
        employees: {
          group_id: "employees",
          impact_rating: 2.2,
          financial_rating: 1.9,
          sample_size: 1240,
          key_concern: "Site greening initiatives",
        },
        customers: {
          group_id: "customers",
          impact_rating: 2.1,
          financial_rating: 2.0,
          sample_size: 68,
          key_concern: "No bio-based land-use change conflict",
        },
      },
      updated_at: now,
    },
  ];

  const standardMappings: TopicStandardMapping[] = [
    {
      id: "map-e1-ghg",
      topic_id: "topic-e1-ghg",
      topic_code: "ESRS-E1-GHG",
      topic_name: "Scope 1, 2 & 3 GHG Emissions & Decarbonization",
      pillar: "Environmental",
      classification: "Double Material",
      esrs_standards: [
        "ESRS E1-1 Transition Plan for Climate Mitigation",
        "ESRS E1-4 GHG Emission Reduction Targets",
        "ESRS E1-6 Gross Scopes 1, 2, 3 & Total GHG Emissions",
        "ESRS E1-9 Anticipated Financial Effects from Climate Risks",
      ],
      gri_standards: [
        "GRI 305-1 Direct (Scope 1) GHG Emissions",
        "GRI 305-2 Energy Indirect (Scope 2) GHG Emissions",
        "GRI 305-3 Other Indirect (Scope 3) GHG Emissions",
        "GRI 305-4 GHG Emissions Intensity",
      ],
      sasb_metrics: [
        "RT-CH-110a.1 Gross Global Scope 1 Emissions",
        "RT-CH-110a.2 Discussion of Long-Term & Short-Term Strategy",
        "EM-RM-110a.1 Gross Global Scope 1 (% Covered Under Emissions-Limiting Regulations)",
      ],
      industry_metrics: [
        "IPIECA CCE-4 Greenhouse Gas Emissions",
        "WBCSD Chemical Sector Guidance (Scope 3 Cat 1 & 12 PCF)",
        "PCAF / SBTi Chemical Sector Pathway Intensity (tCO₂e/t HVC)",
      ],
      linked_calc_engine: "/calc/scope-1",
      linked_calc_label: "01. Scope 1 / 02. Scope 2 / 03. Scope 3 Engines",
      mandatory_datapoints_count: 34,
      covered_datapoints_count: 34,
      assurance_status: "Reasonable Assurance Ready",
      mapping_notes:
        "Full dual-reporting (Location & Market Scope 2) and IPCC 2006 Tier 3 CEMS/GC integration verified.",
      updated_at: now,
    },
    {
      id: "map-e1-methane",
      topic_id: "topic-e1-methane",
      topic_code: "ESRS-E1-CH4",
      topic_name: "Methane Fugitives & Routine Flaring Elimination",
      pillar: "Environmental",
      classification: "Double Material",
      esrs_standards: [
        "ESRS E1-6 §48 Disaggregated CH₄ Emissions & GWP-100/GWP-20",
        "ESRS E1-3 Actions & Resources on Methane Abatement",
      ],
      gri_standards: [
        "GRI 305-1 Biogenic & Fugitive CH₄ Breakdown",
        "GRI 11.2.2 Oil & Gas Sector Flaring & Venting",
      ],
      sasb_metrics: [
        "EM-RM-110a.1 Hydrocarbon Flaring & Methane Percentage",
        "EM-EP-110a.2 Fugitive Methane Emissions Rate",
      ],
      industry_metrics: [
        "OGMP 2.0 Level 4/5 Source & Site Reconciliation",
        "World Bank Zero Routine Flaring by 2030 (ZRF) Reporting",
        "API Compendium Flare DRE (≥98.0% Efficiency)",
      ],
      linked_calc_engine: "/calc/methane",
      linked_calc_label: "05. Methane Accounting & 06. Flaring Engines",
      mandatory_datapoints_count: 18,
      covered_datapoints_count: 18,
      assurance_status: "Reasonable Assurance Ready",
      mapping_notes:
        "Aerial LiDAR plume inversion reconciled with bottom-up OGI + Hi-Flow sampler inventory.",
      updated_at: now,
    },
    {
      id: "map-e3-water",
      topic_id: "topic-e3-water",
      topic_code: "ESRS-E3-WAT",
      topic_name: "Water Withdrawal in High-Stress Arid Basins",
      pillar: "Environmental",
      classification: "Double Material",
      esrs_standards: [
        "ESRS E3-1 Policies Related to Water & Marine Resources",
        "ESRS E3-4 Total Water Consumption in m³ & Areas at Water Risk",
        "ESRS E3-5 Anticipated Financial Effects from Water-Related Risks",
      ],
      gri_standards: [
        "GRI 303-3 Water Withdrawal by Source & Stress Area",
        "GRI 303-4 Water Discharge & Effluent Quality (COD, TDS, Phenols)",
        "GRI 303-5 Water Consumption",
      ],
      sasb_metrics: [
        "RT-CH-140a.1 Total Water Withdrawn & Total Water Consumed (% in High Stress)",
        "RT-CH-140a.2 Number of Incidents of Non-Compliance with Water Permits",
        "EM-RM-140a.1 Fresh Water Withdrawn & Recycled",
      ],
      industry_metrics: [
        "WRI Aqueduct 4.0 Basin Baseline Water Stress Tiering",
        "IPIECA ENV-1 Freshwater Availability & Withdrawal",
      ],
      linked_calc_engine: "/calc/water",
      linked_calc_label: "08. Water Accounting Engine",
      mandatory_datapoints_count: 22,
      covered_datapoints_count: 21,
      assurance_status: "Limited Assurance Ready",
      mapping_notes:
        "Closed-loop steam condensate reuse metered across all 4 cracking blocks.",
      updated_at: now,
    },
    {
      id: "map-s1-hse",
      topic_id: "topic-s1-hse",
      topic_code: "ESRS-S1-HSE",
      topic_name: "Process Safety (API 754 PSE) & Workforce Health",
      pillar: "Social",
      classification: "Double Material",
      esrs_standards: [
        "ESRS S1-14 Health and Safety Metrics (Fatalities, TRIR, LTIR)",
        "ESRS S1-4 Taking Action on Material Impacts on Own Workforce",
      ],
      gri_standards: [
        "GRI 403-9 Work-Related Injuries (Employees & Contractors)",
        "GRI 403-10 Work-Related Ill Health",
        "GRI 11.8.3 Asset Integrity & Process Safety Events",
      ],
      sasb_metrics: [
        "RT-CH-540a.1 Process Safety Incidents Count (PSIC) — Tier 1 & Tier 2",
        "RT-CH-320a.1 Total Recordable Incident Rate (TRIR) & Fatality Rate",
        "EM-RM-540a.1 Process Safety Event (PSE) Rates per 200,000 hrs",
      ],
      industry_metrics: [
        "API RP 754 Tier 1 & Tier 2 Process Safety Event Rate (PSER)",
        "IOGP Life-Saving Rules & Contractor Safety Parity Index",
      ],
      linked_calc_engine: "/calc/safety-hse",
      linked_calc_label: "11. Safety & HSE Calculation Engine",
      mandatory_datapoints_count: 20,
      covered_datapoints_count: 20,
      assurance_status: "Reasonable Assurance Ready",
      mapping_notes:
        "Covers 100% of direct employees and on-site EPC turnaround contractors.",
      updated_at: now,
    },
    {
      id: "map-e5-circular",
      topic_id: "topic-e5-circular",
      topic_code: "ESRS-E5-CIR",
      topic_name: "Circular Polymers, Pyrolysis Feedstock & Catalyst Waste",
      pillar: "Environmental",
      classification: "Double Material",
      esrs_standards: [
        "ESRS E5-4 Resource Inflows (Circular & Renewable Feedstock Share)",
        "ESRS E5-5 Resource Outflows & Hazardous/Non-Hazardous Waste Diverted",
      ],
      gri_standards: [
        "GRI 301-2 Recycled Input Materials Used",
        "GRI 306-3 Waste Generated",
        "GRI 306-4 Waste Diverted from Disposal",
        "GRI 306-5 Waste Directed to Disposal",
      ],
      sasb_metrics: [
        "RT-CH-150a.1 Amount of Hazardous Waste Generated, % Recycled",
        "RT-CH-410a.1 Revenue from Products Designed for Circularity",
      ],
      industry_metrics: [
        "ISCC PLUS Mass-Balance Chain of Custody Attribution",
        "IPIECA ENV-5 Waste Management & Catalyst Precious Metal Recovery",
      ],
      linked_calc_engine: "/calc/waste",
      linked_calc_label: "09. Waste & Materials Engine",
      mandatory_datapoints_count: 16,
      covered_datapoints_count: 15,
      assurance_status: "Limited Assurance Ready",
      mapping_notes:
        "ISCC PLUS mass-balance book-and-claim ledger audited for pyrolysis naphtha.",
      updated_at: now,
    },
    {
      id: "map-e2-air",
      topic_id: "topic-e2-air",
      topic_code: "ESRS-E2-AIR",
      topic_name: "Non-GHG Criteria Air Pollutants (NOx, SOx, VOC, BTEX)",
      pillar: "Environmental",
      classification: "Impact Material Only",
      esrs_standards: [
        "ESRS E2-4 Pollution of Air, Water and Soil (NOx, SOx, PM, NMVOC)",
      ],
      gri_standards: [
        "GRI 305-7 Nitrogen Oxides (NOx), Sulfur Oxides (SOx), and Other Significant Air Emissions",
      ],
      sasb_metrics: [
        "RT-CH-120a.1 Air Emissions of NOx, SOx, VOCs, and HAPs",
        "EM-RM-120a.1 Air Emissions of Criteria Pollutants",
      ],
      industry_metrics: [
        "IPIECA ENV-6 Other Air Emissions (LDAR VOC & Stack CEMS)",
        "EU Industrial Emissions Directive (IED) BAT-AEL Concentration Caps",
      ],
      linked_calc_engine: "/calc/air-emissions",
      linked_calc_label: "10. Air Emissions Calculation Engine",
      mandatory_datapoints_count: 14,
      covered_datapoints_count: 14,
      assurance_status: "Limited Assurance Ready",
      mapping_notes:
        "Continuous CEMS telemetry on all heater stacks and SRU tail-gas units.",
      updated_at: now,
    },
    {
      id: "map-g1-ethics",
      topic_id: "topic-g1-ethics",
      topic_code: "ESRS-G1-GOV",
      topic_name: "Business Conduct, Anti-Corruption & Tax Transparency",
      pillar: "Governance",
      classification: "Financial Material Only",
      esrs_standards: [
        "ESRS G1-1 Corporate Culture & Whistleblower Protection",
        "ESRS G1-3 Prevention and Detection of Corruption and Bribery",
        "ESRS G1-4 Confirmed Incidents of Corruption or Bribery",
      ],
      gri_standards: [
        "GRI 205-2 Communication and Training About Anti-Corruption",
        "GRI 207-4 Country-by-Country Tax Reporting",
      ],
      sasb_metrics: [
        "RT-CH-510a.1 Management System for Prevention of Corruption",
        "EM-EP-510a.2 Net Reserves in Countries with Bottom Corruption Perception Index",
      ],
      industry_metrics: [
        "ISO 37001 Anti-Bribery Management System Certification",
        "IPIECA GOV-3 Transparency & Anti-Corruption",
      ],
      linked_calc_engine: "/calc/governance",
      linked_calc_label: "13. Governance Calculation Engine",
      mandatory_datapoints_count: 12,
      covered_datapoints_count: 12,
      assurance_status: "Limited Assurance Ready",
      mapping_notes:
        "100% third-party maritime & feedstock trading intermediaries screened.",
      updated_at: now,
    },
    {
      id: "map-s2-supply",
      topic_id: "topic-s2-supply",
      topic_code: "ESRS-S2-VCW",
      topic_name: "Value Chain Contractor Labor & Human Rights",
      pillar: "Social",
      classification: "Impact Material Only",
      esrs_standards: [
        "ESRS S2-1 Policies Related to Value Chain Workers",
        "ESRS S2-4 Taking Action on Material Impacts on Value Chain Workers",
      ],
      gri_standards: [
        "GRI 414-1 New Suppliers Screened Using Social Criteria",
        "GRI 408 / 409 Child & Forced Labor Prevention in Supply Chain",
      ],
      sasb_metrics: [
        "RT-CH-320a.2 Discussion of Process to Manage Contractor Safety & Welfare",
      ],
      industry_metrics: [
        "Together for Sustainability (TfS) Chemical Supplier Assessments",
        "ISO 20400 Sustainable Procurement Audit Coverage",
      ],
      linked_calc_engine: "/calc/social-capital",
      linked_calc_label: "12. Social & Human Capital Engine",
      mandatory_datapoints_count: 11,
      covered_datapoints_count: 9,
      assurance_status: "Gap Remediation",
      mapping_notes:
        "Expanding Tier-2 logistics contractor audit coverage from 86% to 100% in FY2025.",
      updated_at: now,
    },
    {
      id: "map-e4-biodiversity",
      topic_id: "topic-e4-biodiversity",
      topic_code: "ESRS-E4-BIO",
      topic_name: "Terrestrial & Marine Biodiversity Near Terminal Sites",
      pillar: "Environmental",
      classification: "Not Material (Monitored)",
      esrs_standards: [
        "ESRS 2 IRO-1 Explanation of Non-Materiality for ESRS E4",
      ],
      gri_standards: [
        "GRI 304-1 Operational Sites Adjacent to Protected Areas",
      ],
      sasb_metrics: [
        "EM-RM-160a.1 Environmental Management Policies for Operating Sites",
      ],
      industry_metrics: [
        "TNFD LEAP Locate & Evaluate Screening Protocol",
      ],
      linked_calc_engine: "/calc/water",
      linked_calc_label: "08. Water & Coastal Outfall Monitoring",
      mandatory_datapoints_count: 4,
      covered_datapoints_count: 4,
      assurance_status: "Monitored Only",
      mapping_notes:
        "Below 3.0 materiality threshold; documented in ESRS 2 IRO-1 exclusion log.",
      updated_at: now,
    },
  ];

  const surveySubmissions: StakeholderSurveySubmission[] = [
    {
      id: "sub-01",
      topic_id: "topic-e1-ghg",
      topic_code: "ESRS-E1-GHG",
      topic_name: "Scope 1, 2 & 3 GHG Emissions & Decarbonization",
      group_id: "investors",
      group_name: "Investors & Institutional Lenders",
      respondent_org: "Nordic Sovereign Climate Fund",
      respondent_count: 14,
      impact_rating: 4.9,
      financial_rating: 5.0,
      engagement_channel: "Q1 Fixed-Income ESG Due Diligence",
      comment:
        "CBAM exposure on European polyolefin exports makes Scope 1 cracker intensity and Scope 2 renewable PPA coverage the #1 financial valuation driver.",
      submitted_by: "M. Lindqvist (Portfolio ESG Lead)",
      submitted_at: now - 86400000 * 12,
    },
    {
      id: "sub-02",
      topic_id: "topic-e3-water",
      topic_code: "ESRS-E3-WAT",
      topic_name: "Water Withdrawal in High-Stress Arid Basins",
      group_id: "communities",
      group_name: "Local Communities & Fence-Line NGOs",
      respondent_org: "Coastal Watershed & Municipal Advisory Board",
      respondent_count: 85,
      impact_rating: 4.9,
      financial_rating: 3.9,
      engagement_channel: "Municipal Townhall & Public Survey",
      comment:
        "Industrial cooling tower makeup must prioritize recycled municipal effluent and desalinated loops over coastal brackish aquifers.",
      submitted_by: "Dr. H. Al-Mansoor (Watershed Council)",
      submitted_at: now - 86400000 * 9,
    },
    {
      id: "sub-03",
      topic_id: "topic-e5-circular",
      topic_code: "ESRS-E5-CIR",
      topic_name: "Circular Polymers, Pyrolysis Feedstock & Catalyst Waste",
      group_id: "customers",
      group_name: "Downstream B2B Chemical Customers",
      respondent_org: "European Automotive & Packaging Consortium",
      respondent_count: 28,
      impact_rating: 4.5,
      financial_rating: 4.8,
      engagement_channel: "B2B Customer PCF & Circularity Roundtable",
      comment:
        "EU PPWR mandates 30% recycled content by 2030; access to ISCC PLUS circular ethylene/propylene determines multi-year supply contract renewal.",
      submitted_by: "S. Vance (VP Global Procurement)",
      submitted_at: now - 86400000 * 6,
    },
    {
      id: "sub-04",
      topic_id: "topic-s1-hse",
      topic_code: "ESRS-S1-HSE",
      topic_name: "Process Safety (API 754 PSE) & Workforce Health",
      group_id: "employees",
      group_name: "Employees, Engineers & Trade Unions",
      respondent_org: "Olefins & Aromatics Joint Safety Council",
      respondent_count: 410,
      impact_rating: 5.0,
      financial_rating: 4.5,
      engagement_channel: "Turnaround Safety Pulse Survey",
      comment:
        "High-pressure hydrocracker turnaround contractor onboarding and automated gas-leak isolation valves remain critical safety priorities.",
      submitted_by: "R. Khorasani (Chief Safety Delegate)",
      submitted_at: now - 86400000 * 4,
    },
    {
      id: "sub-05",
      topic_id: "topic-e1-methane",
      topic_code: "ESRS-E1-CH4",
      topic_name: "Methane Fugitives & Routine Flaring Elimination",
      group_id: "regulators",
      group_name: "Regulators & Environmental Authorities",
      respondent_org: "National Environmental Compliance Inspectorate",
      respondent_count: 9,
      impact_rating: 4.8,
      financial_rating: 4.5,
      engagement_channel: "Annual CEMS & OGMP 2.0 Regulatory Audit",
      comment:
        "Continuous ultrasonic flare metering and quarterly OGI/LiDAR reconciliation are mandatory for 2025 operating permit renewal.",
      submitted_by: "Inspectorate Division IV",
      submitted_at: now - 86400000 * 2,
    },
  ];

  const weightChangeLogs: StakeholderWeightChangeLog[] = [
    {
      id: "wlog-01",
      changed_by: "CSRD Sustainability Steering Committee",
      changed_at: now - 86400000 * 35,
      rationale:
        "Increased Regulators weight from 20% to 25% and Investors to 25% to reflect mandatory CSRD / EU CBAM enforcement in FY 2025.",
      previous_weights: {
        investors: 25,
        regulators: 20,
        communities: 20,
        employees: 20,
        customers: 15,
      },
      new_weights: {
        investors: 25,
        regulators: 25,
        communities: 20,
        employees: 15,
        customers: 15,
      },
      affected_topics_count: 9,
    },
  ];

  const periodicCycles: PeriodicReviewCycle[] = [
    {
      id: "cycle-2023",
      cycle_label: "FY 2023 Baseline",
      review_date: "2023-11-15",
      framework_version: "GRI Universal Standards 2021 + TCFD",
      impact_threshold: 3.0,
      financial_threshold: 3.0,
      approved_by: "Board Sustainability & HSE Committee",
      status: "Archived Baseline",
      summary_note:
        "Pre-CSRD baseline materiality matrix. Circular Polymers and Value Chain Workers were below threshold in 2023.",
      points: [
        {
          topic_id: "topic-e1-ghg",
          topic_code: "ESRS-E1-GHG",
          topic_name: "Scope 1, 2 & 3 GHG Emissions & Decarbonization",
          pillar: "Environmental",
          impact_score: 4.45,
          financial_score: 4.15,
          classification: "Double Material",
        },
        {
          topic_id: "topic-e1-methane",
          topic_code: "ESRS-E1-CH4",
          topic_name: "Methane Fugitives & Routine Flaring Elimination",
          pillar: "Environmental",
          impact_score: 4.05,
          financial_score: 3.45,
          classification: "Double Material",
        },
        {
          topic_id: "topic-e3-water",
          topic_code: "ESRS-E3-WAT",
          topic_name: "Water Withdrawal in High-Stress Arid Basins",
          pillar: "Environmental",
          impact_score: 3.85,
          financial_score: 3.25,
          classification: "Double Material",
        },
        {
          topic_id: "topic-s1-hse",
          topic_code: "ESRS-S1-HSE",
          topic_name: "Process Safety (API 754 PSE) & Workforce Health",
          pillar: "Social",
          impact_score: 4.5,
          financial_score: 4.2,
          classification: "Double Material",
        },
        {
          topic_id: "topic-e5-circular",
          topic_code: "ESRS-E5-CIR",
          topic_name: "Circular Polymers, Pyrolysis Feedstock & Catalyst Waste",
          pillar: "Environmental",
          impact_score: 2.85,
          financial_score: 2.9,
          classification: "Not Material (Monitored)",
        },
        {
          topic_id: "topic-e2-air",
          topic_code: "ESRS-E2-AIR",
          topic_name: "Non-GHG Criteria Air Pollutants (NOx, SOx, VOC, BTEX)",
          pillar: "Environmental",
          impact_score: 3.9,
          financial_score: 2.5,
          classification: "Impact Material Only",
        },
        {
          topic_id: "topic-g1-ethics",
          topic_code: "ESRS-G1-GOV",
          topic_name: "Business Conduct, Anti-Corruption & Tax Transparency",
          pillar: "Governance",
          impact_score: 2.7,
          financial_score: 3.55,
          classification: "Financial Material Only",
        },
        {
          topic_id: "topic-s2-supply",
          topic_code: "ESRS-S2-VCW",
          topic_name: "Value Chain Contractor Labor & Human Rights",
          pillar: "Social",
          impact_score: 2.8,
          financial_score: 2.3,
          classification: "Not Material (Monitored)",
        },
        {
          topic_id: "topic-e4-biodiversity",
          topic_code: "ESRS-E4-BIO",
          topic_name: "Terrestrial & Marine Biodiversity Near Terminal Sites",
          pillar: "Environmental",
          impact_score: 2.25,
          financial_score: 1.95,
          classification: "Not Material (Monitored)",
        },
      ],
    },
    {
      id: "cycle-2024",
      cycle_label: "FY 2024 CSRD Pre-Assurance",
      review_date: "2024-11-20",
      framework_version: "ESRS Set 1 (EFRAG IG 1 Double Materiality)",
      impact_threshold: 3.0,
      financial_threshold: 3.0,
      approved_by: "External Assurance Partner & Audit Committee",
      status: "Assurance Verified",
      summary_note:
        "Adopted EFRAG IG 1 scoring scale. Circular Polymers crossed both Impact and Financial thresholds (3.0) due to EU PPWR recycled content mandates; Value Chain Workers became Impact Material.",
      points: [
        {
          topic_id: "topic-e1-ghg",
          topic_code: "ESRS-E1-GHG",
          topic_name: "Scope 1, 2 & 3 GHG Emissions & Decarbonization",
          pillar: "Environmental",
          impact_score: 4.62,
          financial_score: 4.48,
          classification: "Double Material",
        },
        {
          topic_id: "topic-e1-methane",
          topic_code: "ESRS-E1-CH4",
          topic_name: "Methane Fugitives & Routine Flaring Elimination",
          pillar: "Environmental",
          impact_score: 4.3,
          financial_score: 3.9,
          classification: "Double Material",
        },
        {
          topic_id: "topic-e3-water",
          topic_code: "ESRS-E3-WAT",
          topic_name: "Water Withdrawal in High-Stress Arid Basins",
          pillar: "Environmental",
          impact_score: 4.1,
          financial_score: 3.65,
          classification: "Double Material",
        },
        {
          topic_id: "topic-s1-hse",
          topic_code: "ESRS-S1-HSE",
          topic_name: "Process Safety (API 754 PSE) & Workforce Health",
          pillar: "Social",
          impact_score: 4.52,
          financial_score: 4.3,
          classification: "Double Material",
        },
        {
          topic_id: "topic-e5-circular",
          topic_code: "ESRS-E5-CIR",
          topic_name: "Circular Polymers, Pyrolysis Feedstock & Catalyst Waste",
          pillar: "Environmental",
          impact_score: 3.45,
          financial_score: 3.75,
          classification: "Double Material",
        },
        {
          topic_id: "topic-e2-air",
          topic_code: "ESRS-E2-AIR",
          topic_name: "Non-GHG Criteria Air Pollutants (NOx, SOx, VOC, BTEX)",
          pillar: "Environmental",
          impact_score: 3.98,
          financial_score: 2.6,
          classification: "Impact Material Only",
        },
        {
          topic_id: "topic-g1-ethics",
          topic_code: "ESRS-G1-GOV",
          topic_name: "Business Conduct, Anti-Corruption & Tax Transparency",
          pillar: "Governance",
          impact_score: 2.75,
          financial_score: 3.72,
          classification: "Financial Material Only",
        },
        {
          topic_id: "topic-s2-supply",
          topic_code: "ESRS-S2-VCW",
          topic_name: "Value Chain Contractor Labor & Human Rights",
          pillar: "Social",
          impact_score: 3.28,
          financial_score: 2.45,
          classification: "Impact Material Only",
        },
        {
          topic_id: "topic-e4-biodiversity",
          topic_code: "ESRS-E4-BIO",
          topic_name: "Terrestrial & Marine Biodiversity Near Terminal Sites",
          pillar: "Environmental",
          impact_score: 2.3,
          financial_score: 2.0,
          classification: "Not Material (Monitored)",
        },
      ],
    },
    {
      id: "cycle-2025",
      cycle_label: "FY 2025 Active Cycle",
      review_date: "2025-03-15",
      framework_version: "ESRS Set 1 + CSRD Omnibus / IPIECA 2025",
      impact_threshold: 3.0,
      financial_threshold: 3.0,
      approved_by: "Chief Sustainability Officer & Audit Committee",
      status: "Active Cycle",
      summary_note:
        "Current live double materiality cycle incorporating Q1 2025 stakeholder survey responses and updated financial exposure modeling.",
      points: [],
    },
  ];

  const rationaleLog: MaterialityRationaleEntry[] = [
    {
      id: "rat-01",
      cycle_label: "FY 2025 Active Cycle",
      topic_id: "topic-e1-ghg",
      topic_code: "ESRS-E1-GHG",
      topic_name: "Scope 1, 2 & 3 GHG Emissions & Decarbonization",
      decision_type: "Double Material Inclusion",
      esrs_iro_reference: "ESRS 2 IRO-1 §53(a) · ESRS E1",
      impact_score_snapshot: 4.76,
      financial_score_snapshot: 4.62,
      rationale_statement:
        "Classified as Double Material with highest priority. Direct Scope 1 cracking furnace emissions (1.84 MtCO₂e) and Scope 3 Cat 1/11/12 value chain footprint exceed the 3.0 severity threshold, while EU CBAM and carbon pricing create $420M in quantified transition financial exposure.",
      evidence_references:
        "ISO 14064-1 Verification Report 2024; EU CBAM Financial Sensitivity Model v4.2",
      recorded_by: "Dr. Z. Zerehsaz (Lead ESG Architect)",
      reviewer_signoff: "Audit & Risk Committee — Approved",
      recorded_at: now - 86400000 * 14,
    },
    {
      id: "rat-02",
      cycle_label: "FY 2025 Active Cycle",
      topic_id: "topic-e5-circular",
      topic_code: "ESRS-E5-CIR",
      topic_name: "Circular Polymers, Pyrolysis Feedstock & Catalyst Waste",
      decision_type: "YoY Score Escalation",
      esrs_iro_reference: "ESRS 2 IRO-1 §53(b) · ESRS E5",
      impact_score_snapshot: 3.84,
      financial_score_snapshot: 4.07,
      rationale_statement:
        "Escalated from Not Material in FY 2023 (2.85 / 2.90) to Double Material in FY 2024–2025. Downstream automotive and FMCG packaging customers ranked ISCC PLUS circular polymers at 4.8/5.0 financial criticality due to binding 2030 EU PPWR recycled-content quotas.",
      evidence_references:
        "Customer Advisory Survey Batch #03; ISCC PLUS Mass-Balance Audit Certificate",
      recorded_by: "A. Al-Harbi (VP Circular Economy)",
      reviewer_signoff: "External Assurance Partner — Verified",
      recorded_at: now - 86400000 * 10,
    },
    {
      id: "rat-03",
      cycle_label: "FY 2025 Active Cycle",
      topic_id: "topic-e2-air",
      topic_code: "ESRS-E2-AIR",
      topic_name: "Non-GHG Criteria Air Pollutants (NOx, SOx, VOC, BTEX)",
      decision_type: "Impact-Only Inclusion",
      esrs_iro_reference: "ESRS 1 §43 Impact Materiality · ESRS E2",
      impact_score_snapshot: 4.02,
      financial_score_snapshot: 2.3,
      rationale_statement:
        "Included under ESRS E2 based on Inside-Out Impact Materiality (4.02 ≥ 3.0 threshold) driven by fence-line community air quality concerns (4.8/5.0 rating), even though Outside-In Financial Materiality (2.30) remains below the 3.0 financial threshold because low-NOx SCR and SRU scrubbing are already funded in baseline OpEx.",
      evidence_references:
        "Port District Ambient Air Dispersion Study 2024; Stack CEMS Annual Ledger",
      recorded_by: "M. Chen (Principal Environmental Engineer)",
      reviewer_signoff: "CSRD Steering Committee — Approved",
      recorded_at: now - 86400000 * 7,
    },
    {
      id: "rat-04",
      cycle_label: "FY 2025 Active Cycle",
      topic_id: "topic-e4-biodiversity",
      topic_code: "ESRS-E4-BIO",
      topic_name: "Terrestrial & Marine Biodiversity Near Terminal Sites",
      decision_type: "Threshold Exclusion Rationale",
      esrs_iro_reference: "ESRS 2 IRO-1 §56 Non-Material Topic Explanation · ESRS E4",
      impact_score_snapshot: 1.9,
      financial_score_snapshot: 1.48,
      rationale_statement:
        "Omitted from full ESRS E4 topical disclosure as both Inside-Out Impact (1.90 < 3.0) and Outside-In Financial (1.48 < 3.0) scores fall below the CSRD materiality threshold. TNFD LEAP screening confirmed all operating crackers and storage terminals sit within zoned heavy-industrial corridors >14 km from protected Ramsar wetlands.",
      evidence_references:
        "TNFD LEAP Geospatial Screening Dossier 2025-Q1; Coastal EIA Renewal Permit",
      recorded_by: "Dr. Z. Zerehsaz (Lead ESG Architect)",
      reviewer_signoff: "External Assurance Partner — Verified",
      recorded_at: now - 86400000 * 3,
    },
  ];

  const initial: MaterialityWorkspaceState = {
    workspace_id: workspaceId,
    active_cycle: "FY 2025 Active Cycle",
    impact_threshold: 3.0,
    financial_threshold: 3.0,
    stakeholder_blend_ratio: 0.3,
    topics,
    stakeholder_groups: stakeholderGroups,
    survey_submissions: surveySubmissions,
    weight_change_logs: weightChangeLogs,
    standard_mappings: standardMappings,
    periodic_cycles: periodicCycles,
    rationale_log: rationaleLog,
    updated_at: now,
  };

  return recomputeMaterialityState(initial);
}

export function createSurveySubmissionId(): string {
  return `sub-${crypto.randomUUID().slice(0, 8)}`;
}

export function createRationaleId(): string {
  return `rat-${crypto.randomUUID().slice(0, 8)}`;
}

export function createTopicId(): string {
  return `topic-${crypto.randomUUID().slice(0, 8)}`;
}
