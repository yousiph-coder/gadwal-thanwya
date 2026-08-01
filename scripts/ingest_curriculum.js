#!/usr/bin/env node

/**
 * =============================================================================
 * Node.js Ingest Curriculum Tool (RAG Pipeline)
 * =============================================================================
 * Usage:
 *   node scripts/ingest_curriculum.js \
 *     --pdf "path/to/textbook.pdf" \
 *     --subject_id 3 \
 *     --unit_title "الوحدة الأولى" \
 *     --lesson_title "الدرس الأول"
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { createClient } = require('@supabase/supabase-js');

// Parse args
const args = {};
process.argv.slice(2).forEach((val, index, array) => {
  if (val.startsWith('--')) {
    const key = val.substring(2);
    const nextVal = array[index + 1];
    if (nextVal && !nextVal.startsWith('--')) {
      args[key] = nextVal;
    }
  }
});

const pdfPath = args.pdf;
const subjectId = parseInt(args.subject_id, 10);
const unitTitle = args.unit_title;
const lessonTitle = args.lesson_title;

if (!pdfPath || !subjectId || !unitTitle || !lessonTitle) {
  console.log(`
❌ Error: Missing parameters.
Usage: node scripts/ingest_curriculum.js --pdf <path> --subject_id <1-6> --unit_title <unit> --lesson_title <lesson>
  `);
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !VOYAGE_API_KEY) {
  console.error("❌ Missing required Environment Variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function extractTextFromPDF(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return {
    text: data.text,
    numPages: data.numpages
  };
}

function chunkText(fullText, chunkSize = 450, overlap = 60) {
  const words = fullText.split(/\s+/);
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    const chunkWords = words.slice(i, i + chunkSize);
    const str = chunkWords.join(' ');
    if (str.trim().length > 40) {
      chunks.push(str);
    }
    i += (chunkSize - overlap);
  }
  return chunks;
}

async function getVoyageEmbeddings(chunks) {
  console.log(`🔮 Generating ${chunks.length} embeddings via Voyage AI (voyage-multilingual-2)...`);
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VOYAGE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      input: chunks,
      model: 'voyage-multilingual-2',
      input_type: 'document'
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Voyage API Error (${response.status}): ${errText}`);
  }

  const resJson = await response.json();
  return resJson.data.map(item => item.embedding);
}

async function run() {
  console.log(`=================================================================`);
  console.log(`🚀 INGESTING PDF: ${pdfPath}`);
  console.log(`📌 Subject ID: ${subjectId} | Unit: ${unitTitle} | Lesson: ${lessonTitle}`);
  console.log(`=================================================================`);

  const { text, numPages } = await extractTextFromPDF(pdfPath);
  console.log(`✅ Extracted text from ${numPages} PDF pages.`);

  const chunks = chunkText(text);
  console.log(`🧩 Split text into ${chunks.length} chunks.`);

  const embeddings = await getVoyageEmbeddings(chunks);

  const records = chunks.map((content, idx) => ({
    subject_id: subjectId,
    unit_title: unitTitle,
    lesson_title: lessonTitle,
    content: content,
    embedding: embeddings[idx]
  }));

  console.log(`💾 Inserting ${records.length} records into Supabase 'curriculum_chunks'...`);
  const { error } = await supabase.from('curriculum_chunks').insert(records);

  if (error) {
    console.error(`❌ Supabase Insert Error:`, error.message);
    process.exit(1);
  }

  console.log(`\n=================================================================`);
  console.log(`🎉 INGESTION COMPLETE!`);
  console.log(`✅ Successfully added ${records.length} chunks to curriculum_chunks.`);
  console.log(`=================================================================`);
}

run().catch(err => {
  console.error("❌ Fatal Ingestion Failure:", err);
  process.exit(1);
});
