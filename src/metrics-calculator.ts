import { Violation } from './diff-validator';

export interface LogEntry {
  timestamp: string;
  id: string;
  action: 'generate' | 'approve' | 'reject' | 'error' | 'rule_update';
  prompt: string;
  context?: string;
  output?: string;
  violations: Violation[];
  metadata: {
    fileName?: string;
    model?: string;
    tokensUsed?: number;
    approved?: boolean;
    linesChanged?: number;
  };
}

export interface TrendDataPoint {
  date: string; // YYYY-MM-DD
  violations: number;
  approvals: number;
  rejections: number;
}

export interface RuleViolationCount {
  ruleType: string;
  description: string;
  count: number;
  percentage: number;
}

export interface MetricsSummary {
  period: { start: string; end: string };
  totalInteractions: number;
  totalViolations: number;
  approvalRate: number;
  rejectionRate: number;
  violationsByType: Record<string, number>;
  violationsBySeverity: { error: number; warning: number };
  trendsOverTime: TrendDataPoint[];
  topViolatedRules: RuleViolationCount[];
  averageViolationsPerInteraction: number;
}

export class MetricsCalculator {
  /**
   * Calculate metrics from log entries for a given period
   */
  public calculate(logs: LogEntry[], periodDays: number = 30): MetricsSummary {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);

    const filteredLogs = logs.filter(log =>
      new Date(log.timestamp) >= cutoff
    );

    const approvals = filteredLogs.filter(l => l.action === 'approve').length;
    const rejections = filteredLogs.filter(l => l.action === 'reject').length;
    const total = filteredLogs.length;

    return {
      period: {
        start: cutoff.toISOString(),
        end: new Date().toISOString()
      },
      totalInteractions: total,
      totalViolations: this.countTotalViolations(filteredLogs),
      approvalRate: total > 0 ? approvals / total : 0,
      rejectionRate: total > 0 ? rejections / total : 0,
      violationsByType: this.countByType(filteredLogs),
      violationsBySeverity: this.countBySeverity(filteredLogs),
      trendsOverTime: this.calculateTrends(filteredLogs, periodDays),
      topViolatedRules: this.getTopViolatedRules(filteredLogs),
      averageViolationsPerInteraction: this.calculateAverage(filteredLogs)
    };
  }

  private countTotalViolations(logs: LogEntry[]): number {
    return logs.reduce((sum, log) => sum + (log.violations?.length || 0), 0);
  }

  private countByType(logs: LogEntry[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const log of logs) {
      for (const violation of log.violations || []) {
        counts[violation.ruleType] = (counts[violation.ruleType] || 0) + 1;
      }
    }
    return counts;
  }

  private countBySeverity(logs: LogEntry[]): { error: number; warning: number } {
    let error = 0;
    let warning = 0;
    for (const log of logs) {
      for (const violation of log.violations || []) {
        if (violation.severity === 'error') {
          error++;
        } else {
          warning++;
        }
      }
    }
    return { error, warning };
  }

  private calculateTrends(logs: LogEntry[], days: number): TrendDataPoint[] {
    const dailyData: Map<string, TrendDataPoint> = new Map();

    for (const log of logs) {
      const date = log.timestamp.split('T')[0]; // YYYY-MM-DD
      const existing = dailyData.get(date) || {
        date,
        violations: 0,
        approvals: 0,
        rejections: 0
      };

      existing.violations += log.violations?.length || 0;
      if (log.action === 'approve') {
        existing.approvals++;
      }
      if (log.action === 'reject') {
        existing.rejections++;
      }

      dailyData.set(date, existing);
    }

    // Fill in missing dates
    const result: TrendDataPoint[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      result.push(dailyData.get(dateStr) || {
        date: dateStr,
        violations: 0,
        approvals: 0,
        rejections: 0
      });
    }

    return result;
  }

  private getTopViolatedRules(logs: LogEntry[]): RuleViolationCount[] {
    const counts: Map<string, { type: string; desc: string; count: number }> = new Map();
    let total = 0;

    for (const log of logs) {
      for (const violation of log.violations || []) {
        const key = `${violation.ruleType}:${violation.description}`;
        const existing = counts.get(key);
        if (existing) {
          existing.count++;
        } else {
          counts.set(key, {
            type: violation.ruleType,
            desc: violation.description,
            count: 1
          });
        }
        total++;
      }
    }

    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(c => ({
        ruleType: c.type,
        description: c.desc,
        count: c.count,
        percentage: total > 0 ? c.count / total : 0
      }));
  }

  private calculateAverage(logs: LogEntry[]): number {
    if (logs.length === 0) {
      return 0;
    }
    const total = logs.reduce((sum, log) => sum + (log.violations?.length || 0), 0);
    return total / logs.length;
  }

  /**
   * Export metrics as CSV string
   */
  public exportAsCsv(metrics: MetricsSummary): string {
    const lines: string[] = [];

    // Summary section
    lines.push('Metric,Value');
    lines.push(`Total Interactions,${metrics.totalInteractions}`);
    lines.push(`Total Violations,${metrics.totalViolations}`);
    lines.push(`Approval Rate,${(metrics.approvalRate * 100).toFixed(1)}%`);
    lines.push(`Rejection Rate,${(metrics.rejectionRate * 100).toFixed(1)}%`);
    lines.push(`Avg Violations Per Interaction,${metrics.averageViolationsPerInteraction.toFixed(2)}`);
    lines.push('');

    // Violations by type
    lines.push('Violation Type,Count');
    for (const [type, count] of Object.entries(metrics.violationsByType)) {
      lines.push(`${type},${count}`);
    }
    lines.push('');

    // Severity breakdown
    lines.push('Severity,Count');
    lines.push(`Error,${metrics.violationsBySeverity.error}`);
    lines.push(`Warning,${metrics.violationsBySeverity.warning}`);
    lines.push('');

    // Daily trends
    lines.push('Date,Violations,Approvals,Rejections');
    for (const point of metrics.trendsOverTime) {
      lines.push(`${point.date},${point.violations},${point.approvals},${point.rejections}`);
    }

    return lines.join('\n');
  }
}
