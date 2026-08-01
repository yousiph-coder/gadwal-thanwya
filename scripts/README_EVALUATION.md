# 📊 دليل تشغيل أداة التقييم والقياس (`evaluate-tutor`)

أداة `evaluate-tutor` مخصصة لاختبار وتقييم دقة إجابات المساعد الذكي لمواد الثانوية العامة المصرية عبر استخدام **Claude 3.5 Sonnet كمحكّم ذكي (LLM-as-a-Judge)** يقارن الرد بالإجابة النموذجية المتوقعة دلالياً ومنهجياً وليس بحرفية جمودية.

---

## 📁 الملفات المطلوبة:
1. **[scripts/eval_dataset.json](file:///C:/Users/acsds/Documents/antigravity/sharp-mendel/scripts/eval_dataset.json):** ملف JSON يضم الأسئلة الاختبارية والإجابة النموذجية المتوقعة لكل مادة ونمط.
2. **[scripts/evaluate_tutor.py](file:///C:/Users/acsds/Documents/antigravity/sharp-mendel/scripts/evaluate_tutor.py):** سكريبت Python التشغيلي.
3. **[supabase/functions/evaluate-tutor/index.ts](file:///C:/Users/acsds/Documents/antigravity/sharp-mendel/supabase/functions/evaluate-tutor/index.ts):** الـ Edge Function الموازية داخل Supabase.

---

## 💻 1. التشغيل المحلي (Python CLI):

### إعداد مفاتيح البيئة:
```bash
export ANTHROPIC_API_KEY="sk-ant-api03-your-key"
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
```

### تشغيل الاختبار:
```bash
python scripts/evaluate_tutor.py --dataset scripts/eval_dataset.json
```

---

## 🌐 2. التشغيل عبر Supabase Edge Function:

```bash
# نشر الدالة
npx supabase functions deploy evaluate-tutor

# استدعاء الدالة مع ملف الأسئلة JSON
curl -X POST 'https://your-project.supabase.co/functions/v1/evaluate-tutor' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"test_items": [{"subject": "فيزياء", "subject_id": 3, "question": "...", "expected_answer": "..."}]}'
```

---

## 📈 ما هي مخرجات التقرير؟

- **نسبة الدقة لكل مادة:** حساب نسبة إجابات المساعد الصحيحة (مثلاً: الفيزياء 100%، الكيمياء 90%).
- **قائمة الأسئلة التي بها أخطاء:** عرض التفاصيل الدقيقة (السؤال، الإجابة المتوقعة، إجابة المساعد المولدة، وملاحظات المحكّم) لسهولة التعديل يدوياً.
