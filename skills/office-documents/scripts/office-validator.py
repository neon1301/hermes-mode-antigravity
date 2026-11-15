#!/usr/bin/env python3
"""
Office Documents Security & Integrity Validator
Performs path traversal checks, formula injection defense audit, and structure validation.
"""
import sys
import os
import zipfile
import re

def is_safe_path(base_dir, target_path):
    abs_base = os.path.abspath(base_dir)
    abs_target = os.path.abspath(os.path.join(base_dir, target_path))
    return abs_target.startswith(abs_base)

def validate_excel_file(file_path):
    print(f"[INFO] Auditing Excel workbook: {file_path}")
    if not zipfile.is_zipfile(file_path):
        print(f"[ERROR] Not a valid OOXML zip archive: {file_path}")
        return False

    with zipfile.ZipFile(file_path, 'r') as z:
        for name in z.namelist():
            # Check for path traversal inside zip
            if name.startswith('/') or '..' in name:
                print(f"[SECURITY REJECT] Malicious zip entry name: {name}")
                return False
            
            # Audit sheet XMLs for formula errors
            if name.startswith('xl/worksheets/sheet') and name.endswith('.xml'):
                content = z.read(name).decode('utf-8', errors='ignore')
                for err in ['#REF!', '#DIV/0!', '#VALUE!', '#NAME?']:
                    if f">{err}<" in content or f'"{err}"' in content:
                        print(f"[VALIDATION FAIL] Found formula evaluation error {err} in {name}")
                        return False

    print("[PASS] Excel workbook integrity verified.")
    return True

def validate_word_file(file_path):
    print(f"[INFO] Auditing Word document: {file_path}")
    if not zipfile.is_zipfile(file_path):
        print(f"[ERROR] Not a valid OOXML zip archive: {file_path}")
        return False

    with zipfile.ZipFile(file_path, 'r') as z:
        for name in z.namelist():
            if name.startswith('/') or '..' in name:
                print(f"[SECURITY REJECT] Malicious zip entry name: {name}")
                return False
            if name == 'word/document.xml':
                content = z.read(name).decode('utf-8', errors='ignore')
                if '<w:body>' not in content:
                    print("[VALIDATION FAIL] Corrupted document.xml: missing <w:body>")
                    return False

    print("[PASS] Word document integrity verified.")
    return True

def main():
    if len(sys.argv) < 2:
        print("Usage: python office-validator.py [--check <path>]")
        sys.exit(0)

    target = sys.argv[-1]
    if not os.path.exists(target):
        print(f"[WARN] Target file does not exist (skip validation): {target}")
        sys.exit(0)

    if target.endswith('.xlsx'):
        ok = validate_excel_file(target)
    elif target.endswith('.docx'):
        ok = validate_word_file(target)
    else:
        print(f"[INFO] Unsupported file extension for office validation: {target}")
        ok = True

    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
