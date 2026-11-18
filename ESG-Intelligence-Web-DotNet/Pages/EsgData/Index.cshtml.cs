using System.Text.Json;
using EnterpriseKnowledge.WebUI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace EnterpriseKnowledge.WebUI.Pages.EsgData;

public class IndexModel : PageModel
{
    private readonly RagApiClient _api;

    public IndexModel(RagApiClient api) => _api = api;

    public List<TableInfo> Tables { get; set; } = new();
    public string? SelectedTable { get; set; }
    public string TableKind { get; set; } = "fact";
    public List<string> WritableFields { get; set; } = new();
    public List<string> RequiredFields { get; set; } = new();
    public List<Dictionary<string, JsonElement>> Rows { get; set; } = new();
    public int Total { get; set; }
    public string WorkspaceId => _api.CurrentWorkspaceId();
    public string? Error { get; set; }

    [BindProperty] public string? FormTable { get; set; }
    [BindProperty] public Dictionary<string, string?> FormFields { get; set; } = new();

    public class TableInfo
    {
        public string Name { get; set; } = "";
        public string Kind { get; set; } = "";
    }

    public async Task OnGetAsync(string? table, CancellationToken ct)
    {
        await LoadCatalog(ct);
        SelectedTable = table;
        if (!string.IsNullOrWhiteSpace(table))
            await LoadTable(table, ct);
    }

    public async Task<IActionResult> OnPostCreateAsync(CancellationToken ct)
    {
        await LoadCatalog(ct);
        SelectedTable = FormTable;
        if (string.IsNullOrWhiteSpace(FormTable))
        {
            Error = "جدول انتخاب نشده است.";
            return Page();
        }
        try
        {
            var body = new Dictionary<string, object?>();
            foreach (var kv in FormFields)
            {
                if (string.IsNullOrWhiteSpace(kv.Value)) continue;
                if (bool.TryParse(kv.Value, out var b)) body[kv.Key] = b;
                else if (long.TryParse(kv.Value, out var l)) body[kv.Key] = l;
                else if (double.TryParse(kv.Value, System.Globalization.NumberStyles.Any,
                             System.Globalization.CultureInfo.InvariantCulture, out var d)) body[kv.Key] = d;
                else body[kv.Key] = kv.Value;
            }
            if (!body.ContainsKey("workspace_id"))
                body["workspace_id"] = WorkspaceId;
            await _api.EsgCreateRowAsync(FormTable, body, ct);
            TempData["Success"] = "رکورد با موفقیت ذخیره شد.";
            return RedirectToPage(new { table = FormTable });
        }
        catch (Exception ex)
        {
            Error = ex.Message;
            await LoadTable(FormTable, ct);
            return Page();
        }
    }

    public async Task<IActionResult> OnPostDeleteAsync(string table, long id, CancellationToken ct)
    {
        try
        {
            await _api.EsgDeleteRowAsync(table, id, WorkspaceId, ct);
            TempData["Success"] = $"رکورد {id} حذف شد.";
        }
        catch (Exception ex)
        {
            TempData["Error"] = ex.Message;
        }
        return RedirectToPage(new { table });
    }

    public async Task<IActionResult> OnPostSyncRagAsync(string? table, CancellationToken ct)
    {
        try
        {
            var res = await _api.EsgSyncToRagAsync(WorkspaceId, ct);
            var chunks = res is not null && res.Value.TryGetProperty("chunks_indexed", out var c) ? c.GetInt32() : 0;
            TempData["Success"] = $"اسنپ‌شات داده‌های Postgres با موفقیت در RAG ایندکس شد ({chunks} chunk).";
        }
        catch (Exception ex)
        {
            TempData["Error"] = "خطا در همگام‌سازی با RAG: " + ex.Message;
        }
        return RedirectToPage(new { table });
    }

    private async Task LoadCatalog(CancellationToken ct)
    {
        try
        {
            var el = await _api.EsgListTablesAsync(ct);
            if (el is null || el.Value.ValueKind != JsonValueKind.Object) return;
            if (!el.Value.TryGetProperty("tables", out var arr)) return;
            foreach (var item in arr.EnumerateArray())
            {
                Tables.Add(new TableInfo
                {
                    Name = item.GetProperty("table").GetString() ?? "",
                    Kind = item.TryGetProperty("kind", out var k) ? k.GetString() ?? "" : "",
                });
            }
        }
        catch (Exception ex)
        {
            Error = "خطا در دریافت فهرست جداول: " + ex.Message;
        }
    }

    private async Task LoadTable(string table, CancellationToken ct)
    {
        try
        {
            var cat = await _api.EsgListTablesAsync(ct);
            if (cat is not null && cat.Value.TryGetProperty("tables", out var arr))
            {
                foreach (var item in arr.EnumerateArray())
                {
                    if ((item.GetProperty("table").GetString() ?? "") != table) continue;
                    TableKind = item.TryGetProperty("kind", out var k) ? k.GetString() ?? "fact" : "fact";
                    WritableFields = item.GetProperty("writable").EnumerateArray().Select(x => x.GetString() ?? "").Where(x => x != "").ToList();
                    RequiredFields = item.GetProperty("required").EnumerateArray().Select(x => x.GetString() ?? "").Where(x => x != "").ToList();
                    break;
                }
            }

            var ws = TableKind == "fact" ? WorkspaceId : null;
            var data = await _api.EsgListRowsAsync(table, ws, 50, ct);
            if (data is null) return;
            if (data.Value.TryGetProperty("total", out var total)) Total = total.GetInt32();
            if (data.Value.TryGetProperty("items", out var items))
            {
                foreach (var row in items.EnumerateArray())
                {
                    var dict = new Dictionary<string, JsonElement>();
                    foreach (var prop in row.EnumerateObject())
                        dict[prop.Name] = prop.Value.Clone();
                    Rows.Add(dict);
                }
            }
        }
        catch (Exception ex)
        {
            Error = "خطا در بارگذاری داده: " + ex.Message;
        }
    }
}
