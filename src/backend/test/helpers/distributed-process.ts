import { closeDatabase } from "../../src/services/database.service.js";
import { updateReviewQuestion } from "../../src/services/review-results.service.js";
import { runDurableClassificationWorker } from "../../src/services/durable-classification.service.js";

try {
  if (process.argv[2] === "review") {
    try {
      const result = await updateReviewQuestion(process.argv[3]!, process.argv[4]!, JSON.parse(process.argv[5]!));
      console.log(JSON.stringify({ status: "saved", questionCount: result?.questions.length }));
    } catch (error) { console.log(JSON.stringify({ status: error instanceof Error ? error.constructor.name : "error" })); }
  } else {
    globalThis.fetch = async (_input, init) => {
      if (process.argv[3] === "wait") {
        console.log("model-started");
        return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true }));
      }
      console.log("model-request");
      return new Response(JSON.stringify({ message: { content: JSON.stringify({ suggestions: [{ questionIndex: 0, discipline: "Matemática", grade: "", topic: "Adição", descriptor: "Somar números", difficulty: "easy" }] }) } }));
    };
    await runDurableClassificationWorker();
    console.log("worker-finished");
  }
} finally { await closeDatabase(); }
