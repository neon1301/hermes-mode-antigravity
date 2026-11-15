# 📊 Excel (.xlsx) Engineering Standards & Patterns

*Adapted from `anthropics/skills` under the Apache License 2.0.*

---

## 1. Number Formatting Guide

Always apply explicit number formatting (`number_format`) rather than relying on default Excel behavior:

| Data Type | Target Format | `openpyxl` Format Code | Example Display |
| :--- | :--- | :--- | :--- |
| **Currency (RUB)** | Standard ruble | `#,##0.00 "₽"` | `1 250 500.00 ₽` |
| **Currency (USD)** | Standard dollar | `$#,##0.00` | `$1,250,500.00` |
| **Percentage** | 1 or 2 decimals | `0.0%` or `0.00%` | `14.5%` |
| **Integer / Quantities** | Thousands separated | `#,##0` | `15,420` |
| **Decimal Precision** | 2 decimals | `#,##0.00` | `1,420.75` |
| **Date (ISO)** | Standard date | `YYYY-MM-DD` | `2026-11-15` |
| **Date & Time** | Timestamp | `YYYY-MM-DD HH:MM:SS` | `2026-11-15 14:30:00` |

---

## 2. Formula Generation Invariant

Always build dynamic calculations with formulas. Never pre-calculate in Python and assign raw constants to summary cells:

```python
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Financial Summary"

# Data rows 2 to 10
# Total row at 11
ws['A11'] = "Итого"
ws['A11'].font = Font(name="Calibri", size=11, bold=True)
ws['B11'] = "=SUM(B2:B10)"
ws['B11'].font = Font(name="Calibri", size=11, bold=True, color="000000") # Black = formula
ws['B11'].number_format = '#,##0.00 "₽"'
```

---

## 3. Auto-Fit Column Widths Pattern

Always apply column width expansion with padding to prevent `###` overflow symbols:

```python
def autofit_columns(ws, min_width=12, padding=3):
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            val = str(cell.value or '')
            if cell.number_format and ('₽' in cell.number_format or '$' in cell.number_format):
                val += "    " # extra allowance for currency symbol
            if len(val) > max_len:
                max_len = len(val)
        ws.column_dimensions[col_letter].width = max(max_len + padding, min_width)
```

---

## 4. Formula Injection Defense

When populating cells with strings sourced from user input, external databases, or APIs:

```python
def sanitize_cell_value(val):
    if isinstance(val, str):
        # Escape leading formula triggers to prevent DDE execution
        if val.startswith(('=', '+', '-', '@', '|', '%')):
            return "'" + val
    return val
```
