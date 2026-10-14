package snippets

import "time"

// Entry is a file or a folder in the snippet tree.
type Entry struct {
	Path       string    `json:"path"`
	Folder     bool      `json:"folder"`
	Size       int64     `json:"size"`
	ModifiedAt time.Time `json:"modified_at"`
}

// Snippet is a saved query with its content.
type Snippet struct {
	Path       string    `json:"path"`
	SQL        string    `json:"sql"`
	ModifiedAt time.Time `json:"modified_at"`
}

// SaveRequest creates (POST) or replaces (PUT) a snippet.
type SaveRequest struct {
	Path string `json:"path"`
	SQL  string `json:"sql"`
}

// MoveRequest renames or moves a snippet or a folder.
type MoveRequest struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// FolderRequest creates a folder.
type FolderRequest struct {
	Path string `json:"path"`
}
