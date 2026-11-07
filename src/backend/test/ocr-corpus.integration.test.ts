import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import { extractDocument } from "../src/services/document-extraction.service.js";
import { identifyQuestionsDetailed } from "../src/services/question-identification.service.js";
import { closeOcrWorker } from "../src/services/ocr.service.js";
after(closeOcrWorker);
test("real Portuguese OCR recovers objective questions, alternatives and answer keys from PNG JPEG and scanned PDF",{skip:process.env.MENTARY_OCR_TEST!=="1",timeout:120000},async t=>{
 const canvas=createCanvas(1400,1000),ctx=canvas.getContext("2d");ctx.fillStyle="white";ctx.fillRect(0,0,1400,1000);ctx.fillStyle="black";ctx.font="32px Arial";
 const lines=["Lista de exercicios - Matematica","Questao 1: Qual e o resultado de 2 + 2?","A) 3","B) 4","C) 5","","Questao 2: Qual e o resultado de 3 + 3?","A) 5","B) 6","C) 7","","Gabarito: 1-B 2-B"];
 lines.forEach((line,i)=>ctx.fillText(line,60,60+i*65));
 const png=canvas.toBuffer("image/png"),jpeg=canvas.toBuffer("image/jpeg");
 const pdf=await PDFDocument.create(),image=await pdf.embedPng(png);pdf.addPage([700,500]).drawImage(image,{x:0,y:0,width:700,height:500});
 for(const sample of [{name:"PNG",mime:"image/png",buffer:png},{name:"JPEG",mime:"image/jpeg",buffer:jpeg},{name:"PDF escaneado",mime:"application/pdf",buffer:Buffer.from(await pdf.save())}])await t.test(sample.name,async()=>{
   const extraction=await extractDocument(sample.buffer,sample.mime);
   const result=await identifyQuestionsDetailed(extraction.pageTexts);
   assert.equal(result.questions.length,2,extraction.text);
   assert.deepEqual(result.questions.map(q=>q.alternatives?.length),[3,3],extraction.text);
   assert.deepEqual(result.questions.map(q=>q.answerKey),["B","B"]);
   assert.equal(extraction.questionRegions?.length,2);
 });
});
