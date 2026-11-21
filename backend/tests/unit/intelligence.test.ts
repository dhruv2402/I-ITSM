import { Category } from '../../src/domain/catalog/Category';
import { ItService } from '../../src/domain/catalog/ItService';
import { Role } from '../../src/domain/enums';
import { Incident } from '../../src/domain/incident/Incident';
import { CategoryClassifier } from '../../src/intelligence/CategoryClassifier';
import { CorrelationEngine } from '../../src/intelligence/CorrelationEngine';
import { DuplicateDetector } from '../../src/intelligence/DuplicateDetector';
import { TextAnalyzer } from '../../src/intelligence/TextAnalyzer';

const reporter = { id: 'E1', name: 'Emp', role: Role.EMPLOYEE };
const make = (id: string, title: string, serviceId: string, description = 'Reported by an employee today.') => {
  const i = Incident.create(id, { title, description, reporter, serviceId, impact: 3, urgency: 3, businessCriticality: 4, affectedUsers: 10 });
  i.classify('APPLICATION', reporter);
  return i;
};

describe('Intelligent features', () => {
  test('text normalisation maps different wordings to the same concept', () => {
    expect(TextAnalyzer.tokenize('Payment application unavailable')).toEqual(['payment', 'application', 'outage']);
    expect(TextAnalyzer.tokenize('Unable to make payment')).toEqual(['fail', 'payment']);
  });

  test('TC10 duplicate detection flags the brief\'s payment example as related', () => {
    const existing = [make('INC101', 'Payment application unavailable', 'SVC-PAY'), make('INC102', 'Printer jammed on 2nd floor', 'SVC-LAPTOP')];
    const d = new DuplicateDetector().findDuplicates(
      { title: 'Payment transaction failing', description: 'Customers cannot complete payment transactions', serviceId: 'SVC-PAY' },
      existing,
    );
    expect(d.map((x) => x.incidentId)).toEqual(['INC101']);
    expect(d[0].sameService).toBe(true);
  });

  test('closed incidents and other topics are not reported as duplicates', () => {
    const d = new DuplicateDetector().findDuplicates(
      { title: 'VPN disconnects every hour', description: 'Remote VPN drops', serviceId: 'SVC-NET' },
      [make('INC1', 'Payment application unavailable', 'SVC-PAY')],
    );
    expect(d).toHaveLength(0);
  });

  test('TC11 category classifier suggests the right category from keywords and history', () => {
    const cats = [
      Category.create({ id: 'NETWORK', name: 'Network', description: '', keywords: ['vpn', 'wifi', 'network'], active: true }),
      Category.create({ id: 'AUTHENTICATION', name: 'Auth', description: '', keywords: ['login', 'password', 'sso'], active: true }),
      Category.create({ id: 'HARDWARE', name: 'HW', description: '', keywords: ['laptop', 'printer'], active: true }),
    ];
    const clf = new CategoryClassifier();
    clf.train([
      { text: 'cannot login sso loop', categoryCode: 'AUTHENTICATION' },
      { text: 'vpn keeps dropping', categoryCode: 'NETWORK' },
    ]);
    expect(clf.suggest('I cannot sign in, my password is rejected', cats)!.categoryCode).toBe('AUTHENTICATION');
    expect(clf.suggest('The office wifi is very slow', cats)!.categoryCode).toBe('NETWORK');
    expect(clf.suggest('zzz qqq', cats)).toBeNull();
  });

  test('a newly added category works immediately through its keywords (extensibility)', () => {
    const cats = [
      Category.create({ id: 'NETWORK', name: 'Network', description: '', keywords: ['vpn'], active: true }),
      Category.create({ id: 'TELEPHONY', name: 'Telephony', description: '', keywords: ['desk phone', 'voip', 'extension'], active: true }),
    ];
    expect(new CategoryClassifier().suggest('My desk phone has no dial tone', cats)!.categoryCode).toBe('TELEPHONY');
  });

  test('TC12 correlation finds the shared upstream root cause in the dependency graph', () => {
    const services = [
      ItService.create({ id: 'NET', name: 'Network', description: '', businessCriticality: 4, ownerTeam: '', userBase: 0, dependsOn: [], active: true }),
      ItService.create({ id: 'DB', name: 'Database', description: '', businessCriticality: 4, ownerTeam: '', userBase: 0, dependsOn: ['NET'], active: true }),
      ItService.create({ id: 'ERP', name: 'ERP', description: '', businessCriticality: 3, ownerTeam: '', userBase: 0, dependsOn: ['DB'], active: true }),
      ItService.create({ id: 'HR', name: 'HR', description: '', businessCriticality: 2, ownerTeam: '', userBase: 0, dependsOn: ['DB'], active: true }),
    ];
    const incidents = [make('I1', 'ERP reports slow', 'ERP'), make('I2', 'HR portal timing out', 'HR'), make('I3', 'Database latency high', 'DB')];
    const clusters = new CorrelationEngine().correlate(incidents, services);
    const dep = clusters.find((c) => c.type === 'SHARED_DEPENDENCY')!;
    expect(dep.serviceId).toBe('DB'); // DB is reported directly -> better explanation than NET
    expect(dep.incidentIds.sort()).toEqual(['I1', 'I2', 'I3']);
    expect(clusters.filter((c) => c.type === 'SHARED_DEPENDENCY')).toHaveLength(1);
  });

  test('dependency traversal is cycle safe', () => {
    const a = ItService.create({ id: 'SVC-A', name: 'A1', description: '', businessCriticality: 1, ownerTeam: '', userBase: 0, dependsOn: ['SVC-B'], active: true });
    const b = ItService.create({ id: 'SVC-B', name: 'B1', description: '', businessCriticality: 1, ownerTeam: '', userBase: 0, dependsOn: ['SVC-A'], active: true });
    expect([...CorrelationEngine.upstreamOf('SVC-A', new Map([['SVC-A', a], ['SVC-B', b]]))]).toEqual(['SVC-B']);
  });
});
