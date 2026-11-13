import { Router } from "express";
import { receiveAssessment, listAssessments, getAssessment } from "../services/assessment.service.js";
import { DocumentValidationError } from "../services/document-validation.service.js";
export const assessmentsRouter = Router();
assessmentsRouter.post("/", async (req, res, next) => { try { const result = await receiveAssessment(req.body); res.status(result.created ? 201 : 200).json(result); } catch (error) { next(error); } });
assessmentsRouter.get("/", async (req, res, next) => {
  try {
    const filters: Record<string, string> = {};
    for (const key of ["schoolId", "classId", "from", "to", "page"]) {
      const value = req.query[key];
      if (value !== undefined && (typeof value !== "string" || value.length > 200)) throw new DocumentValidationError("Filtro de avaliação inválido.");
      if (typeof value === "string") filters[key] = value;
    }
    res.json(await listAssessments(filters));
  } catch (error) { next(error); }
});
assessmentsRouter.get("/:id", async (req, res, next) => {
  try { const result = await getAssessment(String(req.params.id)); if (!result) { res.status(404).json({ error: "Aplicação não encontrada." }); return; } res.json(result); }
  catch (error) { next(error); }
});
