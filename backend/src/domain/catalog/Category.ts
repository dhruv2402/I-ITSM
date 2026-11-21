import { ValidationError } from '../errors';

export interface CategorySnapshot {
  id: string; // category code, e.g. NETWORK
  name: string;
  description: string;
  keywords: string[];
  active: boolean;
}

/**
 * Incident category. Categories are data, not code: an administrator can add a
 * new category (with its keywords) at runtime and the classifier, assignment
 * strategies and reports pick it up without any code change.
 */
export class Category {
  private constructor(private props: CategorySnapshot) {
    Category.validate(props);
  }

  static create(s: CategorySnapshot): Category {
    return new Category({
      ...s,
      id: s.id.toUpperCase(),
      keywords: [...new Set((s.keywords ?? []).map((k) => k.toLowerCase().trim()).filter(Boolean))],
    });
  }

  private static validate(s: CategorySnapshot): void {
    if (!/^[A-Z_]{2,30}$/.test(s.id)) throw new ValidationError('Category code must be 2-30 upper-case letters/underscores');
    if (!s.name || s.name.trim().length < 2) throw new ValidationError('Category name is required');
  }

  get code(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get keywords(): string[] {
    return [...this.props.keywords];
  }
  get isActive(): boolean {
    return this.props.active;
  }

  update(changes: Partial<Omit<CategorySnapshot, 'id'>>): void {
    const next = { ...this.props, ...changes };
    next.keywords = [...new Set(next.keywords.map((k) => k.toLowerCase().trim()).filter(Boolean))];
    Category.validate(next);
    this.props = next;
  }

  toSnapshot(): CategorySnapshot {
    return { ...this.props, keywords: [...this.props.keywords] };
  }
}
