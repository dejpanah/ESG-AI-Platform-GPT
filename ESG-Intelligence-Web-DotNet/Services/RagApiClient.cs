using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using EnterpriseKnowledge.WebUI.Models;
using Microsoft.Extensions.Options;

namespace EnterpriseKnowledge.WebUI.Services;

public sealed class RagApiOptions
{
    public const string Section = "RagApi";
    public string BaseUrl { get; set; } = "http://127.0.0.1:8000/";
    public string DefaultWorkspace { get; set; } = "default";
    public string DefaultUser { get; set; } = "local";
    public int TimeoutSeconds { get; set; } = 120;
    public string? BearerToken { get; set; }
}

public sealed class RagApiException : Exception
{
    public int StatusCode { get; }
    public RagApiException(int status, string message) : base(message) => StatusCode = status;
}

public sealed class RagApiClient
{
    private readonly HttpClient _http;
    private readonly RagApiOptions _opts;
    private readonly IHttpContextAccessor _ctx;
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    public RagApiClient(HttpClient http, IOptions<RagApiOptions> opts, IHttpContextAccessor ctx)
    {
        _http = http;
        _opts = opts.Value;
        _ctx = ctx;
        if (_http.BaseAddress is null)
            _http.BaseAddress = new Uri(_opts.BaseUrl.TrimEnd('/') + "/");
        _http.Timeout = TimeSpan.FromSeconds(Math.Max(30, _opts.TimeoutSeconds));
    }

    public string CurrentWorkspaceId()
    {
        var c = _ctx.HttpContext;
        var ws = c?.Request.Cookies["knowledgeos.workspace"];
        return string.IsNullOrWhiteSpace(ws) ? _opts.DefaultWorkspace : ws.Trim();
    }

    public string CurrentUserId()
    {
        var c = _ctx.HttpContext;
        var user = c?.Request.Cookies["knowledgeos.user"];
        return string.IsNullOrWhiteSpace(user) ? _opts.DefaultUser : user.Trim();
    }

    private void ApplyHeaders(HttpRequestMessage req, string? overrideWorkspace = null)
    {
        var c = _ctx.HttpContext;
        req.Headers.TryAddWithoutValidation("X-Workspace-ID", string.IsNullOrWhiteSpace(overrideWorkspace) ? CurrentWorkspaceId() : overrideWorkspace);
        req.Headers.TryAddWithoutValidation("X-User-ID", CurrentUserId());
        var token = c?.Request.Cookies["knowledgeos.token"] ?? _opts.BearerToken;
        if (!string.IsNullOrWhiteSpace(token))
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }

    private async Task<T?> SendAsync<T>(HttpMethod method, string path, object? body = null, string? workspaceId = null, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(method, path.TrimStart('/'));
        ApplyHeaders(req, workspaceId);
        if (body is not null)
            req.Content = JsonContent.Create(body, options: Json);
        using var resp = await _http.SendAsync(req, ct);
        var text = await resp.Content.ReadAsStringAsync(ct);
        if (resp.StatusCode == System.Net.HttpStatusCode.NoContent) return default;
        if (!resp.IsSuccessStatusCode)
            throw new RagApiException((int)resp.StatusCode, text.Length > 400 ? text[..400] : text);
        if (string.IsNullOrWhiteSpace(text)) return default;
        return JsonSerializer.Deserialize<T>(text, Json);
    }

    private async Task SendVoidAsync(HttpMethod method, string path, object? body = null, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(method, path.TrimStart('/'));
        ApplyHeaders(req);
        if (body is not null)
            req.Content = JsonContent.Create(body, options: Json);
        using var resp = await _http.SendAsync(req, ct);
        if (!resp.IsSuccessStatusCode)
            throw new RagApiException((int)resp.StatusCode, await resp.Content.ReadAsStringAsync(ct));
    }

    public Task<HealthInfo?> GetHealthAsync(CancellationToken ct = default) => SendAsync<HealthInfo>(HttpMethod.Get, "api/health", ct: ct);
    public Task<JsonElement?> GetConfigAsync(CancellationToken ct = default) => SendAsync<JsonElement?>(HttpMethod.Get, "api/config", ct: ct);
    public Task<JsonElement?> GetMetricsAsync(CancellationToken ct = default) => SendAsync<JsonElement?>(HttpMethod.Get, "api/metrics", ct: ct);
    public Task<StorageInfo?> GetStorageAsync(CancellationToken ct = default) => SendAsync<StorageInfo>(HttpMethod.Get, "api/storage", ct: ct);
    public async Task<List<ActivityItem>> ListActivityAsync(CancellationToken ct = default) => (await SendAsync<ActivityResponse>(HttpMethod.Get, "api/activity", ct: ct))?.Events ?? new();

    public Task<ChatResponse?> ChatAsync(string question, int topK = 8, string? documentId = null, bool requireCitations = false, CancellationToken ct = default) =>
        SendAsync<ChatResponse>(HttpMethod.Post, "api/chat", new ChatRequest { Question = question, TopK = topK, DocumentId = documentId, RequireCitations = requireCitations }, ct: ct);

    public Task<object?> SubmitFeedbackAsync(string traceId, int rating, string? comment = null, CancellationToken ct = default) =>
        SendAsync<object>(HttpMethod.Post, "api/feedback", new { trace_id = traceId, rating, comment }, ct: ct);

    public Task<object?> VerifyClaimsAsync(string answer, IEnumerable<string> citationChunkIds, CancellationToken ct = default) =>
        SendAsync<object>(HttpMethod.Post, "api/verify/claims", new { answer, citation_chunk_ids = citationChunkIds.ToList() }, ct: ct);

    public async Task<List<DocumentItem>> ListDocumentsAsync(CancellationToken ct = default) => (await SendAsync<DocumentsResponse>(HttpMethod.Get, "api/documents", ct: ct))?.Documents ?? new();
    public Task<DocumentDetailResponse?> GetDocumentDetailAsync(string id, CancellationToken ct = default) => SendAsync<DocumentDetailResponse>(HttpMethod.Get, $"api/documents/{Uri.EscapeDataString(id)}", ct: ct);
    public async Task<DocumentItem?> GetDocumentAsync(string id, CancellationToken ct = default) => (await GetDocumentDetailAsync(id, ct))?.Document;

    public async Task UploadDocumentAsync(IFormFile file, CancellationToken ct = default)
    {
        using var content = new MultipartFormDataContent();
        await using var stream = file.OpenReadStream();
        var part = new StreamContent(stream);
        part.Headers.ContentType = new MediaTypeHeaderValue(file.ContentType ?? "application/octet-stream");
        // Python FastAPI & Express multer expect "files"
        content.Add(part, "files", file.FileName);
        using var req = new HttpRequestMessage(HttpMethod.Post, "api/documents") { Content = content };
        ApplyHeaders(req);
        using var resp = await _http.SendAsync(req, ct);
        if (!resp.IsSuccessStatusCode)
            throw new RagApiException((int)resp.StatusCode, await resp.Content.ReadAsStringAsync(ct));
    }

    public Task DeleteDocumentAsync(string id, CancellationToken ct = default) => SendVoidAsync(HttpMethod.Delete, $"api/documents/{Uri.EscapeDataString(id)}", ct: ct);
    public Task<object?> ClearDocumentChunksAsync(string id, CancellationToken ct = default) => SendAsync<object>(HttpMethod.Delete, $"api/documents/{Uri.EscapeDataString(id)}/chunks", ct: ct);
    public Task<object?> SyncDocumentsAsync(string? documentId = null, CancellationToken ct = default) =>
        SendAsync<object>(HttpMethod.Post, "api/documents/sync", documentId is null ? new { } : new { document_id = documentId }, ct: ct);
    public Task<object?> ReindexDocumentsAsync(string? documentId = null, CancellationToken ct = default) =>
        SendAsync<object>(HttpMethod.Post, "api/documents/index", documentId is null ? new { } : new { document_id = documentId }, ct: ct);
    public Task<object?> AddDocumentPathAsync(string path, CancellationToken ct = default) => SendAsync<object>(HttpMethod.Post, "api/documents", new { path }, ct: ct);
    public Task<object?> AddGitRepositoryAsync(string url, string? branch = null, CancellationToken ct = default) =>
        SendAsync<object>(HttpMethod.Post, "api/repositories/git", new { url, branch }, ct: ct);
    public async Task<List<DocumentChange>> ListChangesAsync(CancellationToken ct = default) => (await SendAsync<ChangesResponse>(HttpMethod.Get, "api/changes/latest", ct: ct))?.Changes ?? new();

    public Task<JobInfo?> GetJobAsync(string id, CancellationToken ct = default) => SendAsync<JobInfo>(HttpMethod.Get, $"api/jobs/{Uri.EscapeDataString(id)}", ct: ct);
    public Task CancelJobAsync(string id, CancellationToken ct = default) => SendVoidAsync(HttpMethod.Delete, $"api/jobs/{Uri.EscapeDataString(id)}", ct: ct);
    public async Task<List<JobInfo>> ListSyncQueueAsync(CancellationToken ct = default) => (await SendAsync<JobsResponse>(HttpMethod.Get, "api/sync", ct: ct))?.Jobs ?? new();

    public async Task<List<IndexItem>> ListIndexesAsync(CancellationToken ct = default) => (await SendAsync<IndexesResponse>(HttpMethod.Get, "api/indexes", ct: ct))?.Indexes ?? new();
    public Task<object?> CreateIndexAsync(CancellationToken ct = default) => SendAsync<object>(HttpMethod.Post, "api/indexes", new { }, ct: ct);
    public Task<object?> IndexActionAsync(string id, string action, CancellationToken ct = default) =>
        SendAsync<object>(HttpMethod.Post, $"api/indexes/{Uri.EscapeDataString(id)}/{action}", ct: ct);

    public async Task<List<ProviderProfile>> ListProvidersAsync(CancellationToken ct = default) => await SendAsync<List<ProviderProfile>>(HttpMethod.Get, "api/models/profiles", ct: ct) ?? new();
    public Task<object?> CreateProviderAsync(object body, CancellationToken ct = default) => SendAsync<object>(HttpMethod.Post, "api/models/profiles", body, ct: ct);
    public Task<object?> UpdateProviderAsync(string id, object body, CancellationToken ct = default) =>
        SendAsync<object>(HttpMethod.Patch, $"api/models/profiles/{Uri.EscapeDataString(id)}", body, ct: ct);
    public Task DeleteProviderAsync(string id, CancellationToken ct = default) => SendVoidAsync(HttpMethod.Delete, $"api/models/profiles/{Uri.EscapeDataString(id)}", ct: ct);
    public Task<object?> TestProviderAsync(string id, CancellationToken ct = default) => SendAsync<object>(HttpMethod.Post, $"api/models/profiles/{Uri.EscapeDataString(id)}/test", ct: ct);
    public async Task<List<string>> ListOpenAIModelsAsync(CancellationToken ct = default)
    {
        var r = await SendAsync<OpenAIModelsResponse>(HttpMethod.Get, "v1/models", ct: ct);
        return r?.Data?.Select(x => x.Id).Where(x => !string.IsNullOrWhiteSpace(x)).ToList() ?? new();
    }

    public async Task<List<GoldenItem>> ListGoldenAsync(CancellationToken ct = default) => (await SendAsync<GoldenResponse>(HttpMethod.Get, "api/evaluations/golden", ct: ct))?.Items ?? new();
    public Task<object?> AddGoldenAsync(string question, string? expectedAnswer = null, string? expectedDocumentId = null, string? expectedChunkId = null, CancellationToken ct = default) =>
        SendAsync<object>(HttpMethod.Post, "api/evaluations/golden", new
        {
            question,
            expected_answer = expectedAnswer,
            expected_document_id = expectedDocumentId,
            expected_chunk_id = expectedChunkId
        }, ct: ct);

    // ---- ESG structured data CRUD & device ingestion ----
    public Task<JsonElement?> EsgListTablesAsync(CancellationToken ct = default) =>
        SendAsync<JsonElement?>(HttpMethod.Get, "api/v1/esg/tables", ct: ct);

    public Task<JsonElement?> EsgListRowsAsync(string table, string? workspaceId = null, int limit = 100, CancellationToken ct = default)
    {
        var q = $"api/v1/esg/tables/{Uri.EscapeDataString(table)}?limit={limit}";
        if (!string.IsNullOrWhiteSpace(workspaceId))
            q += $"&workspace_id={Uri.EscapeDataString(workspaceId)}";
        return SendAsync<JsonElement?>(HttpMethod.Get, q, ct: ct);
    }

    public Task<JsonElement?> EsgCreateRowAsync(string table, object body, CancellationToken ct = default) =>
        SendAsync<JsonElement?>(HttpMethod.Post, $"api/v1/esg/tables/{Uri.EscapeDataString(table)}", body, ct: ct);

    public Task<JsonElement?> EsgUpdateRowAsync(string table, long id, object body, CancellationToken ct = default) =>
        SendAsync<JsonElement?>(HttpMethod.Put, $"api/v1/esg/tables/{Uri.EscapeDataString(table)}/{id}", body, ct: ct);

    public Task EsgDeleteRowAsync(string table, long id, string? workspaceId = null, CancellationToken ct = default)
    {
        var q = $"api/v1/esg/tables/{Uri.EscapeDataString(table)}/{id}";
        if (!string.IsNullOrWhiteSpace(workspaceId))
            q += $"?workspace_id={Uri.EscapeDataString(workspaceId)}";
        return SendVoidAsync(HttpMethod.Delete, q, ct: ct);
    }

    public Task<JsonElement?> EsgBulkCreateAsync(string table, object body, string? workspaceId = null, CancellationToken ct = default) =>
        SendAsync<JsonElement?>(HttpMethod.Post, $"api/v1/esg/tables/{Uri.EscapeDataString(table)}/bulk", body, workspaceId, ct);

    public Task<JsonElement?> EsgIngestDeviceAsync(DeviceIngestPayload payload, CancellationToken ct = default) =>
        SendAsync<JsonElement?>(HttpMethod.Post, "api/v1/esg/ingest", payload, payload.WorkspaceId, ct);

    public Task<JsonElement?> EsgSyncToRagAsync(string? workspaceId = null, CancellationToken ct = default) =>
        SendAsync<JsonElement?>(HttpMethod.Post, "api/v1/esg/sync-to-rag", new { workspace_id = workspaceId ?? CurrentWorkspaceId() }, workspaceId, ct);

    public Task<JsonElement?> EsgMetricsAsync(object body, CancellationToken ct = default) =>
        SendAsync<JsonElement?>(HttpMethod.Post, "api/v1/esg/metrics", body, ct: ct);

    public Task<JsonElement?> EsgGenerateReportAsync(object body, CancellationToken ct = default) =>
        SendAsync<JsonElement?>(HttpMethod.Post, "api/v1/esg/generate-report", body, ct: ct);

    public async Task<List<ReportItem>> ListReportsAsync(string? workspaceId = null, CancellationToken ct = default)
    {
        var ws = string.IsNullOrWhiteSpace(workspaceId) ? CurrentWorkspaceId() : workspaceId;
        return await SendAsync<List<ReportItem>>(HttpMethod.Get, $"api/v1/reports?workspace_id={Uri.EscapeDataString(ws)}", workspaceId: ws, ct: ct) ?? new();
    }

    public Task<ReportItem?> GetReportAsync(string id, string? workspaceId = null, CancellationToken ct = default)
    {
        var ws = string.IsNullOrWhiteSpace(workspaceId) ? CurrentWorkspaceId() : workspaceId;
        return SendAsync<ReportItem>(HttpMethod.Get, $"api/v1/reports/{Uri.EscapeDataString(id)}?workspace_id={Uri.EscapeDataString(ws)}", workspaceId: ws, ct: ct);
    }

    public Task<ReportItem?> AggregateReportsAsync(object body, string? workspaceId = null, CancellationToken ct = default) =>
        SendAsync<ReportItem>(HttpMethod.Post, "api/v1/reports/aggregate", body, workspaceId, ct);
}
