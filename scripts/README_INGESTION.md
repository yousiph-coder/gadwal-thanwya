# 📚 دليل تشغيل أداة Ingest Curriculum المنهجية (RAG Pipeline)

أداة `ingest-curriculum` مخصصة لمعالجة وتقسيم كتب ومذكرات المناهج وامتحانات الثانوية العامة المصرية وتحويلها إلى **Vector Embeddings** عالية الدقة وحفظها في قاعدة بيانات **Supabase (table: `curriculum_chunks`)**.

---

## 🔑 المتطلبات والـ Environment Variables:

قبل تشغيل السكربت، قم بضبط المتغيرات التالية في بيئة التشغيل أو في ملف `.env`:

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export VOYAGE_API_KEY="pa-your-voyage-api-key"
```

---

## 🐍 طريقة التشغيل باستخدام Python (مع دعم التلقائي للـ OCR للصور والصفحات الممسوحة):

### 1. تثبيت الحزم المطلوبة:
```bash
pip install requests pypdf pdfplumber pytesseract Pillow PyMuPDF
```

### 2. تشغيل السكربت لكتاب أو درس معين:
```bash
python scripts/ingest_curriculum.py \
  --pdf "path/to/physics_chapter1.pdf" \
  --subject_id 3 \
  --unit_title "الوحدة الأولى: الكهربية التيارية والكهرومغناطيسية" \
  --lesson_title "الدرس الأول: التيار الكهربي وقانون أوم"
```

---

## 🟢 طريقة التشغيل باستخدام Node.js:

### 1. تثبيت المكتبات:
```bash
npm install pdf-parse @supabase/supabase-js
```

### 2. تشغيل السكربت:
```bash
node scripts/ingest_curriculum.js \
  --pdf "path/to/physics_chapter1.pdf" \
  --subject_id 3 \
  --unit_title "الوحدة الأولى: الكهربية التيارية والكهرومغناطيسية" \
  --lesson_title "الدرس الأول: التيار الكهربي وقانون أوم"
```

---

## 📊 مميزات الأداة ومراحل الإدخال:

1. **التعامل الذكي مع الـ PDF الأصلي أو الممسوح ضوئياً (OCR Fallback):**
   تستخرج النص الأصلي أولاً، وفي حال وجود صفحات عبارة عن صور ممسوحة، تقوم بتشغيل محرك **Tesseract OCR** لاستخراج النصوص العربية والإنجليزية.
2. **التقسيم الذكي (Chunking with Overlap):**
   تقسيم النص لـ Chunks بحجم ~500-800 توكن مع Overlap بين كل جزء والآخر لمنع انقطاع سياق الشرح.
3. **توليد المتجهات برمز Voyage AI (`voyage-multilingual-2`):**
   استدعاء Voyage AI API المعتمد لـ Claude وتوليد Vector أبعاده 1024-dim.
4. **تقرير شفاف ومفصل:**
   طباعة التقرير النهائي بعدد قطع الـ Chunks المضافة، وإدراج الصفحات الفارغة أو التي تعذر استخراجها لمراجعتها يدوياً.
