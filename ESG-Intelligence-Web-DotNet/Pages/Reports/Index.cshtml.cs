using System.Text.Json;
using EnterpriseKnowledge.WebUI.Models;
using EnterpriseKnowledge.WebUI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace EnterpriseKnowledge.WebUI.Pages.Reports;

public class IndexModel : PageModel
{
    private readonly RagApiClient _api;
    public IndexModel(RagApiClient api) => _api = api;

    [BindProperty] public string Title { get; set; } = "گزارش ESG دوره‌ای";
    [BindProperty] public string ReportType { get; set; } = "esg_periodic";
    [BindProperty] public string? FromDate { get; set; } = "2024-01-01";
    [BindProperty] public string? ToDate { get; set; } = "2024-12-31";
    [BindProperty] public string? Instructions { get; set; }
    [BindProperty] public List<string> SelectedReportIds { get; set; } = new();
    [BindProperty] public string? AggregateTitle { get; set; }

    public List<ReportItem> SavedReports { get; set; } = new();
    public string? GeneratedBody { get; set; }
    public string? Error { get; set; }

    public async Task OnGetAsync(string? id, CancellationToken ct)
    {
        await LoadSavedAsync(ct);
        if (!string.IsNullOrWhiteSpace(id))
        {
            try
            {
                var rep = await _api.GetReportAsync(id, _api.CurrentWorkspaceId(), ct);
                if (rep is not null) GeneratedBody = rep.Body;
            }
            catch (Exception ex) { Error = ex.Message; }
        }
    }

    public async Task<IActionResult> OnPostAsync(CancellationToken ct)
    {
        try
        {
            var body = new
            {
                workspace_id = _api.CurrentWorkspaceId(),
                title = Title,
                report_type = ReportType,
                from_date = FromDate,
                to_date = ToDate,
                instructions = Instructions,
                language = "fa",
                include_metrics = true,
                include_rag = true,
                save = true,
            };
            var result = await _api.EsgGenerateReportAsync(body, ct);
            if (result is not null && result.Value.TryGetProperty("body", out var b))
                GeneratedBody = b.GetString();
            TempData["Success"] = "گزارش تولید شد.";
        }
        catch (Exception ex)
        {
            Error = ex.Message;
        }
        await LoadSavedAsync(ct);
        return Page();
    }

    public async Task<IActionResult> OnPostAggregateAsync(CancellationToken ct)
    {
        if (SelectedReportIds.Count < 2)
        {
            Error = "برای تجمیع حداقل ۲ گزارش انتخاب کنید.";
            await LoadSavedAsync(ct);
            return Page();
        }
        try
        {
            var agg = await _api.AggregateReportsAsync(new
            {
                workspace_id = _api.CurrentWorkspaceId(),
                title = string.IsNullOrWhiteSpace(AggregateTitle) ? "گزارش تجمیعی ESG" : AggregateTitle,
                source_report_ids = SelectedReportIds,
                instructions = Instructions,
                save = true
            }, _api.CurrentWorkspaceId(), ct);
            if (agg is not null) GeneratedBody = agg.Body;
            TempData["Success"] = "گزارش تجمیعی ساخته شد.";
        }
        catch (Exception ex)
        {
            Error = ex.Message;
        }
        await LoadSavedAsync(ct);
        return Page();
    }

    private async Task LoadSavedAsync(CancellationToken ct)
    {
        try { SavedReports = await _api.ListReportsAsync(_api.CurrentWorkspaceId(), ct); }
        catch (Exception ex) { Error ??= ex.Message; }
    }
}
