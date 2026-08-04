import type { Job } from '../domain/models/job.js';
import { getConfig } from '../infrastructure/config/config.js';

export interface JobSearchCriteria {
  roles: string[];
  skills: string[];
  locations: string[];
  experience?: string;
  remote?: boolean;
  minimumMatchPercentage: number;
}

export interface MatchScore {
  roleMatchPercentage: number;
  technologyMatchPercentage: number;
  experienceMatchPercentage: number;
  locationMatchPercentage: number;
  overallMatchPercentage: number;
  matchedSkills: string[];
  missingSkills: string[];
}

const ROLE_ALIASES = new Map<string, string[]>([
  ['software engineer', ['developer', 'programmer', 'sde']],
  ['frontend engineer', ['front end', 'react developer', 'ui engineer']],
  ['backend engineer', ['back end', 'api engineer', 'server engineer']],
  ['data engineer', ['etl engineer', 'analytics engineer']],
  ['devops engineer', ['site reliability', 'sre', 'platform engineer']],
]);

export class JobMatchingEngine {
  match(job: Job, criteria: JobSearchCriteria): MatchScore {
    const roleMatchPercentage = this.scoreRole(job.title, criteria.roles);
    const technologyMatch = this.scoreSkills(job, criteria.skills);
    const experienceMatchPercentage = this.scoreExperience(job, criteria.experience);
    const locationMatchPercentage = this.scoreLocation(job.location, criteria);
    const weights = this.normalizedWeights();

    const overallMatchPercentage = Math.round(
      roleMatchPercentage * weights.roleWeight +
        technologyMatch.percentage * weights.skillsWeight +
        experienceMatchPercentage * weights.experienceWeight +
        locationMatchPercentage * weights.locationWeight,
    );

    return {
      roleMatchPercentage,
      technologyMatchPercentage: technologyMatch.percentage,
      experienceMatchPercentage,
      locationMatchPercentage,
      overallMatchPercentage,
      matchedSkills: technologyMatch.matchedSkills,
      missingSkills: technologyMatch.missingSkills,
    };
  }

  private scoreRole(title: string, roles: string[]): number {
    if (roles.length === 0) {
      return 100;
    }

    const normalizedTitle = normalize(title);
    const scores = roles.map((role) => {
      const normalizedRole = normalize(role);
      const candidates = [normalizedRole, ...(ROLE_ALIASES.get(normalizedRole) ?? [])];

      return Math.max(
        ...candidates.map((candidate) => {
          if (normalizedTitle === candidate) {
            return 100;
          }

          if (normalizedTitle.includes(candidate) || candidate.includes(normalizedTitle)) {
            return 90;
          }

          return Math.round(similarity(normalizedTitle, candidate) * 100);
        }),
      );
    });

    return Math.max(...scores);
  }

  private scoreSkills(
    job: Job,
    skills: string[],
  ): { percentage: number; matchedSkills: string[]; missingSkills: string[] } {
    if (skills.length === 0) {
      return { percentage: 100, matchedSkills: [], missingSkills: [] };
    }

    const searchableText = normalize(
      [job.title, job.description, job.company].filter(Boolean).join(' '),
    );
    const matchedSkills = skills.filter((skill) => searchableText.includes(normalize(skill)));
    const missingSkills = skills.filter((skill) => !matchedSkills.includes(skill));

    return {
      percentage: Math.round((matchedSkills.length / skills.length) * 100),
      matchedSkills,
      missingSkills,
    };
  }

  private scoreExperience(job: Job, experience?: string): number {
    if (!experience) {
      return 100;
    }

    const expectedYears = extractFirstNumber(experience);

    if (expectedYears === undefined) {
      return normalize([job.title, job.description].join(' ')).includes(normalize(experience))
        ? 100
        : 60;
    }

    const jobYears = extractFirstNumber([job.title, job.description].join(' '));

    if (jobYears === undefined) {
      return 70;
    }

    const difference = Math.abs(jobYears - expectedYears);
    return Math.max(0, 100 - difference * 20);
  }

  private scoreLocation(location: string | undefined, criteria: JobSearchCriteria): number {
    if (criteria.locations.length === 0 && criteria.remote === undefined) {
      return 100;
    }

    const normalizedLocation = normalize(location ?? '');
    const isRemote = normalizedLocation.includes('remote');

    if (criteria.remote === true && isRemote) {
      return 100;
    }

    if (criteria.locations.some((item) => normalizedLocation.includes(normalize(item)))) {
      return 100;
    }

    if (criteria.remote === true && !isRemote) {
      return 20;
    }

    return normalizedLocation ? 40 : 60;
  }

  private normalizedWeights() {
    const weights = getConfig().matching;
    const total =
      weights.roleWeight +
      weights.skillsWeight +
      weights.experienceWeight +
      weights.locationWeight;

    return {
      roleWeight: weights.roleWeight / total,
      skillsWeight: weights.skillsWeight / total,
      experienceWeight: weights.experienceWeight / total,
      locationWeight: weights.locationWeight / total,
    };
  }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#. ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractFirstNumber(value: string): number | undefined {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function similarity(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }

  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const temporary = previous[rightIndex];
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + cost,
      );
      diagonal = temporary;
    }
  }

  return previous[right.length];
}
