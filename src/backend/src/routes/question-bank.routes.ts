import { Router } from "express";
import { searchQuestionBank, selectBankQuestions } from "../services/question-bank.service.js";
const router = Router();
router.get("/", async (req, res) => { res.json(await searchQuestionBank(req.query)); });
router.post("/selection", async (req, res) => { res.json({ questions: await selectBankQuestions(req.body?.ids) }); });
router.get("/:questionId", async (req, res) => { res.json((await selectBankQuestions([String(req.params.questionId)]))[0]); });
export { router as questionBankRouter };
