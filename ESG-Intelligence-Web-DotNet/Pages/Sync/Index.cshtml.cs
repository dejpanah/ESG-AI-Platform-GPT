using EnterpriseKnowledge.WebUI.Models;
using EnterpriseKnowledge.WebUI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace EnterpriseKnowledge.WebUI.Pages.Sync;

public class IndexModel : PageModel
{
    private readonly RagApiClient _api;
    public IndexModel(RagApiClient api) => _api = api;
    public List<JobInfo> Jobs { get; private set; } = new();
    public string? Error { get; private set; }
    [BindProperty] public string GitUrl { get; set; } = "";
    [BindProperty] public string? Branch { get; set; }

    public async Task OnGetAsync(CancellationToken ct)
    {
        try { Jobs = await _api.ListSyncQueueAsync(ct); }
        catch (Exception ex) { Error = ex.Message; }
    }

    public async Task<IActionResult> OnPostSyncAsync(CancellationToken ct)
    {
        try { await _api.SyncDocumentsAsync(ct: ct); TempData["Success"] = "Sync"; }
        catch (Exception ex) { TempData["Error"] = ex.Message; }
        return RedirectToPage();
    }

    public async Task<IActionResult> OnPostIndexAsync(CancellationToken ct)
    {
        try { await _api.ReindexDocumentsAsync(ct: ct); TempData["Success"] = "Index"; }
        catch (Exception ex) { TempData["Error"] = ex.Message; }
        return RedirectToPage();
    }

    public async Task<IActionResult> OnPostCancelAsync(string id, CancellationToken ct)
    {
        try { await _api.CancelJobAsync(id, ct); TempData["Success"] = "لغو شد"; }
        catch (Exception ex) { TempData["Error"] = ex.Message; }
        return RedirectToPage();
    }

    public async Task<IActionResult> OnPostGitAsync(CancellationToken ct)
    {
        try { await _api.AddGitRepositoryAsync(GitUrl, Branch, ct); TempData["Success"] = "Git clone درخواست شد"; }
        catch (Exception ex) { TempData["Error"] = ex.Message; }
        return RedirectToPage();
    }
}
