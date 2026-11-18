"""High-quality text extraction for Office and HTML documents.

Used by ingestion (`read_document_text`) so chunking/embedding see clean text
instead of raw binary or noisy markup.
"""

from __future__ import annotations

import re
from pathlib import Path


def _normalize_whitespace(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_docx(path: Path) -> str:
    """Extract paragraphs and tables from a .docx file."""
    from docx import Document  # python-docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    document = Document(str(path))
    parts: list[str] = []

    def iter_block_items(parent):
        """Yield paragraphs and tables in document order."""
        from docx.oxml.ns import qn
        from docx.oxml.text.paragraph import CT_P
        from docx.oxml.table import CT_Tbl

        parent_elm = parent.element.body
        for child in parent_elm.iterchildren():
            if isinstance(child, CT_P):
                yield Paragraph(child, parent)
            elif isinstance(child, CT_Tbl):
                yield Table(child, parent)

    for block in iter_block_items(document):
        if isinstance(block, Paragraph):
            value = (block.text or "").strip()
            if value:
                parts.append(value)
        else:
            rows: list[str] = []
            for row in block.rows:
                cells = [" ".join((cell.text or "").split()) for cell in row.cells]
                # de-dupe merged cell repeats while keeping order
                cleaned: list[str] = []
                for cell in cells:
                    if not cleaned or cleaned[-1] != cell:
                        cleaned.append(cell)
                line = " | ".join(c for c in cleaned if c)
                if line:
                    rows.append(line)
            if rows:
                parts.append("\n".join(rows))

    return _normalize_whitespace("\n\n".join(parts))


def extract_xlsx(path: Path) -> str:
    """Extract sheet tables from .xlsx / .xlsm as readable text."""
    from openpyxl import load_workbook

    wb = load_workbook(str(path), read_only=True, data_only=True)
    parts: list[str] = []
    max_rows = int(__import__("os").getenv("KNOWLEDGEOS_XLSX_MAX_ROWS", "5000"))
    max_cols = int(__import__("os").getenv("KNOWLEDGEOS_XLSX_MAX_COLS", "50"))

    for sheet in wb.worksheets:
        parts.append(f"## Sheet: {sheet.title}")
        row_count = 0
        for row in sheet.iter_rows(values_only=True, max_col=max_cols):
            values = []
            for cell in row:
                if cell is None:
                    values.append("")
                else:
                    values.append(str(cell).strip())
            # skip fully empty rows
            if not any(values):
                continue
            # trim trailing empties
            while values and values[-1] == "":
                values.pop()
            parts.append(" | ".join(values))
            row_count += 1
            if row_count >= max_rows:
                parts.append(f"... (truncated after {max_rows} rows)")
                break
        parts.append("")

    wb.close()
    return _normalize_whitespace("\n".join(parts))


def extract_html(path: Path) -> str:
    """Extract readable text from HTML with scripts/styles removed."""
    raw = path.read_bytes()
    # charset sniff: prefer utf-8, fall back to latin-1 replacement
    try:
        html = raw.decode("utf-8")
    except UnicodeDecodeError:
        html = raw.decode("utf-8", errors="replace")

    try:
        from bs4 import BeautifulSoup
    except ImportError:
        # fallback: crude tag strip
        text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", html)
        text = re.sub(r"(?s)<[^>]+>", " ", text)
        text = re.sub(r"&nbsp;", " ", text)
        text = re.sub(r"&amp;", "&", text)
        text = re.sub(r"&lt;", "<", text)
        text = re.sub(r"&gt;", ">", text)
        return _normalize_whitespace(text)

    soup = BeautifulSoup(html, "lxml")

    for tag in soup(["script", "style", "noscript", "template", "svg", "iframe"]):
        tag.decompose()

    # Prefer main/article content when present
    root = soup.find("main") or soup.find("article") or soup.body or soup

    lines: list[str] = []
    title = soup.title.string.strip() if soup.title and soup.title.string else ""
    if title:
        lines.append(title)
        lines.append("")

    block_tags = {
        "p", "div", "section", "article", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6",
        "pre", "blockquote", "figcaption", "td", "th",
    }

    for element in root.find_all(string=True):
        parent = element.parent
        if parent is None:
            continue
        name = parent.name.lower() if parent.name else ""
        text = " ".join(str(element).split())
        if not text:
            continue
        if name in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            lines.append("")
            lines.append(text)
            lines.append("")
        elif name in block_tags:
            lines.append(text)
        else:
            # inline text — attach to previous line when sensible
            if lines and lines[-1] and not lines[-1].endswith("\n"):
                lines[-1] = f"{lines[-1]} {text}".strip()
            else:
                lines.append(text)

    return _normalize_whitespace("\n".join(lines))


def extract_plain(path: Path, max_bytes: int) -> str:
    """UTF-8 text with size cap (existing behaviour for code/markdown/etc.)."""
    output: list[str] = []
    remaining = max_bytes
    with path.open("rb") as handle:
        while remaining > 0:
            block = handle.read(min(1024 * 1024, remaining))
            if not block:
                break
            remaining -= len(block)
            output.append(block.decode("utf-8", errors="replace"))
    return "".join(output)


def extract_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader

        return "\n\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)
    except Exception:
        return ""


OFFICE_HTML_EXTENSIONS = frozenset({"docx", "xlsx", "xlsm", "html", "htm", "xhtml"})


def extract_document_text(path: Path, name: str, max_plain_bytes: int = 64 * 1024 * 1024) -> str:
    """Dispatch to the best extractor for the file type."""
    ext = Path(name).suffix.lower().lstrip(".")
    try:
        if ext == "pdf":
            return extract_pdf(path)
        if ext == "docx":
            return extract_docx(path)
        if ext in {"xlsx", "xlsm"}:
            return extract_xlsx(path)
        if ext in {"html", "htm", "xhtml"}:
            return extract_html(path)
    except Exception as exc:
        # Surface a short marker so ingestion can still index filename context
        return f"[extract_error:{ext}] {exc}"

    return extract_plain(path, max_plain_bytes)
