// =============================================================================
// Supabase Edge Function: analyze-session
// Description: Analyzes recent chat messages to detect genuine student academic
//              weak points and automatically stores them in student_weak_points.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

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
    const { student_id, subject_id } = await req.json();

    if (!student_id || !subject_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: student_id, subject_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Step 1: Fetch recent chat messages for student & subject (Last 10 messages)
    console.log(`🔍 Step 1: Fetching recent chat messages for student ${student_id}, subject ${subject_id}...`);
    const { data: messages, error: msgErr } = await supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("student_id", student_id)
      .eq("subject_id", subject_id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (msgErr) {
      throw new Error(`Error reading chat history: ${msgErr.message}`);
    }

    if (!messages || messages.length < 2) {
      return new Response(
        JSON.stringify({ message: "Not enough conversation messages to analyze session.", weak_point_detected: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Chronological order (oldest to newest)
    const chronologicalMessages = [...messages].reverse();
    const formattedChat = chronologicalMessages
      .map(m => `${m.role === 'user' ? 'الطالب' : 'المساعد'}: ${m.content}`)
      .join("\n");

    // Step 2: System prompt for Claude to perform diagnostic analysis
    const systemPrompt = `أنت خبير تقييم تربوي متخصص في منهج الثانوية العامة المصرية.
مهمتك: تحليل سياق المحادثة بين الطالب والمساعد التعليمي لتحديد ما إذا كانت هناك "نقطة ضعف أكاديمية واضحة ومثبتة برهانياً".

تعليمات صارمة جداً:
1. حلل فقط الأسئلة والأخطاء الفعلية التي ارتكبها الطالب أو أعرب فيها عن سوء فهم واضح لمفهوم أو قانون معين.
2. لا تختلق أو تفترض أي نقطة ضعف إطلاقاً إذا لم تكن ظهرت بشكل صريح في المحادثة.
3. إذا كانت المحادثة عبارة عن استفسار عام أو أسئلة محلولة بصحة دون أخطاء متكررة، أرجع { "has_weak_point": false }.
4. أرجع الناتج بصيغة JSON فقط دون أي نصوص إضافية كالتالي:

في حالة وجود نقطة ضعف مؤكدة:
{
  "has_weak_point": true,
  "lesson_title": "اسم الدرس المستهدف في المنهج",
  "note": "جملة قصيرة ومحددة تصف سوء الفهم (مثال: صعوبة في التمييز بين التوصيل على التوالي والتوازي في الدوائر)"
}

في حالة عدم وجود نقطة ضعف مؤكدة:
{
  "has_weak_point": false
}`;

    console.log("🤖 Step 2: Sending session transcript to Claude for weak point analysis...");
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 500,
        system: systemPrompt,
        messages: [
          { role: "user", content: `نص المحادثة للتحليل:\n\n${formattedChat}` }
        ]
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`Anthropic API Error (${anthropicRes.status}): ${errText}`);
    }

    const anthropicData = await anthropicRes.json();
    const rawContent = anthropicData.content[0]?.text || "{}";

    // Extract JSON
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ message: "Analysis completed but no valid JSON returned.", weak_point_detected: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const analysisResult = JSON.parse(jsonMatch[0]);

    // Step 3: Record Weak Point if detected
    if (analysisResult.has_weak_point && analysisResult.lesson_title && analysisResult.note) {
      console.log(`📌 Step 3: Weak point detected! Lesson: ${analysisResult.lesson_title} | Note: ${analysisResult.note}`);

      // Check if duplicate note already exists recently
      const { data: existing } = await supabase
        .from("student_weak_points")
        .select("id")
        .eq("student_id", student_id)
        .eq("subject_id", subject_id)
        .eq("lesson_title", analysisResult.lesson_title)
        .limit(1);

      if (!existing || existing.length === 0) {
        const { data: inserted, error: insertErr } = await supabase
          .from("student_weak_points")
          .insert([
            {
              student_id: student_id,
              subject_id: subject_id,
              lesson_title: analysisResult.lesson_title,
              note: analysisResult.note
            }
          ])
          .select()
          .single();

        if (insertErr) {
          throw new Error(`Failed to record weak point: ${insertErr.message}`);
        }

        return new Response(
          JSON.stringify({
            success: true,
            weak_point_detected: true,
            record: inserted
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        return new Response(
          JSON.stringify({
            success: true,
            weak_point_detected: true,
            duplicate_ignored: true,
            note: analysisResult.note
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log("✅ Analysis finished: No academic weak point detected.");
    return new Response(
      JSON.stringify({
        success: true,
        weak_point_detected: false,
        message: "No specific weak point identified in this conversation."
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("❌ Fatal analyze-session Edge Function Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
