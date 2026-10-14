package pg

import (
	"context"
	"errors"
	"testing"
)

func TestAllowedAddrs(t *testing.T) {
	allowed := []string{"10.0.0.0/8", "192.168.1.5", "localhost"}
	tests := []struct {
		host string
		ok   bool
	}{
		{"10.1.2.3", true},
		{"192.168.1.5", true},
		{"192.168.1.6", false},
		{"127.0.0.1", false}, // loopback only by name: "localhost" is listed, 127.0.0.1 is not
		{"localhost", true},
		{"::1", false},
	}
	for _, tc := range tests {
		_, err := AllowedAddrs(context.Background(), tc.host, allowed)
		if tc.ok != (err == nil) || (!tc.ok && !errors.Is(err, ErrHostNotAllowed)) {
			t.Errorf("%s: err = %v", tc.host, err)
		}
	}
}
