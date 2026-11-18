using EnterpriseKnowledge.WebUI.Models;
using EnterpriseKnowledge.WebUI.Services;

var builder = WebApplication.CreateBuilder(args);
builder.Services.Configure<RagApiOptions>(builder.Configuration.GetSection(RagApiOptions.Section));
builder.Services.AddHttpContextAccessor();
builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(o =>
{
    o.IdleTimeout = TimeSpan.FromHours(8);
    o.Cookie.HttpOnly = true;
    o.Cookie.IsEssential = true;
});
builder.Services.AddHttpClient<RagApiClient>((sp, client) =>
{
    var opts = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<RagApiOptions>>().Value;
    client.BaseAddress = new Uri(opts.BaseUrl.TrimEnd('/') + "/");
    client.Timeout = TimeSpan.FromSeconds(Math.Max(30, opts.TimeoutSeconds));
    client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
});
builder.Services.AddRazorPages();

var app = builder.Build();
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}
app.UseStaticFiles();
app.UseRouting();
app.UseSession();
app.MapRazorPages();

// ---- Web API Gateway endpoints for IoT devices, SCADA/BMS & ERP connectors ----
var ingest = app.MapGroup("/api/ingest");

ingest.MapGet("/health", async (RagApiClient rag, CancellationToken ct) =>
{
    var health = await rag.GetHealthAsync(ct);
    return Results.Ok(new
    {
        gateway = "ESG-Intelligence-Web-DotNet",
        status = health?.Ok == true ? "connected" : "degraded",
        rag_backend = health
    });
});

ingest.MapPost("/device", async (DeviceIngestPayload payload, RagApiClient rag, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(payload.Table))
        return Results.BadRequest(new { error = "table is required" });
    if (payload.Records.Count == 0)
        return Results.BadRequest(new { error = "records array must contain at least one item" });

    var result = await rag.EsgIngestDeviceAsync(payload, ct);
    return Results.Ok(result);
});

ingest.MapPost("/batch/{table}", async (
    string table,
    List<Dictionary<string, object?>> records,
    string? workspaceId,
    string? deviceId,
    bool? syncToRag,
    RagApiClient rag,
    CancellationToken ct) =>
{
    var payload = new DeviceIngestPayload
    {
        Table = table,
        WorkspaceId = workspaceId,
        DeviceId = deviceId ?? "dotnet-batch-connector",
        Records = records,
        SyncToRag = syncToRag ?? true
    };
    var result = await rag.EsgIngestDeviceAsync(payload, ct);
    return Results.Ok(result);
});

ingest.MapPost("/sync-rag", async (string? workspaceId, RagApiClient rag, CancellationToken ct) =>
{
    var result = await rag.EsgSyncToRagAsync(workspaceId, ct);
    return Results.Ok(result);
});

app.Run();
