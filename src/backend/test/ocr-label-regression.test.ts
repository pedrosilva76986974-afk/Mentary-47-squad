import assert from "node:assert/strict";
import { test } from "node:test";
import { identifyQuestionsDetailed } from "../src/services/question-identification.service.js";
test("JPEG OCR closing-parenthesis noise is repaired only inside an alternative sequence",async()=>{
 const result=await identifyQuestionsDetailed(["Questao 1: Qual e o resultado de 3 + 3?\nAJ 5\n\nB)6\n\nC)7\nGabarito: 1-B"]);
 assert.deepEqual(result.questions[0]!.alternatives,[{label:"A",text:"5"},{label:"B",text:"6"},{label:"C",text:"7"}]);assert.equal(result.questions[0]!.answerKey,"B");
 const compact=await identifyQuestionsDetailed(["Questao 1: Qual e o resultado de 3 + 3?\nAJ5\n\nB)6\n\nC)7\nGabarito: 1-B"]);
 assert.deepEqual(compact.questions[0]!.alternatives,result.questions[0]!.alternatives);
 const negative=await identifyQuestionsDetailed(["Questao 1: O termo AI 5 aparece no documento. Qual é o significado?\nAI 5\nTexto explicativo sem alternativas."]);
 assert.equal(negative.questions[0]!.alternatives?.length,0);
});
