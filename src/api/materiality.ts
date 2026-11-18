import { apiRequest } from "./client";

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
  impact_rating: number;
  financial_rating: number;
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
  impact_type:
    | "Actual Negative"
    | "Potential Negative"
    | "Actual Positive"
    | "Potential Positive";
  impact_scale: number;
  impact_scope: number;
  impact_irremediability: number;
  impact_likelihood: number;
  impact_score: number;
  impact_description: string;
  financial_effect_type:
    | "Transition Risk"
    | "Physical Risk"
    | "Regulatory / Liability Risk"
    | "Capital & Market Opportunity"
    | "Operational Cost Risk";
  financial_magnitude: number;
  financial_likelihood: number;
  financial_score: number;
  financial_driver: string;
  estimated_financial_exposure_musd: number;
  classification: MaterialityClassification;
  stakeholder_scores: Record<StakeholderGroupId, TopicStakeholderScore>;
  updated_at: number;
}

export interface StakeholderGroupConfig {
  group_id: StakeholderGroupId;
  name: string;
  description: string;
  weight_pct: number;
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
  cycle_label: string;
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
  impact_threshold: number;
  financial_threshold: number;
  stakeholder_blend_ratio: number;
  topics: MaterialityTopic[];
  stakeholder_groups: StakeholderGroupConfig[];
  survey_submissions: StakeholderSurveySubmission[];
  weight_change_logs: StakeholderWeightChangeLog[];
  standard_mappings: TopicStandardMapping[];
  periodic_cycles: PeriodicReviewCycle[];
  rationale_log: MaterialityRationaleEntry[];
  updated_at: number;
}

export async function fetchMaterialityState(): Promise<MaterialityWorkspaceState> {
  return apiRequest<MaterialityWorkspaceState>("/api/v1/materiality");
}

export async function updateMaterialityThresholds(payload: {
  impact_threshold?: number;
  financial_threshold?: number;
  stakeholder_blend_ratio?: number;
}): Promise<MaterialityWorkspaceState> {
  return apiRequest<MaterialityWorkspaceState>("/api/v1/materiality/thresholds", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function updateMaterialityTopic(
  topicId: string,
  payload: Partial<MaterialityTopic>,
): Promise<MaterialityWorkspaceState> {
  return apiRequest<MaterialityWorkspaceState>(
    `/api/v1/materiality/topics/${encodeURIComponent(topicId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function createMaterialityTopic(
  payload: Partial<MaterialityTopic> & { code: string; name: string },
): Promise<MaterialityWorkspaceState> {
  return apiRequest<MaterialityWorkspaceState>("/api/v1/materiality/topics", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateStakeholderWeights(payload: {
  weights: Record<StakeholderGroupId, number>;
  changed_by?: string;
  rationale?: string;
}): Promise<MaterialityWorkspaceState> {
  return apiRequest<MaterialityWorkspaceState>(
    "/api/v1/materiality/stakeholders/weights",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function submitStakeholderSurvey(payload: {
  topic_id: string;
  group_id: StakeholderGroupId;
  respondent_org: string;
  respondent_count: number;
  impact_rating: number;
  financial_rating: number;
  engagement_channel: string;
  comment: string;
  submitted_by: string;
}): Promise<MaterialityWorkspaceState> {
  return apiRequest<MaterialityWorkspaceState>(
    "/api/v1/materiality/stakeholders/surveys",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateTopicStandardMapping(
  mappingId: string,
  payload: Omit<
    Partial<TopicStandardMapping>,
    "esrs_standards" | "gri_standards" | "sasb_metrics" | "industry_metrics"
  > & {
    esrs_standards?: string[] | string;
    gri_standards?: string[] | string;
    sasb_metrics?: string[] | string;
    industry_metrics?: string[] | string;
  },
): Promise<MaterialityWorkspaceState> {
  return apiRequest<MaterialityWorkspaceState>(
    `/api/v1/materiality/mappings/${encodeURIComponent(mappingId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function createMaterialityRationale(payload: {
  cycle_label?: string;
  topic_id: string;
  decision_type: MaterialityRationaleEntry["decision_type"];
  esrs_iro_reference?: string;
  rationale_statement: string;
  evidence_references?: string;
  recorded_by?: string;
  reviewer_signoff?: string;
}): Promise<MaterialityWorkspaceState> {
  return apiRequest<MaterialityWorkspaceState>("/api/v1/materiality/rationale", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createPeriodicCycleSnapshot(payload: {
  cycle_label: string;
  review_date?: string;
  framework_version?: string;
  approved_by?: string;
  summary_note?: string;
}): Promise<MaterialityWorkspaceState> {
  return apiRequest<MaterialityWorkspaceState>(
    "/api/v1/materiality/cycles/snapshot",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}
