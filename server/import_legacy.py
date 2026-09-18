#!/usr/bin/env python3
"""
Import 125 legacy RIE records from the Access DB Excel export into rie.db.
Run from the server/ directory: python3 import_legacy.py

Idempotent — uses INSERT OR IGNORE so safe to re-run.
"""

import sqlite3
import os
import sys
import subprocess
from datetime import datetime, timedelta

XLSX = '/Users/ericsin/Downloads/RIE DB export.xlsx'
DB   = os.path.join(os.path.dirname(__file__), 'rie.db')

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_date(val):
    """DD/MM/YYYY string or None → YYYY-MM-DD string or None."""
    if not val:
        return None
    s = str(val).strip()
    if not s:
        return None
    for fmt in ('%d/%m/%Y', '%Y-%m-%d'):
        try:
            return datetime.strptime(s, fmt).strftime('%Y-%m-%d')
        except ValueError:
            pass
    return None


def add_days(iso_date, n):
    """YYYY-MM-DD + n days → YYYY-MM-DD."""
    if not iso_date:
        return None
    d = datetime.strptime(iso_date, '%Y-%m-%d') + timedelta(days=int(n))
    return d.strftime('%Y-%m-%d')


def norm_reg(reg):
    """Normalise UK aircraft registration: GXXX → G-XXX (insert hyphen)."""
    s = str(reg).strip().upper()
    if len(s) == 5 and s.startswith('G') and '-' not in s:
        return 'G-' + s[1:]
    return s


def norm_category(cat, duration):
    """Map legacy category values → B/C/D."""
    c = str(cat).strip()
    if c in ('B', 'C', 'D'):
        return c
    # '10' or '' with duration 10 → C
    dur = str(duration).strip()
    if c == '10' or (c == '' and dur == '10'):
        return 'C'
    if c == '' and dur == '3':
        return 'B'
    if c == '' and dur == '120':
        return 'D'
    # Fallback: derive from duration
    if dur == '3':   return 'B'
    if dur == '120': return 'D'
    return 'C'  # default to C for unknown


def map_status(rie_closed, rie_report_generated):
    if rie_closed:
        return 'Closed'
    if rie_report_generated:
        return 'Submitted to FOI'
    return 'Authorised'


# ---------------------------------------------------------------------------
# Run Node migrations first
# ---------------------------------------------------------------------------
print('Running server migrations…')
result = subprocess.run(
    ['node', '--input-type=module',
     '--eval', 'import "./migrate.js"'],
    cwd=os.path.dirname(os.path.abspath(__file__)),
    capture_output=True, text=True
)
if result.returncode != 0:
    print('Migration error:', result.stderr)
    sys.exit(1)
print(result.stdout.strip())

# ---------------------------------------------------------------------------
# Connect to DB
# ---------------------------------------------------------------------------
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# ---------------------------------------------------------------------------
# Ensure import user exists (as created_by FK)
# ---------------------------------------------------------------------------
cur.execute("SELECT id FROM profiles WHERE email = 'import@dhl.com'")
imp_user = cur.fetchone()
if not imp_user:
    cur.execute("""
        INSERT INTO profiles (email, password_hash, full_name, department)
        VALUES ('import@dhl.com', 'IMPORT_PLACEHOLDER', 'Legacy Import', 'System')
    """)
    cur.execute("SELECT id FROM profiles WHERE email = 'import@dhl.com'")
    imp_user = cur.fetchone()
import_user_id = imp_user['id']
print(f'Import user id: {import_user_id}')

# ---------------------------------------------------------------------------
# Load Excel
# ---------------------------------------------------------------------------
try:
    import openpyxl
except ImportError:
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'openpyxl', '-q'])
    import openpyxl

wb = openpyxl.load_workbook(XLSX, read_only=True)
ws = wb['RIETable']
rows = list(ws.iter_rows(min_row=2, values_only=True))
print(f'Loaded {len(rows)} rows from Excel')

# Column indices (0-based)
# RIENumber=0, DateOfDefect=1, AircraftRegistration=2, AircraftType=3,
# DetailOfDefect=4, ReasonForNotRectifying=5, OperationalRestriction=6,
# OperationalRestrictionYN=7, RICategory=8, ExpiryOfRIE=9,
# MELReferenceNumber=10, NameOfApplicant=11, ApplicantPosition=12,
# WhyRIERequired=13, DurationOfRIE=14, LatestDateOfROE=15,
# CommentsOfAuthorisingManager=16, NameOfAuthorisingManager=17,
# ManagerPosition=18, SignDate=19, RIEReportGenerated=20, RIEClosed=21,
# RIEClosureDate=22, ADDPNo=23, SRPNo=24, ClearanceSRPNo=25, RaisedSRPNo=26

inserted = 0
skipped = 0

for row in rows:
    rie_num    = row[0]
    date_found = str(row[1]).strip() if row[1] else ''
    reg        = str(row[2]).strip() if row[2] else ''
    ac_type    = str(row[3]).strip() if row[3] else ''
    defect     = str(row[4]).strip() if row[4] else ''
    category   = row[8]
    expiry     = str(row[9]).strip() if row[9] else ''
    mel_ref    = str(row[10]).strip() if row[10] else ''
    applicant  = str(row[11]).strip() if row[11] else ''
    app_pos    = str(row[12]).strip() if row[12] else ''
    why_rie    = str(row[13]).strip() if row[13] else ''
    duration   = str(row[14]).strip() if row[14] else ''
    latest_roe = str(row[15]).strip() if row[15] else ''
    mgr_cmts   = str(row[16]).strip() if row[16] else ''
    mgr_name   = str(row[17]).strip() if row[17] else ''
    mgr_pos    = str(row[18]).strip() if row[18] else ''
    sign_date  = str(row[19]).strip() if row[19] else ''
    rpt_gen    = bool(row[20]) if row[20] is not None else False
    closed     = bool(row[21]) if row[21] is not None else False
    close_date = str(row[22]).strip() if row[22] else ''
    addp_no    = str(row[23]).strip() if row[23] else ''
    reason     = str(row[5]).strip() if row[5] else ''
    op_restr   = str(row[6]).strip() if row[6] else ''

    # Skip only truly blank rows and explicit placeholders
    if not reg or defect == 'RIE NOT USED':
        print(f'  Skip RIE#{rie_num}: blank or placeholder')
        skipped += 1
        continue

    # Normalise
    reg        = norm_reg(reg)
    cat        = norm_category(category, duration)
    ext_days   = int(duration) if duration and duration.isdigit() else 10

    date_found_iso = parse_date(date_found)
    # LatestDateOfROE is the reliable extension-expiry field (matches the computed value in
    # 100 rows vs 49 for ExpiryOfRIE, which the legacy DB often used for the MEL expiry).
    extension_expiry_iso = parse_date(latest_roe) or parse_date(expiry)

    if not date_found_iso:
        print(f'  Skip RIE#{rie_num}: no date_defect_found')
        skipped += 1
        continue

    # The legacy Access DB used ExpiryOfRIE inconsistently — in some rows it holds the
    # MEL interval expiry, in others the post-extension expiry. Rather than guess per row,
    # preserve what was recorded and derive the MEL expiry from the regulatory interval.
    date_mel_start_iso = date_found_iso  # Access had no separate MEL start date
    MEL_DAYS = {'B': 3, 'C': 10, 'D': 120}
    mel_interval_expiry_iso = add_days(date_mel_start_iso, MEL_DAYS.get(cat, 10))

    if not extension_expiry_iso:
        extension_expiry_iso = add_days(mel_interval_expiry_iso, ext_days)

    status     = map_status(closed, rpt_gen)
    ref_number = f'DHL/AIR/RIE/{int(rie_num)}'

    # Sign timestamps
    sign_date_iso = parse_date(sign_date)
    applicant_signed_iso = date_found_iso  # applicant typically signs same day as defect
    manager_signed_iso   = f'{sign_date_iso}T00:00:00.000Z' if sign_date_iso else None
    applicant_signed_ts  = f'{date_found_iso}T00:00:00.000Z'

    # Extension reason: combine WhyRIERequired + reason
    full_reason = why_rie or reason

    cur.execute("""
        INSERT OR IGNORE INTO rie_records (
            ref_number, aircraft_registration, aircraft_type, mel_item_ref,
            defect_description, mel_category,
            date_defect_found, date_mel_start, mel_interval_expiry,
            extension_days, extension_expiry, extension_reason,
            additional_limitations, ref_addp,
            applicant_name, applicant_position, applicant_signed_at,
            manager_name, manager_position, manager_signed_at,
            manager_comments, foi_submitted_at,
            status, created_by
        ) VALUES (
            ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, ?
        )
    """, (
        ref_number, reg, ac_type or 'Unknown', mel_ref or '—',
        defect or '(not recorded in legacy database)', cat,
        date_found_iso, date_mel_start_iso, mel_interval_expiry_iso,
        ext_days, extension_expiry_iso, full_reason or '(see defect description)',
        op_restr or None, addp_no or None,
        applicant or None, app_pos or None, applicant_signed_ts,
        mgr_name or None, mgr_pos or None, manager_signed_iso,
        mgr_cmts or None,
        f'{parse_date(close_date)}T00:00:00.000Z' if closed and parse_date(close_date) else None,
        status, import_user_id
    ))

    if cur.rowcount:
        inserted += 1
    else:
        print(f'  Already exists: {ref_number}')
        skipped += 1

conn.commit()
conn.close()
print(f'\nDone. Inserted: {inserted}, Skipped/duplicate: {skipped}')
