package api

import (
	"net/http"
	"sync"
	"time"
)

// HeartbeatEvery is how long a slow response waits before its first heartbeat, and then between two.
// Under Nginx's default proxy_read_timeout (60 s) and Cloudflare's 100 s wait for the response.
const HeartbeatEvery = 10 * time.Second

// Heartbeat keeps a slow request alive behind a proxy that cuts idle responses. When the handler has
// written nothing after every, it sends 200 and a space (JSON allows leading whitespace), and another
// space each time every passes, until the handler writes its own body after them. A status the handler
// sets later can't be sent anymore: an error then arrives as a 200 with the usual {"error": …} body,
// which the client reads as an error.
func Heartbeat(every time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			hw := &heartbeatWriter{ResponseWriter: w, rc: http.NewResponseController(w), header: http.Header{}}
			stop := make(chan struct{})
			done := make(chan struct{})
			go func() {
				defer close(done)
				t := time.NewTicker(every)
				defer t.Stop()
				for {
					select {
					case <-stop:
						return
					case <-r.Context().Done():
						return
					case <-t.C:
						if !hw.beat() {
							return
						}
					}
				}
			}()
			defer func() {
				close(stop)
				<-done
			}()
			next.ServeHTTP(hw, r)
		})
	}
}

type heartbeatWriter struct {
	http.ResponseWriter
	rc      *http.ResponseController
	header  http.Header // the handler's own: the heartbeat writes the real one meanwhile
	mu      sync.Mutex
	written bool // the handler wrote its header: no more heartbeats
	beating bool // heartbeats sent: the status is already 200
}

// beat sends one heartbeat; false once the handler has answered.
func (h *heartbeatWriter) beat() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.written {
		return false
	}
	if !h.beating {
		h.beating = true
		h.ResponseWriter.Header().Set("Content-Type", "application/json; charset=utf-8")
		h.ResponseWriter.WriteHeader(http.StatusOK)
	}
	_, _ = h.ResponseWriter.Write([]byte(" "))
	_ = h.rc.Flush()
	return true
}

func (h *heartbeatWriter) Header() http.Header { return h.header }

func (h *heartbeatWriter) WriteHeader(status int) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.writeHeader(status)
}

// writeHeader sends the handler's status and headers, unless the heartbeats already sent theirs.
func (h *heartbeatWriter) writeHeader(status int) {
	if !h.written && !h.beating {
		for k, v := range h.header {
			h.ResponseWriter.Header()[k] = v
		}
		h.ResponseWriter.WriteHeader(status)
	}
	h.written = true
}

func (h *heartbeatWriter) Write(b []byte) (int, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.writeHeader(http.StatusOK)
	return h.ResponseWriter.Write(b)
}

// Unwrap lets http.ResponseController reach the connection (Flush, deadlines).
func (h *heartbeatWriter) Unwrap() http.ResponseWriter { return h.ResponseWriter }
