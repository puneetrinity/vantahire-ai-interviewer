import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const authLatency = new Trend('auth_latency');
const jobsLatency = new Trend('jobs_latency');
const interviewsLatency = new Trend('interviews_latency');

// Configuration
const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const SESSION_COOKIE = __ENV.SESSION_COOKIE || 'session=test-session-id';

export const options = {
  scenarios: {
    // Scenario 1: Steady load - normal operation
    steady_load: {
      executor: 'constant-arrival-rate',
      rate: 50, // 50 requests per second
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 20,
      maxVUs: 50,
      exec: 'mixedApiLoad',
    },

    // Scenario 2: Spike test
    spike: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: '30s', target: 10 },   // Normal
        { duration: '10s', target: 200 },  // Spike
        { duration: '30s', target: 200 },  // Sustain spike
        { duration: '10s', target: 10 },   // Recover
        { duration: '30s', target: 10 },   // Normal
      ],
      exec: 'mixedApiLoad',
      startTime: '3m',
    },

    // Scenario 3: Concurrent interviews simulation
    concurrent_interviews: {
      executor: 'constant-vus',
      vus: 25,
      duration: '2m',
      exec: 'interviewSimulation',
      startTime: '6m',
    },
  },

  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% under 500ms, 99% under 1s
    errors: ['rate<0.05'], // Error rate under 5%
    auth_latency: ['p(95)<200'],
    jobs_latency: ['p(95)<300'],
    interviews_latency: ['p(95)<400'],
  },
};

// Helper functions
function makeAuthenticatedRequest(method, path, body = null) {
  const params = {
    headers: {
      'Cookie': SESSION_COOKIE,
      'Content-Type': 'application/json',
    },
  };

  const url = `${BASE_URL}${path}`;

  if (method === 'GET') {
    return http.get(url, params);
  } else if (method === 'POST') {
    return http.post(url, body ? JSON.stringify(body) : null, params);
  } else if (method === 'PATCH') {
    return http.patch(url, body ? JSON.stringify(body) : null, params);
  } else if (method === 'DELETE') {
    return http.del(url, null, params);
  }
}

function makeTokenRequest(method, path, token, body = null) {
  const params = {
    headers: {
      'X-Interview-Token': token,
      'Content-Type': 'application/json',
    },
  };

  const url = `${BASE_URL}${path}`;

  if (method === 'GET') {
    return http.get(url, params);
  } else if (method === 'POST') {
    return http.post(url, body ? JSON.stringify(body) : null, params);
  }
}

// Test scenarios
export function mixedApiLoad() {
  // Randomly select an endpoint type
  const rand = Math.random();

  if (rand < 0.3) {
    // 30% - Health check
    const res = http.get(`${BASE_URL}/health`);
    check(res, {
      'health status is 200': (r) => r.status === 200,
      'health response is healthy': (r) => {
        try {
          return JSON.parse(r.body).status === 'healthy';
        } catch {
          return false;
        }
      },
    });
    errorRate.add(res.status !== 200);
  } else if (rand < 0.5) {
    // 20% - Auth check
    group('auth', () => {
      const start = Date.now();
      const res = makeAuthenticatedRequest('GET', '/auth/me');
      authLatency.add(Date.now() - start);

      check(res, {
        'auth status is 200 or 401': (r) => r.status === 200 || r.status === 401,
      });
      errorRate.add(res.status >= 500);
    });
  } else if (rand < 0.7) {
    // 20% - Jobs list
    group('jobs', () => {
      const start = Date.now();
      const res = makeAuthenticatedRequest('GET', '/jobs?page=1&limit=10');
      jobsLatency.add(Date.now() - start);

      check(res, {
        'jobs status is 200 or 401': (r) => r.status === 200 || r.status === 401,
      });
      errorRate.add(res.status >= 500);
    });
  } else if (rand < 0.9) {
    // 20% - Interviews list
    group('interviews', () => {
      const start = Date.now();
      const res = makeAuthenticatedRequest('GET', '/interviews?page=1&limit=10');
      interviewsLatency.add(Date.now() - start);

      check(res, {
        'interviews status is 200 or 401': (r) => r.status === 200 || r.status === 401,
      });
      errorRate.add(res.status >= 500);
    });
  } else {
    // 10% - Applications list
    group('applications', () => {
      const res = makeAuthenticatedRequest('GET', '/applications/mine?page=1&limit=10');

      check(res, {
        'applications status is valid': (r) => r.status === 200 || r.status === 401 || r.status === 403,
      });
      errorRate.add(res.status >= 500);
    });
  }

  sleep(0.1); // Small delay between requests
}

export function interviewSimulation() {
  // Simulates a candidate going through an interview
  const testToken = __ENV.INTERVIEW_TOKEN || 'test-interview-token';

  group('interview_flow', () => {
    // Step 1: Get interview info
    const infoRes = makeTokenRequest('GET', '/interviews/candidate/current', testToken);

    if (infoRes.status === 401) {
      // Token not valid, skip
      sleep(1);
      return;
    }

    check(infoRes, {
      'get interview info': (r) => r.status === 200,
    });
    errorRate.add(infoRes.status >= 500);

    sleep(0.5);

    // Step 2: Start interview
    const startRes = makeTokenRequest('POST', '/interviews/candidate/start', testToken);

    check(startRes, {
      'start interview': (r) => r.status === 200 || r.status === 400, // 400 if already started
    });
    errorRate.add(startRes.status >= 500);

    sleep(1);

    // Step 3: Send messages (simulate conversation)
    for (let i = 0; i < 3; i++) {
      const messageRes = makeTokenRequest(
        'POST',
        '/interviews/candidate/message',
        testToken,
        { content: `Test message ${i + 1} from load test` }
      );

      check(messageRes, {
        'send message': (r) => r.status === 200 || r.status === 400,
      });
      errorRate.add(messageRes.status >= 500);

      sleep(2); // Wait between messages
    }

    // Step 4: Get messages
    const messagesRes = makeTokenRequest('GET', '/interviews/candidate/messages', testToken);

    check(messagesRes, {
      'get messages': (r) => r.status === 200,
    });
    errorRate.add(messagesRes.status >= 500);

    sleep(1);
  });
}

// Standalone function for quick API tests
export function healthCheck() {
  const res = http.get(`${BASE_URL}/health`);

  check(res, {
    'health check passed': (r) => r.status === 200,
  });

  sleep(1);
}

// Default function (runs if no scenario specified)
export default function () {
  healthCheck();
}
