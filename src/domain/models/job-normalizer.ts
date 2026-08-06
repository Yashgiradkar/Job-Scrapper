import type { CreateJobInput } from './job.js';

// Common legal suffixes to clean from company names
const LEGAL_SUFFIXES = /\b(inc|llc|ltd|corp|corporation|gmbh|co|sa|pvt|pty)\b\.?/i;

// Common skills dictionary to extract from description or title
const KNOWN_SKILLS = [
  'TypeScript', 'JavaScript', 'Node.js', 'React', 'Vue', 'Angular',
  'Python', 'Go', 'Golang', 'Rust', 'Java', 'C++', 'C#', '.NET',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'DynamoDB', 'SQLite',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform',
  'Playwright', 'Puppeteer', 'Selenium', 'Prisma', 'Sequelize',
  'Express', 'Fastify', 'NestJS', 'GraphQL', 'REST API', 'Django',
  'Flask', 'FastAPI', 'Spring Boot', 'TailwindCSS', 'Git', 'CI/CD'
];

export class JobNormalizer {
  static normalize(input: Partial<CreateJobInput> & { title: string; url: string; company: string; source: string }): CreateJobInput {
    const title = this.normalizeTitle(input.title);
    const company = this.normalizeCompany(input.company);
    const url = this.normalizeUrl(input.url);
    const description = this.normalizeDescription(input.description || '');
    const location = this.normalizeLocation(input.location);
    const remote = input.remote ?? this.detectRemote(location, description);
    const employmentType = this.normalizeEmploymentType(input.employmentType || this.detectEmploymentType(description));
    const salary = this.normalizeSalary(input.salary);
    const skills = input.skills || this.extractSkills(title + ' ' + description);
    const experience = this.normalizeExperience(input.experience || this.detectExperience(title + ' ' + description));

    return {
      title,
      company,
      url,
      source: input.source.trim(),
      externalId: input.externalId?.trim(),
      location,
      description,
      remote,
      employmentType,
      salary,
      skills,
      experience,
      postedAt: input.postedAt,
    };
  }

  private static normalizeTitle(title: string): string {
    return title
      .replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '') // remove emojis
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static normalizeCompany(company: string): string {
    return company
      .replace(LEGAL_SUFFIXES, '')
      .replace(/,\s*$/, '') // trailing comma
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url.trim());
      return parsed.toString();
    } catch {
      return url.trim();
    }
  }

  private static normalizeDescription(description: string): string {
    return description
      .replace(/<[^>]+>/g, ' ') // strip HTML
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static normalizeLocation(location: string | undefined): string | undefined {
    if (!location) return undefined;
    let clean = location.replace(/\s+/g, ' ').trim();
    
    // Standardize casing of common location names
    if (/remote/i.test(clean)) {
      clean = clean.split(/[;,]/).map(s => {
        const trimmed = s.trim();
        if (/remote/i.test(trimmed)) return 'Remote';
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
      }).join(', ');
    }
    
    return clean || undefined;
  }

  private static detectRemote(location: string | undefined, description: string): boolean {
    const text = `${location || ''} ${description}`.toLowerCase();
    return text.includes('remote') || text.includes('work from home') || text.includes('wfh');
  }

  private static detectEmploymentType(description: string): string | undefined {
    const text = description.toLowerCase();
    if (text.includes('part-time') || text.includes('part time')) return 'Part-time';
    if (text.includes('contract') || text.includes('temporary')) return 'Contract';
    if (text.includes('intern') || text.includes('internship')) return 'Internship';
    if (text.includes('full-time') || text.includes('full time')) return 'Full-time';
    return undefined;
  }

  private static normalizeEmploymentType(type: string | undefined): string | undefined {
    if (!type) return undefined;
    const clean = type.toLowerCase().trim();
    if (clean.includes('full')) return 'Full-time';
    if (clean.includes('part')) return 'Part-time';
    if (clean.includes('contract')) return 'Contract';
    if (clean.includes('intern')) return 'Internship';
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  private static normalizeSalary(salary: string | undefined): string | undefined {
    if (!salary) return undefined;
    // Standardize spacing and ranges
    let clean = salary.toLowerCase().replace(/\s+/g, '').trim();
    clean = clean.replace(/(\d+)k/g, '$1,000');
    return salary.replace(/\s+/g, ' ').trim();
  }

  private static extractSkills(text: string): string[] {
    const matched = new Set<string>();
    const normalizedText = ` ${text.toLowerCase().replace(/[^a-z0-9+#. ]+/g, ' ')} `;
    
    for (const skill of KNOWN_SKILLS) {
      const skillLower = ` ${skill.toLowerCase()} `;
      if (normalizedText.includes(skillLower)) {
        matched.add(skill);
      }
    }
    
    return Array.from(matched);
  }

  private static detectExperience(text: string): string | undefined {
    const match = text.match(/\b(\d+\+?)\s*(?:years?|yrs?)\b/i);
    return match ? `${match[1]} years` : undefined;
  }

  private static normalizeExperience(experience: string | undefined): string | undefined {
    if (!experience) return undefined;
    return experience.toLowerCase().replace(/\s+/g, ' ').trim();
  }
}
