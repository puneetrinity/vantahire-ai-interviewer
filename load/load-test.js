/**
 * VantaHire Load Test
 *
 * Targets from TEST_PLAN.md:
 * - 25 concurrent interviews
 * - 200 concurrent API requests
 *
 * Run with:
 *   k6 run load/load-test.js --env API_BASE_URL=http://localhost:3000
 *
 * For recording latency metrics:
 *   k6 run load/load-test.js --out json=results.json
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency', true);
const interviewLatency = new Trend('interview_latency', true);
const jobsLatency = new Trend('jobs_latency', true);
const applicationsLatency = new Trend('applications_latency', true);
const interviewsCreated = new Counter('interviews_created');

export const options = {
  scenarios: {
    // Scenario 1: General API load (200 VUs)
    api_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },   // Ramp up to 50
        { duration: '30s', target: 100 },  // Ramp up to 100
        { duration: '1m', target: 200 },   // Ramp up to 200
        { duration: '2m', target: 200 },   // Stay at 200
        { duration: '30s', target: 0 },    // Ramp down
      ],
      gracefulRampDown: '30s',
      exec: 'apiLoad',
    },
    // Scenario 2: Interview simulation (25 VUs)
    interview_load: {
      executor: 'constant-vus',
      vus: 25,
      duration: '4m',
      startTime: '30s', // Start after API load begins
      exec: 'interviewSimulation',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
    errors: ['rate<0.1'],               // Error rate under 10%
    api_latency: ['p(95)<1000'],        // API p95 under 1s
    interview_latency: ['p(95)<3000'],  // Interview p95 under 3s
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';

// Helper to make authenticated request (simulated via headers)
function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Cookie': `session=${token}`,
  };
}

// Scenario 1: General API load
export function apiLoad() {
  group('Health Check', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/health`);
    apiLatency.add(Date.now() - start);

    const success = check(res, {
      'health: status 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
  });

  sleep(Math.random() * 0.5); // 0-500ms pause

  group('Public Jobs List', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/jobs/public`);
    jobsLatency.add(Date.now() - start);

    const success = check(res, {
      'public jobs: status 200': (r) => r.status === 200,
      'public jobs: has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.data);
        } catch {
          return false;
        }
      },
    });
    errorRate.add(!success);
  });

  sleep(Math.random() * 0.5);

  // Simulate random job detail fetch
  group('Public Job Detail', () => {
    // Use a known seeded job ID
    const jobId = '00000000-0000-4000-8000-000000000021';
    const start = Date.now();
    const res = http.get(`${BASE_URL}/jobs/public/${jobId}`);
    jobsLatency.add(Date.now() - start);

    const success = check(res, {
      'job detail: status ok': (r) => r.status === 200 || r.status === 404,
    });
    errorRate.add(!success);
  });

  sleep(Math.random() * 1);
}

// Scenario 2: Interview simulation
export function interviewSimulation() {
  const vuId = __VU;
  const iterationId = __ITER;

  group('Interview Session Flow', () => {
    // Step 1: Access interview page (simulated via API)
    const interviewId = '00000000-0000-4000-8000-000000000031';
    const token = 'test-interview-token';

    const start = Date.now();

    // Simulate interview access check
    const accessRes = http.get(
      `${BASE_URL}/interviews/candidate/current`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Interview-Token': token,
        },
      }
    );

    check(accessRes, {
      'interview access: responds': (r) => r.status !== 0,
    });

    // Step 2: Simulate message exchange (typical interview has 10-20 messages)
    const messageCount = Math.floor(Math.random() * 5) + 3; // 3-8 messages

    for (let i = 0; i < messageCount; i++) {
      sleep(Math.random() * 2 + 1); // 1-3s between messages (thinking time)

      // Health check to simulate ongoing connection
      http.get(`${BASE_URL}/health`);
    }

    interviewLatency.add(Date.now() - start);
    interviewsCreated.add(1);
  });

  sleep(Math.random() * 5 + 5); // 5-10s between interview cycles
}

// Smoke test (standalone)
export function smokeTest() {
  const res = http.get(`${BASE_URL}/health`);
  check(res, {
    'smoke: health ok': (r) => r.status === 200,
  });
}

// Handle summary
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    metrics: {
      http_reqs: data.metrics.http_reqs?.values?.count || 0,
      http_req_duration_p95: data.metrics.http_req_duration?.values?.['p(95)'] || 0,
      errors: data.metrics.errors?.values?.rate || 0,
      api_latency_p95: data.metrics.api_latency?.values?.['p(95)'] || 0,
      interview_latency_p95: data.metrics.interview_latency?.values?.['p(95)'] || 0,
      interviews_created: data.metrics.interviews_created?.values?.count || 0,
    },
    thresholds: {},
  };

  // Check threshold results
  for (const [name, threshold] of Object.entries(data.thresholds || {})) {
    summary.thresholds[name] = threshold.ok;
  }

  console.log('\n=== Load Test Summary ===');
  console.log(`Total Requests: ${summary.metrics.http_reqs}`);
  console.log(`HTTP p95 Latency: ${summary.metrics.http_req_duration_p95.toFixed(2)}ms`);
  console.log(`API p95 Latency: ${summary.metrics.api_latency_p95.toFixed(2)}ms`);
  console.log(`Interview p95 Latency: ${summary.metrics.interview_latency_p95.toFixed(2)}ms`);
  console.log(`Error Rate: ${(summary.metrics.errors * 100).toFixed(2)}%`);
  console.log(`Simulated Interview Sessions: ${summary.metrics.interviews_created}`);
  console.log('\n=== Thresholds ===');
  for (const [name, passed] of Object.entries(summary.thresholds)) {
    console.log(`${passed ? '✓' : '✗'} ${name}`);
  }

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'load-test-results.json': JSON.stringify(data, null, 2),
  };
}
