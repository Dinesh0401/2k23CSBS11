const axios = require('axios');
const path = require('path');

// ── Load token from .env in vehicle_scheduling_be ──────────────────────
require('dotenv').config({
  path: path.join(__dirname, 'vehicle_scheduling_be', '.env')
});

const BASE_URL = process.env.EVAL_BASE_URL || 'http://4.224.186.213';
const TOKEN = process.env.LOGGING_SERVICE_TOKEN;
const TOP_N = 10; // Number of top notifications to display

// ── Priority weights by notification type ──────────────────────────────
const TYPE_WEIGHT = {
  Placement: 3,
  Result: 2,
  Event: 1
};

// ═══════════════════════════════════════════════════════════════════════
// Min-Heap implementation (size-bounded for top-N extraction)
// ═══════════════════════════════════════════════════════════════════════

class MinHeap {
  constructor(maxSize) {
    this.heap = [];
    this.maxSize = maxSize;
  }

  /** Number of items in the heap */
  size() {
    return this.heap.length;
  }

  /** Peek at the minimum element without removing it */
  peekMin() {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  /** Insert an item; if heap is full and item > min, replace min */
  offer(item) {
    if (this.heap.length < this.maxSize) {
      this.heap.push(item);
      this._bubbleUp(this.heap.length - 1);
    } else if (item.score > this.heap[0].score) {
      // New item is better than current minimum — replace it
      this.heap[0] = item;
      this._sinkDown(0);
    }
    // Otherwise discard (item is not in top N)
  }

  /** Extract all items sorted by score descending (highest first) */
  extractAllSorted() {
    return [...this.heap].sort((a, b) => b.score - a.score);
  }

  // ── Internal heap operations ──────────────────────────────────────

  _bubbleUp(idx) {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.heap[parent].score > this.heap[idx].score) {
        [this.heap[parent], this.heap[idx]] = [this.heap[idx], this.heap[parent]];
        idx = parent;
      } else {
        break;
      }
    }
  }

  _sinkDown(idx) {
    const length = this.heap.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;

      if (left < length && this.heap[left].score < this.heap[smallest].score) {
        smallest = left;
      }
      if (right < length && this.heap[right].score < this.heap[smallest].score) {
        smallest = right;
      }
      if (smallest !== idx) {
        [this.heap[smallest], this.heap[idx]] = [this.heap[idx], this.heap[smallest]];
        idx = smallest;
      } else {
        break;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Core logic
// ═══════════════════════════════════════════════════════════════════════

/**
 * Calculate priority score for a notification.
 *
 * score = (type_weight × 1000) + recency_in_seconds
 *
 * Higher score = higher priority.
 */
function calculateScore(notification, oldestTimestamp) {
  const weight = TYPE_WEIGHT[notification.Type] || 1;
  const notifTime = new Date(notification.Timestamp).getTime();
  const recencySeconds = Math.max(0, Math.floor((notifTime - oldestTimestamp) / 1000));

  return weight * 1000 + recencySeconds;
}

/**
 * Find top N priority notifications using a min-heap.
 *
 * Time complexity:  O(n log N) where n = total notifications, N = top count
 * Space complexity: O(N) for the heap
 */
function findTopN(notifications, n) {
  if (!notifications || notifications.length === 0) {
    return [];
  }

  // Find the oldest timestamp as the recency reference point
  const oldestTimestamp = Math.min(
    ...notifications.map((notif) => new Date(notif.Timestamp).getTime())
  );

  // Build a min-heap of size N
  const heap = new MinHeap(n);

  for (const notif of notifications) {
    const score = calculateScore(notif, oldestTimestamp);
    heap.offer({ ...notif, score });
  }

  // Extract sorted results (highest priority first)
  return heap.extractAllSorted();
}

/**
 * Demonstrate how the heap efficiently handles incoming notifications
 * without re-sorting the entire list.
 */
function demonstrateIncomingNotification(heap, newNotification, oldestTimestamp) {
  const score = calculateScore(newNotification, oldestTimestamp);
  const currentMin = heap.peekMin();

  console.log('\n── New Notification Arrived ──────────────────────────────');
  console.log(`  Type: ${newNotification.Type} | Message: "${newNotification.Message}"`);
  console.log(`  Score: ${score} | Current heap min: ${currentMin ? currentMin.score : 'empty'}`);

  if (currentMin && score <= currentMin.score) {
    console.log('  Action: DISCARDED (score too low to enter top 10)');
  } else {
    console.log('  Action: INSERTED into top 10 (replaces lowest-priority item)');
  }

  heap.offer({ ...newNotification, score });
}

// ═══════════════════════════════════════════════════════════════════════
// Main execution
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       Priority Inbox — Top N Notifications             ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  // ── Validate token ────────────────────────────────────────────────
  if (!TOKEN) {
    console.error('ERROR: LOGGING_SERVICE_TOKEN is not set.');
    console.error('Set it in vehicle_scheduling_be/.env or as an environment variable.');
    process.exit(1);
  }

  // ── Fetch notifications from API ──────────────────────────────────
  console.log(`Fetching notifications from ${BASE_URL}/evaluation-service/notifications ...`);
  console.log();

  let notifications;
  try {
    const response = await axios.get(`${BASE_URL}/evaluation-service/notifications`, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 8000
    });

    const data = response.data;
    notifications = Array.isArray(data) ? data : data.notifications || [];
  } catch (err) {
    console.error('Failed to fetch notifications:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Body:', JSON.stringify(err.response.data));
    }
    process.exit(1);
  }

  console.log(`Total notifications fetched: ${notifications.length}`);
  console.log();

  // ── Display type distribution ─────────────────────────────────────
  const typeCounts = {};
  for (const n of notifications) {
    typeCounts[n.Type] = (typeCounts[n.Type] || 0) + 1;
  }
  console.log('Notification Distribution:');
  for (const [type, count] of Object.entries(typeCounts)) {
    const weight = TYPE_WEIGHT[type] || 1;
    console.log(`  ${type}: ${count} notifications (weight: ${weight})`);
  }
  console.log();

  // ── Find top N using min-heap ─────────────────────────────────────
  console.log(`═══ Top ${TOP_N} Priority Notifications ═══`);
  console.log();
  console.log('Scoring: score = (type_weight × 1000) + recency_in_seconds');
  console.log('  Placement: weight 3 | Result: weight 2 | Event: weight 1');
  console.log();

  const topNotifications = findTopN(notifications, TOP_N);

  // ── Display results ───────────────────────────────────────────────
  console.log('┌────┬────────────┬──────────────────────────────────┬──────────────────────┬───────┐');
  console.log('│ #  │ Type       │ Message                          │ Timestamp            │ Score │');
  console.log('├────┼────────────┼──────────────────────────────────┼──────────────────────┼───────┤');

  topNotifications.forEach((notif, index) => {
    const rank = String(index + 1).padStart(2);
    const type = (notif.Type || '').padEnd(10);
    const message = (notif.Message || '').padEnd(32).substring(0, 32);
    const timestamp = (notif.Timestamp || '').substring(0, 20);
    const score = String(notif.score).padStart(5);
    console.log(`│ ${rank} │ ${type} │ ${message} │ ${timestamp} │ ${score} │`);
  });

  console.log('└────┴────────────┴──────────────────────────────────┴──────────────────────┴───────┘');
  console.log();

  // ── Demonstrate handling a new incoming notification ───────────────
  console.log('═══ Demonstrating Efficient Top-N Maintenance ═══');
  console.log();
  console.log('When new notifications arrive, we compare against the heap\'s');
  console.log('minimum score. Cost: O(log N) per insertion — no re-sort needed.');

  const oldestTimestamp = Math.min(
    ...notifications.map((n) => new Date(n.Timestamp).getTime())
  );

  // Rebuild heap for demonstration
  const heap = new MinHeap(TOP_N);
  for (const notif of notifications) {
    const score = calculateScore(notif, oldestTimestamp);
    heap.offer({ ...notif, score });
  }

  // Simulate a new high-priority notification arriving
  demonstrateIncomingNotification(heap, {
    ID: 'new-simulated-001',
    Type: 'Placement',
    Message: 'Amazon hiring — urgent',
    Timestamp: new Date().toISOString()
  }, oldestTimestamp);

  // Simulate a low-priority notification arriving
  demonstrateIncomingNotification(heap, {
    ID: 'new-simulated-002',
    Type: 'Event',
    Message: 'Library book fair',
    Timestamp: '2026-04-01T10:00:00'
  }, oldestTimestamp);

  console.log();
  console.log('Updated Top 10 after new arrivals:');
  console.log();

  const updatedTop = heap.extractAllSorted();
  updatedTop.forEach((notif, index) => {
    const rank = String(index + 1).padStart(2);
    const type = (notif.Type || '').padEnd(10);
    const message = (notif.Message || '').padEnd(32).substring(0, 32);
    const score = String(notif.score).padStart(5);
    console.log(`  ${rank}. [${type}] ${message} (score: ${score})`);
  });

  console.log();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
