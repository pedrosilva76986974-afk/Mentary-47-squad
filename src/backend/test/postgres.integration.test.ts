import request from "supertest";
import { app } from "../src/app.js";
import { searchQuestionBank, selectBankQuestions, publishExistingApprovedQuestions } from "../src/services/question-bank.service.js";
import { deleteReviewResultFromDatabase } from "../src/services/postgres-review.service.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupExpiredDocuments } from "../src/services/document-retention.service.js";
import { test } from "node:test";
import { Client } from "pg";
import { closeDatabase, getDatabasePool, initializeDatabase } from "../src/services/database.service.js";
import { getReviewResultFromDatabase, importLegacyReviewResult, saveReviewResultToDatabase } from "../src/services/postgres-review.service.js";
import type { ReviewResult } from "../src/services/review-results.service.js";

test("real PostgreSQL migrations, round trip, rollback and export", {
  skip: process.env.MENTARY_POSTGRES_TEST !== "1",
}, async () => {
  const originalUrl = process.env.DATABASE_URL;
  assert.ok(originalUrl, "Configure DATABASE_URL for the isolated PostgreSQL test.");
  const name = `mentary_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: originalUrl });
  await admin.connect();
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const url = new URL(originalUrl);
    url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    await initializeDatabase();
    const pool = getDatabasePool();
    assert.equal((await pool.query("SELECT * FROM schema_migrations")).rowCount, 7);
    // Reproduce installations whose migration 003 predates the missing-fields column.
    await pool.query("DROP VIEW extrator.approved_question_exports");
    await pool.query(`CREATE VIEW extrator.approved_question_exports AS
      SELECT question_id, document_id, position, '{}'::jsonb AS mentary_question,
      false AS is_ready_for_mentary, missing_components FROM extrator.review_questions`);
    await pool.query(await readFile("../../database/migrations/004_export_readiness.sql", "utf8"));
    const id = randomUUID();
    const review: ReviewResult = {
      documentId: id, status: "pending_review", message: "Test fixture", processedAt: new Date().toISOString(),
      origin: { id, fileName: "test.pdf", mimeType: "application/pdf", size: 1, sha256: "test", uploadedAt: new Date().toISOString() },
      pages: 1, method: "pdf-text", sourceText: "Questão de teste",
      questions: [{ id: `${id}-q1`, number: 1, text: "Questão de teste", prompt: "Quanto é 2 + 2?",
        responseType: "multiple_choice", alternatives: [{ label: "A", text: "3" }, { label: "B", text: "4" }],
        answerKey: "B", missingComponents: [], pageStart: 1, pageEnd: 1, confidence: "high", status: "pending_review",
        reviewedBy: "Revisor fictício", pedagogy: { discipline: "Matemática", grade:"1º ano", topic: "Adição", bnccSkills: ["EF01MA01"],
          descriptor: "D1", difficulty: "easy", userId: randomUUID(), institutionId: randomUUID() },
      }],
    };
    await saveReviewResultToDatabase(review);
    assert.equal(await importLegacyReviewResult(review), false);
    assert.equal((await pool.query("SELECT * FROM extrator.approved_question_exports")).rowCount, 0);
    review.questions[0]!.status = "approved";
    await saveReviewResultToDatabase(review);
    const stored = await getReviewResultFromDatabase(id);
    assert.equal(stored!.questions[0]!.answerKey, "B");
    assert.deepEqual(stored!.questions[0]!.alternatives, review.questions[0]!.alternatives);
    const exported = (await pool.query("SELECT * FROM extrator.approved_question_exports")).rows[0];
    assert.equal(exported.is_ready_for_mentary, true);
    assert.equal(exported.mentary_question.correct_answer_index, 1);
    assert.deepEqual(exported.mentary_question.answer_options, ["3", "4"]);
    for (const bncc of [null, '"legacy-invalid"']) {
      await pool.query("UPDATE extrator.review_questions SET pedagogy = jsonb_set(pedagogy, '{bnccSkills}', $1::jsonb)", [bncc ?? "null"]);
      const incomplete = (await pool.query("SELECT * FROM extrator.approved_question_exports")).rows[0];
      assert.equal(incomplete.is_ready_for_mentary, false);
      assert.ok(incomplete.missing_destination_fields.includes("metadata.bncc"));
    }
    await saveReviewResultToDatabase(review);
    // A failed write must roll back the deletion/reinsertion of prior questions.
    const invalid = structuredClone(review);
    invalid.questions[0]!.pageStart = 0;
    await assert.rejects(saveReviewResultToDatabase(invalid));
    assert.equal((await getReviewResultFromDatabase(id))!.questions[0]!.pageStart, 1);
    review.questions[0]!.status = "rejected";
    await saveReviewResultToDatabase(review);
    assert.equal((await pool.query("SELECT * FROM extrator.approved_question_exports")).rowCount, 0);
    assert.equal((await searchQuestionBank({})).total, 0, "Rejected questions must disappear");
    review.questions[0]!.status="approved";
    review.questions[0]!.pageStart=null; review.questions[0]!.pageEnd=null;
    await saveReviewResultToDatabase(review);
    assert.equal((await getReviewResultFromDatabase(id))!.questions[0]!.pageStart,null);
    const bank = await searchQuestionBank({discipline:"matemática",grade:"1º ano",topic:"Adição",descriptor:"D1",difficulty:"easy",bncc:"ef01ma01",q:"Quanto"});
    assert.equal(bank.total,1); assert.equal(bank.questions[0].sources[0].pageStart,null);
    const bankId = bank.questions[0].id;
    const duplicate=structuredClone(review); const duplicateId=randomUUID(); duplicate.documentId=duplicateId;duplicate.origin.id=duplicateId;
    duplicate.questions[0]!.id=duplicateId+"-q1";duplicate.questions[0]!.pedagogy!.grade="2º ano";
    await Promise.all([saveReviewResultToDatabase(review),saveReviewResultToDatabase(duplicate)]);
    assert.equal((await searchQuestionBank({})).total,1);
    assert.equal((await searchQuestionBank({grade:"1º ano"})).total,1,"Filters must find an older active source too");
    assert.equal((await searchQuestionBank({grade:"2º ano"})).total,1);
    assert.equal((await selectBankQuestions([bankId,bankId])).length,1);
    assert.equal((await selectBankQuestions([bankId]))[0].sources.length,2);
    await assert.rejects(selectBankQuestions([randomUUID()]));
    assert.equal((await searchQuestionBank({q:"' OR true -- %_"})).total,0);
    assert.equal((await request(app).get("/questions").query({pageSize:1})).body.total,1);
    assert.equal((await request(app).get("/questions").query({page:0})).status,400);
    assert.equal((await request(app).post("/questions/selection").send({ids:[bankId]})).body.questions[0].id,bankId);
    assert.equal((await request(app).get("/questions").query({grade:"não existe"})).body.total,0);
    await assert.rejects(pool.query("INSERT INTO banco.questions(id,fingerprint,prompt,alternatives,answer_key) VALUES($1,'invalid','Test',$2,'Z')",[randomUUID(),JSON.stringify([{label:"A",text:"1"},{label:"B",text:"2"}])]));
    await assert.rejects(pool.query(await readFile("../../database/migrations/006_unknown_source_page.down.sql","utf8")));
    await assert.rejects(pool.query(await readFile("../../database/migrations/005_local_question_bank.down.sql","utf8")));
    review.questions[0]!.status="pending_review";await saveReviewResultToDatabase(review);
    assert.equal((await selectBankQuestions([bankId]))[0].sources.length,1);
    duplicate.questions[0]!.status="rejected";await saveReviewResultToDatabase(duplicate);
    assert.equal((await searchQuestionBank({})).total,0);
    await assert.rejects(selectBankQuestions([bankId]));
    review.questions[0]!.status="approved";await saveReviewResultToDatabase(review);
    await deleteReviewResultFromDatabase(id);
    assert.equal((await searchQuestionBank({})).total,1,"Retention must preserve published content and origin");
    assert.equal((await selectBankQuestions([bankId]))[0].sources[0].origin.fileName,"test.pdf");
    assert.equal(await publishExistingApprovedQuestions(),0);
    assert.equal((await request(app).patch("/documents/"+duplicateId+"/review/questions/"+duplicateId+"-q1").send({pageStart:null})).status,400);
    assert.equal((await request(app).patch("/documents/"+duplicateId+"/review/questions/"+duplicateId+"-q1").send({pageStart:2,pageEnd:2})).status,400);
    assert.equal((await request(app).patch("/documents/"+duplicateId+"/review/questions/"+duplicateId+"-q1").send({visualReferences:[{page:1,kind:"graphic",region:{x:.9,y:0,width:.5,height:1}}]})).status,400);
    const updated=await request(app).patch("/documents/"+duplicateId+"/review/questions/"+duplicateId+"-q1").send({pageStart:null,pageEnd:null,visualReferences:[{page:1,kind:"graphic",region:{x:0,y:.1,width:1,height:.4}}]});
    assert.equal(updated.status,200);assert.equal(updated.body.questions[0].pageStart,null);assert.equal(updated.body.questions[0].visualReferences[0].association,"manual");
    const standalone=structuredClone(review), standaloneId=randomUUID();standalone.documentId=standaloneId;standalone.origin.id=standaloneId;standalone.questions[0]!.id=standaloneId+"-q1";standalone.questions[0]!.prompt="Selecione a alternativa indicada no enunciado.";standalone.questions[0]!.pedagogy={};
    await saveReviewResultToDatabase(standalone);assert.equal((await searchQuestionBank({})).total,2,"BNCC and external identities must not block the native bank");
    const concurrent = structuredClone(standalone), concurrentId = randomUUID();
    concurrent.documentId = concurrentId; concurrent.origin.id = concurrentId;
    concurrent.questions = [1, 2].map(index => ({ ...structuredClone(standalone.questions[0]!), id: `${concurrentId}-q${index}`, status: "pending_review" as const }));
    await saveReviewResultToDatabase(concurrent);
    const concurrentUpdates = await Promise.all([1, 2].map(index => request(app)
      .patch(`/documents/${concurrentId}/review/questions/${concurrentId}-q${index}`)
      .send({ prompt: `Questão ${index} revisada simultaneamente?` })));
    assert.deepEqual(concurrentUpdates.map(response => response.status), [200, 200]);
    assert.deepEqual((await getReviewResultFromDatabase(concurrentId))!.questions.map(question => question.prompt), [
      "Questão 1 revisada simultaneamente?", "Questão 2 revisada simultaneamente?",
    ]);
    await deleteReviewResultFromDatabase(concurrentId);
    const firstPage=await searchQuestionBank({pageSize:"1"}),secondPage=await searchQuestionBank({pageSize:"1",page:"2"});
    assert.notEqual(firstPage.questions[0].id,secondPage.questions[0].id);assert.equal(secondPage.total,2);assert.equal((await searchQuestionBank({page:"3",pageSize:"1"})).questions.length,0);
    const directory=await mkdtemp(join(tmpdir(),"mentary-bank-retention-"));
    const previousRegistry=process.env.MENTARY_UPLOAD_REGISTRY, previousDocs=process.env.MENTARY_DOCUMENT_DIRECTORY;
    process.env.MENTARY_UPLOAD_REGISTRY=join(directory,"manifest.json");process.env.MENTARY_DOCUMENT_DIRECTORY=join(directory,"documents");
    try {
      const old="2000-01-01T00:00:00.000Z";await mkdir(process.env.MENTARY_DOCUMENT_DIRECTORY,{recursive:true});
      await writeFile(process.env.MENTARY_UPLOAD_REGISTRY,JSON.stringify([{...standalone.origin,uploadedAt:old},{...duplicate.origin,uploadedAt:old}]));
      await writeFile(join(process.env.MENTARY_DOCUMENT_DIRECTORY,standaloneId+".pdf"),"fixture");await writeFile(join(process.env.MENTARY_DOCUMENT_DIRECTORY,duplicateId+".pdf"),"fixture");
      assert.equal(await cleanupExpiredDocuments(),1);assert.ok(await getReviewResultFromDatabase(standaloneId));assert.equal(await getReviewResultFromDatabase(duplicateId),undefined);
      assert.equal(JSON.parse(await readFile(process.env.MENTARY_UPLOAD_REGISTRY,"utf8")).length,1);
    } finally {
      if(previousRegistry===undefined)delete process.env.MENTARY_UPLOAD_REGISTRY;else process.env.MENTARY_UPLOAD_REGISTRY=previousRegistry;
      if(previousDocs===undefined)delete process.env.MENTARY_DOCUMENT_DIRECTORY;else process.env.MENTARY_DOCUMENT_DIRECTORY=previousDocs;
      assert.ok(directory.startsWith(join(tmpdir(),"mentary-bank-retention-")));await rm(directory,{recursive:true,force:true});
    }

  } finally {
    await closeDatabase();
    process.env.DATABASE_URL = originalUrl;
    try {
      if (created) await admin.query(`DROP DATABASE "${name}"`);
    } finally { await admin.end(); }
  }
});
