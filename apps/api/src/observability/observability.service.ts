import { Injectable } from "@nestjs/common";

interface HttpMetricBucket {
  requests: number;
  errors: number;
  totalLatencyMs: number;
  maxLatencyMs: number;
}

interface OpenAiMetrics {
  calls: number;
  failures: number;
  totalLatencyMs: number;
  maxLatencyMs: number;
}

@Injectable()
export class ObservabilityService {
  private readonly httpMetrics = new Map<string, HttpMetricBucket>();
  private readonly openAiMetrics: OpenAiMetrics = {
    calls: 0,
    failures: 0,
    totalLatencyMs: 0,
    maxLatencyMs: 0,
  };

  recordHttpRequest(args: {
    method: string;
    path: string;
    statusCode: number;
    latencyMs: number;
  }): void {
    const key = `${args.method.toUpperCase()} ${args.path}`;
    const existing = this.httpMetrics.get(key) ?? {
      requests: 0,
      errors: 0,
      totalLatencyMs: 0,
      maxLatencyMs: 0,
    };

    existing.requests += 1;
    if (args.statusCode >= 500) {
      existing.errors += 1;
    }
    existing.totalLatencyMs += args.latencyMs;
    existing.maxLatencyMs = Math.max(existing.maxLatencyMs, args.latencyMs);

    this.httpMetrics.set(key, existing);
  }

  recordOpenAiGrade(args: { latencyMs: number; failed: boolean }): void {
    this.openAiMetrics.calls += 1;
    if (args.failed) {
      this.openAiMetrics.failures += 1;
    }
    this.openAiMetrics.totalLatencyMs += args.latencyMs;
    this.openAiMetrics.maxLatencyMs = Math.max(this.openAiMetrics.maxLatencyMs, args.latencyMs);
  }

  snapshot() {
    const http = [...this.httpMetrics.entries()]
      .map(([routeKey, bucket]) => ({
        routeKey,
        requests: bucket.requests,
        errors: bucket.errors,
        avgLatencyMs:
          bucket.requests > 0
            ? Number((bucket.totalLatencyMs / bucket.requests).toFixed(2))
            : 0,
        maxLatencyMs: Number(bucket.maxLatencyMs.toFixed(2)),
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 200);

    return {
      http,
      openAi: {
        calls: this.openAiMetrics.calls,
        failures: this.openAiMetrics.failures,
        avgLatencyMs:
          this.openAiMetrics.calls > 0
            ? Number((this.openAiMetrics.totalLatencyMs / this.openAiMetrics.calls).toFixed(2))
            : 0,
        maxLatencyMs: Number(this.openAiMetrics.maxLatencyMs.toFixed(2)),
      },
    };
  }
}
