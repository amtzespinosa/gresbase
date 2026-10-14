package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

// argon2id parameters: the second recommended option of RFC 9106 (64 MiB, 3 passes, 4 lanes).
// They are stored in each hash, so changing them later keeps old hashes verifiable.
const (
	argonTime    = 3
	argonMemory  = 64 * 1024
	argonThreads = 4
	argonKeyLen  = 32
	saltLen      = 16
)

// Password length limits, in characters (the maximum bounds the work of a login attempt).
const (
	MinPasswordLen = 8
	MaxPasswordLen = 256
)

// ErrWeakPassword is returned by ValidatePassword.
var ErrWeakPassword = fmt.Errorf("password must have between %d and %d characters", MinPasswordLen, MaxPasswordLen)

// ValidatePassword checks the length limits of a new password.
func ValidatePassword(p string) error {
	if n := utf8.RuneCountInString(p); n < MinPasswordLen || n > MaxPasswordLen {
		return ErrWeakPassword
	}
	return nil
}

// HashPassword returns an argon2id hash in PHC format: $argon2id$v=19$m=…,t=…,p=…$salt$hash.
func HashPassword(p string) (string, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(p), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version, argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}

// VerifyPassword reports whether p matches an argon2id PHC hash. Malformed hashes never match.
func VerifyPassword(hash, p string) bool {
	if utf8.RuneCountInString(p) > MaxPasswordLen {
		return false
	}
	salt, want, m, t, threads, err := parseHash(hash)
	if err != nil {
		return false
	}
	got := argon2.IDKey([]byte(p), salt, t, m, threads, uint32(len(want))) //nolint:gosec // key length from our own hash
	return subtle.ConstantTimeCompare(got, want) == 1
}

func parseHash(hash string) (salt, key []byte, m, t uint32, threads uint8, err error) {
	parts := strings.Split(hash, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != fmt.Sprintf("v=%d", argon2.Version) {
		return nil, nil, 0, 0, 0, errors.New("not an argon2id hash")
	}
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &threads); err != nil || m == 0 || t == 0 || threads == 0 ||
		m > 1<<20 || t > 16 {
		return nil, nil, 0, 0, 0, errors.New("invalid argon2id parameters")
	}
	if salt, err = base64.RawStdEncoding.DecodeString(parts[4]); err != nil {
		return nil, nil, 0, 0, 0, err
	}
	if key, err = base64.RawStdEncoding.DecodeString(parts[5]); err != nil || len(key) < 16 || len(key) > 64 {
		return nil, nil, 0, 0, 0, errors.New("invalid argon2id key")
	}
	return salt, key, m, t, threads, nil
}

// fingerprint identifies a credential without revealing it. It goes into the session cookie, so
// changing the password invalidates every other session.
func fingerprint(credential string) string {
	sum := sha256.Sum256([]byte(credential))
	return hex.EncodeToString(sum[:8])
}
