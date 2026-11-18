using EnterpriseKnowledge.WebUI.Models;
using EnterpriseKnowledge.WebUI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace EnterpriseKnowledge.WebUI.Pages.Indexes;

public class IndexModel : PageModel
{
    private readonly RagApiClient _api;
    public IndexModel(RagApiClient api) => _api = api;
    public List<IndexItem> Indexes { get; private set; } = new();
    public string? Error { get; private set; }
    public async Task OnGetAsync(CancellationToken ct)
    {
        try { Indexes = await _api.ListIndexesAsync(ct); }
        catch (Exception ex) { Error = ex.Message; }
    }
    public async Task<IActionResult> OnPostCreateAsync(CancellationToken ct)
    {
        try { await _api.CreateIndexAsync(ct); TempData["Success"] = "ساخته شد"; }
        catch (Exception ex) { TempData["Error"] = ex.Message; }
        return RedirectToPage();
    }
    public async Task<IActionResult> OnPostActionAsync(string id, string action, CancellationToken ct)
    {
        try { await _api.IndexActionAsync(id, action, ct); TempData["Success"] = $"{action} ok"; }
        catch (Exception ex) { TempData["Error"] = ex.Message; }
        return RedirectToPage();
    }
}
