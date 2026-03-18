import fs from 'fs';
import path from 'path';
import prisma from '../../../../prisma/client.js';
import dataService from './dataService.js';
import { getClientKey, getMauticTempRoot } from '../../utils/tempPages.js';

class ReportJsonImportService {
  parseMonthBounds(yearMonth) {
    const match = String(yearMonth || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      throw new Error(`Invalid month format "${yearMonth}". Expected YYYY-MM.`);
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const from = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
    const to = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59));

    return { from, to };
  }

  resolveBaseDir(baseDir) {
    if (!baseDir) {
      return getMauticTempRoot();
    }

    return path.isAbsolute(baseDir)
      ? baseDir
      : path.resolve(process.cwd(), baseDir);
  }

  getPageFiles(monthDir) {
    if (!fs.existsSync(monthDir)) {
      throw new Error(`Month directory not found: ${monthDir}`);
    }

    return fs
      .readdirSync(monthDir)
      .filter((fileName) => /^page_\d+\.json$/i.test(fileName))
      .sort((left, right) => {
        const leftPage = parseInt(left.match(/page_(\d+)\.json/i)?.[1] || '0', 10);
        const rightPage = parseInt(right.match(/page_(\d+)\.json/i)?.[1] || '0', 10);
        return leftPage - rightPage;
      });
  }

  async markMonthImported(clientId, yearMonth, from, to) {
    await prisma.mauticFetchedMonth.createMany({
      data: [{
        clientId,
        yearMonth,
        from,
        to
      }],
      skipDuplicates: true
    });

    await prisma.mauticFetchedMonth.updateMany({
      where: { clientId, yearMonth },
      data: { from, to }
    });
  }

  async importMonthForClient(clientId, yearMonth, baseDir) {
    const client = await prisma.mauticClient.findFirst({
      where: {
        id: clientId,
        reportId: { not: 'sms-only' }
      },
      select: {
        id: true,
        name: true
      }
    });

    if (!client) {
      throw new Error(`Mautic client ${clientId} not found or is SMS-only.`);
    }

    const resolvedBaseDir = this.resolveBaseDir(baseDir);

    const clientKey = getClientKey(client, 'mautic-email-reports');
    const candidates = [
      path.join(resolvedBaseDir, 'mautic-email-reports', clientKey, yearMonth),
      path.join(getMauticTempRoot(), 'mautic-email-reports', clientKey, yearMonth)
    ];

    const monthDir = candidates.find((dir) => fs.existsSync(dir));
    if (!monthDir) {
      throw new Error(
        `Month directory not found for client ${client.id} (${client.name}) and month ${yearMonth}. Expected one of: ${candidates.join(' | ')}`
      );
    }
    const pageFiles = this.getPageFiles(monthDir);
    const { from, to } = this.parseMonthBounds(yearMonth);

    let created = 0;
    let skipped = 0;
    let totalRows = 0;

    for (const fileName of pageFiles) {
      const filePath = path.join(monthDir, fileName);
      const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const rows = Array.isArray(payload?.data) ? payload.data : [];

      if (rows.length === 0) {
        continue;
      }

      const result = await dataService.saveEmailReports(client.id, rows);
      created += result.created || 0;
      skipped += result.skipped || 0;
      totalRows += rows.length;
    }

    await this.markMonthImported(client.id, yearMonth, from, to);

    return {
      clientId: client.id,
      clientName: client.name,
      yearMonth,
      pageCount: pageFiles.length,
      totalRows,
      created,
      skipped
    };
  }

  async importMonthsForClients({ clientIds = [], months = [], baseDir } = {}) {
    const normalizedClientIds = [...new Set(
      clientIds
        .map((clientId) => parseInt(clientId, 10))
        .filter((clientId) => Number.isInteger(clientId) && clientId > 0)
    )];

    if (normalizedClientIds.length === 0) {
      throw new Error('At least one valid clientId is required.');
    }

    const normalizedMonths = [...new Set(
      months
        .map((month) => String(month).trim())
        .filter(Boolean)
    )];

    if (normalizedMonths.length === 0) {
      throw new Error('At least one month is required.');
    }

    const results = [];

    for (const clientId of normalizedClientIds) {
      for (const yearMonth of normalizedMonths) {
        const result = await this.importMonthForClient(clientId, yearMonth, baseDir);
        results.push(result);
      }
    }

    return {
      success: true,
      clientIds: normalizedClientIds,
      months: normalizedMonths,
      summary: {
        clientsProcessed: normalizedClientIds.length,
        monthsProcessed: normalizedMonths.length,
        importsRun: results.length,
        totalRows: results.reduce((sum, item) => sum + item.totalRows, 0),
        created: results.reduce((sum, item) => sum + item.created, 0),
        skipped: results.reduce((sum, item) => sum + item.skipped, 0)
      },
      results
    };
  }
}

export default new ReportJsonImportService();