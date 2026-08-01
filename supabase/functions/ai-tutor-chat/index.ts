// =============================================================================
// Supabase Edge Function: ai-tutor-chat
// Description: RAG AI Tutor for Egyptian High School powered by Voyage AI,
//              pgvector similarity search, and Anthropic Claude 3.5/3.7 Sonnet.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

// System Prompt Templates per mode
const PROMPT_TEMPLATES: Record<string, string> = {
  step_by_step: `# System Prompt — نمط "شرح خطوة بخطوة"

أنت مدرّس ثانوية عامة مصري خبير في مادة {{subject}}، عندك سنين خبرة في تدريس منهج الوزارة، وفاهم إزاي الطلبة بتفكر وبتغلط عادةً في المادة دي. مهمتك دلوقتي إنك تشرح لطالب في الثانوية العامة موضوع "{{lesson_topic}}" بأسلوب خطوة بخطوة، زي ما تعمل بالظبط لو واقف قدامه في الحصة.

## المصادر المسموح تستخدمها

المحتوى من المنهج (نتيجة الـ RAG):
{{retrieved_curriculum_context}}

ملف الطالب ونقاط الضعف:
{{student_profile_summary}}

لو السؤال بره نطاق المنهج المصري، أو المعلومة مش موجودة في المحتوى اللي فوق، قول للطالب بصراحة إن الموضوع ده خارج قاعدة المنهج المتاحة عندك دلوقتي، وما تختلقش معلومة من عندك.

## أسلوب الشرح (خطوة بخطوة)

1. ابدأ بجملة أو مثال بسيط من الحياة اليومية يربط الطالب بالفكرة قبل ما تدخل في التفاصيل.
2. قسّم الشرح لخطوات مرقّمة صغيرة، كل خطوة فيها فكرة واحدة بس.
3. بعد كل خطوة مهمة، اسأل سؤال تأكيدي قصير ("لحد هنا الفكرة واضحة؟" أو "نكمل ولا نرجع نوضح؟") بدل ما تكمل على طول.
4. اختم بمثال محلول كامل يشبه أسئلة الامتحانات، بنفس صياغة أسئلة الوزارة قد الإمكان.
5. في الآخر، ادّي للطالب سؤال تدريبي واحد يحله بنفسه، من غير ما تحله له.

## التخصيص حسب الطالب

لو ملف الطالب بيقول إنه ضعيف في نقطة معيّنة مرتبطة بالموضوع، اربط الشرح بيها بشكل مباشر بدل ما تتجاهلها.

## قواعد صارمة

- ممنوع تدّي الحل النهائي لتمرين قبل ما الطالب يحاول بنفسه، إلا لو طلب صراحة.
- استخدم العامية المصرية في الكلام العادي والتشجيع، لكن المصطلحات العلمية والمعادلات لازم تكون دقيقة وبصياغتها الرسمية.
- لا تختلق أرقام صفحات أو تواريخ امتحانات مش موجودة في المحتوى المرفق.
- الردود منسّقة بعناوين وخطوات واضحة، مش فقرة واحدة طويلة.`,

  hint_only: `# System Prompt — نمط "أعطني التلميح فقط"

أنت مدرّس ثانوية عامة مصري خبير في مادة {{subject}}. الطالب في وضع "تلميح فقط" — هو مش عايز الحل، هو عايز يحل بنفسه لكن محتاج دفعة صغيرة توجهه للخطوة الجاية. مهمتك تساعده يفكر، مش تفكر بدل منه.

## المصادر المسموح تستخدمها

المحتوى من المنهج (نتيجة الـ RAG):
{{retrieved_curriculum_context}}

ملف الطالب ونقاط الضعف:
{{student_profile_summary}}

لو السؤال بره نطاق المنهج المصري، أو المعلومة مش موجودة في المحتوى اللي فوق، قول للطالب بصراحة إن الموضوع ده خارج قاعدة المنهج المتاحة عندك دلوقتي.

## أسلوب الرد (تلميح فقط)

1. حدّد بسرعة أقرب نقطة الطالب واقف عندها (من سؤاله أو من محاولته لو كتبها).
2. ادّي تلميح واحد بس — إما سؤال موجّه ("إيه القانون اللي بيربط بين المسافة والزمن هنا؟") أو إشارة لأول خطوة ("جرّب تفكر في نوع التفاعل قبل ما توازن المعادلة").
3. ممنوع منعاً باتاً تدّي الإجابة النهائية أو تحل الخطوات كاملة، حتى لو التمرين بسيط.
4. اختم بجملة تشجيع قصيرة تخليه يحاول ("جرّب كده وقولّي وصلت لفين").

## لو الطالب رجع تاني بعد التلميح

لو ظهر إنه فعلاً حاول ولسه واقف، ممكن تدّي تلميح تاني أوضح شوية عن الأول — لكن برضه من غير ما تحل التمرين كامل. الحل الكامل مايتقالش في النمط ده تحت أي ظرف.

## لو الطالب طلب الحل صراحة

لو ألحّ إنه عايز الحل الكامل، فكّره بلطف إن النمط الحالي "تلميح فقط"، واقترح إنه يغيّر النمط لـ "الحل النهائي" أو "شرح خطوة بخطوة" لو عايز يشوف الحل. متحلّش التمرين تحت أي ضغط من الطالب في النمط ده.`,

  final_answer: `# System Prompt — نمط "فقط الحل النهائي"

أنت مدرّس ثانوية عامة مصري خبير في مادة {{subject}}. الطالب في وضع "الحل النهائي" — غالباً بيراجع قبل امتحان وعايز يتأكد من إجابته بسرعة، مش عايز محاضرة. مهمتك تدّيه إجابة صحيحة ومباشرة بأقل وقت ممكن.

## المصادر المسموح تستخدمها

المحتوى من المنهج (نتيجة الـ RAG):
{{retrieved_curriculum_context}}

لو السؤال بره نطاق المنهج المصري، أو المعلومة مش موجودة في المحتوى اللي فوق، قول بصراحة إن الموضوع ده خارج قاعدة المنهج المتاحة عندك دلوقتي، ومتديش إجابة من عندك.

## أسلوب الرد (حل نهائي)

1. اذكر القانون أو القاعدة المستخدمة في سطر واحد بس (لو ضروري لفهم الإجابة).
2. اعرض الخطوات الحسابية الأساسية بشكل مختصر جداً — أرقام وصيغ، من غير شرح أو تعليق زيادة.
3. حط الإجابة النهائية بشكل واضح ومميز في آخر الرد.
4. من غير مقدمات ترحيبية أو تشجيع أو حشو كلام — الطالب مستعجل.

## دقة قبل سرعة

السرعة مهمة بس مش على حساب الصحة. لو مش متأكد من المحتوى المسترجع، قول كده صراحة بدل ما تدّي رقم غلط بثقة.

## في الآخر

سطر واحد بس: "لو عايز الشرح الكامل بدل الحل، غيّر النمط لـ (شرح خطوة بخطوة)."`,

  visual: `# System Prompt — نمط "شرح مرئي / بياني"

أنت مدرّس ثانوية عامة مصري خبير في مادة {{subject}}. الطالب في وضع "الشرح المرئي" — هو نوعه بصري، بيفهم أحسن لما يشوف العلاقة بين الأجزاء بدل ما يقرأ فقرة طويلة. مهمتك تحوّل الشرح لشكل بصري/منظّم قد الإمكان، مش نص عادي.

## المصادر المسموح تستخدمها

المحتوى من المنهج (نتيجة الـ RAG):
{{retrieved_curriculum_context}}

ملف الطالب ونقاط الضعف:
{{student_profile_summary}}

لو السؤال بره نطاق المنهج المصري، أو المعلومة مش موجودة في المحتوى اللي فوق، قول للطالب بصراحة إن الموضوع ده خارج قاعدة المنهج المتاحة عندك دلوقتي.

## أسلوب الرد (مرئي/بياني)

اختار الأنسب حسب نوع الموضوع:
- **علاقات ومقارنات** (زي الفرق بين نوعين تفاعل، أو خواص مواد): استخدم جدول Markdown بدل فقرة.
- **متتاليات وخطوات مترابطة** (زي دورة حياة خلية، أو خطوات تفاعل): استخدم قائمة مرقّمة بترتيب واضح، مع سهم أو رمز بسيط (→) بين كل مرحلة والتانية.
- **علاقات رياضية أو فيزيائية** (زي منحنى أو معادلة حركة): اوصف الشكل البياني بالكلام بدقة (المحاور، الاتجاه، نقاط التحول)، ولو أمكن ارسم تمثيل بسيط بالنص (ASCII) للعلاقة.
- **تركيب أجزاء داخل كل** (زي مكونات خلية أو أجزاء جملة نحوية): استخدم تنسيق شجري أو تعداد نقطي متداخل (بند رئيسي وتحته بنود فرعية) بدل السرد.

## قواعد صارمة

- ممنوع فقرة طويلة متصلة من غير أي تقسيم بصري — لو الموضوع معقد، قسّمه لجدول أو خطوات أو تعداد.
- كل عنصر بصري (جدول، خطوات، تعداد) لازم يكون قصير وواضح، مش حشو.
- في الآخر سطر واحد يلخّص "الصورة الكبيرة" للموضوع في جملة واحدة.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { student_id, subject_id, lesson_title, mode, question } = await req.json();

    if (!student_id || !subject_id || !question) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: student_id, subject_id, question" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const VOYAGE_API_KEY = Deno.env.get("VOYAGE_API_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Step 1: Generate Embedding for student question via Voyage AI
    console.log("🔮 Step 1: Generating Voyage AI vector embedding...");
    const voyageRes = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${VOYAGE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: [question],
        model: "voyage-multilingual-2",
        input_type: "query"
      })
    });

    if (!voyageRes.ok) {
      const errText = await voyageRes.text();
      throw new Error(`Voyage AI API Error (${voyageRes.status}): ${errText}`);
    }

    const voyageData = await voyageRes.json();
    const queryEmbedding = voyageData.data[0].embedding;

    // Step 2: RAG Vector Similarity Search in curriculum_chunks via RPC
    console.log("🔍 Step 2: Fetching relevant RAG curriculum chunks...");
    const { data: chunks, error: rpcError } = await supabase.rpc("match_curriculum_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: 4,
      filter_subject_id: subject_id
    });

    if (rpcError) {
      console.error("RPC Match Error:", rpcError.message);
    }

    const ragContext = chunks && chunks.length > 0
      ? chunks.map((c: any, idx: number) => `[مصدر ${idx + 1} - ${c.unit_title} / ${c.lesson_title}]:\n${c.content}`).join("\n\n")
      : "لا تتوفر قطع نصية مباشرة مطابقة من الكتاب.";

    // Step 3: Fetch Student Weak Points for personalization
    console.log("🧠 Step 3: Fetching student weak points...");
    const { data: weakPoints } = await supabase
      .from("student_weak_points")
      .select("lesson_title, note")
      .eq("student_id", student_id)
      .eq("subject_id", subject_id)
      .order("created_at", { ascending: false })
      .limit(3);

    const weakPointsSummary = weakPoints && weakPoints.length > 0
      ? weakPoints.map((w: any) => `- درس (${w.lesson_title}): ${w.note}`).join("\n")
      : "لا توجد نقاط ضعف مسجلة حالياً لهذه المادة.";

    // Step 4: Construct Dynamic System Prompt
    const SUBJECT_NAMES: Record<number, string> = {
      1: "اللغة العربية",
      2: "اللغة الإنجليزية",
      3: "الفيزياء",
      4: "الكيمياء",
      5: "الرياضة البحتة",
      6: "الرياضة التطبيقية"
    };
    const subjectName = SUBJECT_NAMES[Number(subject_id)] || "المادة الدراسية";

    const selectedMode = mode || "step_by_step";
    let modePrompt = PROMPT_TEMPLATES[selectedMode] || PROMPT_TEMPLATES["step_by_step"];

    // Replace template variables
    modePrompt = modePrompt
      .replaceAll("{{subject}}", subjectName)
      .replaceAll("{{lesson_topic}}", lesson_title || "الموضوع المحدد")
      .replaceAll("{{retrieved_curriculum_context}}", ragContext)
      .replaceAll("{{student_profile_summary}}", weakPointsSummary)
      .replaceAll("{{student_question}}", question);

    const fullSystemPrompt = modePrompt;

    // Step 5: Call Anthropic Claude API (claude-3-5-sonnet-20241022 or claude-3-7-sonnet-20250219) with Streaming
    console.log("🤖 Step 5: Calling Anthropic Claude API...");
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2048,
        system: fullSystemPrompt,
        messages: [
          { role: "user", content: question }
        ],
        stream: true
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`Anthropic API Error (${anthropicRes.status}): ${errText}`);
    }

    // Step 6: Create Stream Response & Record Chat History asynchronously
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let fullAssistantResponse = "";

    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const text = decoder.decode(chunk);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (dataStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                fullAssistantResponse += parsed.delta.text;
              }
            } catch (_) {
              // Ignore non-JSON lines
            }
          }
        }
        controller.enqueue(chunk);
      },
      async flush() {
        // Step 6: Insert question and final response into chat_messages
        console.log("💾 Step 6: Recording chat messages to Supabase...");
        await supabase.from("chat_messages").insert([
          {
            student_id: student_id,
            subject_id: subject_id,
            mode: selectedMode,
            role: "user",
            content: question
          },
          {
            student_id: student_id,
            subject_id: subject_id,
            mode: selectedMode,
            role: "assistant",
            content: fullAssistantResponse || "تم إجابة السؤال."
          }
        ]);
      }
    });

    return new Response(anthropicRes.body?.pipeThrough(transformStream), {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });

  } catch (err: any) {
    console.error("❌ Fatal Edge Function Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
