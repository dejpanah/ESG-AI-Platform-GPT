using EnterpriseKnowledge.WebUI.Services;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace EnterpriseKnowledge.WebUI.Pages.Storage;

public class IndexModel : PageModel
{
    private readonly RagApiClient _api;
    public IndexModel(RagApiClient api) => _api = api;
    public string Payload { get; private set; } = "";
    public string? Error { get; private set; }

    public async Task OnGetAsync(CancellationToken ct)
    {
        try
        {
            Payload = System.Text.Json.JsonSerializer.Serialize(await _api.GetStorageAsync(ct));
        }
        catch (Exception ex)
        {
            Error = ex.Message;
        }
    }
}
