using EnterpriseKnowledge.WebUI.Models;
using EnterpriseKnowledge.WebUI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace EnterpriseKnowledge.WebUI.Pages.Models;

public class IndexModel : PageModel
{
    private readonly RagApiClient _api;
    public IndexModel(RagApiClient api) => _api = api;
    public List<ProviderProfile> Providers { get; private set; } = new();
    public List<string> OpenAIModels { get; private set; } = new();
    public string? Error { get; private set; }
    [BindProperty] public string Name { get; set; } = "";
    [BindProperty] public string Kind { get; set; } = "openai";
    [BindProperty] public string BaseUrl { get; set; } = "http://127.0.0.1:11434/v1";
    [BindProperty] public string ModelName { get; set; } = "";
    [BindProperty] public string Role { get; set; } = "Generation";
    [BindProperty] public string ApiKey { get; set; } = "ollama";

    public async Task OnGetAsync(CancellationToken ct)
    {
        try
        {
            Providers = await _api.ListProvidersAsync(ct);
            try { OpenAIModels = await _api.ListOpenAIModelsAsync(ct); } catch { /* optional */ }
        }
        catch (Exception ex) { Error = ex.Message; }
    }

    public async Task<IActionResult> OnPostCreateAsync(CancellationToken ct)
    {
        try
        {
            await _api.CreateProviderAsync(new
            {
                name = Name,
                kind = Kind,
                base_url = BaseUrl,
                model = ModelName,
                role = Role,
                api_key = ApiKey,
            }, ct);
            TempData["Success"] = "Provider اضافه شد";
        }
        catch (Exception ex) { TempData["Error"] = ex.Message; }
        return RedirectToPage();
    }

    public async Task<IActionResult> OnPostDeleteAsync(string id, CancellationToken ct)
    {
        try { await _api.DeleteProviderAsync(id, ct); TempData["Success"] = "حذف شد"; }
        catch (Exception ex) { TempData["Error"] = ex.Message; }
        return RedirectToPage();
    }

    public async Task<IActionResult> OnPostTestAsync(string id, CancellationToken ct)
    {
        try { await _api.TestProviderAsync(id, ct); TempData["Success"] = "Test OK"; }
        catch (Exception ex) { TempData["Error"] = ex.Message; }
        return RedirectToPage();
    }

    public async Task<IActionResult> OnPostToggleAsync(string id, bool enabled, CancellationToken ct)
    {
        try { await _api.UpdateProviderAsync(id, new { enabled }, ct); TempData["Success"] = "به‌روز شد"; }
        catch (Exception ex) { TempData["Error"] = ex.Message; }
        return RedirectToPage();
    }
}
