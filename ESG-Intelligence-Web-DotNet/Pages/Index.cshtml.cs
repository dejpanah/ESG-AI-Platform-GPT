using EnterpriseKnowledge.WebUI.Models;
using EnterpriseKnowledge.WebUI.Services;
using Microsoft.AspNetCore.Mvc.RazorPages;
namespace EnterpriseKnowledge.WebUI.Pages;
public class IndexModel : PageModel {
  private readonly RagApiClient _api;
  public IndexModel(RagApiClient api) => _api = api;
  public HealthInfo? Health { get; private set; }
  public string? Error { get; private set; }
  public async Task OnGetAsync(CancellationToken ct) {
    try { Health = await _api.GetHealthAsync(ct); } catch (Exception ex) { Error = ex.Message; }
  }
}
