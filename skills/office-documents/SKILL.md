---
name: office-documents
description: Enterprise creation, parsing, formatting, and audit of Microsoft Excel (.xlsx) workbooks and Word (.docx) documents using Python (openpyxl, python-docx). Use when generating SAP financial reports, tabular data exports, executive Word specifications, technical documentation, or auditing spreadsheet formulas.
---

# 📄 Office Documents Engineering (.xlsx & .docx)

Enterprise document automation for Microsoft Excel spreadsheets and Microsoft Word documents. Adapted from `anthropics/skills` under the Apache License 2.0.

---

## 🏛️ Core Principles

1. **Formula-First Excel**: Never hardcode calculated aggregate values (`SUM`, `AVERAGE`, `SUBTOTAL`). Always write live formulas to maintain workbook integrity.
2. **Zero Evaluation Errors**: Deliverables must have zero `#REF!`, `#DIV/0!`, `#VALUE!`, or `#NAME?` calculation errors.
3. **Structured Word Layouts**: Define clean heading cascades, explicit paragraph spacing (`space_before`, `space_after`), and `keep_with_next = True` on all section headers to prevent orphan headings.
4. **AppSec & Injection Protection**:
   - Strictly sanitize formula inputs to prevent CSV/Formula Injection (DDE execution): prepend `'` to any untrusted string starting with `=`, `+`, `-`, `@`, or `|`.
   - Validate file paths to prevent directory traversal outside the active workspace.
   - For detailed guidelines, see [`references/xlsx-standards.md`](references/xlsx-standards.md) and [`references/docx-standards.md`](references/docx-standards.md).

---

## 📊 Excel (.xlsx) Automation Standard

### Library Routing
- **`openpyxl`**: Primary engine for workbook creation, cell styling, borders, formula definition, and multi-sheet workbooks.
- **`pandas`**: High-throughput tabular data ingestion and export (`pd.read_excel`, `df.to_excel`).

### Financial Modeling Palette
| Category | Font Color | Fill / Style | Purpose |
| :--- | :--- | :--- | :--- |
| **Inputs / Constants** | Blue (`#0000FF`) | None / White | Hardcoded assumptions, raw figures |
| **Formulas / Calcs** | Black (`#000000`) | Bold on totals | Evaluated formulas (`=SUM(...)`) |
| **Cross-Sheet Links** | Green (`#008000`) | Regular | References to other worksheets |
| **External Links** | Red (`#FF0000`) | Underlined | References to external workbooks |
| **Table Headers** | White (`#FFFFFF`) | Dark Slate (`#1F4E78`) | Column descriptors with auto-filter |

For implementation code snippets and number formatting tables, see [`references/xlsx-standards.md`](references/xlsx-standards.md).

---

## 📝 Word (.docx) Automation Standard

### Layout & Typographic Hygiene
- **Page Setup**: Standard margins (1 inch / 25.4 mm), Portrait orientation (Landscape only for wide tables).
- **Heading Cascade**:
  - `Title` (24–28 pt bold), `Subtitle` (14–16 pt regular).
  - `Heading 1` (18–20 pt bold, page break before or 18 pt space before, 6 pt after).
  - `Heading 2` (14–16 pt bold, 12 pt space before, 4 pt after).
  - `Heading 3` (12–13 pt semibold, 8 pt space before, 2 pt after).
  - **Invariant**: Set `paragraph.paragraph_format.keep_with_next = True` on all headings.
- **Tables**: Styled header row repeated on every page (`trPr.append(parse_xml(r'<w:tblHeader xmlns:w="..."/>'))`), alternating row shading (`#F2F4F7`), right-aligned numeric data.
- **Callout Panels**: Left accent border (3 pt, primary brand color), subtle background fill (`#F8F9FA`), 6 pt internal padding.

For template patterns and Python examples, see [`references/docx-standards.md`](references/docx-standards.md).

---

## 🛡️ Security & Safe Execution

Always invoke python document generation scripts through `run_command` with clean workspace arguments:
```powershell
python skills/office-documents/scripts/office-validator.py --check report.xlsx
```
