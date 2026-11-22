import { SlaPolicy } from '../domain/catalog/SlaPolicy';
import { Priority } from '../domain/enums';
import { SlaConfigurationError } from '../domain/errors';
import { SlaPolicyRepository } from '../persistence/repositories';

/** Resolves which SLA applies: a service-specific policy first, otherwise the default policy for the priority. */
export class SlaService {
  constructor(private readonly policies: SlaPolicyRepository) {}

  async resolvePolicy(serviceId: string, priority: Priority): Promise<SlaPolicy> {
    // fetch the service-specific and the default policy together, then prefer the specific one
    const [specific, fallback] = await Promise.all([this.policies.findFor(priority, serviceId), this.policies.findFor(priority, null)]);
    if (specific) return specific;
    if (fallback) return fallback;
    throw new SlaConfigurationError(`No SLA policy is configured for priority ${priority} (service ${serviceId})`);
  }
}
