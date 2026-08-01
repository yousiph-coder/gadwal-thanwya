#!/usr/bin/env python3
"""
=============================================================================
Ingest Curriculum Tool (RAG Pipeline for Egyptian High School Curriculum)
=============================================================================
Usage:
  python scripts/ingest_curriculum.py \
      --pdf "path/to/textbook.pdf" \
      --subject_id 3 \
      --unit_title "الوحدة الأولى: الكهربية التيارية" \
      --lesson_title "الدرس الأول: التيار الكهربي وقانون أوم"

Environment Variables Required:
  - SUPABASE_URL: Your Supabase Project URL
  - SUPABASE_SERVICE_ROLE_KEY: Service Role Key for writing to curriculum_chunks
  - VOYAGE_API_KEY: Voyage AI API Key for RAG Vector Embeddings (voyage-multilingual-2)
"""

import os
import sys
import argparse
import requests
import json
from pathlib import Path

# Optional PDF & OCR Libraries
try:
    import pypdf
except ImportError:
    pypdf = None

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    import pytesseract
    from PIL import Image
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

# Configuration
CHUNK_SIZE_WORDS = 450      # Approx 600-750 tokens
CHUNK_OVERLAP_WORDS = 60    # Approx 80-100 tokens overlap
VOYAGE_EMBEDDING_MODEL = "voyage-multilingual-2"  # 1024-dimension vector model for Arabic/English RAG


def get_env_or_fail(var_name: str) -> str:
    val = os.environ.get(var_name)
    if not val:
        print(f"❌ Error: Missing environment variable {var_name}")
        sys.exit(1)
    return val


def extract_text_from_pdf(pdf_path: str):
    """Extracts text page by page. Tries native text first, falls back to OCR if empty."""
    pages_text = []
    failed_pages = []

    print(f"📄 Reading PDF file: {pdf_path}")

    # Method A: Try pypdf / pdfplumber first
    if pdfplumber:
        with pdfplumber.open(pdf_path) as pdf:
            for i, page in enumerate(pdf.pages):
                text = page.extract_text() or ""
                if len(text.strip()) > 30:
                    pages_text.append((i + 1, text.strip()))
                else:
                    # Low text found, mark for OCR
                    ocr_text = try_ocr_on_page(pdf_path, i)
                    if ocr_text and len(ocr_text.strip()) > 30:
                        pages_text.append((i + 1, ocr_text.strip()))
                    else:
                        failed_pages.append(i + 1)
    elif pypdf:
        reader = pypdf.PdfReader(pdf_path)
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if len(text.strip()) > 30:
                pages_text.append((i + 1, text.strip()))
            else:
                ocr_text = try_ocr_on_page(pdf_path, i)
                if ocr_text and len(ocr_text.strip()) > 30:
                    pages_text.append((i + 1, ocr_text.strip()))
                else:
                    failed_pages.append(i + 1)
    else:
        print("⚠️ Warning: Neither pdfplumber nor pypdf found. Install via: pip install pdfplumber pypdf")
        sys.exit(1)

    return pages_text, failed_pages


def try_ocr_on_page(pdf_path: str, page_num: int) -> str:
    """Fallback OCR on scanned images using PyMuPDF + Tesseract."""
    if not (fitz and pytesseract):
        return ""
    try:
        doc = fitz.open(pdf_path)
        page = doc.load_page(page_num)
        pix = page.get_pixmap(dpi=200)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        # Attempt Arabic + English OCR
        text = pytesseract.image_to_string(img, lang="ara+eng")
        return text
    except Exception as e:
        return ""


def chunk_text(pages_text, chunk_size=CHUNK_SIZE_WORDS, overlap=CHUNK_OVERLAP_WORDS):
    """Chunks full document text into overlapping segments."""
    full_text = "\n\n".join([f"[صفحة {pnum}]\n{text}" for pnum, text in pages_text])
    words = full_text.split()

    if not words:
        return []

    chunks = []
    i = 0
    while i < len(words):
        chunk_words = words[i : i + chunk_size]
        chunk_str = " ".join(chunk_words)
        if len(chunk_str.strip()) > 40:
            chunks.append(chunk_str)
        i += (chunk_size - overlap)

    return chunks


def get_voyage_embeddings(chunks, voyage_api_key):
    """Calls Voyage AI Embeddings API for a batch of text chunks."""
    url = "https://api.voyageai.com/v1/embeddings"
    headers = {
        "Authorization": f"Bearer {voyage_api_key}",
        "Content-Type": "application/json"
    }
    
    print(f"🔮 Generating vector embeddings using Voyage AI ({VOYAGE_EMBEDDING_MODEL})...")
    
    # Process in batches of 8 chunks
    embeddings = []
    batch_size = 8
    
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i : i + batch_size]
        payload = {
            "input": batch,
            "model": VOYAGE_EMBEDDING_MODEL,
            "input_type": "document"
        }
        res = requests.post(url, headers=headers, json=payload)
        if res.status_code != 200:
            print(f"❌ Voyage API Error ({res.status_code}): {res.text}")
            sys.exit(1)
        
        data = res.json()
        for item in data["data"]:
            embeddings.append(item["embedding"])

    return embeddings


def insert_chunks_to_supabase(supabase_url, service_key, subject_id, unit_title, lesson_title, chunks, embeddings):
    """Inserts chunks & embeddings into public.curriculum_chunks table in Supabase."""
    url = f"{supabase_url.rstrip('/')}/rest/v1/curriculum_chunks"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    records = []
    for chunk, emb in zip(chunks, embeddings):
        records.append({
            "subject_id": subject_id,
            "unit_title": unit_title,
            "lesson_title": lesson_title,
            "content": chunk,
            "embedding": emb
        })

    print(f"💾 Saving {len(records)} chunks into Supabase table 'curriculum_chunks'...")
    res = requests.post(url, headers=headers, json=records)
    if res.status_code not in (200, 201):
        print(f"❌ Supabase Insert Error ({res.status_code}): {res.text}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Ingest Egyptian Curriculum PDF into RAG Vector DB")
    parser.add_argument("--pdf", required=True, help="Path to PDF textbook file")
    parser.add_argument("--subject_id", type=int, required=True, help="Subject ID (1: عربي, 2: إنجليزي, 3: فيزياء, 4: كيمياء, 5: رياضة بحتة, 6: رياضة تطبيقية)")
    parser.add_argument("--unit_title", required=True, help="Unit title (اسم الوحدة)")
    parser.add_argument("--lesson_title", required=True, help="Lesson title (اسم الدرس)")

    args = parser.parse_args()

    # Load Env
    supabase_url = get_env_or_fail("SUPABASE_URL")
    supabase_key = get_env_or_fail("SUPABASE_SERVICE_ROLE_KEY")
    voyage_key = get_env_or_fail("VOYAGE_API_KEY")

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"❌ PDF file not found: {pdf_path}")
        sys.exit(1)

    print("=================================================================")
    print("🚀 STARTING CURRICULUM RAG INGESTION PIPELINE")
    print(f"📌 Subject ID: {args.subject_id} | Unit: {args.unit_title} | Lesson: {args.lesson_title}")
    print("=================================================================")

    # 1. Extract Text & OCR
    pages_text, failed_pages = extract_text_from_pdf(str(pdf_path))
    print(f"✅ Extracted text from {len(pages_text)} pages successfully.")

    if not pages_text:
        print("❌ Error: No text could be extracted from PDF.")
        sys.exit(1)

    # 2. Chunking
    chunks = chunk_text(pages_text)
    print(f"🧩 Created {len(chunks)} text chunks (500-800 tokens with overlap).")

    # 3. Vector Embeddings via Voyage AI
    embeddings = get_voyage_embeddings(chunks, voyage_key)

    # 4. Insert into Supabase
    insert_chunks_to_supabase(supabase_url, supabase_key, args.subject_id, args.unit_title, args.lesson_title, chunks, embeddings)

    # 5. Final Report
    print("\n" + "=" * 65)
    print("🎉 INGESTION REPORT (تقرير الإدخال والمكافأة)")
    print("=" * 65)
    print(f"✅ Total Chunks Saved: {len(chunks)}")
    print(f"📖 Pages Processed Successfully: {len(pages_text)}")
    if failed_pages:
        print(f"⚠️ Failed / Blank Pages for Manual Review: {failed_pages}")
    else:
        print("🌟 All pages extracted with 100% success!")
    print("=" * 65)


if __name__ == "__main__":
    main()
