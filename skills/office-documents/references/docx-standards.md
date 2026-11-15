# 📝 Word (.docx) Engineering Standards & Patterns

*Adapted from `anthropics/skills` under the Apache License 2.0.*

---

## 1. Document Structure & Typography

```python
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn

doc = docx.Document()

# Configure standard margins
for section in doc.sections:
    section.top_margin = Inches(1.0)
    section.bottom_margin = Inches(1.0)
    section.left_margin = Inches(1.0)
    section.right_margin = Inches(1.0)
```

---

## 2. Heading Invariant: Preventing Orphan Headings

Always attach headings to the subsequent paragraph using `keep_with_next`:

```python
def add_heading_with_keep(doc, text, level=1):
    h = doc.add_heading(text, level=level)
    h.paragraph_format.keep_with_next = True
    if level == 1:
        h.paragraph_format.space_before = Pt(18)
        h.paragraph_format.space_after = Pt(6)
    elif level == 2:
        h.paragraph_format.space_before = Pt(14)
        h.paragraph_format.space_after = Pt(4)
    elif level == 3:
        h.paragraph_format.space_before = Pt(10)
        h.paragraph_format.space_after = Pt(2)
    return h
```

---

## 3. Table Formatting & Header Row Repetition

Ensure long tables spanning multiple pages repeat their header row on every page:

```python
def set_repeat_table_header(table):
    header_tr = table.rows[0]._tr.get_or_add_trPr()
    header_tr.append(parse_xml(r'<w:tblHeader %s/>' % nsdecls('w')))

def set_cell_shading(cell, color_hex="F2F4F7"):
    shading_elm = parse_xml(r'<w:shd %s w:fill="%s"/>' % (nsdecls('w'), color_hex))
    cell._tc.get_or_add_tcPr().append(shading_elm)
```

---

## 4. Callout Panels

```python
def add_callout_box(doc, text, title="ВНИМАНИЕ", border_color="1F4E78", bg_color="F8F9FA"):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    
    # Left thick border, no top/bottom/right borders
    tcPr = cell._tc.get_or_add_tcPr()
    borders_xml = parse_xml(
        r'<w:tcBorders %s>'
        r'  <w:top w:val="none"/>'
        r'  <w:left w:val="single" w:sz="24" w:space="0" w:color="%s"/>'
        r'  <w:bottom w:val="none"/>'
        r'  <w:right w:val="none"/>'
        r'</w:tcBorders>' % (nsdecls('w'), border_color)
    )
    tcPr.append(borders_xml)
    
    # Background fill
    shd_xml = parse_xml(r'<w:shd %s w:fill="%s"/>' % (nsdecls('w'), bg_color))
    tcPr.append(shd_xml)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(4)
    run_title = p.add_run(f"📌 {title}: ")
    run_title.bold = True
    run_title.font.color.rgb = RGBColor.from_string(border_color)
    p.add_run(text)
```
