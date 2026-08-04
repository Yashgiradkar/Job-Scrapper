import type { MatchedJob } from '../job-match-service.js';

const COLUMNS = [
  'Company',
  'Job Title',
  'Match Percentage',
  'Matched Skills',
  'Missing Skills',
  'Experience',
  'Location',
  'Job URL',
  'Career Page',
  'Date Scraped',
];

export function exportMatchedJobsToCsv(jobs: MatchedJob[]): string {
  return [
    COLUMNS.join(','),
    ...jobs.map((job) =>
      [
        job.company,
        job.title,
        `${job.matchPercentage}%`,
        job.matchedSkills.join('; '),
        job.missingSkills.join('; '),
        job.experience ?? '',
        job.location ?? '',
        job.jobUrl,
        job.careerPageUrl,
        job.dateScraped,
      ]
        .map(escapeCsv)
        .join(','),
    ),
  ].join('\n');
}

export function exportMatchedJobsToExcelHtml(jobs: MatchedJob[]): string {
  const rows = jobs
    .map(
      (job) => `<tr>
        <td>${escapeHtml(job.company)}</td>
        <td>${escapeHtml(job.title)}</td>
        <td>${job.matchPercentage}%</td>
        <td>${escapeHtml(job.matchedSkills.join('; '))}</td>
        <td>${escapeHtml(job.missingSkills.join('; '))}</td>
        <td>${escapeHtml(job.experience ?? '')}</td>
        <td>${escapeHtml(job.location ?? '')}</td>
        <td>${escapeHtml(job.jobUrl)}</td>
        <td>${escapeHtml(job.careerPageUrl)}</td>
        <td>${escapeHtml(job.dateScraped)}</td>
      </tr>`,
    )
    .join('');

  return `<html><body><table><thead><tr>${COLUMNS.map(
    (column) => `<th>${escapeHtml(column)}</th>`,
  ).join('')}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
