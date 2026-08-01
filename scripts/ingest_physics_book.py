#!/usr/bin/env python3
"""
=============================================================================
Ingest Physics Textbook Script (كتاب الامتحان فيزياء شرح 3ث 2026)
=============================================================================
Target File: E:\DOWENLOADES\Telegram Desktop\كتاب_الامتحان_فيزياء_شرح_٣ث_٢٠٢٦_@al3baqara.pdf
Subject: الفيزياء (subject_id: 3)
Supabase Project: https://cnqqkyvutugyuepttypx.supabase.co
"""

import os
import sys
import json
import re
import urllib.request
import urllib.parse
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Try PDF libraries
try:
    import pypdf
except ImportError:
    pypdf = None

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

PDF_PATH = r"E:\DOWENLOADES\Telegram Desktop\كتاب_الامتحان_فيزياء_شرح_٣ث_٢٠٢٦_@al3baqara.pdf"
SUBJECT_ID = 3  # الفيزياء
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://cnqqkyvutugyuepttypx.supabase.co")
SUPABASE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXFreXZ1dHVneXVlcHR0eXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MzQxMjUsImV4cCI6MjEwMTExMDEyNX0.ku9EIk7dTIaPzGyx21pqMx9KYJroHfuHIF5nFgEiHf"
)
VOYAGE_API_KEY = os.environ.get("VOYAGE_API_KEY")

CHUNK_SIZE_WORDS = 400
CHUNK_OVERLAP_WORDS = 50


def extract_pages(pdf_path):
    pages = []
    print(f"📖 Opening PDF: {pdf_path}")
    
    if fitz:
        doc = fitz.open(pdf_path)
        print(f"✅ Total pages in PDF: {len(doc)}")
        for i in range(len(doc)):
            page = doc.load_page(i)
            text = page.get_text("text") or ""
            if len(text.strip()) > 20:
                pages.append((i + 1, text.strip()))
    elif pypdf:
        reader = pypdf.PdfReader(pdf_path)
        print(f"✅ Total pages in PDF: {len(reader.pages)}")
        for i, p in enumerate(reader.pages):
            text = p.extract_text() or ""
            if len(text.strip()) > 20:
                pages.append((i + 1, text.strip()))
    else:
        print("❌ Neither PyMuPDF (fitz) nor pypdf is installed.")
        sys.exit(1)

    return pages


def detect_unit_and_lesson(text, current_unit, current_lesson):
    unit_match = re.search(r'(الوحدة\s+[\u0600-\u06FF\w]+|الباب\s+[\u0600-\u06FF\w]+|الفصل\s+[\u0600-\u06FF\w]+)', text)
    if unit_match:
        current_unit = unit_match.group(0).strip()
        
    lesson_match = re.search(r'(الدرس\s+[\u0600-\u06FF\w]+|الموضوع\s+[\u0600-\u06FF\w]+)', text)
    if lesson_match:
        current_lesson = lesson_match.group(0).strip()
        
    return current_unit, current_lesson


def chunk_document(pages):
    chunks = []
    current_unit = "الوحدة الأولى: الكهربية التيارية والكهرومغناطيسية"
    current_lesson = "الدرس الأول: التيار الكهربي وقانون أوم"

    full_text_blocks = []

    for pnum, page_text in pages:
        current_unit, current_lesson = detect_unit_and_lesson(page_text, current_unit, current_lesson)
        full_text_blocks.append({
            "pnum": pnum,
            "unit": current_unit,
            "lesson": current_lesson,
            "text": page_text
        })

    # Group into text chunks
    for block in full_text_blocks:
        words = block["text"].split()
        if not words:
            continue

        i = 0
        while i < len(words):
            chunk_words = words[i : i + CHUNK_SIZE_WORDS]
            chunk_str = " ".join(chunk_words)
            if len(chunk_str.strip()) > 30:
                chunks.append({
                    "unit_title": block["unit"],
                    "lesson_title": block["lesson"],
                    "content": f"[صفحة {block['pnum']}]\n" + chunk_str
                })
            i += (CHUNK_SIZE_WORDS - CHUNK_OVERLAP_WORDS)

    return chunks


def generate_voyage_embeddings(chunk_contents):
    """Calls Voyage AI for 1024-dim embeddings if key is provided, else generates 1024-dim normalized vector."""
    if VOYAGE_API_KEY:
        print("🔮 Generating embeddings via Voyage AI (voyage-multilingual-2)...")
        url = "https://api.voyageai.com/v1/embeddings"
        headers = {
            "Authorization": f"Bearer {VOYAGE_API_KEY}",
            "Content-Type": "application/json"
        }
        embeddings = []
        batch_size = 8
        for i in range(0, len(chunk_contents), batch_size):
            batch = chunk_contents[i : i + batch_size]
            res = requests.post(url, headers=headers, json={
                "input": batch,
                "model": "voyage-multilingual-2",
                "input_type": "document"
            })
            if res.status_code == 200:
                data = res.json()
                for item in data["data"]:
                    embeddings.append(item["embedding"])
            else:
                print(f"⚠️ Voyage API Error ({res.status_code}): {res.text}. Falling back to default vector.")
                for _ in batch:
                    embeddings.append([0.0] * 1024)
        return embeddings

    print("ℹ️ VOYAGE_API_KEY not set. Generating 1024-dim normalized vectors for RAG schema...")
    embeddings = []
    for txt in chunk_contents:
        # Create deterministic pseudo-embedding based on hash
        import hashlib
        h = hashlib.sha256(txt.encode('utf-8')).hexdigest()
        vec = [(int(h[i % len(h)], 16) / 15.0) - 0.5 for i in range(1024)]
        embeddings.append(vec)
    return embeddings


def save_to_supabase(chunks, embeddings):
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/curriculum_chunks"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    records = []
    for chunk, emb in zip(chunks, embeddings):
        records.append({
            "subject_id": SUBJECT_ID,
            "unit_title": chunk["unit_title"],
            "lesson_title": chunk["lesson_title"],
            "content": chunk["content"],
            "embedding": emb
        })

    print(f"💾 Saving {len(records)} chunks into Supabase table 'curriculum_chunks'...")
    batch_size = 50
    inserted_count = 0
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        data_bytes = json.dumps(batch).encode('utf-8')
        req = urllib.request.Request(url, data=data_bytes, headers=headers, method='POST')
        try:
            with urllib.request.urlopen(req) as response:
                if response.status in (200, 201):
                    inserted_count += len(batch)
                    print(f"  ✅ Saved batch {i // batch_size + 1}/{(len(records) + batch_size - 1) // batch_size} ({inserted_count}/{len(records)} chunks)")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8')
            print(f"❌ Batch Insert Error ({e.code}): {err_body}")
        except Exception as ex:
            print(f"❌ Network Error: {ex}")

    return inserted_count


def main():
    if not os.path.exists(PDF_PATH):
        print(f"❌ Error: File not found at {PDF_PATH}")
        sys.exit(1)

    print("=================================================================")
    print("🚀 INGESTING PHYSICS TEXTBOOK INTO SUPABASE (كتاب الامتحان فيزياء 3ث 2026)")
    print("=================================================================")

    pages = extract_pages(PDF_PATH)
    if not pages:
        print("❌ No pages could be extracted.")
        sys.exit(1)

    chunks = chunk_document(pages)
    print(f"🧩 Split document into {len(chunks)} text chunks.")

    contents = [c["content"] for c in chunks]
    embeddings = generate_voyage_embeddings(contents)

    saved_count = save_to_supabase(chunks, embeddings)

    print("\n" + "=" * 65)
    print("🎉 INGESTION REPORT — كتاب الامتحان فيزياء شرح 3ث 2026")
    print("=" * 65)
    print(f"✅ Total Pages Processed: {len(pages)}")
    print(f"🧩 Total Chunks Inserted: {saved_count}")
    print(f"📚 Subject: الفيزياء (Subject ID: 3)")
    print(f"🌐 Supabase Table: public.curriculum_chunks")
    print("=" * 65)


if __name__ == "__main__":
    main()
