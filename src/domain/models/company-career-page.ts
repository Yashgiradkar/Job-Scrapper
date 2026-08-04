import { ValidationError } from '../errors/app-error.js';

export interface CompanyCareerPage {
  company: string;
  careerPageUrl: string;
}

export function createCompanyCareerPage(input: CompanyCareerPage): CompanyCareerPage {
  const company = input.company.trim();
  const careerPageUrl = input.careerPageUrl.trim();

  if (!company) {
    throw new ValidationError('Company name is required');
  }

  if (!careerPageUrl) {
    throw new ValidationError('Career page URL is required');
  }

  try {
    new URL(careerPageUrl);
  } catch {
    throw new ValidationError(`Invalid career page URL: ${careerPageUrl}`);
  }

  return { company, careerPageUrl };
}

export function parseCompanyCsv(csv: string): CompanyCareerPage[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const firstColumns = splitCsvLine(lines[0]).map((column) => column.toLowerCase());
  const hasHeader =
    firstColumns.some((column) => column.includes('company')) &&
    firstColumns.some((column) => column.includes('url'));
  const rows = hasHeader ? lines.slice(1) : lines;
  const companyIndex = hasHeader
    ? firstColumns.findIndex((column) => column.includes('company'))
    : 0;
  const urlIndex = hasHeader
    ? firstColumns.findIndex((column) => column.includes('url'))
    : 1;

  return rows.map((row) => {
    const columns = splitCsvLine(row);
    return createCompanyCareerPage({
      company: columns[companyIndex] ?? '',
      careerPageUrl: columns[urlIndex] ?? '',
    });
  });
}

function splitCsvLine(line: string): string[] {
  const columns: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && nextCharacter === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === ',' && !inQuotes) {
      columns.push(current.trim());
      current = '';
      continue;
    }

    current += character;
  }

  columns.push(current.trim());
  return columns;
}
