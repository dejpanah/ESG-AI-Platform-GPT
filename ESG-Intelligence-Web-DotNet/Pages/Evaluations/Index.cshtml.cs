using EnterpriseKnowledge.WebUI.Models;
using EnterpriseKnowledge.WebUI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace EnterpriseKnowledge.WebUI.Pages.Evaluations;

public class IndexModel : PageModel
{
    private readonly RagApiClient _api;
    public IndexModel(RagApiClient api) => _api = api;
    public List<GoldenItem> Items { get; private set; } = new();
    public List<DocumentItem> Documents { get; private set; } = new();
    public string? Error { get; private set; }
    [BindProperty] public string Question { get; set; } = "";
    [BindProperty] public string? ExpectedDocumentId { get; set; }
    [BindProperty] public string? ExpectedChunkId { get; set; }
    [BindProperty] public string? ExpectedAnswer { get; set; }

    public async Task OnGetAsync(CancellationToken ct)
    {
        try
        {
            Items = await _api.ListGoldenAsync(ct);
            Documents = await _api.ListDocumentsAsync(ct);
        }
        catch (Exception ex) { Error = ex.Message; }
    }

    public async Task<IActionResult> OnPostAddAsync(CancellationToken ct)
    {
        try
        {
            await _api.AddGoldenAsync(
                Question,
                string.IsNullOrWhiteSpace(ExpectedAnswer) ? null : ExpectedAnswer,
                string.IsNullOrWhiteSpace(ExpectedDocumentId) ? null : ExpectedDocumentId,
                string.IsNullOrWhiteSpace(ExpectedChunkId) ? null : ExpectedChunkId,
                ct);
            TempData["Success"] = "اضافه شد";
        }
        catch (Exception ex) { TempData["Error"] = ex.Message; }
        return RedirectToPage();
    }
}
