import { Request, Response } from 'express';
import { parseReportRange } from '../utils/dateRange';
import { getReportData, buildReportCsv, buildReportPdf } from '../services/report.service';

const filenameDate = (start: Date) => start.toISOString().slice(0, 10);

export const getReport = async (req: Request, res: Response) => {
  const { start, end } = parseReportRange(req.query as Record<string, string | undefined>);
  const data = await getReportData(req, start, end);
  res.status(200).json(data);
};

export const exportReportCsv = async (req: Request, res: Response) => {
  const { start, end } = parseReportRange(req.query as Record<string, string | undefined>);
  const data = await getReportData(req, start, end);
  const csv = buildReportCsv(data);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="rapport_${filenameDate(start)}.csv"`
  );
  // BOM UTF-8 : sans lui, Excel affiche mal les accents français
  res.send('\uFEFF' + csv);
};

export const exportReportPdf = async (req: Request, res: Response) => {
  const { start, end } = parseReportRange(req.query as Record<string, string | undefined>);
  const data = await getReportData(req, start, end);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="rapport_${filenameDate(start)}.pdf"`
  );

  const doc = buildReportPdf(data, 'Rapport de ventes');
  doc.pipe(res);
  doc.end();
};
