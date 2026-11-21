import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Role } from '../domain/enums';
import { AuthenticationError, ConflictError, InvalidCredentialsError, ValidationError } from '../domain/errors';
import { EventType } from '../domain/events/DomainEvent';
import { EventBus } from '../domain/events/EventBus';
import { User } from '../domain/user/User';
import { UserFactory } from '../domain/user/UserFactory';
import { SequenceGenerator, UserRepository } from '../persistence/repositories';
import { clock } from '../shared/clock';

export interface TokenPayload {
  sub: string;
  role: Role;
}

export const PASSWORD_RULE = 'at least 8 characters with a letter and a digit';

export function validatePassword(password: string): void {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new ValidationError(`Password must be ${PASSWORD_RULE}`);
  }
}

/** Authentication: registration, login (bcrypt + JWT) and token verification. */
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sequences: SequenceGenerator,
    private readonly bus: EventBus,
    private readonly jwtSecret: string,
    private readonly tokenTtlSeconds: number,
  ) {}

  static hash(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async register(input: { name: string; email: string; password: string; phone?: string; department?: string }): Promise<{ user: User; token: string }> {
    validatePassword(input.password);
    if (await this.users.findByEmail(input.email)) throw new ConflictError('An account with this e-mail already exists');
    const id = `E${await this.sequences.next('user-E')}`;
    const user = UserFactory.create({
      id,
      name: input.name,
      email: input.email,
      passwordHash: await AuthService.hash(input.password),
      role: Role.EMPLOYEE, // self-registration can only create employees
      phone: input.phone,
      department: input.department,
      active: true,
      createdAt: clock.now(),
    });
    await this.users.save(user);
    await this.bus.publish({
      type: EventType.USER_CREATED,
      actor: user.toActor(),
      occurredAt: clock.now(),
      description: `${user.name} self-registered as Employee ${user.id}`,
    });
    return { user, token: this.issueToken(user) };
  }

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const user = await this.users.findByEmail(email ?? '');
    // same error for unknown e-mail and wrong password (no account enumeration)
    if (!user || !(await bcrypt.compare(password ?? '', user.passwordHash))) throw new InvalidCredentialsError();
    if (!user.isActive) throw new AuthenticationError('This account has been deactivated. Contact the IT administrator.');
    await this.bus.publish({ type: EventType.USER_LOGIN, actor: user.toActor(), occurredAt: clock.now(), description: `${user.name} logged in` });
    return { user, token: this.issueToken(user) };
  }

  async changePassword(user: User, current: string, next: string): Promise<void> {
    if (!(await bcrypt.compare(current ?? '', user.passwordHash))) throw new ValidationError('Current password is incorrect');
    validatePassword(next);
    user.changePasswordHash(await AuthService.hash(next));
    await this.users.save(user);
  }

  issueToken(user: User): string {
    const payload: TokenPayload = { sub: user.id, role: user.role };
    return jwt.sign(payload, this.jwtSecret, { expiresIn: this.tokenTtlSeconds, algorithm: 'HS256' });
  }

  async authenticate(token: string | undefined): Promise<User> {
    if (!token) throw new AuthenticationError('Authentication required');
    let payload: TokenPayload;
    try {
      payload = jwt.verify(token, this.jwtSecret, { algorithms: ['HS256'] }) as TokenPayload;
    } catch {
      throw new AuthenticationError('Session expired or invalid token. Please log in again.');
    }
    const user = await this.users.findById(payload.sub);
    if (!user || !user.isActive) throw new AuthenticationError('Account not found or deactivated');
    return user;
  }
}
