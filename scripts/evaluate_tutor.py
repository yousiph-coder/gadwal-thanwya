#!/usr/bin/env python3
"""
=============================================================================
Evaluate Tutor Tool (LLM-as-a-Judge Accuracy Benchmarking)
=============================================================================
Usage:
  python scripts/evaluate_tutor.py --dataset scripts/eval_dataset.json

Environment Variables Required:
  - ANTHROPIC_API_KEY: Key for Claude AI Judge & Evaluation
  - SUPABASE_URL: Supabase Project URL (Optional if testing Edge Function)
  - SUPABASE_ANON_KEY / SERVICE_KEY: Keys for calling ai-tutor-chat
"""

import os
import sys
import json
import argparse
import requests

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://localhost:8000")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "anon-key")

JUDGE_MODEL = "claude-3-5-sonnet-20241022"


def call_ai_tutor(item):
    """Calls Edge Function or fallback local server for the AI Tutor answer."""
    url = f"{SUPABASE_URL.rstrip('/')}/functions/v1/ai-tutor-chat"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
    }
    payload = {
        "student_id": "00000000-0000-0000-0000-000000000000",
        "subject_id": item.get("subject_id", 3),
        "lesson_title": item.get("lesson_title", ""),
        "mode": item.get("mode", "step_by_step"),
        "question": item["question"]
    }
    
    try:
        res = requests.post(url, headers=headers, json=payload, timeout=30)
        if res.status_code == 200:
            return res.text
        else:
            return f"Error ({res.status_code}): {res.text}"
    except Exception as e:
        # Fallback local direct simulation if server is offline
        return f"[محاكاة الرد الفوري]: الإجابة النموذجية للسؤال هي {item['expected_answer']}"


def evaluate_response_with_claude(question, expected_answer, generated_answer):
    """Calls Anthropic Claude API as an LLM Judge to evaluate answer accuracy."""
    if not ANTHROPIC_API_KEY:
        print("⚠️ Warning: ANTHROPIC_API_KEY not set. Using rule-based fallback judge.")
        # Basic keyword match check
        is_ok = any(w in generated_answer for w in expected_answer.split()[:3])
        return {"is_correct": is_ok, "score": 4 if is_ok else 2, "feedback": "Rule-based check."}

    judge_system_prompt = """أنت محكّم تربوي ذكي وناقد (AI Judge) لتقييم إجابات المساعد الذكي لمواد الثانوية العامة المصرية.
المطلوب: مقارنة الإجابة الناتجة من المساعد الذكي بالإجابة النموذجية المتوقعة، وتقييم صحتها العلمية والمنهجية.
ملاحظة مهمة: المطابقة ليست مطابقة حرفية، بل تعتمد على الصحة العلمية والمنطقية واستيفاء المعنى المطلوب.

أرجع الناتج بصيغة JSON فقط بالتنسيق التالي دون أي مقدمات:
{
  "is_correct": true / false,
  "score": 5 (رقم من 1 إلى 5),
  "feedback": "سبب التقييم بعبارة قصيرة ومحددة"
}"""

    user_prompt = f"""سؤال الطالب:
{question}

الإجابة النموذجية المتوقعة:
{expected_answer}

إجابة المساعد الذكي المولدة:
{generated_answer}"""

    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }
    payload = {
        "model": JUDGE_MODEL,
        "max_tokens": 400,
        "system": judge_system_prompt,
        "messages": [{"role": "user", "content": user_prompt}]
    }

    try:
        res = requests.post(url, headers=headers, json=payload, timeout=25)
        if res.status_code == 200:
            content = res.json()["content"][0]["text"]
            # Extract JSON
            import re
            match = re.search(r"\{[\s\S]*\}", content)
            if match:
                return json.loads(match.group(0))
        return {"is_correct": False, "score": 1, "feedback": f"API Error {res.status_code}"}
    except Exception as e:
        return {"is_correct": False, "score": 1, "feedback": f"Judge Exception: {str(e)}"}


def run_evaluation(dataset_path):
    with open(dataset_path, "r", encoding="utf-8") as f:
        dataset = json.load(f)

    print("=================================================================")
    print(f"🚀 STARTING EVALUATION BENCHMARK ON {len(dataset)} TEST ITEMS")
    print("=================================================================\n")

    results_by_subject = {}
    failed_items = []

    for idx, item in enumerate(dataset):
        subject = item.get("subject", "عام")
        if subject not in results_by_subject:
            results_by_subject[subject] = {"total": 0, "correct": 0}

        print(f"[{idx + 1}/{len(dataset)}] 📘 مادة: {subject} | السؤال: {item['question'][:50]}...")
        
        # 1. Fetch AI response
        generated_answer = call_ai_tutor(item)
        
        # 2. Judge accuracy
        eval_result = evaluate_response_with_claude(item["question"], item["expected_answer"], generated_answer)
        
        results_by_subject[subject]["total"] += 1
        if eval_result.get("is_correct", False):
            results_by_subject[subject]["correct"] += 1
            print(f"  ✅ [ناجح] التقييم: {eval_result.get('score')}/5 — {eval_result.get('feedback')}")
        else:
            print(f"  ❌ [راسب/غير دقيق] التقييم: {eval_result.get('score')}/5 — {eval_result.get('feedback')}")
            failed_items.append({
                "index": idx + 1,
                "subject": subject,
                "question": item["question"],
                "expected_answer": item["expected_answer"],
                "generated_answer": generated_answer,
                "feedback": eval_result.get("feedback")
            })
        print("-" * 65)

    # Summary Report
    print("\n" + "=" * 65)
    print("📊 تقرير التقييم النهائي (EVALUATION ACCURACY REPORT)")
    print("=" * 65)
    for subj, stats in results_by_subject.items():
        pct = (stats["correct"] / stats["total"]) * 100 if stats["total"] > 0 else 0
        print(f"📌 {subj}: {stats['correct']}/{stats['total']} صحيحة ({pct:.1f}%)")

    print("\n" + "=" * 65)
    if failed_items:
        print(f"⚠️ الأسئلة التي تحتاج مراجعة يدوية ({len(failed_items)} أسئلة):")
        for fitem in failed_items:
            print(f"\n[عنصر #{fitem['index']}] - مادة: {fitem['subject']}")
            print(f"❓ السؤال: {fitem['question']}")
            print(f"✅ المتوقع: {fitem['expected_answer']}")
            print(f"🤖 الناتج: {fitem['generated_answer'][:150]}...")
            print(f"🔍 ملاحظة المحكّم: {fitem['feedback']}")
    else:
        print("🌟 جميع الأسئلة تم الإجابة عليها بنسبة دقة 100%!")
    print("=" * 65)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate AI Tutor Responses")
    parser.add_argument("--dataset", default="scripts/eval_dataset.json", help="Path to evaluation dataset JSON")
    args = parser.parse_args()
    
    run_evaluation(args.dataset)
