package api

import (
	"bufio"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHeartbeat(t *testing.T) {
	const every = 40 * time.Millisecond
	tests := []struct {
		name     string
		wait     time.Duration
		status   int
		wantCode int
		beats    bool
	}{
		{"fast answer keeps its status", 0, http.StatusConflict, http.StatusConflict, false},
		{"slow answer gets heartbeats", 3 * every, http.StatusOK, http.StatusOK, true},
		{"slow error arrives in a 200", 3 * every, http.StatusConflict, http.StatusOK, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := Heartbeat(every)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				time.Sleep(tt.wait)
				if tt.status == http.StatusOK {
					WriteJSON(w, http.StatusOK, map[string]int{"rows": 1})
				} else {
					Fail(w, tt.status, CodeConflict, "late")
				}
			}))
			srv := httptest.NewServer(h)
			defer srv.Close()
			start := time.Now()
			res, err := http.Get(srv.URL)
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = res.Body.Close() }()
			if res.StatusCode != tt.wantCode {
				t.Errorf("status = %d, want %d", res.StatusCode, tt.wantCode)
			}
			// The first byte comes long before the handler answers (a proxy sees a live response).
			br := bufio.NewReader(res.Body)
			first, _ := br.Peek(1)
			if tt.beats && (string(first) != " " || time.Since(start) > 2*every) {
				t.Errorf("first byte %q after %v, want a space after about %v", first, time.Since(start), every)
			}
			body, _ := io.ReadAll(br)
			if tt.beats != strings.HasPrefix(string(body), " ") {
				t.Errorf("body = %q", body)
			}
			var v map[string]any
			if err := json.Unmarshal(body, &v); err != nil {
				t.Fatalf("body is not JSON: %q", body)
			}
			if _, isErr := v["error"]; isErr != (tt.status != http.StatusOK) {
				t.Errorf("body = %q", body)
			}
		})
	}
}
