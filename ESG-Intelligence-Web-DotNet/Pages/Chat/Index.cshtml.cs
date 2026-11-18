using EnterpriseKnowledge.WebUI.Models;
using EnterpriseKnowledge.WebUI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace EnterpriseKnowledge.WebUI.Pages.Chat;

public class IndexModel : PageModel
{
  private readonly RagApiClient _api;
  public IndexModel(RagApiClient api) => _api = api;
  [BindProperty] public string Question { get; set; } = "";
  [BindProperty] public int TopK { get; set; } = 8;
  [BindProperty] public bool RequireCitations { get; set; }
  public ChatResponse? Result { get; private set; }
  public string? Error { get; private set; }
  public void OnGet() {}
  public async Task OnPostAsync(CancellationToken ct)
  {
    try { Result = await _api.ChatAsync(Question, TopK, null, RequireCitations, ct); }
    catch (Exception ex) { Error = ex.Message; }
  }
  public async Task<IActionResult> OnPostFeedbackAsync(string traceId, int rating, CancellationToken ct)
  {
    try { await _api.SubmitFeedbackAsync(traceId, rating, ct: ct); TempData["Success"] = "بازخورد ثبت شد"; }
    catch (Exception ex) { TempData["Error"] = ex.Message; }
    return RedirectToPage();
  }
}
