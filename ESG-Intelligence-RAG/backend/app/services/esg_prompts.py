"""ESG-specific system and user prompts for report generation."""

from __future__ import annotations

from typing import Any
import json

REPORT_TYPE_LABELS = {
    "esg_periodic": "گزارش دوره‌ای پایداری (ESG Periodic)",
    "esg_environmental": "گزارش محیط‌زیست (Environmental)",
    "esg_social": "گزارش اجتماعی (Social)",
    "esg_governance": "گزارش حاکمیتی (Governance)",
    "esg_audit": "گزارش ممیزی / اطمینان‌بخشی ESG",
    "esg_aggregate": "گزارش تجمیعی چنددوره‌ای ESG",
    "esg_custom": "گزارش سفارشی ESG",
}

SYSTEM_PROMPT_FA = """تو یک تحلیل‌گر ارشد پایداری و ESG هستی.
وظیفه‌ات تولید گزارش‌های دقیق، شفاف و قابل استناد بر اساس داده‌های ساختاریافته و اسناد بازیابی‌شده است.

قواعد:
1. فقط از داده‌ها و شواهد داده‌شده استفاده کن؛ عدد یا ادعا اختراع نکن.
2. اگر داده برای یک بخش وجود ندارد، صریحاً بنویس «داده موجود نیست».
3. اعداد را با واحد و دوره زمانی ذکر کن.
4. ساختار گزارش را با عناوین Markdown رعایت کن.
5. در پایان بخش «منابع و محدودیت‌ها» را بیاور.
6. لحن حرفه‌ای، خنثی و مناسب گزارش‌دهی سازمانی باشد (فارسی یا انگلیسی مطابق درخواست کاربر).
7. در صورت امکان به استانداردهای رایج (GRI، SASB، TCFD، ESRS، GHG Protocol) ارجاع مفهومی بده، بدون ادعای انطباق کامل مگر داده صریح باشد.
"""

SYSTEM_PROMPT_EN = """You are a senior ESG / sustainability analyst.
Produce accurate, transparent, evidence-based reports from structured metrics and retrieved documents.

Rules:
1. Use only the provided data and evidence; never invent numbers or claims.
2. If data for a section is missing, state clearly "Data not available".
3. Always include units and reporting periods for figures.
4. Use clear Markdown headings.
5. End with a "Sources and limitations" section.
6. Professional, neutral tone suitable for corporate disclosure.
7. You may reference common frameworks (GRI, SASB, TCFD, ESRS, GHG Protocol) conceptually without claiming full compliance unless explicitly supported by data.
"""


def build_report_user_prompt(
    *,
    report_type: str,
    title: str,
    instructions: str | None,
    metrics_snapshot: dict[str, Any] | None,
    document_context: str | None,
    language: str = "fa",
) -> str:
    label = REPORT_TYPE_LABELS.get(report_type, report_type)
    parts: list[str] = []
    if language.startswith("fa"):
        parts.append(f"نوع گزارش: {label}")
        parts.append(f"عنوان درخواستی: {title}")
        if instructions:
            parts.append(f"دستورالعمل کاربر:\n{instructions}")
        parts.append("---")
        if metrics_snapshot:
            parts.append("داده‌های ساختاریافته (JSON):")
            parts.append("```json")
            parts.append(json.dumps(metrics_snapshot, ensure_ascii=False, indent=2, default=str))
            parts.append("```")
        if document_context:
            parts.append("محتوای بازیابی‌شده از اسناد:")
            parts.append(document_context[:12000])
        parts.append("---")
        parts.append(
            "بر اساس موارد بالا یک گزارش کامل Markdown تولید کن. "
            "بخش‌های پیشنهادی: خلاصه مدیریتی، شاخص‌های کلیدی، تحلیل، ریسک‌ها و فرصت‌ها، منابع و محدودیت‌ها."
        )
    else:
        parts.append(f"Report type: {label}")
        parts.append(f"Requested title: {title}")
        if instructions:
            parts.append(f"User instructions:\n{instructions}")
        parts.append("---")
        if metrics_snapshot:
            parts.append("Structured metrics (JSON):")
            parts.append("```json")
            parts.append(json.dumps(metrics_snapshot, ensure_ascii=False, indent=2, default=str))
            parts.append("```")
        if document_context:
            parts.append("Retrieved document context:")
            parts.append(document_context[:12000])
        parts.append("---")
        parts.append(
            "Produce a full Markdown report. Suggested sections: Executive summary, "
            "Key metrics, Analysis, Risks and opportunities, Sources and limitations."
        )
    return "\n\n".join(parts)


def system_prompt(language: str = "fa") -> str:
    return SYSTEM_PROMPT_FA if language.startswith("fa") else SYSTEM_PROMPT_EN
