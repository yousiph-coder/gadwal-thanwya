// =============================================================================
// Supabase Edge Function: evaluate-tutor
// Description: Evaluates a JSON array of benchmark test questions against
//              ai-tutor-chat using Claude as an AI Judge.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { test_items } = await req.json();

    if (!test_items || !Array.isArray(test_items)) {
      return new Response(
        JSON.stringify({ error: "Missing test_items array in body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const subjectStats: Record<string, { total: number; correct: number }> = {};
    const failedItems: any[] = [];

    for (let idx = 0; idx < test_items.length; idx++) {
      const item = test_items[idx];
      const subject = item.subject || "عام";

      if (!subjectStats[subject]) {
        subjectStats[subject] = { total: 0, correct: 0 };
      }

      // Step 1: Call ai-tutor-chat Edge Function internally
      const tutorRes = await fetch(`${SUPABASE_URL.rstrip('/')}/functions/v1/ai-tutor-chat`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          student_id: "00000000-0000-0000-0000-000000000000",
          subject_id: item.subject_id || 3,
          lesson_title: item.lesson_title || "",
          mode: item.mode || "step_by_step",
          question: item.question
        })
      });

      const generatedAnswer = tutorRes.ok ? await tutorRes.text() : `Error: ${tutorRes.statusText}`;

      // Step 2: Use Claude AI Judge to evaluate response accuracy
      const judgePrompt = `أنت محكّم تربوي ذكي وناقد (AI Judge) لتقييم إجابات المساعد الذكي لمواد الثانوية العامة المصرية.
المطلوب: مقارنة الإجابة الناتجة من المساعد الذكي بالإجابة النموذجية المتوقعة، وتقييم صحتها العلمية والمنهجية.
ملاحظة مهمة: المطابقة ليست مطابقة حرفية، بل تعتمد على الصحة العلمية والمنطقية واستيفاء المعنى المطلوب.

أرجع الناتج بصيغة JSON فقط بالتنسيق التالي دون أي مقدمات:
{
  "is_correct": true / false,
  "score": 5 (رقم من 1 إلى 5),
  "feedback": "سبب التقييم بعبارة قصيرة ومحددة"
}`;

      const judgeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 400,
          system: judgePrompt,
          messages: [
            {
              role: "user",
              content: `السؤال:\n${item.question}\n\nالإجابة المتوقعة:\n${item.expected_answer}\n\nالإجابة المولدة:\n${generatedAnswer}`
            }
          ]
        })
      });

      let isCorrect = false;
      let feedback = "فشل في تقييم المحكّم";

      if (judgeRes.ok) {
        const judgeData = await judgeRes.json();
        const rawText = judgeData.content[0]?.text || "";
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            isCorrect = parsed.is_correct === true;
            feedback = parsed.feedback || "";
          } catch (_) {}
        }
      }

      subjectStats[subject].total++;
      if (isCorrect) {
        subjectStats[subject].correct++;
      } else {
        failedItems.push({
          index: idx + 1,
          subject,
          question: item.question,
          expected_answer: item.expected_answer,
          generated_answer: generatedAnswer,
          feedback
        });
      }
    }

    // Format accuracy report
    const accuracyReport: Record<string, string> = {};
    for (const [subj, stats] of Object.entries(subjectStats)) {
      const pct = stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(1) : "0";
      accuracyReport[subj] = `${stats.correct}/${stats.total} (${pct}%)`;
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: accuracyReport,
        failed_items: failedItems
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
