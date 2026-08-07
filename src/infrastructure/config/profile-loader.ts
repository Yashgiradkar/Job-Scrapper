import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { JobSearchCriteria } from '../../application/job-matching-engine.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('profile-loader');

export interface UserProfileData {
  criteria: JobSearchCriteria;
}

export function loadUserProfile(): UserProfileData {
  try {
    const dataDir = path.resolve(process.cwd(), 'data_folder');
    const resumePath = path.join(dataDir, 'plain_text_resume.yaml');
    const preferencesPath = path.join(dataDir, 'work_preferences.yaml');

    if (!fs.existsSync(resumePath)) {
      throw new Error(`Resume file not found at: ${resumePath}`);
    }
    if (!fs.existsSync(preferencesPath)) {
      throw new Error(`Preferences file not found at: ${preferencesPath}`);
    }

    const resumeRaw = fs.readFileSync(resumePath, 'utf8');
    const preferencesRaw = fs.readFileSync(preferencesPath, 'utf8');

    const resume = yaml.load(resumeRaw) as any;
    const preferences = yaml.load(preferencesRaw) as any;

    if (!resume || typeof resume !== 'object') {
      throw new Error('Invalid resume YAML structure');
    }
    if (!preferences || typeof preferences !== 'object') {
      throw new Error('Invalid preferences YAML structure');
    }

    // Extract skills from all experience entries in the resume
    const skills = new Set<string>();
    if (Array.isArray(resume.experience_details)) {
      for (const exp of resume.experience_details) {
        if (Array.isArray(exp.skills_acquired)) {
          for (const skill of exp.skills_acquired) {
            if (typeof skill === 'string' && skill.trim()) {
              skills.add(skill.trim());
            }
          }
        }
      }
    }

    // Calculate total months of experience from resume employment_period fields
    let totalMonths = 0;
    if (Array.isArray(resume.experience_details)) {
      for (const exp of resume.experience_details) {
        const period = exp.employment_period;
        if (typeof period === 'string') {
          const parts = period.split('-').map((s: string) => s.trim());
          if (parts.length === 2) {
            totalMonths += parseDurationInMonths(parts[0], parts[1]);
          }
        }
      }
    }
    const calculatedYears = Math.round((totalMonths / 12) * 10) / 10;
    const experience = calculatedYears > 0 ? `${calculatedYears} years` : undefined;

    // Pull positions, locations, and work mode from preferences
    const roles: string[] = Array.isArray(preferences.positions)
      ? preferences.positions.map(String)
      : [];
    const locations: string[] = Array.isArray(preferences.locations)
      ? preferences.locations.map(String)
      : [];
    const remote: boolean | undefined = preferences.remote === true ? true : undefined;

    // Pull blacklists from preferences
    const companyBlacklist: string[] = Array.isArray(preferences.company_blacklist)
      ? preferences.company_blacklist.map(String)
      : [];
    const titleBlacklist: string[] = Array.isArray(preferences.title_blacklist)
      ? preferences.title_blacklist.map(String)
      : [];
    const locationBlacklist: string[] = Array.isArray(preferences.location_blacklist)
      ? preferences.location_blacklist.map(String)
      : [];

    logger.info(
      {
        roles,
        skills: Array.from(skills),
        locations,
        experience,
        remote,
        companyBlacklist,
        titleBlacklist,
        locationBlacklist,
      },
      'Loaded user profile from YAML files',
    );

    return {
      criteria: {
        roles,
        skills: Array.from(skills),
        locations,
        experience,
        remote,
        minimumMatchPercentage: 70,
        companyBlacklist,
        titleBlacklist,
        locationBlacklist,
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to load user profile from YAML files');
    throw error;
  }
}

function parseDurationInMonths(startStr: string, endStr: string): number {
  const monthMap: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
  };

  const parsePart = (part: string): { month: number; year: number } | null => {
    const clean = part.toLowerCase().trim();
    if (clean === 'present') {
      const now = new Date();
      return { month: now.getMonth(), year: now.getFullYear() };
    }
    // Match "Sep 2024", "January 2024", etc.
    const match = clean.match(/^([a-z]+)\s+(\d{4})$/);
    if (!match) {
      return null;
    }
    const monthName = match[1];
    const year = parseInt(match[2], 10);
    const month = monthMap[monthName] ?? 0;
    return { month, year };
  };

  const start = parsePart(startStr);
  const end = parsePart(endStr);

  if (!start || !end) {
    return 0;
  }

  const months = (end.year - start.year) * 12 + (end.month - start.month) + 1;
  return months > 0 ? months : 0;
}
