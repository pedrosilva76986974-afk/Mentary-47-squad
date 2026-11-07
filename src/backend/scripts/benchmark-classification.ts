import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { classifyPedagogy } from "../src/services/ollama.service.js";
import type { ParsedQuestion } from "../src/services/question-parser.service.js";
const model = process.argv[2] ?? process.env.OLLAMA_MODEL ?? "qwen3.5:2b";
process.env.OLLAMA_MODEL = model;
const targetMs = 15000;
const samples = [
  { name: "matematica", expected: ["matematica"], prompt: "Qual é o resultado de 20% de 150?", alternatives: ["15", "30", "50", "75"] },
  { name: "historia", expected: ["historia"], prompt: "Qual acontecimento marcou a independência política do Brasil em 1822?", alternatives: ["Proclamação da República", "Grito do Ipiranga", "Abolição da escravidão", "Inconfidência Mineira"] },
  { name: "portugues", expected: ["lingua portuguesa", "portugues"], prompt: "Na frase 'As crianças brincavam no parque', qual palavra é um verbo?", alternatives: ["crianças", "brincavam", "parque", "As"] },
  { name: "biologia", expected: ["biologia", "ciencias"], prompt: "Qual organela celular é responsável pela maior parte da produção de ATP na respiração aeróbica?", alternatives: ["Lisossomo", "Mitocôndria", "Ribossomo", "Complexo golgiense"] },
  { name: "informatica", expected: ["informatica", "computacao", "ciencia da computacao"], prompt: "Na arquitetura de um computador, qual componente da CPU executa operações aritméticas e lógicas?", alternatives: ["Unidade de Controle", "Registrador de Instrução", "Unidade Lógica e Aritmética", "Memória cache"] },
];
const makeQuestion = (prompt: string, alternatives: string[]): ParsedQuestion => ({ number: 1, text: prompt, prompt, responseType: "multiple_choice", alternatives: alternatives.map((text, i) => ({ label: String.fromCharCode(65 + i), text })), pageStart: 1, pageEnd: 1, confidence: "high" });
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
async function measure(prompt: string, alternatives: string[]) {
  const start = performance.now();
  try {
    const [classification] = await classifyPedagogy([makeQuestion(prompt, alternatives)], AbortSignal.timeout(45000));
    return { durationMs: Math.round(performance.now() - start), classification };
  } catch (error) { return { durationMs: Math.round(performance.now() - start), error: error instanceof Error ? error.message : String(error) }; }
}
console.log(JSON.stringify({ phase: "warmup", model, targetMs }));
const warmup = await measure("Quanto é 1 + 1?", ["1", "2", "3", "4"]);
console.log(JSON.stringify({ phase: "warmup-result", ...warmup }));
const results = [];
for (const sample of samples.slice(0, Math.max(1, Number(process.argv[3]) || samples.length))) {
  const result = await measure(sample.prompt, sample.alternatives);
  const c = result.classification;
  const descriptorIsAnswer = !!c && (sample.alternatives.some(a => normalize(a) === normalize(c.descriptor)) || /^[\d\s%.,+−-]+$/.test(c.descriptor));
  const qualityPassed = !descriptorIsAnswer && !!c && sample.expected.includes(normalize(c.discipline)) && !!c.area && !!c.topic && !!c.descriptor && c.questionType === "Múltipla escolha" && c.grade === "" && !("bnccSkills" in c);
  const row = { name: sample.name, ...result, qualityPassed, targetMet: !result.error && result.durationMs <= targetMs };
  results.push(row); console.log(JSON.stringify(row));
}
const times = results.map(r => r.durationMs).sort((a, b) => a - b);
const report = { profile: "named-fixed-count-v2", numGpu: process.env.OLLAMA_NUM_GPU ?? "auto", model, date: new Date().toISOString(), targetMs, scope: "Tempo da chamada local até JSON validado; exclui fila e polling da tela. Amostra sintética pequena; não garante acurácia pedagógica geral.", warmup, results, summary: { cases: results.length, withinTarget: results.filter(r => r.targetMet).length, qualityPassed: results.filter(r => r.qualityPassed).length, p50Ms: times[Math.ceil(times.length * .5) - 1], p95Ms: times[Math.ceil(times.length * .95) - 1] } };
const directory = resolve("../../docs/benchmarks"); await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, model.replace(/[^a-z0-9-]/gi, "_") + "-fast-gpu" + (process.env.OLLAMA_NUM_GPU ?? "auto") + ".json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report.summary));
if (report.summary.withinTarget !== results.length || report.summary.qualityPassed !== results.length) process.exitCode = 1;
