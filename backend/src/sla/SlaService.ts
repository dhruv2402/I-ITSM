import { SlaPolicy } from '../domain/catalog/SlaPolicy';
import { Priority } from '../domain/enums';
import { SlaConfigurationError } from '../domain/errors';
import { SlaPolicyRepository } from '../persistence/repositories';

/** Resolves which SLA applies: a service-specific policy first, otherwise the default policy for the priority. */
export class SlaService {
  constructor(private readonly policies: SlaPolicyRepository) {}

  async resolvePolicy(serviceId: string, priority: Priority): Promise<SlaPolicy> {
    const specific = await this.policies.findFor(priority, serviceId);
    if (specific) return specific;
    const fallback = await this.policies.findFor(priority, null);
    if (fallback) return fallback;
    throw new SlaConfigurationError(`No SLA policy is configured for priority ${priority} (service ${serviceId})`);
  }
}
