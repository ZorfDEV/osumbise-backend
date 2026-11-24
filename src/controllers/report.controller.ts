import { Request, Response } from 'express';
import { localDay, parseReportRange } from '../utils/dateRange';
import { getReportData, buildReportCsv, buildReportPdf } from '../services/report.service';

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
    `attachment; filename="rapport_${localDay(start)}.csv"`
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
    `attachment; filename="rapport_${localDay(start)}.pdf"`
  );

  const doc = buildReportPdf(data, 'Rapport de ventes');
  doc.pipe(res);
  doc.end();
};
