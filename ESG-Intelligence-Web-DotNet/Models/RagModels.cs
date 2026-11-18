using System.Text.Json.Serialization;

namespace EnterpriseKnowledge.WebUI.Models;

public sealed class HealthInfo
{
    public bool Ok { get; set; }
    public string? Version { get; set; }
    public string? Database { get; set; }
    [JsonPropertyName("db_ok")] public bool? DbOk { get; set; }
    public int Documents { get; set; }
    public int Chunks { get; set; }
    [JsonPropertyName("fts_active")] public bool? FtsActive { get; set; }
    [JsonPropertyName("vector_backend")] public string? VectorBackend { get; set; }
    [JsonPropertyName("active_index")] public string? ActiveIndex { get; set; }
    [JsonPropertyName("embedding_provider")] public string? EmbeddingProvider { get; set; }
}

public sealed class DocumentItem
{
    public string Id { get; set; } = "";
    public string Filename { get; set; } = "";
    public string Path { get; set; } = "";
    public string Extension { get; set; } = "";
    public string Status { get; set; } = "";
    public int Chunks { get; set; }
    [JsonPropertyName("size_bytes")] public long SizeBytes { get; set; }
    public int Version { get; set; }
    public string? Error { get; set; }
    public string? Stage { get; set; }
    public double? Progress { get; set; }
}

public sealed class DocumentChunkItem
{
    public string Id { get; set; } = "";
    public int Index { get; set; }
    [JsonPropertyName("line_start")] public int LineStart { get; set; }
    [JsonPropertyName("line_end")] public int LineEnd { get; set; }
    public string? Section { get; set; }
    public int Tokens { get; set; }
    public string Excerpt { get; set; } = "";
}

public sealed class DocumentDetailResponse
{
    public DocumentItem Document { get; set; } = new();
    public string? Content { get; set; }
    public List<DocumentChunkItem> Chunks { get; set; } = new();
}

public sealed class DocumentsResponse
{
    public List<DocumentItem> Documents { get; set; } = new();
}

public sealed class DocumentChange
{
    [JsonPropertyName("document_id")] public string DocumentId { get; set; } = "";
    public string Filename { get; set; } = "";
    public string Path { get; set; } = "";
    [JsonPropertyName("changed_at")] public long ChangedAt { get; set; }
}

public sealed class ChangesResponse
{
    public List<DocumentChange> Changes { get; set; } = new();
}

public sealed class ChatRequest
{
    public string Question { get; set; } = "";
    [JsonPropertyName("top_k")] public int TopK { get; set; } = 8;
    [JsonPropertyName("document_id")] public string? DocumentId { get; set; }
    [JsonPropertyName("require_citations")] public bool RequireCitations { get; set; }
}

public sealed class ChatResponse
{
    public string Answer { get; set; } = "";
    public List<Citation> Citations { get; set; } = new();
    public double Confidence { get; set; }
    [JsonPropertyName("trace_id")] public string? TraceId { get; set; }
    public string? Model { get; set; }
    [JsonPropertyName("cache_hit")] public bool CacheHit { get; set; }
    public EvidenceBlock? Evidence { get; set; }
}

public sealed class EvidenceBlock
{
    public string? Decision { get; set; }
    [JsonPropertyName("require_citations")] public bool RequireCitations { get; set; }
}

public sealed class Citation
{
    [JsonPropertyName("chunk_id")] public string ChunkId { get; set; } = "";
    [JsonPropertyName("document_id")] public string DocumentId { get; set; } = "";
    public string Filename { get; set; } = "";
    public string Excerpt { get; set; } = "";
    public double Score { get; set; }
    [JsonPropertyName("line_start")] public int LineStart { get; set; }
    [JsonPropertyName("line_end")] public int LineEnd { get; set; }
}

public sealed class IndexItem
{
    public string Id { get; set; } = "";
    public string State { get; set; } = "";
    public int Revision { get; set; }
    public string? Embedding { get; set; }
    public int Documents { get; set; }
    public int Chunks { get; set; }
}

public sealed class IndexesResponse
{
    public List<IndexItem> Indexes { get; set; } = new();
}

public sealed class ProviderProfile
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "";
    [JsonPropertyName("base_url")] public string BaseUrl { get; set; } = "";
    public string Model { get; set; } = "";
    public string Role { get; set; } = "Generation";
    public bool Enabled { get; set; } = true;
}

public sealed class StorageInfo
{
    public int Documents { get; set; }
    [JsonPropertyName("original_bytes")] public long OriginalBytes { get; set; }
    public int Chunks { get; set; }
    public string Storage { get; set; } = "local";
    [JsonPropertyName("data_directory")] public string? DataDirectory { get; set; }
}

public sealed class ActivityItem
{
    public string Id { get; set; } = "";
    public string Kind { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Detail { get; set; }
    [JsonPropertyName("created_at")] public long CreatedAt { get; set; }
}

public sealed class ActivityResponse
{
    public List<ActivityItem> Events { get; set; } = new();
}

public sealed class JobInfo
{
    public string Id { get; set; } = "";
    public string Status { get; set; } = "";
    public string? Stage { get; set; }
    public double Progress { get; set; }
    [JsonPropertyName("error")] public string? Error { get; set; }
    [JsonIgnore] public string? LastError => Error;
    [JsonPropertyName("document_id")] public string? DocumentId { get; set; }
    [JsonPropertyName("document_name")] public string? DocumentName { get; set; }
}

public sealed class JobsResponse
{
    public List<JobInfo> Jobs { get; set; } = new();
}

public sealed class GoldenItem
{
    public string Id { get; set; } = "";
    public string Question { get; set; } = "";
    [JsonPropertyName("expected_document_id")] public string? ExpectedDocumentId { get; set; }
    [JsonPropertyName("expected_chunk_id")] public string? ExpectedChunkId { get; set; }
    [JsonPropertyName("expected_answer")] public string? ExpectedAnswer { get; set; }
}

public sealed class GoldenResponse
{
    public List<GoldenItem> Items { get; set; } = new();
}

public sealed class ReportItem
{
    public string Id { get; set; } = "";
    [JsonPropertyName("workspace_id")] public string WorkspaceId { get; set; } = "default";
    public string Title { get; set; } = "";
    [JsonPropertyName("report_type")] public string ReportType { get; set; } = "";
    public string Body { get; set; } = "";
    public string Status { get; set; } = "";
    [JsonPropertyName("created_at")] public long CreatedAt { get; set; }
}

public sealed class DeviceIngestPayload
{
    [JsonPropertyName("workspace_id")] public string? WorkspaceId { get; set; }
    [JsonPropertyName("device_id")] public string? DeviceId { get; set; }
    [JsonPropertyName("source_system")] public string? SourceSystem { get; set; }
    public string Table { get; set; } = "esg_co2_emission";
    public List<Dictionary<string, object?>> Records { get; set; } = new();
    [JsonPropertyName("sync_to_rag")] public bool SyncToRag { get; set; } = true;
}

public sealed class OpenAIModelsResponse
{
    public List<OpenAIModelItem>? Data { get; set; }
}

public sealed class OpenAIModelItem
{
    public string Id { get; set; } = "";
}
