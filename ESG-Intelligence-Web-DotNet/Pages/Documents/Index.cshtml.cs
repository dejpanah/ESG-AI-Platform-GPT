using EnterpriseKnowledge.WebUI.Models;
using EnterpriseKnowledge.WebUI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace EnterpriseKnowledge.WebUI.Pages.Documents;

public class IndexModel : PageModel
{
    private readonly RagApiClient _api;
    public IndexModel(RagApiClient api) => _api = api;
    public List<DocumentItem> Documents { get; private set; } = new();
    public List<DocumentChange> Changes { get; private set; } = new();
    public string? Error { get; private set; }

    public async Task OnGetAsync(CancellationToken ct)
    {
        try
        {
            Documents = await _api.ListDocumentsAsync(ct);
            Changes = await _api.ListChangesAsync(ct);
        }
        catch (Exception ex) { Error = ex.Message; }
    }

    public async Task<IActionResult> OnPostUploadAsync(IFormFile? file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) { TempData["Error"] = "فایل انتخاب نشده"; return RedirectToPage(); }
        try { await _api.UploadDocumentAsync(file, ct); TempData["Success"] = $"آپلود: {file.FileName}"; }
        catch (Exception ex) { TempData["Error"] = ex.Message; }
        return RedirectToPage();
    }

    public async Task<IActionResult> OnPostDeleteAsync(string id, CancellationToken ct)
    {
        try { await _api.DeleteDocumentAsync(id, ct); TempData["Success"] = "حذف شد"; }
        catch (Exception ex) { TempData["Error"] = ex.Message; }
        return RedirectToPage();
    }

    public async Task<IActionResult> OnPostClearChunksAsync(string id, CancellationToken ct)
    {
        try { await _api.ClearDocumentChunksAsync(id, ct); TempData["Success"] = "Chunks پاک شد"; }
        catch (Exception ex) { TempData["Error"] = ex.Message; }
        return RedirectToPage();
    }

    public async Task<IActionResult> OnPostSyncAsync(string? id, CancellationToken ct)
    {
        try { await _api.SyncDocumentsAsync(string.IsNullOrWhiteSpace(id) ? null : id, ct); TempData["Success"] = "Sync درخواست شد"; }
        catch (Exception ex) { TempData["Error"] = ex.Message; }
        return RedirectToPage();
    }

    public async Task<IActionResult> OnPostReindexAsync(string? id, CancellationToken ct)
    {
        try { await _api.ReindexDocumentsAsync(string.IsNullOrWhiteSpace(id) ? null : id, ct); TempData["Success"] = "Index درخواست شد"; }
        catch (Exception ex) { TempData["Error"] = ex.Message; }
        return RedirectToPage();
    }

    public async Task<IActionResult> OnPostAddPathAsync(string path, CancellationToken ct)
    {
        try { await _api.AddDocumentPathAsync(path, ct); TempData["Success"] = "مسیر اضافه شد"; }
        catch (Exception ex) { TempData["Error"] = ex.Message; }
        return RedirectToPage();
    }
}
