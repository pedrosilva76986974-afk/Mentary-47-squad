import assert from "node:assert/strict";
import { test } from "node:test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { locateQuestionRegions } from "../src/services/question-regions.service.js";
import { extractDocument } from "../src/services/document-extraction.service.js";
import { renderSourcePreview, validateRegion } from "../src/services/source-preview.service.js";
import { findQuestionVisualReferences, saveReviewResult } from "../src/services/review-results.service.js";
import { questionFingerprint, canPublish, parseBankFilters } from "../src/services/question-bank.service.js";
import type { ReviewQuestion } from "../src/services/review-results.service.js";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const question:ReviewQuestion={ id:"test-q1",number:1,text:"Quanto é 2 + 2?",prompt:"Quanto é 2 + 2?",alternatives:[{label:"A",text:"3"},{label:"B",text:"4"}],answerKey:"B",status:"approved",pageStart:null,pageEnd:null,confidence:"high",reviewedBy:"Revisor de teste" };
test("bank fingerprint deduplicates spacing and label case but preserves mathematical case and order",()=>{
  assert.equal(questionFingerprint(question),questionFingerprint({...question,prompt:" Quanto é 2  +  2? ",answerKey:"b"}));
  assert.notEqual(questionFingerprint(question),questionFingerprint({...question,answerKey:"A"}));
  assert.notEqual(questionFingerprint({...question,prompt:"x + 1"}),questionFingerprint({...question,prompt:"X + 1"}));
  assert.notEqual(questionFingerprint(question),questionFingerprint({...question,alternatives:[...question.alternatives!].reverse()}));
});
test("only complete approved questions with a reviewer are publishable; BNCC is optional",()=>{
  assert.equal(canPublish(question),true);
  for(const change of [{status:"pending_review"},{status:"rejected"},{reviewedBy:""},{answerKey:"Z"},{alternatives:[{label:"A",text:"1"},{label:"a",text:"2"}]}])assert.equal(canPublish({...question,...change} as ReviewQuestion),false);
});
test("bank filters validate pagination, types and difficulty before reaching SQL",()=>{
  assert.equal(parseBankFilters({page:"2",pageSize:"10",discipline:" Matemática "}).page,2);
  for(const input of [{page:"0"},{page:"1.5"},{pageSize:"101"},{q:["test"]},{difficulty:"impossible"}])assert.throws(()=>parseBankFilters(input));
});
test("unknown page does not invent a visual page",()=>assert.deepEqual(findQuestionVisualReferences({pageStart:null,pageEnd:null},[{page:1,kind:"image"}]),[]));
test("regions separate two questions and columns conservatively",()=>{
  const regions=locateQuestionRegions([{text:"01. Qual é a figura?",x:.08,y:.15,width:.4,height:.02},{text:"02. Qual é o gráfico?",x:.08,y:.55,width:.4,height:.02}],1);
  assert.equal(regions.length,2);assert.ok(regions[0]!.region.y+regions[0]!.region.height<=regions[1]!.region.y);
  const columns=locateQuestionRegions([{text:"1) Leia o texto.",x:.08,y:.2,width:.4,height:.02},{text:"2) Leia o gráfico.",x:.56,y:.2,width:.4,height:.02}],1);
  assert.equal(columns[0]!.region.width,.5);assert.equal(columns[1]!.region.x,.5);
});
test("source crop rejects malformed or out of bounds coordinates",()=>{
  for(const region of [{x:-.1,y:0,width:1,height:1},{x:0,y:0,width:0,height:1},{x:.8,y:0,width:.4,height:1},{x:NaN,y:0,width:1,height:1}])assert.throws(()=>validateRegion(region));
});
test("image crops preserve their own figures without including neighboring questions",async()=>{
  const canvas=createCanvas(200,400),ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,200,400);ctx.fillStyle="red";ctx.fillRect(20,50,80,80);ctx.fillStyle="blue";ctx.fillRect(20,250,80,80);
  const crop=await renderSourcePreview(canvas.toBuffer("image/png"),"image/png",1,{x:0,y:0,width:1,height:.5});
  const image=await loadImage(crop);assert.equal(image.height,200);const out=createCanvas(200,200);out.getContext("2d").drawImage(image,0,0);assert.ok(out.getContext("2d").getImageData(40,70,1,1).data[0]!>200);
  await assert.rejects(renderSourcePreview(canvas.toBuffer("image/png"),"image/png",2,{x:0,y:0,width:1,height:1}));
});
test("digital PDF visual regions remain associated with the correct question and render independently",async()=>{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage([600,800]);
  page.drawText("Questao 1: Qual e a figura vermelha?",{x:40,y:730,size:12,font});page.drawRectangle({x:40,y:550,width:120,height:120,color:rgb(1,0,0)});
  page.drawText("Questao 2: Qual e a figura azul?",{x:40,y:350,size:12,font});page.drawRectangle({x:40,y:170,width:120,height:120,color:rgb(0,0,1)});
  const bytes=Buffer.from(await pdf.save()),extraction=await extractDocument(bytes,"application/pdf",async()=>"unused");
  assert.equal(extraction.questionRegions?.length,2);
  const dir=await mkdtemp(join(tmpdir(),"mentary-regions-"));const previous=process.env.MENTARY_REVIEW_DIRECTORY;const db=process.env.DATABASE_URL;delete process.env.DATABASE_URL;process.env.MENTARY_REVIEW_DIRECTORY=dir;
  try{
    const id=randomUUID();const review=await saveReviewResult({id,fileName:"regions.pdf",mimeType:"application/pdf",size:bytes.length,sha256:"test",uploadedAt:new Date().toISOString()},extraction,[{...question,number:1,prompt:"Qual e a figura vermelha?",pageStart:1,pageEnd:1},{...question,number:2,prompt:"Qual e a figura azul?",pageStart:1,pageEnd:1}]);
    const [first,second]=review.questions.map(q=>q.visualReferences?.[0]);assert.equal(first?.association,"automatic");assert.equal(second?.association,"automatic");assert.ok(first!.region!.y+first!.region!.height<=second!.region!.y);
    const preview=await loadImage(await renderSourcePreview(bytes,"application/pdf",1,first!.region!));assert.ok(preview.height<1600);
  }finally{if(previous===undefined)delete process.env.MENTARY_REVIEW_DIRECTORY;else process.env.MENTARY_REVIEW_DIRECTORY=previous;if(db!==undefined)process.env.DATABASE_URL=db;await rm(dir,{recursive:true,force:true});}
});
test("OCR layout regions are retained for JPEG and PNG without rerunning recognition",async()=>{
  for(const mime of ["image/png","image/jpeg"]){let calls=0;const result=await extractDocument(Buffer.from("fixture"),mime,async()=>{calls++;return {text:"Questão 1: Qual é o resultado?\na) 1\nb) 2",lines:[{text:"Questão 1: Qual é o resultado?",x:.1,y:.2,width:.8,height:.03}]};});assert.equal(calls,1);assert.equal(result.questionRegions?.[0]?.number,1);}
});
