export interface DoctorCheckResult {
  ok: boolean;
  message: string;
}

export interface NamedDoctorCheck extends DoctorCheckResult {
  name: string;
}

export interface DoctorResult {
  ok: boolean;
  checks: NamedDoctorCheck[];
}

export type DoctorCheckName = 'database' | 'auditLog' | 'model' | 'scheduler';

export type DoctorChecks = Partial<Record<DoctorCheckName, () => Promise<DoctorCheckResult>>>;

const checkOrder: DoctorCheckName[] = ['database', 'auditLog', 'model', 'scheduler'];

export async function runDoctor(options: { checks: DoctorChecks }): Promise<DoctorResult> {
  const checks: NamedDoctorCheck[] = [];

  for (const name of checkOrder) {
    const check = options.checks[name];
    if (!check) {
      continue;
    }

    const result = await check();
    checks.push({ name, ...result });
  }

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}
