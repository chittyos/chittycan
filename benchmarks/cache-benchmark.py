#!/usr/bin/env python3
"""
ChittyCan Cache Benchmark

Measures cost savings and latency improvements from edge caching.
Compares direct API calls vs ChittyCan proxy with caching enabled.

Usage:
    export CHITTYCAN_TOKEN=chitty_xxx
    python3 benchmarks/cache-benchmark.py
"""

import os
import sys
import time
import statistics
import openai
from typing import List, Tuple

# Test configuration
BENCHMARK_PROMPT = "What is the API endpoint for user authentication?"
NUM_REQUESTS = 1000
CONCURRENCY = 10


def run_benchmark(
    api_base: str,
    api_key: str,
    num_requests: int,
    prompt: str
) -> Tuple[List[float], float]:
    """
    Run benchmark against specified API endpoint.

    Returns:
        (latencies, total_cost)
    """
    openai.api_base = api_base
    openai.api_key = api_key

    latencies = []
    total_tokens = 0

    print(f"\nRunning {num_requests} requests...")
    print(f"Endpoint: {api_base}")

    start_time = time.time()

    for i in range(num_requests):
        request_start = time.time()

        try:
            response = openai.ChatCompletion.create(
                model="gpt-4",
                messages=[{"role": "user", "content": prompt}],
                temperature=0  # Deterministic for caching
            )

            request_latency = time.time() - request_start
            latencies.append(request_latency)

            if response.usage:
                total_tokens += response.usage.total_tokens

            # Progress indicator
            if (i + 1) % 100 == 0:
                print(f"  {i + 1}/{num_requests} requests complete...")

        except Exception as e:
            print(f"  Error on request {i + 1}: {e}")
            continue

    total_time = time.time() - start_time

    # Estimate cost (GPT-4: $0.03/1K input tokens, $0.06/1K output tokens)
    # Rough estimate: average split
    estimated_cost = (total_tokens / 1000) * 0.045

    print(f"\nCompleted {len(latencies)}/{num_requests} requests")
    print(f"Total time: {total_time:.2f}s")

    return latencies, estimated_cost


def calculate_percentiles(latencies: List[float]) -> dict:
    """Calculate latency percentiles"""
    if not latencies:
        return {}

    sorted_latencies = sorted(latencies)
    return {
        "p50": statistics.median(sorted_latencies),
        "p95": sorted_latencies[int(len(sorted_latencies) * 0.95)],
        "p99": sorted_latencies[int(len(sorted_latencies) * 0.99)],
        "min": min(sorted_latencies),
        "max": max(sorted_latencies),
        "avg": statistics.mean(sorted_latencies)
    }


def print_results(name: str, latencies: List[float], cost: float):
    """Print benchmark results"""
    percentiles = calculate_percentiles(latencies)

    print(f"\n{'='*60}")
    print(f"{name} Results")
    print(f"{'='*60}")
    print(f"Total Cost:        ${cost:.2f}")
    print(f"Cost per Request:  ${cost/len(latencies):.4f}")
    print(f"\nLatency:")
    print(f"  Min:             {percentiles['min']*1000:.0f}ms")
    print(f"  Avg:             {percentiles['avg']*1000:.0f}ms")
    print(f"  P50:             {percentiles['p50']*1000:.0f}ms")
    print(f"  P95:             {percentiles['p95']*1000:.0f}ms")
    print(f"  P99:             {percentiles['p99']*1000:.0f}ms")
    print(f"  Max:             {percentiles['max']*1000:.0f}ms")


def main():
    """Run cache benchmark comparison"""
    chittycan_token = os.environ.get("CHITTYCAN_TOKEN")
    openai_key = os.environ.get("OPENAI_API_KEY")

    if not chittycan_token:
        print("ERROR: Set CHITTYCAN_TOKEN environment variable")
        sys.exit(1)

    print("ChittyCan Cache Benchmark")
    print("="*60)
    print(f"Prompt: {BENCHMARK_PROMPT}")
    print(f"Requests: {NUM_REQUESTS}")
    print(f"Model: gpt-4")
    print()

    # Benchmark 1: Direct OpenAI (if API key available)
    direct_latencies = []
    direct_cost = 0.0

    if openai_key:
        print("\n[1/2] Benchmarking Direct OpenAI API...")
        direct_latencies, direct_cost = run_benchmark(
            "https://api.openai.com/v1",
            openai_key,
            10,  # Only 10 requests (expensive!)
            BENCHMARK_PROMPT
        )
        print_results("Direct OpenAI", direct_latencies, direct_cost)
    else:
        print("\n[1/2] Skipping direct OpenAI benchmark (no OPENAI_API_KEY)")

    # Benchmark 2: ChittyCan with cache
    print("\n[2/2] Benchmarking ChittyCan Proxy with Cache...")
    chittycan_latencies, chittycan_cost = run_benchmark(
        "https://connect.chitty.cc/v1",
        chittycan_token,
        NUM_REQUESTS,
        BENCHMARK_PROMPT
    )
    print_results("ChittyCan (with cache)", chittycan_latencies, chittycan_cost)

    # Calculate savings
    if direct_latencies:
        direct_avg_cost = direct_cost / len(direct_latencies)
        chittycan_avg_cost = chittycan_cost / len(chittycan_latencies)

        cost_savings_pct = ((direct_avg_cost - chittycan_avg_cost) / direct_avg_cost) * 100

        direct_avg_latency = statistics.mean(direct_latencies) * 1000
        chittycan_avg_latency = statistics.mean(chittycan_latencies) * 1000
        latency_improvement_pct = ((direct_avg_latency - chittycan_avg_latency) / direct_avg_latency) * 100

        print(f"\n{'='*60}")
        print("CACHE SAVINGS")
        print(f"{'='*60}")
        print(f"Cost Savings:      {cost_savings_pct:.1f}%")
        print(f"Latency Improved:  {latency_improvement_pct:.1f}%")
        print(f"\nEstimated cache hit rate: {cost_savings_pct:.1f}%")
        print(f"(Based on {NUM_REQUESTS} identical requests)")

    # Export for Prometheus/Grafana
    print(f"\n{'='*60}")
    print("PROMETHEUS METRICS")
    print(f"{'='*60}")
    print(f"chitty_cache_hit_rate {chittycan_cost/direct_cost if direct_cost else 0:.2f}")
    print(f"chitty_cost_per_request {{proxy='chittycan'}} {chittycan_cost/NUM_REQUESTS:.6f}")
    if direct_cost:
        print(f"chitty_cost_per_request {{proxy='direct'}} {direct_cost/10:.6f}")
    print(f"chitty_latency_p95_ms {{proxy='chittycan'}} {calculate_percentiles(chittycan_latencies)['p95']*1000:.0f}")

    print(f"\n{'='*60}")
    print("✅ Benchmark Complete")
    print(f"{'='*60}")
    print("\nTo reproduce:")
    print("  export CHITTYCAN_TOKEN=...")
    print("  python3 benchmarks/cache-benchmark.py")


if __name__ == "__main__":
    main()
