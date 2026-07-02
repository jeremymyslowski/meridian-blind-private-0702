package webhookretry

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	_ "github.com/lib/pq"
)

// Constants for retry configuration
const (
	MaxAttempts     = 5                // Respect max attempt limit
	BaseBackoff     = 5 * time.Second  // Starting backoff delay
	MaxBackoff      = 5 * time.Minute  // Cap the backoff
	DispatchTimeout = 10 * time.Second
)

// WebhookEvent represents a queued webhook event for retry processing
type WebhookEvent struct {
	ID            string
	WebhookID     string
	WebhookURL    string
	EventType     string
	Payload       []byte
	Attempts      int
	NextAttemptAt time.Time // For exponential backoff scheduling
	LastError     string
}

// EnqueueEvent inserts a new webhook event ready for dispatch (initial attempts=0, next_attempt_at=now)
func EnqueueEvent(db *sql.DB, webhookID, eventType string, payload []byte, webhookURL string) error {
	_, err := db.Exec(`
		INSERT INTO webhook_events (id, webhook_id, event_type, payload, attempts, next_attempt_at, created_at)
		VALUES (gen_random_uuid(), $1, $2, $3, 0, NOW(), NOW())
	`, webhookID, eventType, payload)
	if err != nil {
		return fmt.Errorf("enqueue webhook event: %w", err)
	}
	log.Printf("webhook enqueued: type=%s url=%s", eventType, webhookURL)
	return nil
}

// Note: In production enqueue also joins webhooks table to get URL and filters by event subscription (see webhook_queue.py)

// FetchReadyWebhookEvents retrieves events ready for dispatch: not processed, attempts < max, and next_attempt_at <= now
func FetchReadyWebhookEvents(db *sql.DB, limit int) ([]WebhookEvent, error) {
	rows, err := db.Query(`
		SELECT we.id, we.webhook_id, w.url, we.event_type, we.payload::text, we.attempts, COALESCE(we.next_attempt_at, we.created_at), COALESCE(we.last_error, '')
		FROM webhook_events we
		JOIN webhooks w ON w.id = we.webhook_id
		WHERE we.processed = FALSE
		  AND we.attempts < $1
		  AND COALESCE(we.next_attempt_at, we.created_at) <= NOW()
		ORDER BY we.created_at ASC
		LIMIT $2
	`, MaxAttempts, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []WebhookEvent
	for rows.Next() {
		var e WebhookEvent
		var payloadStr string
		var nextAt time.Time
		if err := rows.Scan(&e.ID, &e.WebhookID, &e.WebhookURL, &e.EventType, &payloadStr, &e.Attempts, &nextAt, &e.LastError); err != nil {
			return nil, err
		}
		e.Payload = []byte(payloadStr)
		e.NextAttemptAt = nextAt
		events = append(events, e)
	}
	return events, rows.Err()
}

// CalculateBackoff computes exponential backoff delay: min( base * 2^attempts , max )
func CalculateBackoff(attempts int) time.Duration {
	if attempts < 0 {
		attempts = 0
	}
	delay := BaseBackoff * (1 << attempts) // 2^attempts
	if delay > MaxBackoff {
		delay = MaxBackoff
	}
	// Add jitter: +/- 10% to prevent thundering herd
	jitter := time.Duration(float64(delay) * 0.1 * (2*float64(time.Now().UnixNano()%100)/100 - 1))
	return delay + jitter
}

// DispatchWebhook sends the HTTP POST with timeout. Returns error on failure (network or 4xx/5xx)
func DispatchWebhook(event WebhookEvent) error {
	req, err := http.NewRequest(http.MethodPost, event.WebhookURL, bytes.NewReader(event.Payload))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Meridian-Event", event.EventType)
	// Optionally add signature if secret known, but omitted for simplicity

	client := &http.Client{Timeout: DispatchTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("http dispatch: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode >= 400 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}
	return nil
}

// RecordFailure increments attempts, sets last_error, and if under max attempts schedules next retry with exponential backoff
func RecordFailure(db *sql.DB, event WebhookEvent, dispatchErr error) error {
	newAttempts := event.Attempts + 1
	errMsg := dispatchErr.Error()

	if newAttempts >= MaxAttempts {
		// Max attempts reached: mark as permanently failed (or could set processed=true with failed status, but keep simple)
		_, dbErr := db.Exec(`
			UPDATE webhook_events
			SET attempts = $1, last_error = $2, processed = TRUE
			WHERE id = $3
		`, newAttempts, errMsg, event.ID)
		if dbErr != nil {
			log.Printf("ERROR record max failure: %v", dbErr)
		}
		log.Printf("webhook max attempts reached: event_id=%s attempts=%d error=%s", event.ID, newAttempts, errMsg)
		return nil
	}

	// Schedule next attempt with exponential backoff
	nextAt := time.Now().Add(CalculateBackoff(newAttempts))
	_, dbErr := db.Exec(`
		UPDATE webhook_events
		SET attempts = $1, last_error = $2, next_attempt_at = $3
		WHERE id = $4
	`, newAttempts, errMsg, nextAt, event.ID)
	if dbErr != nil {
		log.Printf("ERROR record failure: %v", dbErr)
		return dbErr
	}

	log.Printf("webhook retry scheduled: event_id=%s attempt=%d next_at=%s error=%s", event.ID, newAttempts, nextAt.Format(time.RFC3339), errMsg)
	return nil
}

// MarkProcessed marks event as successfully delivered
func MarkProcessed(db *sql.DB, eventID string) error {
	_, err := db.Exec("UPDATE webhook_events SET processed = TRUE WHERE id = $1", eventID)
	return err
}

// ProcessWebhookRetries is the main loop entry: fetch ready, dispatch, handle success/failure with backoff
func ProcessWebhookRetries(db *sql.DB) error {
	events, err := FetchReadyWebhookEvents(db, 10)
	if err != nil {
		return err
	}

	for _, event := range events {
		if err := DispatchWebhook(event); err != nil {
			if recErr := RecordFailure(db, event, err); recErr != nil {
				log.Printf("ERROR recording failure for %s: %v", event.ID, recErr)
			}
			continue
		}
		if err := MarkProcessed(db, event.ID); err != nil {
			return err
		}
		log.Printf("webhook dispatched successfully: event_id=%s type=%s url=%s", event.ID, event.EventType, event.WebhookURL)
	}
	return nil
}

// Note: Integrate by calling ProcessWebhookRetries periodically from worker main loop instead of the basic version.
// Also update schema with: ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
// And update indexes, and initial enqueue to set next_attempt_at = NOW().