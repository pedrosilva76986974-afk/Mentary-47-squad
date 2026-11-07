import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractDocument } from "../src/services/document-extraction.service.js";
import { identifyQuestionsDetailed } from "../src/services/question-identification.service.js";
import { closeOcrWorker } from "../src/services/ocr.service.js";
import { renderSourcePreview } from "../src/services/source-preview.service.js";
after(closeOcrWorker);
test("real Portuguese OCR recovers objective questions, alternatives and answer keys from PNG JPEG and scanned PDF",{skip:process.env.MENTARY_OCR_TEST!=="1",timeout:120000},async t=>{
 // PDF standard fonts are bundled by PDF.js; fixture generation must not depend on Windows Arial.
 const fixture=await PDFDocument.create(),font=await fixture.embedFont(StandardFonts.Helvetica),page=fixture.addPage([700,500]);
 const lines=["Lista de exercicios - Matematica","Questao 1: Qual e o resultado de 2 + 2?","A) 3","B) 4","C) 5","","Questao 2: Qual e o resultado de 3 + 3?","A) 5","B) 6","C) 7","","Gabarito: 1-B 2-B"];
 lines.forEach((line,i)=>page.drawText(line,{x:30,y:470-i*32.5,size:16,font}));
 const png=await renderSourcePreview(Buffer.from(await fixture.save()),"application/pdf",1,{x:0,y:0,width:1,height:1});
 const raster=await loadImage(png),canvas=createCanvas(raster.width,raster.height);canvas.getContext("2d").drawImage(raster,0,0);
 const jpeg=canvas.toBuffer("image/jpeg");
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
