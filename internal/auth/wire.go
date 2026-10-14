package auth

import "time"

// Wire types of the auth endpoints (exported to TypeScript by tygo).

// LoginRequest is the body of POST /api/v1/auth/login.
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// SessionResponse is the body of a successful login and of GET /api/v1/auth/session.
type SessionResponse struct {
	AuthEnabled bool   `json:"auth_enabled"`
	Username    string `json:"username"`
	// Role is "admin" for the administrator and for the local session without login.
	Role string `json:"role"`
	// AccountLocked is true when the account comes from GRESBASE_USER/GRESBASE_PASSWORD and cannot
	// be changed from the app.
	AccountLocked bool       `json:"account_locked"`
	ExpiresAt     *time.Time `json:"expires_at"`
}

// PasswordChange is the body of POST /api/v1/auth/password.
type PasswordChange struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}
