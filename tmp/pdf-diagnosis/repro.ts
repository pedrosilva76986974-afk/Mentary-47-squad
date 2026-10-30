import { readFile } from 'node:fs/promises';
import { parseQuestions } from './src/backend/src/services/question-parser.service.ts';
const pages=JSON.parse(await readFile('tmp/pdf-diagnosis/pages.json','utf8')) as string[];
const qs=parseQuestions(pages); console.log('COUNT',qs.length); for(const q of qs) console.log(q.number,q.pageStart,JSON.stringify(q.text.slice(0,180)));
