#!/usr/bin/env python3
"""
ChittyCan Prometheus Metrics Exporter

Exports ChittyCan gateway metrics in Prometheus format.
Run as sidecar or standalone service.

Usage:
    python3 benchmarks/prometheus-exporter.py --port 9090
"""

import argparse
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Dict, List


class MetricsStore:
    """In-memory metrics storage"""

    def __init__(self):
        self.requests_total: Dict[str, int] = {}
        self.cache_hits_total: Dict[str, int] = {}
        self.cache_requests_total: Dict[str, int] = {}
        self.cost_cents_total: Dict[str, float] = {}
        self.fallback_events_total: Dict[str, int] = {}
        self.budget_overruns_total: Dict[str, int] = {}
        self.request_duration_histogram: Dict[str, List[float]] = {}

    def record_request(
        self,
        model: str,
        tenant: str,
        duration: float,
        cached: bool,
        cost: float
    ):
        """Record a single request"""
        key = f'{model},{tenant}'

        # Increment request counter
        self.requests_total[key] = self.requests_total.get(key, 0) + 1

        # Record cache stats
        self.cache_requests_total[model] = self.cache_requests_total.get(model, 0) + 1
        if cached:
            self.cache_hits_total[model] = self.cache_hits_total.get(model, 0) + 1

        # Record cost
        self.cost_cents_total[key] = self.cost_cents_total.get(key, 0.0) + cost

        # Record duration
        if model not in self.request_duration_histogram:
            self.request_duration_histogram[model] = []
        self.request_duration_histogram[model].append(duration)

    def export_prometheus(self) -> str:
        """Export metrics in Prometheus format"""
        lines = []

        # Header
        lines.append("# ChittyCan Gateway Metrics")
        lines.append("")

        # Requests total
        lines.append("# HELP chitty_requests_total Total number of requests")
        lines.append("# TYPE chitty_requests_total counter")
        for key, value in self.requests_total.items():
            model, tenant = key.split(',')
            lines.append(f'chitty_requests_total{{model="{model}",tenant="{tenant}"}} {value}')
        lines.append("")

        # Cache hits
        lines.append("# HELP chitty_cache_hits_total Total number of cache hits")
        lines.append("# TYPE chitty_cache_hits_total counter")
        for model, value in self.cache_hits_total.items():
            lines.append(f'chitty_cache_hits_total{{model="{model}"}} {value}')
        lines.append("")

        # Cache requests
        lines.append("# HELP chitty_cache_requests_total Total number of cacheable requests")
        lines.append("# TYPE chitty_cache_requests_total counter")
        for model, value in self.cache_requests_total.items():
            lines.append(f'chitty_cache_requests_total{{model="{model}"}} {value}')
        lines.append("")

        # Cache hit rate (computed metric)
        lines.append("# HELP chitty_cache_hit_rate Cache hit rate ratio (hits/requests)")
        lines.append("# TYPE chitty_cache_hit_rate gauge")
        for model in self.cache_requests_total.keys():
            hits = self.cache_hits_total.get(model, 0)
            requests = self.cache_requests_total[model]
            rate = hits / requests if requests > 0 else 0
            lines.append(f'chitty_cache_hit_rate{{model="{model}"}} {rate:.4f}')
        lines.append("")

        # Cost in cents
        lines.append("# HELP chitty_cost_cents_total Total cost in USD cents")
        lines.append("# TYPE chitty_cost_cents_total counter")
        for key, value in self.cost_cents_total.items():
            model, tenant = key.split(',')
            lines.append(f'chitty_cost_cents_total{{model="{model}",tenant="{tenant}"}} {value:.2f}')
        lines.append("")

        # Request duration histogram
        lines.append("# HELP chitty_request_duration_seconds Request duration in seconds")
        lines.append("# TYPE chitty_request_duration_seconds histogram")
        for model, durations in self.request_duration_histogram.items():
            if not durations:
                continue

            sorted_durations = sorted(durations)
            count = len(sorted_durations)

            # Buckets: 0.01s, 0.1s, 0.5s, 1s, 2s, 5s, 10s, +Inf
            buckets = [0.01, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0, float('inf')]
            cumulative = 0

            for bucket in buckets:
                cumulative += sum(1 for d in sorted_durations if d <= bucket)
                bucket_label = "+Inf" if bucket == float('inf') else str(bucket)
                lines.append(f'chitty_request_duration_seconds_bucket{{model="{model}",le="{bucket_label}"}} {cumulative}')

            # Summary stats
            total_duration = sum(durations)
            lines.append(f'chitty_request_duration_seconds_sum{{model="{model}"}} {total_duration:.4f}')
            lines.append(f'chitty_request_duration_seconds_count{{model="{model}"}} {count}')

        lines.append("")

        # Fallback events
        if self.fallback_events_total:
            lines.append("# HELP chitty_fallback_events_total Total number of provider fallback events")
            lines.append("# TYPE chitty_fallback_events_total counter")
            for key, value in self.fallback_events_total.items():
                from_model, to_model = key.split('->')
                lines.append(f'chitty_fallback_events_total{{from_model="{from_model}",to_model="{to_model}"}} {value}')
            lines.append("")

        # Budget overruns
        if self.budget_overruns_total:
            lines.append("# HELP chitty_budget_overruns_total Total number of budget overrun incidents")
            lines.append("# TYPE chitty_budget_overruns_total counter")
            for tenant, value in self.budget_overruns_total.items():
                lines.append(f'chitty_budget_overruns_total{{tenant="{tenant}"}} {value}')
            lines.append("")

        return "\n".join(lines)


# Global metrics store
METRICS = MetricsStore()


class MetricsHandler(BaseHTTPRequestHandler):
    """HTTP handler for /metrics endpoint"""

    def do_GET(self):
        """Handle GET requests"""
        if self.path == "/metrics":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; version=0.0.4")
            self.end_headers()

            metrics_output = METRICS.export_prometheus()
            self.wfile.write(metrics_output.encode())

        elif self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"OK")

        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        """Suppress default logging"""
        pass


def generate_sample_data():
    """Generate sample metrics for testing"""
    import random

    models = ["gpt-4", "claude-sonnet", "groq/llama-3-70b"]
    tenants = ["tenant-a", "tenant-b", "tenant-c"]

    print("Generating sample metrics...")

    for _ in range(1000):
        model = random.choice(models)
        tenant = random.choice(tenants)
        duration = random.uniform(0.05, 2.0)
        cached = random.random() < 0.7  # 70% cache hit rate
        cost = 0 if cached else random.uniform(0.001, 0.05)

        METRICS.record_request(model, tenant, duration, cached, cost)

    print(f"Generated {sum(METRICS.requests_total.values())} sample requests")


def main():
    """Run Prometheus exporter server"""
    parser = argparse.ArgumentParser(description="ChittyCan Prometheus Exporter")
    parser.add_argument("--port", type=int, default=9090, help="Port to listen on")
    parser.add_argument("--sample-data", action="store_true", help="Generate sample data")
    args = parser.parse_args()

    if args.sample_data:
        generate_sample_data()

    server = HTTPServer(("", args.port), MetricsHandler)

    print(f"ChittyCan Prometheus Exporter")
    print(f"Listening on http://localhost:{args.port}/metrics")
    print(f"Health check: http://localhost:{args.port}/health")
    print()
    print("Prometheus scrape config:")
    print("  - job_name: 'chittycan'")
    print(f"    static_configs:")
    print(f"      - targets: ['localhost:{args.port}']")
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()


if __name__ == "__main__":
    main()
